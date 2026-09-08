import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import store from '../store'
import log from '../logger'
import {
  parseRegistryVram,
  resolveVramMb,
  type RegistryVram,
  type WindowsAdapter
} from './gpuVram'
import type { GpuInfo, GpuVendor } from '../../shared/types'

const execFileAsync = promisify(execFile)

// PowerShell executables to try, in order. `powershell.exe` (Windows PowerShell 5.1)
// is not always on PATH — some machines only expose PowerShell 7 (`pwsh`) — so we try
// the absolute Windows PowerShell path first (it ships with Windows and is resolvable
// even when its directory is missing from PATH), then fall back to pwsh / PATH lookup.
const POWERSHELL_CANDIDATES = [
  `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
  'pwsh.exe',
  'powershell.exe'
]

async function runPowerShell(command: string): Promise<string> {
  let lastErr: unknown
  for (const exe of POWERSHELL_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(exe, ['-NoProfile', '-Command', command], {
        timeout: 20000
      })
      return stdout
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('No usable PowerShell executable found')
}

/**
 * Parse a `spdisplays_vram` string into megabytes.
 *
 * The unit varies: discrete and Intel integrated GPUs commonly report MB
 * ("1536 MB"), others GB ("8 GB"). Matching only GB silently dropped every
 * MB-reporting Mac, which showed no memory at all.
 */
function parseVramMb(raw: unknown): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*(MB|GB)/i.exec(String(raw ?? ''))
  if (!m) return undefined
  const value = Number(m[1])
  if (!Number.isFinite(value) || value <= 0) return undefined
  return Math.round(m[2].toUpperCase() === 'GB' ? value * 1024 : value)
}

function vendorFromName(name: string): GpuVendor {
  const n = name.toLowerCase()
  if (n.includes('apple')) return 'apple'
  if (n.includes('nvidia') || n.includes('geforce') || n.includes('quadro')) return 'nvidia'
  if (n.includes('amd') || n.includes('radeon')) return 'amd'
  if (n.includes('intel') || n.includes('iris') || n.includes('uhd graphics')) return 'intel'
  return 'none'
}

async function detectDarwin(): Promise<GpuInfo> {
  const { stdout } = await execFileAsync('system_profiler', ['SPDisplaysDataType', '-json'], {
    timeout: 15000
  })
  const data = JSON.parse(stdout) as { SPDisplaysDataType?: Array<Record<string, unknown>> }
  const gpu = data.SPDisplaysDataType?.[0]
  const model = String(gpu?.sppci_model ?? gpu?._name ?? 'Unknown')
  // Apple Silicon reports no `spdisplays_vram` at all (unified memory), but does
  // report `sppci_cores` — which is the number that actually means something there.
  const cores = Number(gpu?.sppci_cores)
  return {
    vendor: vendorFromName(model),
    model,
    vramMb: parseVramMb(gpu?.spdisplays_vram),
    cores: Number.isInteger(cores) && cores > 0 ? cores : undefined
  }
}

// Display adapters' driver class. Each subkey is one installed driver, and
// carries the true VRAM that Win32_VideoController.AdapterRAM cannot express.
const DISPLAY_CLASS_KEY =
  'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'

const REGISTRY_VRAM_COMMAND = [
  "$ErrorActionPreference='SilentlyContinue';",
  `Get-ChildItem '${DISPLAY_CLASS_KEY}' | ForEach-Object {`,
  '  $p = Get-ItemProperty -Path $_.PSPath;',
  '  if ($p.DriverDesc) {',
  // REG_QWORD on modern drivers; older ones only have the 32-bit MemorySize,
  // which may come back as REG_BINARY and needs unpacking.
  "    $q = $p.'HardwareInformation.qwMemorySize';",
  "    if ($null -eq $q) { $q = $p.'HardwareInformation.MemorySize' }",
  '    if ($q -is [byte[]]) { $q = [System.BitConverter]::ToUInt32($q, 0) }',
  '    if ($null -ne $q) {',
  '      [pscustomobject]@{ Name = [string]$p.DriverDesc; Bytes = [string]$q }',
  '    }',
  '  }',
  '} | ConvertTo-Json -Compress'
].join(' ')

/**
 * True VRAM per driver, or `[]` if anything goes wrong.
 *
 * Deliberately a second PowerShell call rather than one combined query: the
 * adapter list already works, and a registry read that fails on some machine
 * must not take the whole probe down with it.
 */
async function readRegistryVram(): Promise<RegistryVram[]> {
  try {
    return parseRegistryVram(await runPowerShell(REGISTRY_VRAM_COMMAND))
  } catch (err) {
    log.debug(`GPU registry VRAM lookup failed, falling back to AdapterRAM: ${String(err)}`)
    return []
  }
}

async function detectWin32(): Promise<GpuInfo> {
  const stdout = await runPowerShell(
    'Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | ConvertTo-Json'
  )
  const parsed = JSON.parse(stdout) as WindowsAdapter | WindowsAdapter[]
  const adapters = Array.isArray(parsed) ? parsed : [parsed]
  const registry = await readRegistryVram()

  // Multi-GPU machines (e.g. NVIDIA dGPU + Intel iGPU): prefer the most
  // capable vendor for the encoder ladder.
  const rank: Record<GpuVendor, number> = { nvidia: 4, amd: 3, intel: 2, apple: 1, none: 0 }
  let best: GpuInfo = { vendor: 'none', model: 'Unknown' }
  for (const adapter of adapters) {
    const model = adapter.Name ?? ''
    const info: GpuInfo = {
      vendor: vendorFromName(model),
      model,
      vramMb: resolveVramMb(adapter, registry),
      driverVersion: adapter.DriverVersion ?? undefined
    }
    if (rank[info.vendor] > rank[best.vendor]) best = info
  }
  return best
}

/**
 * Detect the GPU once and cache the result in electron-store.
 * `force` re-runs detection (the Settings "re-probe" action).
 */
const DETECTION_FAILED_MODEL = 'Unknown (detection failed)'

export async function detectGpu(force = false): Promise<GpuInfo> {
  if (!force) {
    const cached = store.get('gpuInfo')
    // Ignore a previously cached failure so we retry instead of returning it forever.
    if (cached && cached.model !== DETECTION_FAILED_MODEL) return cached
  }

  try {
    const info = process.platform === 'darwin' ? await detectDarwin() : await detectWin32()
    log.info(`GPU detected: ${info.vendor} — ${info.model}`)
    store.set('gpuInfo', info)
    return info
  } catch (err) {
    log.warn(`GPU detection failed: ${err instanceof Error ? err.message : String(err)}`)
    // Do not cache failures — let the next launch or re-probe try again.
    return { vendor: 'none', model: DETECTION_FAILED_MODEL }
  }
}

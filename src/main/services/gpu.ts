import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import store from '../store'
import log from '../logger'
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
  const vramMatch = /(\d+)\s*GB/i.exec(String(gpu?.spdisplays_vram ?? ''))
  return {
    vendor: vendorFromName(model),
    model,
    vramMb: vramMatch ? Number(vramMatch[1]) * 1024 : undefined
  }
}

async function detectWin32(): Promise<GpuInfo> {
  const stdout = await runPowerShell(
    'Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | ConvertTo-Json'
  )
  type Adapter = { Name?: string; AdapterRAM?: number; DriverVersion?: string }
  const parsed = JSON.parse(stdout) as Adapter | Adapter[]
  const adapters = Array.isArray(parsed) ? parsed : [parsed]

  // Multi-GPU machines (e.g. NVIDIA dGPU + Intel iGPU): prefer the most
  // capable vendor for the encoder ladder.
  const rank: Record<GpuVendor, number> = { nvidia: 4, amd: 3, intel: 2, apple: 1, none: 0 }
  let best: GpuInfo = { vendor: 'none', model: 'Unknown' }
  for (const adapter of adapters) {
    const model = adapter.Name ?? ''
    const info: GpuInfo = {
      vendor: vendorFromName(model),
      model,
      vramMb: adapter.AdapterRAM ? Math.round(adapter.AdapterRAM / (1024 * 1024)) : undefined,
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

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import store from '../store'
import log from '../logger'
import { app } from 'electron'
import {
  parseRegExeVram,
  resolveVramMb,
  SATURATED_ADAPTER_RAM_MB,
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

/** `execFile`'s rejection carries the partial output; pull it out safely. */
function stdoutOf(err: unknown): string {
  const value = (err as { stdout?: unknown } | null)?.stdout
  return typeof value === 'string' ? value : ''
}

async function runPowerShell(command: string): Promise<string> {
  let lastErr: unknown
  for (const exe of POWERSHELL_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(exe, ['-NoProfile', '-Command', command], {
        timeout: 20000
      })
      return stdout
    } catch (err) {
      // PowerShell exits non-zero when *any* error touched the pipeline, even one
      // it was told to ignore, and `execFile` rejects on that exit code alone — so
      // a complete, valid result on stdout would otherwise be thrown away. Only a
      // run that produced nothing counts as a failure.
      const stdout = stdoutOf(err)
      if (stdout.trim()) return stdout
      lastErr = err
      // Another candidate only helps when *this* executable was the problem
      // (ENOENT/EACCES). A timeout means the shell started and the query never
      // finished — wedged WMI, or EDR/AppLocker holding the process — and every
      // other shell would hang identically, so don't pay the timeout three times.
      if ((err as { killed?: boolean } | null)?.killed) break
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

/** Generous next to a measured ~460 ms cold start; this only catches a hang. */
const GPU_INFO_TIMEOUT_MS = 5000

/**
 * PCI vendor IDs, as Chromium reports them in `gpuDevice[].vendorId`. This is
 * the authoritative signal — a marketing name need not contain the vendor, and
 * Windows' own software adapter ("Microsoft Basic Render Driver", 0x1414) must
 * not be mistaken for hardware. Anything unlisted falls back to the name.
 */
const PCI_VENDORS: Record<number, GpuVendor> = {
  0x10de: 'nvidia',
  0x1002: 'amd',
  0x1022: 'amd',
  0x8086: 'intel',
  0x106b: 'apple'
}

/**
 * Display adapters straight from Chromium's GPU process — no child process at
 * all, so this survives a PowerShell that is missing, policy-blocked, or wedged
 * behind a broken WMI repository. Returns the same model string and a
 * byte-identical `driverVersion` as the CIM query it replaces, but no memory
 * figure — hence the separate registry lookup.
 */
async function adaptersFromElectron(): Promise<WindowsAdapter[]> {
  if (!app.isReady()) return []
  try {
    // `getGPUInfo('complete')` carries no timeout and is reported never to settle
    // on some GPU-disabled configurations, so an unguarded await could hang
    // detection forever — worse than the shell it replaces.
    const info = (await Promise.race([
      app.getGPUInfo('complete'),
      new Promise((resolve) => setTimeout(() => resolve(null), GPU_INFO_TIMEOUT_MS))
    ])) as {
      gpuDevice?: Array<{ deviceString?: string; vendorId?: number; driverVersion?: string }>
    } | null
    if (!info) {
      log.debug('Electron GPU info timed out, falling back to PowerShell')
      return []
    }
    return (info.gpuDevice ?? [])
      .filter((d) => d.deviceString)
      .map((d) => ({
        Name: d.deviceString,
        DriverVersion: d.driverVersion,
        VendorId: d.vendorId
      }))
  } catch (err) {
    log.debug(`Electron GPU info unavailable, falling back to PowerShell: ${String(err)}`)
    return []
  }
}

/** Same list via WMI. Only reached when Chromium reported nothing usable. */
async function adaptersFromCim(): Promise<WindowsAdapter[]> {
  const stdout = await runPowerShell(
    'Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | ConvertTo-Json'
  )
  const parsed = JSON.parse(stdout) as WindowsAdapter | WindowsAdapter[]
  return Array.isArray(parsed) ? parsed : [parsed]
}

// Display adapters' driver class. Each subkey is one installed driver, and
// carries the true VRAM that Win32_VideoController.AdapterRAM cannot express.
const DISPLAY_CLASS_KEY =
  'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'

/** `HardwareInformation.MemorySize` is the pre-QWORD spelling; it saturates. */
const VRAM_VALUE_NAMES = [
  'DriverDesc',
  'HardwareInformation.qwMemorySize',
  'HardwareInformation.MemorySize'
]

function runRegQuery(valueName: string): Promise<string> {
  const exe = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\reg.exe`
  return execFileAsync(exe, ['query', DISPLAY_CLASS_KEY, '/s', '/v', valueName], {
    timeout: 10000
  }).then(({ stdout }) => stdout)
}

/**
 * True VRAM per driver, or `[]` if anything goes wrong.
 *
 * `reg.exe` rather than PowerShell: an in-box OS component with no scripting
 * engine behind it, so it survives the policies that block script hosts, and it
 * skips the class key's ACL-protected `Properties` subkey silently instead of
 * exiting non-zero over it. Kept separate from the adapter list so that a
 * registry read failing on some machine cannot take the whole probe down.
 */
async function readRegistryVram(): Promise<RegistryVram[]> {
  try {
    const [names, qw, dw] = await Promise.all(VRAM_VALUE_NAMES.map(runRegQuery))
    return parseRegExeVram(names, qw, dw)
  } catch (err) {
    log.debug(`GPU registry VRAM lookup failed: ${String(err)}`)
    return []
  }
}

async function detectWin32(): Promise<GpuInfo> {
  // Independent lookups, so run them together.
  const [adapters, registry] = await Promise.all([adaptersFromElectron(), readRegistryVram()])

  // Chromium is the primary source; WMI is the last resort if it reported
  // nothing usable. Only that path yields AdapterRAM, hence the VRAM fallback
  // inside resolveVramMb.
  const resolved = adapters.length ? adapters : await adaptersFromCim()

  // Multi-GPU machines (e.g. NVIDIA dGPU + Intel iGPU): prefer the most
  // capable vendor for the encoder ladder.
  const rank: Record<GpuVendor, number> = { nvidia: 4, amd: 3, intel: 2, apple: 1, none: 0 }
  let best: GpuInfo = { vendor: 'none', model: 'Unknown' }
  for (const adapter of resolved) {
    const model = adapter.Name ?? ''
    const info: GpuInfo = {
      vendor:
        (adapter.VendorId !== undefined ? PCI_VENDORS[adapter.VendorId] : undefined) ??
        vendorFromName(model),
      model,
      vramMb: resolveVramMb(adapter, registry),
      driverVersion: adapter.DriverVersion ?? undefined
    }
    if (rank[info.vendor] > rank[best.vendor]) best = info
  }
  return best
}

const DETECTION_FAILED_MODEL = 'Unknown (detection failed)'

/**
 * Detect the GPU once and cache the result in electron-store.
 * `force` re-runs detection (the Settings "re-probe" action).
 */
export async function detectGpu(force = false): Promise<GpuInfo> {
  if (!force) {
    const cached = store.get('gpuInfo')
    // Discard a cached failure so we retry rather than return it forever, and a
    // cached saturated AdapterRAM so upgraded installs stop showing 4 GB for a
    // larger card without needing a manual "Re-detect hardware".
    const stale =
      !cached ||
      cached.model === DETECTION_FAILED_MODEL ||
      cached.vramMb === SATURATED_ADAPTER_RAM_MB
    if (!stale) return cached
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

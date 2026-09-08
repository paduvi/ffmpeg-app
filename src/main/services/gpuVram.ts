/**
 * Pure VRAM-resolution logic for the Windows GPU probe.
 *
 * Split out from `gpu.ts` deliberately: that module imports electron, so it
 * cannot be exercised outside a running app. This file has no imports at all,
 * so the decision table below can be tested directly — which matters because
 * the `reg.exe` output that feeds it can only be produced on Windows.
 */

/**
 * One display adapter. `AdapterRAM` is only present on the WMI fallback path;
 * `VendorId` only on the Chromium path, where it is the authoritative PCI id.
 */
export type WindowsAdapter = {
  Name?: string
  AdapterRAM?: number
  DriverVersion?: string
  VendorId?: number
}

/** One driver's registry entry: display name and true memory size in bytes. */
export type RegistryVram = {
  Name?: string
  /** Kept as a string so a >2³² byte count survives parsing without mangling. */
  Bytes?: string
}

const BYTES_PER_MB = 1024 * 1024

/**
 * A uint32 cannot hold 4 GB, so any card with at least that much pins just under
 * the ceiling instead — measured 4293918720 bytes (4095 MB) on a 6 GB RTX 2060.
 * The value means "≥ 4 GB, size unknown", not "4 GB", and no real card ships
 * 4095 MB, so at or above this we report nothing rather than a wrong total.
 *
 * `_MB` is the same ceiling as a build that still trusted AdapterRAM would have
 * *stored* it; nothing writes that now, so finding it in a cached probe means the
 * cache predates the fix and should be re-detected.
 */
const SATURATED_ADAPTER_RAM_BYTES = 4293918720
export const SATURATED_ADAPTER_RAM_MB = Math.round(SATURATED_ADAPTER_RAM_BYTES / BYTES_PER_MB)

/**
 * `Win32_VideoController.AdapterRAM` is a **uint32 of bytes**, so it saturates
 * just under 4 GB: an 8, 12 or 24 GB card all report ~4095 MB. The driver's
 * own registry key carries the true size as a REG_QWORD, so prefer that and
 * keep AdapterRAM only as the fallback.
 *
 * Matching is by name — the CIM `Name` and the registry `DriverDesc` both come
 * from the driver INF, so they agree in practice. Anything unmatched falls back
 * to AdapterRAM, except when AdapterRAM is sitting on its uint32 ceiling (see
 * `SATURATED_ADAPTER_RAM_BYTES`) — there it carries no information at all.
 */
export function resolveVramMb(
  adapter: WindowsAdapter,
  registry: RegistryVram[]
): number | undefined {
  const name = adapter.Name?.trim().toLowerCase()
  const match = name
    ? registry.find((entry) => entry.Name?.trim().toLowerCase() === name)
    : undefined

  const registryBytes = Number(match?.Bytes)
  if (Number.isFinite(registryBytes) && registryBytes > 0) {
    return Math.round(registryBytes / BYTES_PER_MB)
  }

  const adapterBytes = adapter.AdapterRAM
  if (
    typeof adapterBytes === 'number' &&
    Number.isFinite(adapterBytes) &&
    adapterBytes > 0 &&
    adapterBytes < SATURATED_ADAPTER_RAM_BYTES
  ) {
    return Math.round(adapterBytes / BYTES_PER_MB)
  }

  return undefined
}

/**
 * One `reg.exe query <key> /s /v <name>` block looks like:
 *
 * ```
 * HKEY_LOCAL_MACHINE\SYSTEM\...\Class\{4d36e968-...}\0000
 *     HardwareInformation.qwMemorySize    REG_QWORD    0x180000000
 * ```
 *
 * Returns subkey path (lower-cased, for joining) → `[type, data]`. The `REG_*`
 * token is the anchor rather than a fixed run of spaces: `DriverDesc`'s data is
 * free text that can contain runs of spaces of its own.
 */
function parseRegExeBlock(stdout: string): Map<string, [string, string]> {
  const out = new Map<string, [string, string]>()
  let key = ''
  for (const line of stdout.split('\n')) {
    const trimmedEnd = line.replace(/\r$/, '')
    if (/^HKEY_/i.test(trimmedEnd)) {
      key = trimmedEnd.trim().toLowerCase()
      continue
    }
    const m = /^\s+(.+?)\s+(REG_[A-Z_]+)\s+(.*)$/.exec(trimmedEnd)
    if (m && key) out.set(key, [m[2].toUpperCase(), m[3].trim()])
  }
  return out
}

/**
 * Registry numbers as `reg.exe` prints them. `REG_QWORD`/`REG_DWORD` arrive as
 * `0x…`; `REG_BINARY` as a contiguous little-endian hex string, so its byte
 * pairs must be reversed before parsing.
 */
function regValueToBytes(type: string, data: string): string | undefined {
  if (type === 'REG_BINARY') {
    const hex = data.replace(/[^0-9a-fA-F]/g, '')
    if (!hex || hex.length % 2 !== 0) return undefined
    const pairs = hex.match(/../g)
    if (!pairs) return undefined
    const value = BigInt(`0x${pairs.reverse().join('')}`)
    return value > 0n ? value.toString() : undefined
  }
  if (!/^0x[0-9a-fA-F]+$/.test(data)) return undefined
  const value = BigInt(data)
  return value > 0n ? value.toString() : undefined
}

/**
 * Join three `reg.exe query /s /v …` outputs into the same rows the PowerShell
 * lookup used to produce, matching each driver subkey's `DriverDesc` to its
 * memory size. `qwMemorySize` (REG_QWORD) wins over the legacy 32-bit
 * `MemorySize`, which saturates exactly like AdapterRAM — measured 0xfff00000
 * (4095 MB) on a 6 GB card.
 */
export function parseRegExeVram(
  driverDescOut: string,
  qwMemoryOut: string,
  memorySizeOut: string
): RegistryVram[] {
  const names = parseRegExeBlock(driverDescOut)
  const qw = parseRegExeBlock(qwMemoryOut)
  const dw = parseRegExeBlock(memorySizeOut)

  const rows: RegistryVram[] = []
  for (const [key, [, name]] of names) {
    if (!name) continue
    const entry = qw.get(key) ?? dw.get(key)
    if (!entry) continue
    const bytes = regValueToBytes(entry[0], entry[1])
    if (bytes) rows.push({ Name: name, Bytes: bytes })
  }
  return rows
}

/**
 * Pure VRAM-resolution logic for the Windows GPU probe.
 *
 * Split out from `gpu.ts` deliberately: that module imports electron, so it
 * cannot be exercised outside a running app. This file has no imports at all,
 * so the decision table below can be tested directly — which matters because
 * the PowerShell that feeds it can only run on Windows.
 */

/** One row of `Get-CimInstance Win32_VideoController`. */
export type WindowsAdapter = {
  Name?: string
  AdapterRAM?: number
  DriverVersion?: string
}

/** One driver's registry entry: display name and true memory size in bytes. */
export type RegistryVram = {
  Name?: string
  /** Kept as a string across the PowerShell boundary to avoid any numeric mangling. */
  Bytes?: string
}

const BYTES_PER_MB = 1024 * 1024

/**
 * `Win32_VideoController.AdapterRAM` is a **uint32 of bytes**, so it saturates
 * just under 4 GB: an 8, 12 or 24 GB card all report ~4095 MB. The driver's
 * own registry key carries the true size as a REG_QWORD, so prefer that and
 * keep AdapterRAM only as the fallback.
 *
 * Matching is by name — the CIM `Name` and the registry `DriverDesc` both come
 * from the driver INF, so they agree in practice. Anything unmatched simply
 * falls back, which is exactly the old behaviour.
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
  if (typeof adapterBytes === 'number' && Number.isFinite(adapterBytes) && adapterBytes > 0) {
    return Math.round(adapterBytes / BYTES_PER_MB)
  }

  return undefined
}

/** Normalise `ConvertTo-Json` output, which emits a bare object for one row. */
export function parseRegistryVram(stdout: string): RegistryVram[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []
  const parsed = JSON.parse(trimmed) as RegistryVram | RegistryVram[]
  return Array.isArray(parsed) ? parsed : [parsed]
}

/** Zero-padded two-digit helper for timecodes. */
const pad = (n: number): string => String(Math.floor(n)).padStart(2, '0')

/** `h:mm:ss` above an hour, `m:ss` below it. For read-only duration cells. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

/**
 * Parse a trim timecode into seconds. Accepts `ss`, `mm:ss` and `hh:mm:ss`,
 * with optional fractional seconds. Returns null for anything unparseable so
 * the caller can flag the field instead of silently trimming at 0.
 */
export function parseTimecode(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const parts = trimmed.split(':')
  if (parts.length > 3) return null

  let seconds = 0
  for (const part of parts) {
    // Only the last part may be fractional; the rest must be whole numbers.
    if (!/^\d+(\.\d+)?$/.test(part)) return null
    seconds = seconds * 60 + parseFloat(part)
  }
  return Number.isFinite(seconds) ? seconds : null
}

/**
 * Coarse "how long will this take" label. Estimates are heuristics, so the
 * resolution deliberately drops as the number grows — `~2m` reads as an
 * estimate in a way `~1m 47s` does not.
 */
export function formatEstimate(seconds: number): string {
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))}s`
  if (seconds < 3600) {
    const m = Math.round(seconds / 60)
    return `~${m}m`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`
}

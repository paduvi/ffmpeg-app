import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

/**
 * Create this run's output directory, `~/ffmpeg-output/<yyyyMMddHHmmss>/`.
 *
 * The timestamp is deliberately **local time, not UTC** — it matches the legacy
 * JavaFX app, and a folder named in the user's own clock is the point. Shared by
 * compression and cutting: both had a verbatim copy of this, which is exactly how
 * that invariant would have drifted.
 */
export function makeOutputDir(): string {
  const now = new Date()
  const ts =
    String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
  const dir = join(homedir(), 'ffmpeg-output', ts)
  mkdirSync(dir, { recursive: true })
  return dir
}

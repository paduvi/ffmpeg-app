import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveFfmpegPath } from './ffmpeg'
import log from '../logger'

export type Frame = { path: string; timestampMs: number }

// showinfo filter emits lines like:
// [Parsed_showinfo_1 @ 0x...] n:   0 pts: 512 pts_time:0.200000 ...
const SHOWINFO_RE = /Parsed_showinfo.*?\bpts_time:(\d+(?:\.\d+)?)/
const DURATION_RE = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/

function parseDurationSeconds(h: string, m: string, s: string): number {
  return Number(h) * 3600 + Number(m) * 60 + parseFloat(s)
}

/**
 * @param onProgress - called for each extracted frame with a 0–1 value
 *   representing how far through the video extraction has progressed.
 *   Useful for showing a progress bar during the (potentially slow) extraction
 *   phase before similarity search begins.
 */
export async function extractFrames(
  videoPath: string,
  signal: AbortSignal,
  onProgress?: (value: number) => void
): Promise<{ frames: Frame[]; cleanup: () => void }> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dogympeg-frames-'))
  const timestamps: number[] = []

  await new Promise<void>((resolve, reject) => {
    const binary = resolveFfmpegPath()
    // Select every 30th frame; showinfo writes pts_time to stderr
    const args = [
      '-i', videoPath,
      '-vf', 'select=not(mod(n\\,30)),showinfo',
      '-vsync', 'vfr',
      '-q:v', '5',
      join(tmpDir, 'frame_%06d.jpg'),
      '-y'
    ]

    const proc = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] })

    const onAbort = (): void => {
      proc.kill('SIGTERM')
      setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL') }, 3000)
    }
    signal.addEventListener('abort', onAbort, { once: true })

    let totalSeconds = 0
    const rl = createInterface({ input: proc.stderr! })
    rl.on('line', (line) => {
      // Parse total duration once (for progress reporting)
      if (!totalSeconds) {
        const dm = DURATION_RE.exec(line)
        if (dm) totalSeconds = parseDurationSeconds(dm[1], dm[2], dm[3])
      }
      const m = SHOWINFO_RE.exec(line)
      if (m) {
        const ptsS = parseFloat(m[1])
        timestamps.push(Math.round(ptsS * 1000))
        if (onProgress && totalSeconds > 0) {
          onProgress(Math.min(ptsS / totalSeconds, 1))
        }
      }
    })

    proc.on('close', (code) => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted || code === 0) resolve()
      else reject(new Error(`Frame extraction failed with code ${code}`))
    })

    proc.on('error', reject)
  })

  const fileNames = readdirSync(tmpDir).filter((f) => f.endsWith('.jpg')).sort()
  const frames: Frame[] = fileNames.map((name, i) => ({
    path: join(tmpDir, name),
    timestampMs: timestamps[i] ?? i * 1000
  }))

  log.info(`Extracted ${frames.length} frames from ${videoPath}`)

  return {
    frames,
    cleanup: () => {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }
}

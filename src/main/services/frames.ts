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

export async function extractFrames(
  videoPath: string,
  signal: AbortSignal
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

    const rl = createInterface({ input: proc.stderr! })
    rl.on('line', (line) => {
      const m = SHOWINFO_RE.exec(line)
      if (m) timestamps.push(Math.round(parseFloat(m[1]) * 1000))
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

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { app } from 'electron'
import store from '../store'
import log from '../logger'

const DURATION_RE = /Duration:\s*(\d+:\d+:\d+\.\d+)/
const PROGRESS_RE = /time=(\s*\d+:\d+:\d+\.\d+)/

function parseTime(str: string): number {
  const [h, m, s] = str.trim().split(':')
  return Number(h) * 3600 + Number(m) * 60 + parseFloat(s)
}

export function resolveFfmpegPath(): string {
  if (!store.get('useDefaultFfmpeg')) {
    const custom = store.get('ffmpegLocation')
    if (custom) {
      log.debug(`Using custom ffmpeg: ${custom}`)
      return custom
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  let binary = require('ffmpeg-static') as string

  if (app.isPackaged) {
    // The binary lives inside app.asar but can't be executed from there.
    // electron-builder unpacks it via asarUnpack; fix the path accordingly.
    binary = binary.replace(
      join('app.asar', 'node_modules'),
      join('app.asar.unpacked', 'node_modules')
    )
  }

  log.debug(`Using bundled ffmpeg: ${binary}`)
  return binary
}

/**
 * @param expectedSeconds Length of the *output* in seconds, when the caller
 *   already knows it. ffmpeg's `Duration:` banner reports the **input** length,
 *   which over-states the denominator whenever `-ss`/`-t` shorten the output —
 *   the bar would then stall short of 100 %. Omit it for whole-file jobs.
 */
export function runFfmpeg(
  args: string[],
  onProgress: (value: number) => void,
  signal: AbortSignal,
  expectedSeconds?: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Guard: if already aborted before we even spawn, bail immediately
    if (signal.aborted) {
      reject(new Error('ffmpeg aborted'))
      return
    }

    const binary = resolveFfmpegPath()
    log.debug(`ffmpeg ${args.join(' ')}`)

    const proc = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] })

    const onAbort = (): void => {
      proc.kill('SIGTERM')
      // Force-kill if SIGTERM is not honoured within 3 s
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL')
      }, 3000)
    }
    signal.addEventListener('abort', onAbort, { once: true })

    let totalSeconds = expectedSeconds && expectedSeconds > 0 ? expectedSeconds : 0

    // FFmpeg writes all progress info to stderr
    const rl = createInterface({ input: proc.stderr! })
    rl.on('line', (line) => {
      if (!totalSeconds) {
        const m = DURATION_RE.exec(line)
        if (m) totalSeconds = parseTime(m[1])
      }
      const m = PROGRESS_RE.exec(line)
      if (m && totalSeconds > 0) {
        onProgress(Math.min(parseTime(m[1]) / totalSeconds, 1))
      }
    })

    proc.on('close', (code) => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) {
        reject(new Error('ffmpeg aborted'))
      } else if (code === 0) {
        onProgress(1)
        resolve()
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      signal.removeEventListener('abort', onAbort)
      reject(err)
    })
  })
}

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolveFfmpegPath } from './ffmpeg'
import { FRAME_BYTES, IMG_SIZE } from './preprocess'
import log from '../logger'

export type RawFrame = { pixels: Uint8Array; timestampMs: number }

/**
 * 'keyframes' decodes only I-frames (`-skip_frame nokey`) — measured ~34×
 * faster than full decode, and the `-c copy` cut can only land on a keyframe
 * anyway, so sampling there costs no output precision. Match windows shorter
 * than one GOP can slip through, so callers fall back to 'dense' (decode all,
 * keep every 30th ≈ 1 frame/s) when keyframe sampling finds nothing.
 */
export type FrameSampling = 'keyframes' | 'dense'

export type FrameStream = {
  frames: AsyncIterable<RawFrame>
  /** Frames assembled but not yet consumed — the adaptive-flush signal. */
  pendingCount: () => number
  /** Frames emitted by the producer so far. */
  producedCount: () => number
  /** Fraction of the video decoded so far (pts/duration), 0–1. */
  producedFraction: () => number
  /** Kill the producer (early termination / abort / error). Idempotent. */
  stop: () => void
}

// showinfo filter emits lines like:
// [Parsed_showinfo_3 @ 0x...] n:   0 pts: 512 pts_time:0.200000 ...
const SHOWINFO_RE = /Parsed_showinfo.*?\bpts_time:(\d+(?:\.\d+)?)/
const DURATION_RE = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/

// Pause the ffmpeg stdout pipe when this many frames sit unconsumed (~9.6 MB);
// resume below half. The consumer normally outpaces the producer, so this only
// engages if inference stalls.
const HIGH_WATER = 64

/** Minimal push-queue bridging event callbacks to an async iterator. */
class AsyncQueue<T> implements AsyncIterable<T> {
  /** Called after a buffered item is taken — used to release backpressure. */
  onDrain: (() => void) | null = null
  private items: T[] = []
  private waiters: Array<{ resolve: (r: IteratorResult<T>) => void; reject: (e: Error) => void }> =
    []
  private done = false
  private err: Error | null = null

  push(item: T): void {
    const w = this.waiters.shift()
    if (w) w.resolve({ value: item, done: false })
    else this.items.push(item)
  }

  /** End the stream; with `err`, pending and future reads reject. */
  end(err?: Error): void {
    if (this.done) return
    this.done = true
    this.err = err ?? null
    for (const w of this.waiters.splice(0)) {
      if (this.err) w.reject(this.err)
      else w.resolve({ value: undefined as never, done: true })
    }
  }

  size(): number {
    return this.items.length
  }

  private next = (): Promise<IteratorResult<T>> => {
    if (this.items.length > 0) {
      const value = this.items.shift()!
      this.onDrain?.()
      return Promise.resolve({ value, done: false })
    }
    if (this.done) {
      return this.err
        ? Promise.reject(this.err)
        : Promise.resolve({ value: undefined as never, done: true })
    }
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return { next: this.next }
  }
}

/**
 * Stream sampled frames from a video as raw 224×224 rgb24 buffers.
 *
 * ffmpeg scales + center-crops each sampled frame (cover semantics — must
 * match sharp's `.resize(224, 224)` used for sample images in preprocess.ts)
 * and writes rawvideo to stdout: no tmpdir, no JPEG round-trip, no per-frame
 * sharp. Timestamps come from pairing the k-th stdout frame with the k-th
 * showinfo line on stderr — both are emitted in presentation order.
 */
export function streamFrames(
  videoPath: string,
  signal: AbortSignal,
  hwaccel = true,
  sampling: FrameSampling = 'keyframes'
): FrameStream {
  const binary = resolveFfmpegPath()
  const filters =
    (sampling === 'dense' ? 'select=not(mod(n\\,30)),' : '') +
    `scale=${IMG_SIZE}:${IMG_SIZE}:force_original_aspect_ratio=increase:flags=lanczos,crop=${IMG_SIZE}:${IMG_SIZE},showinfo`
  const args = [
    // 'auto' picks the platform decoder (VideoToolbox / D3D11VA) and silently
    // falls back to software when the codec has no hw path; the caller retries
    // without it if the stream still fails.
    ...(hwaccel ? ['-hwaccel', 'auto'] : []),
    // Keyframe mode: the decoder skips every non-I frame, so only one frame
    // per GOP is ever decoded; in this mode all surviving frames are sampled.
    ...(sampling === 'keyframes' ? ['-skip_frame', 'nokey'] : []),
    '-i', videoPath,
    '-an', '-sn',
    '-vf', filters,
    '-vsync', 'vfr',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    'pipe:1'
  ]
  log.debug(`frame stream: ffmpeg ${args.join(' ')}`)

  const queue = new AsyncQueue<RawFrame>()
  const ptsQueue: number[] = []
  const pixelQueue: Uint8Array[] = []
  let pending: Buffer = Buffer.alloc(0)
  let produced = 0
  let totalSeconds = 0
  let lastPts = 0
  let stopRequested = false
  let paused = false

  const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })

  const stop = (): void => {
    if (stopRequested) return
    stopRequested = true
    proc.kill('SIGTERM')
    // Force-kill if SIGTERM is not honoured within 3 s
    setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL')
    }, 3000)
  }
  const onAbort = (): void => stop()
  signal.addEventListener('abort', onAbort, { once: true })

  const tryEmit = (): void => {
    while (ptsQueue.length > 0 && pixelQueue.length > 0) {
      const pts = ptsQueue.shift()!
      const pixels = pixelQueue.shift()!
      produced++
      lastPts = pts
      queue.push({ pixels, timestampMs: Math.round(pts * 1000) })
    }
    if (!paused && queue.size() > HIGH_WATER) {
      paused = true
      proc.stdout!.pause()
    }
  }

  queue.onDrain = (): void => {
    if (paused && queue.size() < HIGH_WATER / 2) {
      paused = false
      proc.stdout!.resume()
    }
  }

  proc.stdout!.on('data', (chunk: Buffer) => {
    pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk])
    while (pending.length >= FRAME_BYTES) {
      const pixels = new Uint8Array(FRAME_BYTES)
      pending.copy(pixels, 0, 0, FRAME_BYTES)
      pending = pending.subarray(FRAME_BYTES)
      pixelQueue.push(pixels)
    }
    tryEmit()
  })

  const rl = createInterface({ input: proc.stderr! })
  rl.on('line', (line) => {
    if (!totalSeconds) {
      const dm = DURATION_RE.exec(line)
      if (dm) totalSeconds = Number(dm[1]) * 3600 + Number(dm[2]) * 60 + parseFloat(dm[3])
    }
    const m = SHOWINFO_RE.exec(line)
    if (m) {
      ptsQueue.push(parseFloat(m[1]))
      tryEmit()
    }
  })

  proc.on('close', (code) => {
    signal.removeEventListener('abort', onAbort)
    if (!stopRequested && (pixelQueue.length || ptsQueue.length || pending.length)) {
      log.warn(
        `frame stream: unpaired leftovers (pixels=${pixelQueue.length}, pts=${ptsQueue.length}, bytes=${pending.length})`
      )
    }
    if (!stopRequested && !signal.aborted && code !== 0) {
      queue.end(new Error(`frame extraction failed with code ${code}`))
    } else {
      queue.end()
    }
  })

  proc.on('error', (err) => {
    signal.removeEventListener('abort', onAbort)
    queue.end(err instanceof Error ? err : new Error(String(err)))
  })

  return {
    frames: queue,
    pendingCount: () => queue.size(),
    producedCount: () => produced,
    producedFraction: () => (totalSeconds > 0 ? Math.min(lastPts / totalSeconds, 1) : 0),
    stop
  }
}

import store from '../store'
import log from '../logger'
import { probeVideo } from './probe'
import { resolveVideoEncoder } from './encoders'
import type {
  CompressionPreset,
  CutMode,
  EstimateTask,
  VideoAnalysis,
  VideoEncoder
} from '../../shared/types'

/**
 * Estimates are expressed as a **speed**: seconds of source video handled per
 * second of wall clock, normalised to 1080p. A 4K file at the same speed takes
 * four times as long, so the estimate scales by the pixel ratio.
 *
 * The tables below are only the cold-start guess. Every finished file feeds
 * `recordThroughput()`, which keeps an EMA of the speed actually observed on
 * this machine (keyed by encoder/preset or cut mode) in electron-store; once a
 * key has been measured the learned value replaces the guess, so estimates get
 * better the more the app is used.
 */
const REFERENCE_PIXELS = 1920 * 1080

/** Cold-start hardware/software encode speeds at 1080p. */
const ENCODER_SPEED: Record<VideoEncoder, number> = {
  h264_nvenc: 10,
  h264_videotoolbox: 6,
  h264_qsv: 6,
  h264_amf: 6,
  libx264: 1.8 // refined by PRESET_SPEED below
}

/** libx264 speed at 1080p per preset — the CPU path is the preset-sensitive one. */
const PRESET_SPEED: Record<CompressionPreset, number> = {
  ultrafast: 8,
  superfast: 6,
  veryfast: 4.5,
  faster: 3,
  fast: 2.2,
  medium: 1.8,
  slow: 1,
  slower: 0.6,
  veryslow: 0.3
}

/**
 * Keyframe-sampled ML search: the decoder skips every non-I frame, so only a
 * handful of frames per second of video reach ONNX. Very fast, but bounded
 * below by process startup, so a fixed overhead is added.
 */
const SEARCH_SPEED = 200
const SEARCH_OVERHEAD_SEC = 2.5

/** `-c copy` cut/trim: bounded by disk I/O, plus ffmpeg startup. */
const COPY_SPEED = 600
const COPY_OVERHEAD_SEC = 0.8

/** Weight of the newest measurement in the throughput EMA. */
const EMA_ALPHA = 0.3

/** How a compression job was encoded — irrelevant to (and omitted by) cutting. */
export type EncodingChoice = { encoder: VideoEncoder; preset: CompressionPreset }

function throughputKey(task: EstimateTask, encoding?: EncodingChoice): string {
  if (task.kind !== 'compression') return `cutting:${task.cutMode}`
  const { encoder, preset } = encoding ?? { encoder: 'libx264', preset: 'medium' }
  // Only libx264 is preset-sensitive enough to deserve its own key per preset.
  return `compression:${encoder}${encoder === 'libx264' ? `:${preset}` : ''}`
}

/** Learned speed for a key, or `null` when nothing has been measured yet. */
function learnedSpeed(key: string): number | null {
  const speed = store.get('throughput')?.[key]
  return typeof speed === 'number' && speed > 0 ? speed : null
}

/** One finished file: how much source video was handled, and how long it took. */
export type ThroughputSample = {
  durationSec: number | null
  /** Frame area, for normalising to 1080p; null when the probe found none. */
  pixels: number | null
  elapsedSec: number
}

/**
 * Fold one finished file into the learned-speed EMA.
 *
 * Very short runs are ignored: their wall time is dominated by process startup
 * and would drag the average towards nonsense.
 */
export function recordThroughput(
  task: EstimateTask,
  sample: ThroughputSample,
  encoding?: EncodingChoice
): void {
  const { durationSec, pixels, elapsedSec } = sample
  if (!durationSec || durationSec < 5 || elapsedSec < 1) return
  const pixelRatio = pixels && pixels > 0 ? pixels / REFERENCE_PIXELS : 1
  const speed = (durationSec * pixelRatio) / elapsedSec
  if (!Number.isFinite(speed) || speed <= 0) return

  const key = throughputKey(task, encoding)
  const table = { ...(store.get('throughput') ?? {}) }
  const previous = table[key]
  table[key] = previous > 0 ? previous * (1 - EMA_ALPHA) + speed * EMA_ALPHA : speed
  store.set('throughput', table)
  log.debug(`throughput[${key}] = ${table[key].toFixed(2)}× (sample ${speed.toFixed(2)}×)`)
}

function compressionSeconds(
  durationSec: number,
  pixelRatio: number,
  encoder: VideoEncoder,
  preset: CompressionPreset,
  key: string
): number {
  const base = encoder === 'libx264' ? PRESET_SPEED[preset] : ENCODER_SPEED[encoder]
  const speed = learnedSpeed(key) ?? base
  return (durationSec * pixelRatio) / speed
}

function cuttingSeconds(
  durationSec: number,
  pixelRatio: number,
  cutMode: CutMode,
  key: string
): number {
  const learned = learnedSpeed(key)
  if (learned) return (durationSec * pixelRatio) / learned

  // Trim mode never decodes: it is a single stream copy.
  if (cutMode === 'trim') return COPY_OVERHEAD_SEC + (durationSec * pixelRatio) / COPY_SPEED

  // Smart modes scan for the match, then stream-copy the cut. The estimate
  // assumes the match is found at keyframe sampling; the dense-sampling
  // fallback for a no-match video roughly doubles the scan.
  return (
    SEARCH_OVERHEAD_SEC +
    (durationSec * pixelRatio) / SEARCH_SPEED +
    COPY_OVERHEAD_SEC +
    (durationSec * pixelRatio) / COPY_SPEED
  )
}

/**
 * Probe each path and attach a processing-time estimate for `task`.
 * Never throws: an unprobeable file yields nulls and the UI shows "—".
 */
export async function analyzeVideos(
  paths: string[],
  task: EstimateTask
): Promise<VideoAnalysis[]> {
  const preset = store.get('preset')
  // Only the compression estimate depends on the encoder, and resolving it is
  // cached after the first probe — but skip it entirely for cutting.
  const encoder: VideoEncoder =
    task.kind === 'compression' ? await resolveVideoEncoder().catch(() => 'libx264') : 'libx264'
  const key = throughputKey(task, { encoder, preset })

  return Promise.all(
    paths.map(async (path): Promise<VideoAnalysis> => {
      const meta = await probeVideo(path)
      const { durationSec, width, height } = meta
      if (!durationSec) {
        return {
          path,
          durationSec: null,
          width,
          height,
          estimatedSec: null
        }
      }

      const pixels = width && height ? width * height : null
      const pixelRatio = pixels ? pixels / REFERENCE_PIXELS : 1
      const estimatedSec =
        task.kind === 'compression'
          ? compressionSeconds(durationSec, pixelRatio, encoder, preset, key)
          : cuttingSeconds(durationSec, pixelRatio, task.cutMode, key)

      return {
        path,
        durationSec,
        width,
        height,
        estimatedSec: Math.max(estimatedSec, 1)
      }
    })
  )
}

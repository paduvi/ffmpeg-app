export type CompressionPreset =
  | 'ultrafast'
  | 'superfast'
  | 'veryfast'
  | 'faster'
  | 'fast'
  | 'medium'
  | 'slow'
  | 'slower'
  | 'veryslow'

export type AudioCodec = 'aac' | 'copy' | 'mp3' | 'opus'

export type GpuVendor = 'apple' | 'nvidia' | 'amd' | 'intel' | 'none'

export type GpuInfo = {
  vendor: GpuVendor
  model: string
  /**
   * Dedicated video memory. Absent on Apple Silicon, which shares one unified
   * pool with the CPU and reports no separate figure — `cores` is the
   * meaningful spec there instead.
   */
  vramMb?: number
  /** GPU core count. macOS only; `system_profiler` reports it, Windows does not. */
  cores?: number
  driverVersion?: string
}

/** Video encoders the compression ladder can select; libx264 is the CPU fallback. */
export type VideoEncoder = 'h264_videotoolbox' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'libx264'

/** Cached encoder capability probe, keyed by the ffmpeg binary that was probed. */
export type EncoderProbe = {
  ffmpegPath: string
  encoder: VideoEncoder
}

/** Effective acceleration status shown in Settings → Performance. */
export type GpuStatus = {
  gpu: GpuInfo
  inferenceBackend: 'CoreML' | 'DirectML' | 'CPU'
  videoEncoder: VideoEncoder
}

export type Settings = {
  audioCodec: AudioCodec
  preset: CompressionPreset
  crf: number
  useDefaultFfmpeg: boolean
  ffmpegLocation: string
  container: string
  videoExtension: string
  /** Last sample image picked on the Cutting page; null = use the default sample. */
  lastSampleImageId: number | null
  /** Detection/probe caches — managed by gpu.ts / encoders.ts, not user-edited. */
  gpuInfo: GpuInfo | null
  encoderProbe: EncoderProbe | null
  /** Learned processing speeds — managed by estimate.ts, not user-edited. */
  throughput: Record<string, number>
}

export type SampleImage = {
  id: number
  name: string
  path: string
  isPermanent: boolean
}

export type FileProgress = {
  name: string
  value: number // 0–1
  done: boolean
  active: boolean // currently being processed (shows animation even at 0%)
  /**
   * Input/output sizes, set once a file finishes so the progress modal can show
   * the real size change. Only main knows these — unlike the ETA, they cannot
   * be derived renderer-side from `value`.
   */
  inputBytes?: number
  outputBytes?: number
}

/**
 * How a cutting job decides where to cut.
 * - 'start' / 'end' — ML search against the sample image; cut at the first
 *   similar frame, or at the last one of the match window.
 * - 'trim' — no search at all; each video is trimmed to its own start–end
 *   range supplied by the user (see `CutJob.trim`).
 */
export type CutMode = 'start' | 'end' | 'trim'

/** A user-supplied trim window for one video, in seconds from its start. */
export type TrimRange = {
  startSec: number
  /** null = keep everything from `startSec` to the end of the video. */
  endSec: number | null
}

export type CutJob = {
  input: string
  /** Required for 'start'/'end'; null when cutting without a sample image. */
  sampleImageId: number | null
  /**
   * The user's per-video window ("dynamic per video"). Applied in **every**
   * mode: it bounds the ML search and always supplies the output's end, so a
   * sample-image cut and a manual trim compose rather than conflict.
   */
  trim?: TrimRange
}

export type VideoFile = {
  path: string
  name: string
  size: number
}

/** What a duration estimate is being requested for. */
export type EstimateTask = { kind: 'compression' } | { kind: 'cutting'; cutMode: CutMode }

/** Probed media facts plus the heuristic processing-time estimate for a task. */
export type VideoAnalysis = {
  path: string
  /** Container duration in seconds; null when ffmpeg could not report one. */
  durationSec: number | null
  width: number | null
  height: number | null
  /** Rough wall-clock estimate in seconds; null when duration is unknown. */
  estimatedSec: number | null
}

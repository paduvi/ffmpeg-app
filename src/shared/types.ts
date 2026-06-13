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
  vramMb?: number
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
}

export type SampleImage = {
  id: number
  name: string
  path: string
  isPermanent: boolean
}

export type FileProgress = {
  name: string
  value: number   // 0–1
  done: boolean
  active: boolean // currently being processed (shows animation even at 0%)
}

/** Whether to cut at the first similar frame (start) or the last (end of match). */
export type CutMode = 'start' | 'end'

export type VideoFile = {
  path: string
  name: string
  size: number
}

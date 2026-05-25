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

export type Settings = {
  audioCodec: AudioCodec
  preset: CompressionPreset
  crf: number
  useDefaultFfmpeg: boolean
  ffmpegLocation: string
  container: string
  videoExtension: string
}

export type SampleImage = {
  id: number
  name: string
  path: string
  isPermanent: boolean
}

export type JobProgress = {
  jobId: string
  value: number
}

export type VideoFile = {
  path: string
  name: string
  size: number
}

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

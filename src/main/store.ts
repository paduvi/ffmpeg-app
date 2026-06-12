import Store from 'electron-store'
import type { Settings } from '../shared/types'

const store = new Store<Settings>({
  defaults: {
    audioCodec: 'aac',
    preset: 'medium',
    crf: 23,
    useDefaultFfmpeg: true,
    ffmpegLocation: '',
    container: 'mp4',
    videoExtension: 'mp4',
    hwEncoding: 'auto',
    lastSampleImageId: null,
    gpuInfo: null,
    encoderProbe: null
  }
})

export default store

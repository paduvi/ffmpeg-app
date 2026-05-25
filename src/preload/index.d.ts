import { ElectronAPI } from '@electron-toolkit/preload'
import type { Settings, SampleImage, VideoFile } from '../shared/types'

type Unsubscribe = () => void

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      app: {
        quit: () => Promise<void>
        checkForUpdates: () => Promise<void>
      }
      dialog: {
        openVideos: () => Promise<VideoFile[]>
        openImage: () => Promise<string | null>
        openFile: (filters?: Electron.FileFilter[]) => Promise<string | null>
        openFolder: () => Promise<string | null>
        showItemInFolder: (fullPath: string) => Promise<void>
      }
      settings: {
        getAll: () => Promise<Settings>
        get: <K extends keyof Settings>(key: K) => Promise<Settings[K]>
        set: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
        reset: () => Promise<void>
      }
      samples: {
        getAll: () => Promise<SampleImage[]>
        insert: (name: string, path: string) => Promise<SampleImage>
        remove: (id: number) => Promise<void>
      }
      compression: {
        start: (jobs: { input: string; output?: string }[]) => Promise<string>
        cancel: (jobId: string) => Promise<void>
        onProgress: (cb: (jobId: string, value: number) => void) => Unsubscribe
        onDone: (cb: (jobId: string, outputDir: string) => void) => Unsubscribe
      }
      cutting: {
        start: (jobs: { input: string; sampleImageId: number }[]) => Promise<string>
        cancel: (jobId: string) => Promise<void>
        onProgress: (cb: (jobId: string, value: number) => void) => Unsubscribe
        onDone: (cb: (jobId: string, outputDir: string) => void) => Unsubscribe
      }
    }
  }
}

export {}

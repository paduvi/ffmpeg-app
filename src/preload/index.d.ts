import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  CutJob,
  CutMode,
  EstimateTask,
  GpuStatus,
  Settings,
  SampleImage,
  VideoAnalysis,
  VideoFile,
  FileProgress
} from '../shared/types'

type Unsubscribe = () => void

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      app: {
        quit: () => Promise<void>
        checkForUpdates: () => Promise<void>
        getVersion: () => Promise<string>
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
      gpu: {
        getStatus: () => Promise<GpuStatus>
        reprobe: () => Promise<GpuStatus>
      }
      media: {
        analyze: (paths: string[], task: EstimateTask) => Promise<VideoAnalysis[]>
      }
      compression: {
        start: (jobs: { input: string; output?: string }[]) => Promise<string>
        cancel: (jobId: string) => Promise<void>
        onProgress: (cb: (jobId: string, progress: FileProgress[]) => void) => Unsubscribe
        onDone: (cb: (jobId: string, outputDir: string) => void) => Unsubscribe
      }
      cutting: {
        start: (jobs: CutJob[], cutMode: CutMode) => Promise<string>
        cancel: (jobId: string) => Promise<void>
        onProgress: (cb: (jobId: string, progress: FileProgress[]) => void) => Unsubscribe
        onDone: (cb: (jobId: string, outputDir: string) => void) => Unsubscribe
      }
    }
  }
}

export {}

import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  CutMode,
  GpuStatus,
  Settings,
  SampleImage,
  VideoFile,
  FileProgress
} from '../shared/types'

const api = {
  app: {
    quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke('app:checkForUpdates')
  },

  dialog: {
    openVideos: (): Promise<VideoFile[]> => ipcRenderer.invoke('dialog:openVideos'),
    openImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:openImage'),
    openFile: (filters?: Electron.FileFilter[]): Promise<string | null> =>
      ipcRenderer.invoke('dialog:openFile', filters),
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
    showItemInFolder: (fullPath: string): Promise<void> =>
      ipcRenderer.invoke('dialog:showItemInFolder', fullPath)
  },

  settings: {
    getAll: (): Promise<Settings> => ipcRenderer.invoke('settings:getAll'),
    get: <K extends keyof Settings>(key: K): Promise<Settings[K]> =>
      ipcRenderer.invoke('settings:get', key),
    set: <K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> =>
      ipcRenderer.invoke('settings:set', key, value),
    reset: (): Promise<void> => ipcRenderer.invoke('settings:reset')
  },

  samples: {
    getAll: (): Promise<SampleImage[]> => ipcRenderer.invoke('samples:getAll'),
    insert: (name: string, path: string): Promise<SampleImage> =>
      ipcRenderer.invoke('samples:insert', name, path),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('samples:remove', id)
  },

  gpu: {
    getStatus: (): Promise<GpuStatus> => ipcRenderer.invoke('gpu:getStatus'),
    reprobe: (): Promise<GpuStatus> => ipcRenderer.invoke('gpu:reprobe')
  },

  compression: {
    start: (jobs: { input: string; output?: string }[]): Promise<string> =>
      ipcRenderer.invoke('compression:start', jobs),
    cancel: (jobId: string): Promise<void> => ipcRenderer.invoke('compression:cancel', jobId),
    onProgress: (cb: (jobId: string, progress: FileProgress[]) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, jobId: string, progress: FileProgress[]) =>
        cb(jobId, progress)
      ipcRenderer.on('compression:progress', handler)
      return () => ipcRenderer.off('compression:progress', handler)
    },
    onDone: (cb: (jobId: string, outputDir: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, jobId: string, outputDir: string) =>
        cb(jobId, outputDir)
      ipcRenderer.on('compression:done', handler)
      return () => ipcRenderer.off('compression:done', handler)
    }
  },

  cutting: {
    start: (jobs: { input: string; sampleImageId: number }[], cutMode: CutMode): Promise<string> =>
      ipcRenderer.invoke('cutting:start', jobs, cutMode),
    cancel: (jobId: string): Promise<void> => ipcRenderer.invoke('cutting:cancel', jobId),
    onProgress: (cb: (jobId: string, progress: FileProgress[]) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, jobId: string, progress: FileProgress[]) =>
        cb(jobId, progress)
      ipcRenderer.on('cutting:progress', handler)
      return () => ipcRenderer.off('cutting:progress', handler)
    },
    onDone: (cb: (jobId: string, outputDir: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, jobId: string, outputDir: string) =>
        cb(jobId, outputDir)
      ipcRenderer.on('cutting:done', handler)
      return () => ipcRenderer.off('cutting:done', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (err) {
    console.error(err)
  }
} else {
  // @ts-expect-error contextIsolation disabled
  window.electron = electronAPI
  // @ts-expect-error contextIsolation disabled
  window.api = api
}

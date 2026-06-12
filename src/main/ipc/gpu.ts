import { ipcMain } from 'electron'
import { detectGpu } from '../services/gpu'
import { resolveVideoEncoder } from '../services/encoders'
import store from '../store'
import type { GpuStatus } from '../../shared/types'

function inferenceBackend(): GpuStatus['inferenceBackend'] {
  if (process.platform === 'darwin') return 'CoreML'
  if (process.platform === 'win32') return 'DirectML'
  return 'CPU'
}

export function registerGpuHandlers(): void {
  ipcMain.handle('gpu:getStatus', async (): Promise<GpuStatus> => {
    return {
      gpu: await detectGpu(),
      inferenceBackend: inferenceBackend(),
      videoEncoder: await resolveVideoEncoder()
    }
  })

  // Re-detect hardware and re-run the encoder probe from scratch.
  ipcMain.handle('gpu:reprobe', async (): Promise<GpuStatus> => {
    store.set('encoderProbe', null)
    const gpu = await detectGpu(true)
    return {
      gpu,
      inferenceBackend: inferenceBackend(),
      videoEncoder: await resolveVideoEncoder()
    }
  })
}

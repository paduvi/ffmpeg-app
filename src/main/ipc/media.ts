import { ipcMain } from 'electron'
import { analyzeVideos } from '../services/estimate'
import type { EstimateTask, VideoAnalysis } from '../../shared/types'
import log from '../logger'

export function registerMediaHandlers(): void {
  ipcMain.handle(
    'media:analyze',
    async (_event, paths: string[], task: EstimateTask): Promise<VideoAnalysis[]> => {
      try {
        return await analyzeVideos(paths, task)
      } catch (err) {
        log.warn(`media:analyze failed: ${err instanceof Error ? err.message : String(err)}`)
        // Estimates are decoration — degrade to "unknown" rather than failing the UI.
        return paths.map((path) => ({
          path,
          durationSec: null,
          width: null,
          height: null,
          estimatedSec: null
        }))
      }
    }
  )
}

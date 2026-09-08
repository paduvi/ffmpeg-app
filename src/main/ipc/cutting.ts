import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { cutVideos } from '../services/cutting'
import { notifyJobDone } from '../services/notify'
import type { CutJob, CutMode } from '../../shared/types'
import log from '../logger'

const controllers = new Map<string, AbortController>()

export function registerCuttingHandlers(): void {
  ipcMain.handle(
    'cutting:start',
    async (event, jobs: CutJob[], cutMode: CutMode = 'end') => {
      const jobId = randomUUID()
      const controller = new AbortController()
      controllers.set(jobId, controller)

      const win = BrowserWindow.fromWebContents(event.sender)

      cutVideos(
        jobs,
        cutMode,
        (progress) => win?.webContents.send('cutting:progress', jobId, progress),
        controller.signal
      )
        .then(({ outputs, outputDir }) => {
          win?.webContents.send('cutting:done', jobId, outputDir)
          log.info(`Cutting job ${jobId} done → ${outputDir}`)
          if (!controller.signal.aborted) {
            notifyJobDone(
              'Cutting finished',
              `${outputs.length} file${outputs.length === 1 ? '' : 's'} processed`
            )
          }
        })
        .catch((err) => {
          if (!controller.signal.aborted) log.error(`Cutting job ${jobId} failed`, err)
          win?.webContents.send('cutting:done', jobId, '')
        })
        .finally(() => controllers.delete(jobId))

      return jobId
    }
  )

  ipcMain.handle('cutting:cancel', (_event, jobId: string) => {
    controllers.get(jobId)?.abort()
    controllers.delete(jobId)
    log.info(`Cutting job ${jobId} cancelled`)
  })
}

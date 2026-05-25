import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { cutVideos } from '../services/cutting'
import log from '../logger'

const controllers = new Map<string, AbortController>()

export function registerCuttingHandlers(): void {
  ipcMain.handle(
    'cutting:start',
    async (event, jobs: { input: string; sampleImageId: number }[]) => {
      const jobId = randomUUID()
      const controller = new AbortController()
      controllers.set(jobId, controller)

      const win = BrowserWindow.fromWebContents(event.sender)

      cutVideos(
        jobs,
        (value) => win?.webContents.send('cutting:progress', jobId, value),
        controller.signal
      )
        .then(({ outputDir }) => {
          win?.webContents.send('cutting:done', jobId, outputDir)
          log.info(`Cutting job ${jobId} done → ${outputDir}`)
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

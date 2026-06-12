import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { compressVideos, type CompressionJob } from '../services/compression'
import { notifyJobDone } from '../services/notify'
import log from '../logger'

const activeJobs = new Map<string, AbortController>()

export function registerCompressionHandlers(): void {
  ipcMain.handle('compression:start', (event, jobs: CompressionJob[]) => {
    const jobId = randomUUID()
    const ac = new AbortController()
    activeJobs.set(jobId, ac)

    const { sender } = event

    compressVideos(
      jobs,
      (progress) => {
        if (!sender.isDestroyed()) sender.send('compression:progress', jobId, progress)
      },
      ac.signal
    )
      .then(({ outputs, outputDir }) => {
        if (!sender.isDestroyed()) sender.send('compression:done', jobId, outputDir)
        log.info(`Compression job ${jobId} completed → ${outputDir}`)
        if (!ac.signal.aborted) {
          const count = outputs.filter(Boolean).length
          notifyJobDone('Compression finished', `${count} file${count === 1 ? '' : 's'} compressed`)
        }
      })
      .catch((err) => {
        log.error(`Compression job ${jobId} failed`, err)
        if (!sender.isDestroyed()) sender.send('compression:done', jobId, '')
      })
      .finally(() => activeJobs.delete(jobId))

    return jobId
  })

  ipcMain.handle('compression:cancel', (_event, jobId: string) => {
    const ac = activeJobs.get(jobId)
    if (ac) {
      ac.abort()
      activeJobs.delete(jobId)
      log.info(`Compression job ${jobId} cancelled`)
    }
  })
}

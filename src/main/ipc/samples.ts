import { ipcMain } from 'electron'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { app } from 'electron'
import { getAllSampleImages, insertSampleImage, deleteSampleImage } from '../db/sampleImages'
import log from '../logger'

export function registerSamplesHandlers(): void {
  ipcMain.handle('samples:getAll', () => getAllSampleImages())

  ipcMain.handle('samples:insert', (_event, name: string, sourcePath: string) => {
    const destDir = join(app.getPath('userData'), 'sample-images')
    mkdirSync(destDir, { recursive: true })
    const dest = join(destDir, basename(sourcePath))
    copyFileSync(sourcePath, dest)
    const record = insertSampleImage(name, dest)
    log.info(`Sample image added: ${name} → ${dest}`)
    return record
  })

  ipcMain.handle('samples:remove', (_event, id: number) => {
    deleteSampleImage(id)
    log.info(`Sample image ${id} removed`)
  })
}

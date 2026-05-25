import { app, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from './logger'

export function initUpdater(): void {
  if (!app.isPackaged) {
    log.info('Auto-update disabled (dev build)')
    ipcMain.handle('app:checkForUpdates', () => {
      log.info('Manual update check skipped (dev build)')
    })
    return
  }

  autoUpdater.logger = log
  autoUpdater.autoDownload = true

  autoUpdater.on('update-available', (info) => {
    log.info(`Update available: v${info.version}`)
  })

  autoUpdater.on('update-not-available', () => {
    log.info('App is up to date')
  })

  autoUpdater.on('download-progress', (progress) => {
    log.info(`Downloading update: ${Math.round(progress.percent)}%`)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    log.info(`Update downloaded: v${info.version}`)
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Restart the application to apply the update.'
    })
    if (response === 0) {
      autoUpdater.quitAndInstall()
    }
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error', err)
  })

  // Check on startup
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    log.error('Startup update check failed', err)
  })

  ipcMain.handle('app:checkForUpdates', async () => {
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      log.error('Manual update check failed', err)
      await dialog.showMessageBox({
        type: 'error',
        buttons: ['OK'],
        title: 'Update Check Failed',
        message: 'Could not check for updates. Please try again later.'
      })
    }
  })
}

import { app, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from './logger'

export function initUpdater(): void {
  if (!app.isPackaged) {
    log.info('Auto-update disabled (dev build)')
    // Still answer the manual check so the menu item gives feedback instead of
    // appearing dead — updates simply can't be applied to an unpacked build.
    ipcMain.handle('app:checkForUpdates', async () => {
      log.info('Manual update check requested in dev build')
      await dialog.showMessageBox({
        type: 'info',
        buttons: ['OK'],
        title: 'Updates Unavailable in Development',
        message: 'Update checking only works in the installed app.',
        detail: 'Run a packaged build (npm run package) to test auto-update.'
      })
    })
    return
  }

  autoUpdater.logger = log
  autoUpdater.autoDownload = true

  // Per-arch mac update feeds (not merged): Apple Silicon uses the default
  // 'latest' channel → latest-mac.yml; Intel requests latest-x64-mac.yml,
  // which the release workflow renames from the Intel job's feed.
  if (process.platform === 'darwin' && process.arch === 'x64') {
    autoUpdater.channel = 'latest-x64'
  }

  // True only while a user-initiated check is in flight. The result events are
  // shared by the silent startup check too, so they consult this flag before
  // showing any dialog — otherwise the startup check would pop dialogs on every
  // launch. It is a one-shot: whichever result event fires clears it.
  let manualCheck = false

  autoUpdater.on('update-available', (info) => {
    log.info(`Update available: v${info.version}`)
    if (manualCheck) {
      manualCheck = false
      void dialog.showMessageBox({
        type: 'info',
        buttons: ['OK'],
        title: 'Update Available',
        message: `Version ${info.version} is available.`,
        detail: 'It is downloading now — you will be prompted to restart when it is ready.'
      })
    }
  })

  autoUpdater.on('update-not-available', () => {
    log.info('App is up to date')
    if (manualCheck) {
      manualCheck = false
      void dialog.showMessageBox({
        type: 'info',
        buttons: ['OK'],
        title: 'No Updates',
        message: `You are on the latest version (v${app.getVersion()}).`
      })
    }
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
    if (manualCheck) {
      manualCheck = false
      void dialog.showMessageBox({
        type: 'error',
        buttons: ['OK'],
        title: 'Update Check Failed',
        message: 'Could not check for updates. Please try again later.',
        detail: err instanceof Error ? err.message : String(err)
      })
    }
  })

  // Silent check on startup (no dialogs unless an update finishes downloading).
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    log.error('Startup update check failed', err)
  })

  ipcMain.handle('app:checkForUpdates', async () => {
    if (manualCheck) return // a manual check is already in flight — ignore re-clicks
    manualCheck = true
    try {
      const result = await autoUpdater.checkForUpdates()
      // checkForUpdates resolves null only when no feed is configured; the
      // available / not-available / error events handle every real outcome.
      if (!result) manualCheck = false
    } catch (err) {
      // The 'error' event normally fires too (and clears the flag first); this
      // guards the case where the promise rejects without an event.
      if (manualCheck) {
        manualCheck = false
        log.error('Manual update check failed', err)
        await dialog.showMessageBox({
          type: 'error',
          buttons: ['OK'],
          title: 'Update Check Failed',
          message: 'Could not check for updates. Please try again later.'
        })
      }
    }
  })
}

import { app, dialog, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import log from './logger'

// macOS builds are unsigned, and Squirrel.Mac refuses to apply an update to an
// app without a valid Developer ID signature: the .zip downloads, but
// quitAndInstall() silently no-ops and the same update is re-offered on every
// launch. So on macOS we do NOT auto-download or self-install — we detect an
// available update and send the user to the releases page to install manually.
// Windows (NSIS) applies updates fine without signing, so it keeps the full
// download → "Restart Now" flow.
const isMac = process.platform === 'darwin'

/**
 * Resolve the GitHub releases page from the same app-update.yml electron-updater
 * reads (in the packaged app's resources dir), so the manual-download link can
 * never drift from the actual publish target. Returns null if it can't be read.
 */
function releasesPageUrl(): string | null {
  try {
    const cfg = readFileSync(join(process.resourcesPath, 'app-update.yml'), 'utf-8')
    const owner = /^owner:\s*(\S+)/m.exec(cfg)?.[1]
    const repo = /^repo:\s*(\S+)/m.exec(cfg)?.[1]
    if (owner && repo) return `https://github.com/${owner}/${repo}/releases/latest`
  } catch (err) {
    log.warn(`Could not read app-update.yml for releases URL: ${err instanceof Error ? err.message : String(err)}`)
  }
  return null
}

async function promptManualDownload(version: string): Promise<void> {
  const url = releasesPageUrl()
  const { response } = await dialog.showMessageBox({
    type: 'info',
    buttons: url ? ['Download', 'Later'] : ['OK'],
    defaultId: 0,
    cancelId: url ? 1 : 0,
    title: 'Update Available',
    message: `Version ${version} is available.`,
    detail: url
      ? 'Open the releases page to download and install the new version.'
      : 'Download the new version from the project’s GitHub releases page.'
  })
  if (url && response === 0) await shell.openExternal(url)
}

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
  // Windows self-installs; macOS only detects + links out (see top-of-file note).
  autoUpdater.autoDownload = !isMac

  // Per-arch mac update feeds (not merged): Apple Silicon uses the default
  // 'latest' channel → latest-mac.yml; Intel requests latest-x64-mac.yml,
  // which the release workflow renames from the Intel job's feed.
  if (isMac && process.arch === 'x64') {
    autoUpdater.channel = 'latest-x64'
  }

  // True only while a user-initiated check is in flight. Shared result events
  // consult it before showing a dialog so the silent startup check doesn't pop
  // dialogs on every launch. One-shot: whichever result event fires clears it.
  let manualCheck = false

  autoUpdater.on('update-available', async (info) => {
    log.info(`Update available: v${info.version}`)
    if (isMac) {
      // Always surface on macOS (startup + manual) — there is no background
      // install to wait for; the user installs from the releases page.
      manualCheck = false
      await promptManualDownload(info.version)
      return
    }
    // Windows: the update is downloading in the background; only acknowledge it
    // on an explicit manual check (the startup check stays silent until ready).
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

  // Windows-only path below (on macOS autoDownload is false, so the update is
  // never fetched and these events do not fire).
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

  // Silent check on startup (macOS surfaces a download prompt if one is found;
  // Windows downloads quietly and prompts to restart when ready).
  autoUpdater.checkForUpdates().catch((err) => {
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

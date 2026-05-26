import { app, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import log from './logger'
import store from './store'
import { openDb, closeDb } from './db'
import { createSplashWindow, createMainWindow } from './window'
import { registerDialogHandlers } from './ipc/dialog'
import { registerSettingsHandlers } from './ipc/settings'
import { registerCompressionHandlers } from './ipc/compression'
import { registerCuttingHandlers } from './ipc/cutting'
import { registerSamplesHandlers } from './ipc/samples'
import { initOnnxSession } from './services/onnx'
import { initUpdater } from './updater'

// Register local-file:// scheme before app is ready so it is trusted.
// This lets the renderer (which may be on http://localhost in dev) load
// images from the local filesystem without triggering mixed-content or
// same-origin blocks.
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { secure: true, supportFetchAPI: false, bypassCSP: false, stream: true } }
])

// Single-instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

async function bootstrap(): Promise<void> {
  electronApp.setAppUserModelId('com.chotoxautinh.dogympegapp')

  // local-file://<absolute-path> → serves the file at that path.
  // Enables <img src="local-file:///abs/path/to/image.png"> to work from
  // both the http://localhost dev server and the file:// production page.
  protocol.handle('local-file', (request) => {
    const filePath = request.url.slice('local-file://'.length)
    return net.fetch(`file://${filePath}`)
  })

  app.on('browser-window-created', (_e, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register all IPC handlers before any window opens
  registerDialogHandlers()
  registerSettingsHandlers()
  registerCompressionHandlers()
  registerCuttingHandlers()
  registerSamplesHandlers()
  ipcMain.handle('app:quit', () => app.quit())
  initUpdater()

  log.info(`Starting DogyMpegApp v${app.getVersion()}`)
  log.info(`userData: ${app.getPath('userData')}`)

  // Force settings to initialise (reads/writes prefs file)
  log.info(`Settings loaded: preset=${store.get('preset')}, crf=${store.get('crf')}`)

  const splash = createSplashWindow()
  await initServices()

  const mainWin = createMainWindow()
  mainWin.once('ready-to-show', () => {
    splash.close()
    mainWin.show()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createMainWindow()
      w.once('ready-to-show', () => w.show())
    }
  })
}

async function initServices(): Promise<void> {
  try {
    openDb()
    await Promise.all([
      initOnnxSession(),
      new Promise<void>((r) => setTimeout(r, 2000))
    ])
    log.info('All services initialised')
  } catch (err) {
    log.error('Service init failed', err)
    throw err
  }
}

app.whenReady().then(bootstrap).catch((err) => {
  log.error('Fatal startup error', err)
  app.quit()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  closeDb()
  log.info('App shutting down')
})

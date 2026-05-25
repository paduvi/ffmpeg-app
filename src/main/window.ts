import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'

const iconPath = is.dev
  ? join(process.cwd(), 'resources', 'icon.png')
  : join(process.resourcesPath, 'icon.png')

export function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 480,
    height: 480,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    show: false,
    webPreferences: { sandbox: true }
  })

  splash.once('ready-to-show', () => splash.show())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    splash.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/splash.html`)
  } else {
    splash.loadFile(join(__dirname, '../renderer/splash.html'))
  }

  return splash
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'DogyMpegApp',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

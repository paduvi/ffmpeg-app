import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { statSync } from 'node:fs'
import { basename } from 'node:path'
import type { VideoFile } from '../../shared/types'

const VIDEO_EXTS = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'mts']
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']

export function registerDialogHandlers(): void {
  ipcMain.handle('dialog:openVideos', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Select Video Files',
      filters: [
        { name: 'Video Files', extensions: VIDEO_EXTS },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    if (canceled) return []
    return filePaths.map(
      (p): VideoFile => ({
        path: p,
        name: basename(p),
        size: statSync(p).size
      })
    )
  })

  ipcMain.handle('dialog:openImage', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Select Sample Image',
      filters: [
        { name: 'Image Files', extensions: IMAGE_EXTS },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('dialog:openFile', async (event, filters?: Electron.FileFilter[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Select File',
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
      properties: ['openFile']
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('dialog:showItemInFolder', (_event, fullPath: string) => {
    shell.showItemInFolder(fullPath)
  })
}

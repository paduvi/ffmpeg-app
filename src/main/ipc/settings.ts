import { ipcMain } from 'electron'
import store from '../store'
import type { Settings } from '../../shared/types'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getAll', () => store.store)

  ipcMain.handle('settings:get', <K extends keyof Settings>(_event: Electron.IpcMainInvokeEvent, key: K) =>
    store.get(key)
  )

  ipcMain.handle('settings:set', <K extends keyof Settings>(
    _event: Electron.IpcMainInvokeEvent,
    key: K,
    value: Settings[K]
  ) => {
    store.set(key, value)
  })

  ipcMain.handle('settings:reset', () => store.clear())
}

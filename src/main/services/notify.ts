import { app, BrowserWindow, Notification } from 'electron'

/**
 * Completion signal for long-running jobs: OS notification plus dock bounce
 * (macOS) or taskbar flash (Windows) — but only when the app is in the
 * background. A focused user is already watching the progress modal.
 */
export function notifyJobDone(title: string, body: string): void {
  if (BrowserWindow.getFocusedWindow() !== null) return

  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())

  if (Notification.isSupported()) {
    const notification = new Notification({ title, body })
    notification.on('click', () => {
      if (win) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      }
    })
    notification.show()
  }

  if (process.platform === 'darwin') {
    // 'informational' bounces once; the highlight persists until the app is activated
    app.dock?.bounce('informational')
  } else if (win) {
    win.flashFrame(true)
    win.once('focus', () => win.flashFrame(false))
  }
}

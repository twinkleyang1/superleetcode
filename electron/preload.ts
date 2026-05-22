import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  onNotificationReminder: (callback: () => void) => {
    ipcRenderer.on('review-reminder', callback)
    return () => ipcRenderer.removeListener('review-reminder', callback)
  }
})

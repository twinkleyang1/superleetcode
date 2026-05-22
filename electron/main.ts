import { app, Tray, Menu, nativeImage, Notification, shell } from 'electron'
import { initStore, readData, readSettings } from './store'
import { createServer } from './server'

let tray: Tray | null = null
let isQuitting = false
let server: any = null

function createTray() {
  const size = 16
  const buffer = Buffer.alloc(size * size * 4)
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = 59
    buffer[i + 1] = 130
    buffer[i + 2] = 246
    buffer[i + 3] = 255
  }
  const icon = nativeImage.createFromBuffer(buffer, { width: size, height: size })
  tray = new Tray(icon)
  tray.setToolTip('LeetCode Tracker - 右键退出')

  const updateMenu = () => {
    const data = readData()
    const needsReview = data.progress.filter(p => {
      if (p.level === 'forgotten' || p.level === 'not_started') return true
      if (!p.nextReviewAt) return false
      return new Date(p.nextReviewAt) <= new Date()
    }).length

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '打开网页',
        click: () => shell.openExternal('http://localhost:5173')
      },
      {
        label: `今日待复习: ${needsReview} 道`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          if (server) server.close()
          app.quit()
        }
      }
    ])
    tray?.setContextMenu(contextMenu)
  }

  updateMenu()
  setInterval(updateMenu, 60000)

  tray.on('double-click', () => shell.openExternal('http://localhost:5173'))
}

function setupReminder() {
  const checkReminder = () => {
    const now = new Date()
    const settings = readSettings()
    const [h, m] = settings.reminderTime.split(':').map(Number)
    if (now.getHours() === h && now.getMinutes() === m) {
      const data = readData()
      const needsReview = data.progress.filter(p => {
        if (p.level === 'forgotten' || p.level === 'not_started') return true
        if (!p.nextReviewAt) return false
        return new Date(p.nextReviewAt) <= new Date()
      }).length

      if (needsReview > 0 && Notification.isSupported()) {
        new Notification({
          title: 'LeetCode Tracker',
          body: `今日待复习 ${needsReview} 道，新题目标 ${settings.dailyNew} 道`
        }).show()
      }
    }
  }
  setInterval(checkReminder, 60000)
}

function startServer() {
  const expressApp = createServer()
  server = expressApp.listen(3456, '127.0.0.1', () => {
    console.log('Express server running on http://localhost:3456')
  })
}

app.whenReady().then(async () => {
  await initStore()
  startServer()
  createTray()
  setupReminder()

  const settings = readSettings()
  app.setLoginItemSettings({
    openAtLogin: settings.autoLaunch,
    path: app.getPath('exe')
  })
})

app.on('before-quit', () => {
  isQuitting = true
  if (server) server.close()
})

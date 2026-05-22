import express from 'express'
import cors from 'cors'
import { readData, writeData, readSettings, writeSettings, SettingsData } from './store'

export function createServer(): express.Express {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '10mb' }))

  app.get('/api/data', (_req, res) => {
    try {
      const data = readData()
      res.json(data)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  app.post('/api/data', (req, res) => {
    try {
      writeData(req.body)
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  app.get('/api/settings', (_req, res) => {
    try {
      const settings = readSettings()
      res.json(settings)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  app.put('/api/settings', (req, res) => {
    try {
      const s: SettingsData = req.body
      writeSettings(s)
      const { app } = require('electron')
      app.setLoginItemSettings({
        openAtLogin: s.autoLaunch,
        path: app.getPath('exe')
      })
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  app.post('/api/quit', (_req, res) => {
    res.json({ success: true })
    const { app } = require('electron')
    app.quit()
  })

  return app
}

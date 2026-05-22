import { useEffect, useState } from 'react'
import { db } from '../db'
import { Settings } from '../types'
import { exportToJSON } from '../seed'
import { api } from '../api'

interface Props {
  onClose: () => void
}

export default function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<Settings>({
    id: 1, dailyTotal: 5, dailyNew: 2, autoLaunch: true, reminderTime: '09:00'
  })

  useEffect(() => {
    db.settings.get(1).then(s => { if (s) setSettings(s) })
  }, [])

  function handleQuit() {
    api.quit()
  }

  async function save() {
    await db.settings.put(settings)
    try {
      await api.updateSettings(settings)
      const data = await exportToJSON()
      await api.saveData(data)
    } catch {
      // Electron not running
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 w-96 space-y-4">
        <h3 className="text-lg font-semibold">设置</h3>

        <div>
          <label className="text-sm text-slate-400 block mb-1">每日总题数</label>
          <input
            type="number"
            value={settings.dailyTotal}
            onChange={e => setSettings({ ...settings, dailyTotal: parseInt(e.target.value) || 0 })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
            min={1}
          />
        </div>

        <div>
          <label className="text-sm text-slate-400 block mb-1">每日最低新题数</label>
          <input
            type="number"
            value={settings.dailyNew}
            onChange={e => setSettings({ ...settings, dailyNew: parseInt(e.target.value) || 0 })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
            min={0}
          />
        </div>

        <div>
          <label className="text-sm text-slate-400 block mb-1">每日提醒时间</label>
          <input
            type="time"
            value={settings.reminderTime}
            onChange={e => setSettings({ ...settings, reminderTime: e.target.value })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm text-slate-400">开机自启</label>
          <button
            onClick={() => setSettings({ ...settings, autoLaunch: !settings.autoLaunch })}
            className={`w-12 h-6 rounded-full transition-colors ${
              settings.autoLaunch ? 'bg-blue-600' : 'bg-slate-600'
            }`}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${
              settings.autoLaunch ? 'translate-x-5' : ''
            }`} />
          </button>
        </div>

        <div>
          <button onClick={handleQuit} className="w-full bg-red-800 hover:bg-red-700 text-red-200 text-sm py-2 rounded-lg">
            退出程序
          </button>
          <p className="text-xs text-slate-500 mt-1">关闭窗口只会最小化到托盘，在这里才能真正退出</p>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-sm py-2 rounded-lg">
            取消
          </button>
          <button onClick={save} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded-lg">
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

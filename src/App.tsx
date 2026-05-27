import { useEffect, useState } from 'react'
import { db } from './db'
import { initializeData, syncFromJSON, exportToJSON } from './seed'
import { resetTodayReviewCounts } from './spacedRepetition'
import { api } from './api'
import Layout from './components/Layout'

function App() {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')

  useEffect(() => {
    async function load() {
      await initializeData()

      try {
        const data = await api.getData()
        if (data && data.problems.length > 0) {
          await syncFromJSON(data)
        }
      } catch {
        // Electron not running, use IndexedDB data
      }

      const progressList = await db.progress.toArray()
      const reset = resetTodayReviewCounts(progressList)
      for (const p of reset) {
        await db.progress.update(p.id, {
          todayReviewCount: p.todayReviewCount,
          dailyCompleted: p.dailyCompleted,
          dailyTarget: p.dailyTarget,
          dailyForgottenCount: p.dailyForgottenCount,
          dailyRatingPath: p.dailyRatingPath
        })
      }

      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (loading) return
    const interval = setInterval(async () => {
      const data = await exportToJSON()
      await api.saveData(data)
    }, 30000)
    return () => clearInterval(interval)
  }, [loading])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-lg">加载中...</p>
      </div>
    )
  }

  return <Layout activeTab={activeTab} setActiveTab={setActiveTab} />
}

export default App

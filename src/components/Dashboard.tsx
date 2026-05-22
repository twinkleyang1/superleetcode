import { useEffect, useState } from 'react'
import { db } from '../db'
import { Problem, Progress, Level, LEVEL_LABELS } from '../types'
import { computePredictions, computeStreak } from '../predictions'

interface Stats {
  todayDone: number
  todayNew: number
  dailyTotal: number
  dailyNew: number
  notStarted: number
  mastered: number
  total: number
  streak: { current: number; longest: number }
  firstRoundDate: string
  allMasteredDate: string
  effectiveQuota: number
}

interface QueueItem {
  problem: Problem
  progress: Progress
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    const problems = await db.problems.toArray()
    const progressList = await db.progress.toArray()
    const logs = await db.reviewLogs.toArray()
    const settingsArr = await db.settings.toArray()
    const settings = settingsArr[0] || { dailyTotal: 5, dailyNew: 2 }

    const today = new Date().toISOString().split('T')[0]
    const todayLogs = logs.filter(l => l.date === today)
    const todayDone = new Set(todayLogs.map(l => l.problemId)).size
    const todayNew = new Set(
      todayLogs.filter(l => l.oldLevel === 'not_started').map(l => l.problemId)
    ).size

    const notStarted = progressList.filter(p => p.level === 'not_started').length
    const mastered = progressList.filter(p => p.level === 'mastered').length
    const total = progressList.length

    const reviewDates = [...new Set(logs.map(l => l.date))]
    const streak = computeStreak(reviewDates)
    const newProblemDates = logs.filter(l => l.oldLevel === 'not_started').map(l => l.date)
    const predictions = computePredictions(progressList, settings.dailyNew, newProblemDates)

    setStats({
      todayDone,
      todayNew,
      dailyTotal: settings.dailyTotal,
      dailyNew: settings.dailyNew,
      notStarted,
      mastered,
      total,
      streak,
      firstRoundDate: predictions.firstRoundDate.toLocaleDateString('zh-CN'),
      allMasteredDate: predictions.allMasteredDate.toLocaleDateString('zh-CN'),
      effectiveQuota: predictions.effectiveQuota
    })

    // Build today's review queue preview
    const progressMap = new Map(progressList.map(p => [p.problemId, p]))
    const problemMap = new Map(problems.map(p => [p.id, p]))
    const queueItems: QueueItem[] = []

    for (const p of progressList) {
      if (p.level === 'forgotten' || p.level === 'not_started') {
        const problem = problemMap.get(p.problemId)
        if (problem) queueItems.push({ problem, progress: p })
      } else if (p.nextReviewAt && new Date(p.nextReviewAt) <= new Date()) {
        const problem = problemMap.get(p.problemId)
        if (problem) queueItems.push({ problem, progress: p })
      }
    }

    queueItems.sort((a, b) => {
      const order: Record<Level, number> = {
        forgotten: 0, not_started: 1, partial: 2, hesitant: 3, mastered: 4
      }
      return order[a.progress.level] - order[b.progress.level]
    })

    setQueue(queueItems.slice(0, 10))
  }

  if (!stats) return null

  const progressPct = stats.total > 0
    ? Math.round(((stats.total - stats.notStarted) / stats.total) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-sm text-slate-400">今日进度</div>
          <div className="text-2xl font-bold mt-1">
            {stats.todayDone} <span className="text-base text-slate-500">/ {stats.dailyTotal}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">新题 {stats.todayNew} / {stats.dailyNew}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-sm text-slate-400">连续打卡</div>
          <div className="text-2xl font-bold mt-1 text-orange-400">{stats.streak.current} 天</div>
          <div className="text-xs text-slate-500 mt-1">最长 {stats.streak.longest} 天</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-sm text-slate-400">掌握 / 未刷</div>
          <div className="text-2xl font-bold mt-1">
            <span className="text-green-400">{stats.mastered}</span>
            <span className="text-slate-500"> / </span>
            <span className="text-red-400">{stats.notStarted}</span>
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-sm text-slate-400">总进度</div>
          <div className="text-2xl font-bold mt-1">{progressPct}%</div>
        </div>
      </div>

      {/* Predictions */}
      <div className="bg-slate-800 rounded-xl p-4 flex gap-8">
        <div>
          <span className="text-slate-400 text-sm">刷完一轮预计</span>
          <span className="ml-2 font-bold text-blue-400">{stats.firstRoundDate}</span>
          <span className="text-xs text-slate-500 ml-2">按 {stats.effectiveQuota} 道/天</span>
        </div>
        <div>
          <span className="text-slate-400 text-sm">全部掌握预计</span>
          <span className="ml-2 font-bold text-green-400">{stats.allMasteredDate}</span>
        </div>
      </div>

      {/* Progress bars */}
      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-400">每日目标</span>
            <span>{stats.todayDone} / {stats.dailyTotal}</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, (stats.todayDone / stats.dailyTotal) * 100)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-400">总进度</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Today's queue preview */}
      <div>
        <h3 className="text-lg font-semibold mb-3">今日复习队列（前 10 道）</h3>
        <div className="space-y-2">
          {queue.map(item => (
            <div key={item.problem.id} className="bg-slate-800 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-slate-500 text-sm w-12">{item.problem.leetcodeNumber}</span>
                <span>{item.problem.title}</span>
                <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded">
                  {item.problem.category}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded ${
                  item.progress.level === 'forgotten' ? 'bg-red-900 text-red-300' :
                  item.progress.level === 'not_started' ? 'bg-slate-700 text-slate-400' :
                  'bg-yellow-900 text-yellow-300'
                }`}>
                  {LEVEL_LABELS[item.progress.level]}
                </span>
                {item.progress.todayReviewCount > 0 && (
                  <span className="text-xs text-slate-500">今日×{item.progress.todayReviewCount}</span>
                )}
              </div>
            </div>
          ))}
          {queue.length === 0 && (
            <p className="text-slate-500 text-center py-4">今日无事，可以休息或提前刷新题</p>
          )}
        </div>
      </div>
    </div>
  )
}

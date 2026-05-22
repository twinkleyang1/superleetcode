import { useEffect, useState } from 'react'
import { db } from '../db'
import { Problem, Progress, Level, LEVEL_LABELS } from '../types'
import RatingModal from './RatingModal'

interface QueueItem {
  problem: Problem
  progress: Progress
  zone: 'review' | 'newQuota' | 'extraNew'
}

export default function ReviewQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [ratingItem, setRatingItem] = useState<QueueItem | null>(null)

  useEffect(() => {
    loadQueue()
  }, [])

  async function loadQueue() {
    const problems = await db.problems.toArray()
    const progressList = await db.progress.toArray()
    const settingsArr = await db.settings.toArray()
    const settings = settingsArr[0] || { dailyTotal: 5, dailyNew: 2 }

    const today = new Date().toISOString().split('T')[0]
    const logs = await db.reviewLogs.where({ date: today }).toArray()
    const todayDone = new Set(logs.map(l => l.problemId)).size
    const todayNewCount = new Set(
      logs.filter(l => l.oldLevel === 'not_started').map(l => l.problemId)
    ).size

    const progressMap = new Map(progressList.map(p => [p.problemId, p]))
    const problemMap = new Map(problems.map(p => [p.id, p]))

    const now = new Date()
    const result: QueueItem[] = []

    // Zone 1: Due reviews (forgotten first)
    for (const p of progressList) {
      if (p.level === 'forgotten') {
        const problem = problemMap.get(p.problemId)
        if (problem) result.push({ problem, progress: p, zone: 'review' })
      }
    }
    for (const p of progressList) {
      if (p.nextReviewAt && new Date(p.nextReviewAt) <= now && p.level !== 'forgotten') {
        const problem = problemMap.get(p.problemId)
        if (problem) result.push({ problem, progress: p, zone: 'review' })
      }
    }

    // Zone 2: New problems to meet quota
    const newNeeded = Math.max(0, settings.dailyNew - todayNewCount)
    const notStarted = progressList.filter(p => p.level === 'not_started')
    for (let i = 0; i < Math.min(newNeeded, notStarted.length); i++) {
      const problem = problemMap.get(notStarted[i].problemId)
      if (problem && !result.find(r => r.problem.id === problem.id)) {
        result.push({ problem, progress: notStarted[i], zone: 'newQuota' })
      }
    }

    // Zone 3: Extra new to meet total
    const totalNeeded = Math.max(0, settings.dailyTotal - todayDone - result.length)
    const extraNew = notStarted.filter(p => !result.find(r => r.problem.id === problemMap.get(p.problemId)?.id))
    for (let i = 0; i < Math.min(totalNeeded, extraNew.length); i++) {
      const problem = problemMap.get(extraNew[i].problemId)
      if (problem) result.push({ problem, progress: extraNew[i], zone: 'extraNew' })
    }

    setQueue(result)
  }

  const zone1 = queue.filter(q => q.zone === 'review')
  const zone2 = queue.filter(q => q.zone === 'newQuota')
  const zone3 = queue.filter(q => q.zone === 'extraNew')

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-bold mb-6">今日复习</h2>

      {queue.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-2xl mb-2">🎉</p>
          <p className="text-lg text-slate-400">今日目标已达成！</p>
          <p className="text-sm text-slate-500 mt-1">可以休息，或者去题目列表提前刷题</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Zone 1: Due reviews */}
          {zone1.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-red-400 mb-3">复习债（今日到期）</h3>
              <div className="space-y-2">
                {zone1.map(item => (
                  <QueueCard key={item.problem.id} item={item} onRate={() => setRatingItem(item)} />
                ))}
              </div>
            </div>
          )}

          {/* Zone 2: New problem quota */}
          {zone2.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-blue-400 mb-3">新题配额（最低 {zone2.length} 道）</h3>
              <div className="space-y-2">
                {zone2.map(item => (
                  <QueueCard key={item.problem.id} item={item} onRate={() => setRatingItem(item)} />
                ))}
              </div>
            </div>
          )}

          {/* Zone 3: Extra new */}
          {zone3.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-3">更多新题（补足每日总数）</h3>
              <div className="space-y-2">
                {zone3.map(item => (
                  <QueueCard key={item.problem.id} item={item} onRate={() => setRatingItem(item)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {ratingItem && (
        <RatingModal
          item={ratingItem}
          onClose={() => setRatingItem(null)}
          onRated={() => { setRatingItem(null); loadQueue() }}
        />
      )}
    </div>
  )
}

function QueueCard({ item, onRate }: { item: QueueItem; onRate: () => void }) {
  const levelColors: Record<Level, string> = {
    not_started: 'bg-slate-700 text-slate-400',
    forgotten: 'bg-red-900 text-red-300',
    partial: 'bg-orange-900 text-orange-300',
    hesitant: 'bg-yellow-900 text-yellow-300',
    mastered: 'bg-green-900 text-green-300'
  }

  return (
    <div className="bg-slate-800 rounded-lg p-2 sm:p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-500 text-xs sm:text-sm sm:w-12">{item.problem.leetcodeNumber}</span>
        <a
          href={item.problem.url}
          target="_blank"
          className="text-blue-400 hover:text-blue-300 hover:underline text-sm"
          rel="noreferrer"
        >
          {item.problem.title}
        </a>
        <span className="text-xs text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">
          {item.problem.category}
        </span>
        <span className="text-xs text-slate-500">
          {item.problem.difficulty === 'easy' ? '简单' :
           item.problem.difficulty === 'medium' ? '中等' : '困难'}
        </span>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded ${levelColors[item.progress.level]}`}>
          {LEVEL_LABELS[item.progress.level]}
        </span>
        {item.progress.todayReviewCount > 0 && (
          <span className="text-xs text-slate-500">今日×{item.progress.todayReviewCount}</span>
        )}
        <button
          onClick={onRate}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 sm:px-3 py-1.5 rounded-lg"
        >
          评价
        </button>
      </div>
    </div>
  )
}

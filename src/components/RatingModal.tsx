import { Level } from '../types'
import { db } from '../db'
import { computeNextReview } from '../spacedRepetition'
import { exportToJSON } from '../seed'
import { api } from '../api'

interface QueueItem {
  problem: { id: number; title: string; leetcodeNumber: number }
  progress: { id: number; level: Level; problemId: number }
}

interface Props {
  item: QueueItem
  onClose: () => void
  onRated: () => void
}

const RATINGS: { level: Level; label: string; desc: string; color: string }[] = [
  { level: 'forgotten', label: '完全忘记', desc: '完全不会写', color: 'bg-red-600 hover:bg-red-700' },
  { level: 'partial', label: '记得部分', desc: '写了但没过', color: 'bg-orange-600 hover:bg-orange-700' },
  { level: 'hesitant', label: '犹豫但对', desc: '过了但不确定', color: 'bg-yellow-600 hover:bg-yellow-700' },
  { level: 'mastered', label: '完全掌握', desc: '顺利写对', color: 'bg-green-600 hover:bg-green-700' }
]

export default function RatingModal({ item, onClose, onRated }: Props) {
  async function handleRate(newLevel: Level) {
    const progress = await db.progress.where({ problemId: item.problem.id }).first()
    if (!progress) return

    const oldLevel = progress.level
    const updates = computeNextReview(progress, newLevel)
    await db.progress.update(progress.id, updates)

    const today = new Date().toISOString().split('T')[0]
    const logCount = await db.reviewLogs.count()
    await db.reviewLogs.add({
      id: logCount + 1,
      problemId: item.problem.id,
      date: today,
      oldLevel,
      newLevel,
      reviewedAt: new Date().toISOString()
    })

    const data = await exportToJSON()
    await api.saveData(data)

    onRated()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 w-96">
        <h3 className="text-lg font-semibold mb-2">
          {item.problem.leetcodeNumber}. {item.problem.title}
        </h3>
        <p className="text-sm text-slate-400 mb-4">完成刷题后，评价你的掌握程度</p>
        <div className="space-y-2">
          {RATINGS.map(r => (
            <button
              key={r.level}
              onClick={() => handleRate(r.level)}
              className={`w-full text-left px-4 py-3 rounded-lg text-white transition-colors ${r.color}`}
            >
              <div className="font-medium">{r.label}</div>
              <div className="text-xs opacity-75">{r.desc}</div>
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full mt-3 bg-slate-700 hover:bg-slate-600 text-sm py-2 rounded-lg"
        >
          取消
        </button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { db } from '../db'
import { Problem, Progress, Level, LEVEL_LABELS, DIFFICULTY_LABELS, CATEGORIES } from '../types'
import { computeNextReview } from '../spacedRepetition'
import { exportToJSON } from '../seed'
import { api } from '../api'
import AddProblemModal from './AddProblemModal'

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 'forgotten', label: '完全忘记' },
  { value: 'partial', label: '记得部分' },
  { value: 'hesitant', label: '犹豫但对' },
  { value: 'mastered', label: '完全掌握' }
]

export default function ProblemList() {
  const [problems, setProblems] = useState<(Problem & { progress: Progress })[]>([])
  const [categoryFilter, setCategoryFilter] = useState('全部')
  const [difficultyFilter, setDifficultyFilter] = useState('全部')
  const [levelFilter, setLevelFilter] = useState('全部')
  const [showAddModal, setShowAddModal] = useState(false)
  const [updating, setUpdating] = useState<number | null>(null)

  useEffect(() => {
    loadProblems()
  }, [])

  async function loadProblems() {
    const problems = await db.problems.toArray()
    const progressList = await db.progress.toArray()
    const progressMap = new Map(progressList.map(p => [p.problemId, p]))
    const combined = problems.map(p => ({
      ...p,
      progress: progressMap.get(p.id)!
    }))
    setProblems(combined)
  }

  async function updateLevel(problemId: number, newLevel: Level) {
    setUpdating(problemId)
    const progress = await db.progress.where({ problemId }).first()
    if (!progress) return

    const oldLevel = progress.level
    const updates = computeNextReview(progress, newLevel)

    await db.progress.update(progress.id, updates)

    const today = new Date().toISOString().split('T')[0]
    const logCount = await db.reviewLogs.count()
    await db.reviewLogs.add({
      id: logCount + 1,
      problemId,
      date: today,
      oldLevel,
      newLevel,
      reviewedAt: new Date().toISOString()
    })

    const data = await exportToJSON()
    await api.saveData(data)

    setUpdating(null)
    loadProblems()
  }

  const filtered = problems.filter(p => {
    if (categoryFilter !== '全部' && p.category !== categoryFilter) return false
    if (difficultyFilter !== '全部' && p.difficulty !== difficultyFilter) return false
    if (levelFilter !== '全部' && p.progress?.level !== levelFilter) return false
    return true
  })

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="全部">全部分类</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={difficultyFilter}
          onChange={e => setDifficultyFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="全部">全部难度</option>
          <option value="easy">简单</option>
          <option value="medium">中等</option>
          <option value="hard">困难</option>
        </select>
        <select
          value={levelFilter}
          onChange={e => setLevelFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="全部">全部状态</option>
          <option value="not_started">未刷</option>
          <option value="forgotten">完全忘记</option>
          <option value="partial">记得部分</option>
          <option value="hesitant">犹豫但对</option>
          <option value="mastered">完全掌握</option>
        </select>
        <div className="flex-1" />
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm"
        >
          + 添加题目
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700 text-sm text-slate-400">
              <th className="text-left px-4 py-3 w-16">题号</th>
              <th className="text-left px-4 py-3">题目</th>
              <th className="text-left px-4 py-3">分类</th>
              <th className="text-left px-4 py-3">难度</th>
              <th className="text-left px-4 py-3">状态</th>
              <th className="text-left px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-slate-700/50 hover:bg-slate-750">
                <td className="px-4 py-2.5 text-slate-500">{p.leetcodeNumber}</td>
                <td className="px-4 py-2.5">
                  <a
                    href={p.url}
                    target="_blank"
                    className="text-blue-400 hover:text-blue-300 hover:underline"
                    rel="noreferrer"
                  >
                    {p.title}
                  </a>
                  {p.isCustom ? <span className="text-xs text-slate-500 ml-2">自定义</span> : null}
                </td>
                <td className="px-4 py-2.5 text-slate-400">{p.category}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs ${
                    p.difficulty === 'easy' ? 'text-green-400' :
                    p.difficulty === 'medium' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {DIFFICULTY_LABELS[p.difficulty]}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    p.progress?.level === 'mastered' ? 'bg-green-900 text-green-300' :
                    p.progress?.level === 'not_started' ? 'bg-slate-700 text-slate-400' :
                    p.progress?.level === 'forgotten' ? 'bg-red-900 text-red-300' :
                    'bg-yellow-900 text-yellow-300'
                  }`}>
                    {LEVEL_LABELS[p.progress?.level || 'not_started']}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value=""
                    onChange={e => {
                      if (e.target.value) updateLevel(p.id, e.target.value as Level)
                    }}
                    disabled={updating === p.id}
                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs"
                  >
                    <option value="">更新状态</option>
                    {LEVEL_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-slate-500 text-center py-8">无匹配题目</p>
        )}
      </div>

      {showAddModal && (
        <AddProblemModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => { setShowAddModal(false); loadProblems() }}
        />
      )}
    </div>
  )
}

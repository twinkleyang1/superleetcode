import { useState } from 'react'
import { db } from '../db'
import { Difficulty, CATEGORIES } from '../types'
import { exportToJSON } from '../seed'
import { api } from '../api'

interface Props {
  onClose: () => void
  onAdded: () => void
}

export default function AddProblemModal({ onClose, onAdded }: Props) {
  const [leetcodeNumber, setLeetcodeNumber] = useState('')
  const [title, setTitle] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [category, setCategory] = useState(CATEGORIES[0])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!leetcodeNumber || !title) return

    const id = (await db.problems.count()) + 1
    const problem = {
      id,
      leetcodeNumber: parseInt(leetcodeNumber),
      title,
      difficulty,
      category,
      url: `https://leetcode.cn/problems/${title.toLowerCase().replace(/\s+/g, '-')}`,
      isCustom: true
    }

    await db.problems.add(problem)
    await db.progress.add({
      id,
      problemId: id,
      level: 'not_started',
      lastReviewedAt: null,
      nextReviewAt: null,
      reviewCount: 0,
      todayReviewCount: 0,
      consecutiveMastered: 0,
      forgottenCount: 0,
      lastForgottenAt: null,
      dailyTarget: 1,
      dailyCompleted: 0,
      dailyForgottenCount: 0,
      dailyRatingPath: ''
    })

    const data = await exportToJSON()
    await api.saveData(data)

    onAdded()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-4 sm:p-6 w-[92vw] max-w-sm">
        <h3 className="text-lg font-semibold mb-4">添加自定义题目</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-slate-400 block mb-1">LeetCode 题号</label>
            <input
              type="number"
              value={leetcodeNumber}
              onChange={e => setLeetcodeNumber(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              placeholder="如 146"
              required
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">题目名称</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              placeholder="如 LRU 缓存"
              required
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">难度</label>
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value as Difficulty)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
            >
              <option value="easy">简单</option>
              <option value="medium">中等</option>
              <option value="hard">困难</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">分类</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-sm py-2 rounded-lg"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded-lg"
            >
              添加
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

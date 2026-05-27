import { useEffect, useState } from 'react'
import { db } from '../db'
import { Problem, Progress, ReviewLog, LEVEL_LABELS, DIFFICULTY_LABELS } from '../types'
import { getLocalDateString } from '../spacedRepetition'
import Heatmap from '../charts/Heatmap'
import TrendChart from '../charts/TrendChart'
import StackedAreaChart from '../charts/StackedAreaChart'
import CategoryRadar from '../charts/RadarChart'

type ChartType = 'heatmap' | 'trend' | 'stacked' | 'radar'

export default function History() {
  const [logs, setLogs] = useState<ReviewLog[]>([])
  const [problems, setProblems] = useState<Problem[]>([])
  const [progressList, setProgressList] = useState<Progress[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [activeChart, setActiveChart] = useState<ChartType>('heatmap')
  const [filterCategory, setFilterCategory] = useState('全部')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return getLocalDateString(d)
  })
  const [endDate, setEndDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return getLocalDateString(d)
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const allLogs = await db.reviewLogs.toArray()
    const allProblems = await db.problems.toArray()
    const allProgress = await db.progress.toArray()
    setLogs(allLogs)
    setProblems(allProblems)
    setProgressList(allProgress)
  }

  const problemMap = new Map(problems.map(p => [p.id, p]))

  const filteredLogs = logs.filter(l => {
    if (selectedDate && l.date !== selectedDate) return false
    if (startDate && l.date < startDate) return false
    if (endDate && l.date > endDate) return false
    if (filterCategory !== '全部') {
      const problem = problemMap.get(l.problemId)
      if (!problem || problem.category !== filterCategory) return false
    }
    return true
  })

  function exportCSV() {
    const headers = '日期,题号,题目,分类,难度,复习前,复习后'
    const rows = filteredLogs.map(l => {
      const p = problemMap.get(l.problemId)
      return [
        l.date,
        p?.leetcodeNumber || '',
        p?.title || '',
        p?.category || '',
        p ? DIFFICULTY_LABELS[p.difficulty] : '',
        LEVEL_LABELS[l.oldLevel as keyof typeof LEVEL_LABELS] || l.oldLevel,
        LEVEL_LABELS[l.newLevel as keyof typeof LEVEL_LABELS] || l.newLevel
      ].join(',')
    })
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leetcode-review-${getLocalDateString()}.csv`
    a.click()
  }

  const chartTabs: { id: ChartType; label: string }[] = [
    { id: 'heatmap', label: '热力图' },
    { id: 'trend', label: '刷题趋势' },
    { id: 'stacked', label: '熟练度变化' },
    { id: 'radar', label: '分类掌握' }
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {chartTabs.map(ct => (
          <button
            key={ct.id}
            onClick={() => setActiveChart(ct.id)}
            className={`px-2.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              activeChart === ct.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {ct.label}
          </button>
        ))}
      </div>

      <div className="bg-slate-800 rounded-xl p-3 sm:p-4 overflow-x-auto">
        {activeChart === 'heatmap' && (
          <Heatmap logs={logs} onDateClick={setSelectedDate} selectedDate={selectedDate} />
        )}
        {activeChart === 'trend' && <TrendChart logs={logs} />}
        {activeChart === 'stacked' && <StackedAreaChart logs={logs} totalProblems={problems.length} />}
        {activeChart === 'radar' && <CategoryRadar problems={problems} progressList={progressList} />}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm"
        >
          <option value="全部">全部分类</option>
          {[...new Set(problems.map(p => p.category))].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm w-32 sm:w-auto"
        />
        <input
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm w-32 sm:w-auto"
        />
        {selectedDate && (
          <button
            onClick={() => setSelectedDate(null)}
            className="text-xs sm:text-sm text-blue-400 hover:text-blue-300"
          >
            清除日期筛选
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={exportCSV}
          className="bg-slate-800 hover:bg-slate-700 text-xs sm:text-sm px-3 sm:px-4 py-1.5 rounded-lg border border-slate-700"
        >
          导出 CSV
        </button>
      </div>

      <div className="bg-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[550px]">
          <thead>
            <tr className="border-b border-slate-700 text-xs sm:text-sm text-slate-400">
              <th className="text-left px-2 sm:px-4 py-2 sm:py-3">日期</th>
              <th className="text-left px-2 sm:px-4 py-2 sm:py-3">题号</th>
              <th className="text-left px-2 sm:px-4 py-2 sm:py-3">题目</th>
              <th className="text-left px-2 sm:px-4 py-2 sm:py-3 hidden sm:table-cell">分类</th>
              <th className="text-left px-2 sm:px-4 py-2 sm:py-3 hidden sm:table-cell">难度</th>
              <th className="text-left px-2 sm:px-4 py-2 sm:py-3">状态变化</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map(l => {
              const p = problemMap.get(l.problemId)
              return (
                <tr key={l.id} className="border-b border-slate-700/50">
                  <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-slate-400">{l.date}</td>
                  <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-slate-500">{p?.leetcodeNumber}</td>
                  <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm">{p?.title}</td>
                  <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-slate-400 hidden sm:table-cell">{p?.category}</td>
                  <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm hidden sm:table-cell">{p ? DIFFICULTY_LABELS[p.difficulty] : ''}</td>
                  <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm">
                    <span className="text-slate-500">{LEVEL_LABELS[l.oldLevel as keyof typeof LEVEL_LABELS] || l.oldLevel}</span>
                    <span className="mx-0.5 sm:mx-1 text-slate-600">→</span>
                    <span>{LEVEL_LABELS[l.newLevel as keyof typeof LEVEL_LABELS] || l.newLevel}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filteredLogs.length === 0 && (
          <p className="text-slate-500 text-center py-8">暂无记录</p>
        )}
      </div>
    </div>
  )
}

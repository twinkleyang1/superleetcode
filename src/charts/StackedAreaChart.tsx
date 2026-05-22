import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ReviewLog, Level } from '../types'

interface Props {
  logs: ReviewLog[]
  totalProblems: number
}

interface DataPoint {
  mastered: number
  hesitant: number
  partial: number
  forgotten: number
  not_started: number
  date: string
}

export default function StackedAreaChart({ logs, totalProblems }: Props) {
  const data = useMemo(() => {
    if (logs.length === 0) return []

    const dates = [...new Set(logs.map(l => l.date))].sort()
    const problemLevels: Record<number, Level> = {}
    const result: DataPoint[] = []

    for (const date of dates) {
      const dayLogs = logs.filter(l => l.date === date)
      for (const log of dayLogs) {
        problemLevels[log.problemId] = log.newLevel as Level
      }

      const counts: DataPoint = {
        mastered: 0, hesitant: 0, partial: 0, forgotten: 0, not_started: 0, date: date.slice(5)
      }
      for (const level of Object.values(problemLevels)) {
        counts[level] = (counts[level] || 0) + 1
      }
      counts.not_started = totalProblems - Object.values(problemLevels).length

      result.push(counts)
    }

    return result
  }, [logs, totalProblems])

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Area type="monotone" dataKey="mastered" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} />
          <Area type="monotone" dataKey="hesitant" stackId="1" stroke="#eab308" fill="#eab308" fillOpacity={0.6} />
          <Area type="monotone" dataKey="partial" stackId="1" stroke="#f97316" fill="#f97316" fillOpacity={0.6} />
          <Area type="monotone" dataKey="forgotten" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} />
          <Area type="monotone" dataKey="not_started" stackId="1" stroke="#64748b" fill="#64748b" fillOpacity={0.6} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

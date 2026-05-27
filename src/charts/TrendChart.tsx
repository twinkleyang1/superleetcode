import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ReviewLog } from '../types'

interface Props {
  logs: ReviewLog[]
}

export default function TrendChart({ logs }: Props) {
  const data = useMemo(() => {
    const dailyProblems = new Map<string, Set<number>>()
    logs.forEach(l => {
      if (!dailyProblems.has(l.date)) dailyProblems.set(l.date, new Set())
      dailyProblems.get(l.date)!.add(l.problemId)
    })
    const countMap: Record<string, number> = {}
    dailyProblems.forEach((problems, date) => {
      countMap[date] = problems.size
    })

    const sorted = Object.entries(countMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-60)
      .map(([date, count]) => ({ date: date.slice(5), count }))
    return sorted
  }, [logs])

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

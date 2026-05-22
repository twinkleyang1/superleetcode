import { useMemo } from 'react'
import { ReviewLog } from '../types'

interface Props {
  logs: ReviewLog[]
  onDateClick: (date: string) => void
  selectedDate: string | null
}

export default function Heatmap({ logs, onDateClick, selectedDate }: Props) {
  const data = useMemo(() => {
    const map: Record<string, number> = {}
    logs.forEach(l => {
      map[l.date] = (map[l.date] || 0) + 1
    })

    const days: { date: string; count: number; level: number }[] = []
    const today = new Date()
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const count = map[dateStr] || 0
      let level = 0
      if (count > 0) level = 1
      if (count >= 3) level = 2
      if (count >= 6) level = 3
      if (count >= 10) level = 4
      days.push({ date: dateStr, count, level })
    }
    return days
  }, [logs])

  const levelColors = ['bg-slate-800', 'bg-green-900', 'bg-green-700', 'bg-green-500', 'bg-green-300']

  // Group into weeks
  const weeks: typeof data[] = []
  for (let i = 0; i < data.length; i += 7) {
    weeks.push(data.slice(i, i + 7))
  }

  return (
    <div className="flex gap-1 overflow-x-auto">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {week.map(day => (
            <div
              key={day.date}
              onClick={() => onDateClick(day.date)}
              className={`w-3.5 h-3.5 rounded-sm cursor-pointer transition-colors ${
                levelColors[day.level]
              } ${selectedDate === day.date ? 'ring-2 ring-blue-400' : ''}`}
              title={`${day.date}: ${day.count} 道`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

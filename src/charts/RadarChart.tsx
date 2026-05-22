import { useMemo } from 'react'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts'
import { Problem, Progress, CATEGORIES } from '../types'

interface Props {
  problems: Problem[]
  progressList: Progress[]
}

export default function CategoryRadar({ problems, progressList }: Props) {
  const data = useMemo(() => {
    const progressMap = new Map(progressList.map(p => [p.problemId, p]))

    return CATEGORIES.map(cat => {
      const catProblems = problems.filter(p => p.category === cat)
      const mastered = catProblems.filter(p => {
        const prog = progressMap.get(p.id)
        return prog && prog.level === 'mastered'
      }).length

      return {
        category: cat.length > 3 ? cat.slice(0, 3) : cat,
        mastered,
        total: catProblems.length,
        pct: catProblems.length > 0 ? Math.round((mastered / catProblems.length) * 100) : 0
      }
    })
  }, [problems, progressList])

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis dataKey="category" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
          <Radar name="掌握度 %" dataKey="pct" stroke="#22c55e" fill="#22c55e" fillOpacity={0.4} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

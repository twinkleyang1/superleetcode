import { Progress } from './types'

interface Predictions {
  firstRoundDate: Date
  allMasteredDate: Date
  firstRoundDays: number
  allMasteredDays: number
  effectiveQuota: number
}

export function computePredictions(
  progressList: Progress[],
  dailyNewQuota: number,
  newProblemDates: string[] = []
): Predictions {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const quota = Math.max(1, dailyNewQuota)

  // Calculate actual average daily pace from history
  let effectiveQuota = quota
  if (newProblemDates.length > 0) {
    const dateCounts: Record<string, number> = {}
    newProblemDates.forEach(d => {
      dateCounts[d] = (dateCounts[d] || 0) + 1
    })
    const dailyCounts = Object.values(dateCounts)
    const avgPace = dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length
    effectiveQuota = Math.max(quota, Math.ceil(avgPace))
  }

  const notStartedCount = progressList.filter(p => p.level === 'not_started').length
  const firstRoundDays = Math.ceil(notStartedCount / effectiveQuota)
  const firstRoundDate = new Date(today)
  firstRoundDate.setDate(firstRoundDate.getDate() + firstRoundDays)

  // All-mastered: max of (each pipeline problem's best case) and (last new batch + 3 days)
  let maxDays = 0

  // Pipeline problems (already started)
  for (const p of progressList) {
    if (p.level === 'not_started') continue
    const days = bestCaseDaysToMastered(p)
    if (days > maxDays) maxDays = days
  }

  // Not_started: last batch finishes first round, then +3 days to master
  if (notStartedCount > 0) {
    const lastBatchStartDay = firstRoundDays - 1
    const lastBatchMasteredDay = lastBatchStartDay + 3
    if (lastBatchMasteredDay > maxDays) maxDays = lastBatchMasteredDay
  }

  const allMasteredDate = new Date(today)
  allMasteredDate.setDate(allMasteredDate.getDate() + maxDays)

  return {
    firstRoundDate,
    allMasteredDate,
    firstRoundDays,
    allMasteredDays: maxDays,
    effectiveQuota
  }
}

function bestCaseDaysToMastered(progress: Progress): number {
  switch (progress.level) {
    case 'not_started':
      return 3 // Today to hesitant, 2 days later mastered
    case 'forgotten':
      return 2 // Today to hesitant, 1-2 days later mastered
    case 'partial':
      return 2
    case 'hesitant':
      return 2
    case 'mastered': {
      const remaining = Math.max(0, 5 - progress.consecutiveMastered)
      let days = 0
      let cm = progress.consecutiveMastered
      for (let i = 0; i < remaining; i++) {
        const intervals = [2, 3, 5, 7, 9]
        days += intervals[Math.min(cm, intervals.length - 1)]
        cm++
      }
      return days
    }
    default:
      return 0
  }
}

export function computeStreak(reviewDates: string[]): { current: number; longest: number } {
  if (reviewDates.length === 0) return { current: 0, longest: 0 }

  const uniqueDates = [...new Set(reviewDates)].sort()
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  // Calculate longest streak
  let longest = 0
  let streak = 0
  let prevDate: Date | null = null

  for (const dateStr of uniqueDates) {
    const date = new Date(dateStr)
    if (prevDate) {
      const diff = (date.getTime() - prevDate.getTime()) / 86400000
      if (diff === 1) {
        streak++
      } else {
        streak = 1
      }
    } else {
      streak = 1
    }
    if (streak > longest) longest = streak
    prevDate = date
  }
  if (streak > longest) longest = streak

  // Calculate current streak
  let current = 0
  const checkDate = new Date(today)
  const allDates = [...new Set(reviewDates)]

  // Check backwards from today
  let d = new Date(today)
  while (allDates.includes(d.toISOString().split('T')[0])) {
    current++
    d.setDate(d.getDate() - 1)
  }

  // Streak must include today or yesterday to be "current"
  if (!allDates.includes(today) && !allDates.includes(yesterday)) {
    current = 0
  }

  return { current, longest }
}

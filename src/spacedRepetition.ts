import { Level, Progress } from './types'

export function getNextReviewInterval(level: Level, consecutiveMastered: number): number {
  switch (level) {
    case 'forgotten':
      return 0 // Stay in today's queue
    case 'partial':
      return 1
    case 'hesitant':
      return 2
    case 'mastered': {
      const intervals = [3, 5, 7, 10, 14]
      const idx = Math.min(consecutiveMastered, intervals.length - 1)
      return intervals[idx]
    }
    default:
      return 0
  }
}

export function computeNextReview(
  progress: Progress,
  newLevel: Level
): Partial<Progress> {
  const now = new Date()

  const isDowngraded = newLevel === 'forgotten' || newLevel === 'partial'
  const consecutiveMastered = isDowngraded
    ? 0
    : newLevel === 'mastered'
      ? progress.consecutiveMastered + 1
      : progress.consecutiveMastered

  const interval = getNextReviewInterval(newLevel, consecutiveMastered)
  const nextReviewAt = new Date(now)
  nextReviewAt.setDate(nextReviewAt.getDate() + interval)

  return {
    level: newLevel,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: interval === 0 ? null : nextReviewAt.toISOString(),
    reviewCount: progress.reviewCount + 1,
    todayReviewCount: progress.todayReviewCount + 1,
    consecutiveMastered
  }
}

export function resetTodayReviewCounts(progressList: Progress[]): Progress[] {
  const today = new Date().toISOString().split('T')[0]
  return progressList.map(p => {
    if (p.lastReviewedAt && p.lastReviewedAt.split('T')[0] !== today) {
      return { ...p, todayReviewCount: 0 }
    }
    return p
  })
}

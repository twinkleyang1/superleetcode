import { Level, Progress } from './types'

export function computeForgetScore(progress: Progress): number {
  const reviewCount = progress.reviewCount
  if (reviewCount === 0) return 0

  const forgottenCount = progress.forgottenCount

  // Ratio score (0-40): what fraction of all reviews were "forgotten"
  const ratioScore = (forgottenCount / reviewCount) * 40

  // Count score (0-30): absolute number of forgotten ratings, caps at 5
  const countScore = Math.min(forgottenCount * 6, 30)

  // Recency score (0-30): how recently was the last forgotten
  let recencyScore = 0
  if (progress.lastForgottenAt) {
    const now = new Date()
    const lastForgot = new Date(progress.lastForgottenAt)
    const daysSince = Math.floor((now.getTime() - lastForgot.getTime()) / 86400000)
    if (daysSince <= 7) recencyScore = 30
    else if (daysSince <= 14) recencyScore = 20
    else if (daysSince <= 30) recencyScore = 10
  }

  let score = ratioScore + countScore + recencyScore

  // Mastery cooldown: consecutive mastery reduces the score
  if (progress.consecutiveMastered >= 5) {
    score = 0
  } else if (progress.consecutiveMastered >= 4) {
    score *= 0.25
  } else if (progress.consecutiveMastered >= 2) {
    score *= 0.5
  }

  return score
}

export function computeDailyTarget(forgetScore: number): number {
  if (forgetScore <= 20) return 1
  if (forgetScore <= 50) return 2
  if (forgetScore <= 80) return 3
  return 4
}

export function getNextReviewInterval(level: Level, consecutiveMastered: number): number {
  switch (level) {
    case 'forgotten':
      return 0
    case 'partial':
      return 1
    case 'hesitant':
      return 2
    case 'mastered': {
      const intervals = [2, 3, 5, 7, 9]
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

  const forgottenCount = newLevel === 'forgotten'
    ? progress.forgottenCount + 1
    : progress.forgottenCount

  const lastForgottenAt = newLevel === 'forgotten'
    ? now.toISOString()
    : progress.lastForgottenAt

  const dailyCompleted = progress.dailyCompleted + 1

  // Compute intermediate state to get forgetScore (using updated values)
  const intermediateProgress: Progress = {
    ...progress,
    forgottenCount,
    lastForgottenAt,
    consecutiveMastered,
    reviewCount: progress.reviewCount + 1
  }
  const forgetScore = computeForgetScore(intermediateProgress)
  const dailyTarget = computeDailyTarget(forgetScore)

  return {
    level: newLevel,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: interval === 0 ? null : nextReviewAt.toISOString(),
    reviewCount: progress.reviewCount + 1,
    todayReviewCount: progress.todayReviewCount + 1,
    consecutiveMastered,
    forgottenCount,
    lastForgottenAt,
    dailyTarget,
    dailyCompleted
  }
}

export function resetTodayReviewCounts(progressList: Progress[]): Progress[] {
  const today = new Date().toISOString().split('T')[0]
  return progressList.map(p => {
    const isNewDay = p.lastReviewedAt && p.lastReviewedAt.split('T')[0] !== today
    const neverReviewed = !p.lastReviewedAt

    if (isNewDay || neverReviewed) {
      const reset: Progress = {
        ...p,
        todayReviewCount: 0,
        dailyCompleted: 0,
        dailyTarget: computeDailyTarget(computeForgetScore(p))
      }
      return reset
    }
    return p
  })
}

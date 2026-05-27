import { Level, Progress, Difficulty } from './types'

export function getLocalDateString(date?: Date): string {
  const d = date || new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const LEVEL_ORDER: Record<string, number> = {
  not_started: -1, forgotten: 0, partial: 1, hesitant: 2, mastered: 3
}

/** Check if the rating path shows oscillation (went up then down) */
function isOscillating(path: string): boolean {
  if (path.length < 2) return false
  const levels = path.split(',').filter(c => c.length > 0)
  let wentUp = false
  for (let i = 1; i < levels.length; i++) {
    const prev = LEVEL_ORDER[levels[i]] ?? -1
    const curr = LEVEL_ORDER[levels[i - 1]] ?? -1
    if (curr > prev) wentUp = true
    if (wentUp && curr < prev) return true
  }
  return false
}

const F_PENALTY: Record<Level, number> = {
  mastered: 25, hesitant: 18, partial: 12, forgotten: 6, not_started: 0
}

const I_PENALTY: Record<Difficulty, number> = {
  easy: 15, medium: 8, hard: 0
}

const DOWNGRADE_TABLE: Record<Level, Level[]> = {
  mastered:    ['mastered', 'hesitant', 'partial',   'forgotten'],
  hesitant:    ['hesitant', 'partial',   'forgotten', 'forgotten'],
  partial:     ['partial',  'forgotten', 'forgotten', 'forgotten'],
  forgotten:   ['forgotten','forgotten', 'forgotten', 'forgotten'],
  not_started: ['not_started','not_started','not_started','not_started']
}

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
  rawLevel: Level,
  difficulty: Difficulty
): Partial<Progress> {
  const now = new Date()

  // Compute confidence score and effective level
  const confidenceScore = computeConfidenceScore(progress, rawLevel, difficulty)
  const effectiveLevel = getEffectiveLevel(rawLevel, confidenceScore)

  // Use effectiveLevel (not rawLevel) for all subsequent logic
  const isDowngraded = effectiveLevel === 'forgotten' || effectiveLevel === 'partial'
  const consecutiveMastered = isDowngraded
    ? 0
    : effectiveLevel === 'mastered'
      ? progress.consecutiveMastered + 1
      : progress.consecutiveMastered

  const interval = getNextReviewInterval(effectiveLevel, consecutiveMastered)
  const nextReviewAt = new Date(now)
  nextReviewAt.setDate(nextReviewAt.getDate() + interval)

  // forgottenCount: increment if user actually clicked "forgotten"
  const forgottenCount = rawLevel === 'forgotten'
    ? progress.forgottenCount + 1
    : progress.forgottenCount

  // lastForgottenAt: update if user actually clicked "forgotten"
  const lastForgottenAt = rawLevel === 'forgotten'
    ? now.toISOString()
    : progress.lastForgottenAt

  const dailyCompleted = progress.dailyCompleted + 1

  // dailyForgottenCount: increment if user clicked "forgotten"
  const dailyForgottenCount = rawLevel === 'forgotten'
    ? progress.dailyForgottenCount + 1
    : progress.dailyForgottenCount

  // dailyRatingPath: append effective level
  const levelChar = effectiveLevel[0]
  const dailyRatingPath = progress.dailyRatingPath
    ? progress.dailyRatingPath + ',' + levelChar
    : levelChar

  // Compute intermediate state to get forgetScore
  const intermediateProgress: Progress = {
    ...progress,
    forgottenCount,
    lastForgottenAt,
    consecutiveMastered,
    reviewCount: progress.reviewCount + 1,
    dailyForgottenCount,
    dailyRatingPath
  }
  const forgetScore = computeForgetScore(intermediateProgress)
  const dailyTarget = computeDailyTarget(forgetScore)

  return {
    level: effectiveLevel,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: interval === 0 ? null : nextReviewAt.toISOString(),
    reviewCount: progress.reviewCount + 1,
    todayReviewCount: progress.todayReviewCount + 1,
    consecutiveMastered,
    forgottenCount,
    lastForgottenAt,
    dailyTarget,
    dailyCompleted,
    dailyForgottenCount,
    dailyRatingPath
  }
}

export function resetTodayReviewCounts(progressList: Progress[]): Progress[] {
  const today = getLocalDateString()
  return progressList.map(p => {
    const lastDate = p.lastReviewedAt ? getLocalDateString(new Date(p.lastReviewedAt)) : null
    const isNewDay = lastDate && lastDate !== today
    const neverReviewed = !p.lastReviewedAt

    if (isNewDay || neverReviewed) {
      const reset: Progress = {
        ...p,
        todayReviewCount: 0,
        dailyCompleted: 0,
        dailyForgottenCount: 0,
        dailyRatingPath: '',
        dailyTarget: computeDailyTarget(computeForgetScore(p))
      }
      return reset
    }
    return p
  })
}

export function computeConfidenceScore(
  progress: Progress,
  rawLevel: Level,
  difficulty: Difficulty
): number {
  const today = new Date()
  const A = progress.dailyForgottenCount
  const B = progress.dailyCompleted + 1

  // Factor C: days since last review (only when A > 0)
  let C_penalty = 0
  if (A > 0 && progress.lastReviewedAt) {
    const lastReview = new Date(progress.lastReviewedAt)
    const C = Math.floor((today.getTime() - lastReview.getTime()) / 86400000)
    C_penalty = Math.max(0, 15 - C * 1.5)
  }

  // Factor D: historical forgetScore
  const D = computeForgetScore(progress)

  // Factor F: current level penalty (only when A > 0)
  const F = A > 0 ? F_PENALTY[progress.level] : 0

  // Factor G: oscillation check (use existing path + rawLevel)
  const G_levelChar = rawLevel[0]
  const tentativePath = progress.dailyRatingPath
    ? progress.dailyRatingPath + ',' + G_levelChar
    : G_levelChar
  const G = isOscillating(tentativePath) ? 15 : 0

  // Factor I: difficulty penalty (only when A > 0)
  const I = A > 0 ? I_PENALTY[difficulty] : 0

  let score = 100
    - (B - 1) * 5
    - (A > 0 ? A * 25 + C_penalty + F + I : 0)
    - D * 0.3
    - G

  return Math.max(0, Math.min(100, score))
}

export function getEffectiveLevel(rawLevel: Level, confidenceScore: number): Level {
  const downgradeSteps = confidenceScore >= 85 ? 0
    : confidenceScore >= 60 ? 1
    : confidenceScore >= 35 ? 2
    : 3
  return DOWNGRADE_TABLE[rawLevel][downgradeSteps]
}

export type Difficulty = 'easy' | 'medium' | 'hard'
export type Level = 'not_started' | 'forgotten' | 'partial' | 'hesitant' | 'mastered'

export interface Problem {
  id: number
  leetcodeNumber: number
  title: string
  difficulty: Difficulty
  category: string
  url: string
  isCustom: boolean
}

export interface Progress {
  id: number
  problemId: number
  level: Level
  lastReviewedAt: string | null
  nextReviewAt: string | null
  reviewCount: number
  todayReviewCount: number
  consecutiveMastered: number
  forgottenCount: number
  lastForgottenAt: string | null
  dailyTarget: number
  dailyCompleted: number
  dailyForgottenCount: number
  dailyRatingPath: string
}

export interface ReviewLog {
  id: number
  problemId: number
  date: string
  oldLevel: string
  newLevel: string
  reviewedAt: string
}

export interface Settings {
  id: number
  dailyTotal: number
  dailyNew: number
  autoLaunch: boolean
  reminderTime: string
}

export interface AppData {
  problems: Problem[]
  progress: Progress[]
  reviewLogs: ReviewLog[]
  settings: Settings
}

export const LEVEL_LABELS: Record<Level, string> = {
  not_started: '未刷',
  forgotten: '完全忘记',
  partial: '记得部分',
  hesitant: '犹豫但对',
  mastered: '完全掌握'
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难'
}

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: 'text-green-400',
  medium: 'text-yellow-400',
  hard: 'text-red-400'
}

export const CATEGORIES = [
  '哈希', '双指针', '滑动窗口', '普通数组', '矩阵',
  '链表', '二叉树', '图论', '回溯', '二分查找',
  '栈', '堆', '贪心', '动态规划', '技巧'
]

import Dexie, { Table } from 'dexie'
import { Problem, Progress, ReviewLog, Settings } from './types'

class LeetCodeDB extends Dexie {
  problems!: Table<Problem, number>
  progress!: Table<Progress, number>
  reviewLogs!: Table<ReviewLog, number>
  settings!: Table<Settings, number>

  constructor() {
    super('LeetCodeTracker')
    this.version(1).stores({
      problems: 'id, leetcodeNumber, difficulty, category, isCustom',
      progress: 'id, problemId, level, nextReviewAt',
      reviewLogs: 'id, problemId, date',
      settings: 'id'
    })
  }
}

export const db = new LeetCodeDB()

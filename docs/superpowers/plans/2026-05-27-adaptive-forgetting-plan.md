# Adaptive Forgetting & Chart Dedup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix heatmap/trend chart double-counting bug and implement adaptive forgetting with weighted forgetScore, same-day retry, and mastery cooldown.

**Architecture:** Add 4 fields to the Progress model; compute a forgetScore (0-100) from ratio/count/recency of forgotten ratings; derive a dailyTarget for how many times a problem must appear today; allow same-day re-entry on forgotten ratings up to dailyTarget; apply mastery cooldown to taper off bombardment. Shorten mastered intervals to 2→3→5→7→9 days.

**Tech Stack:** React + TypeScript, Dexie (IndexedDB), Recharts

---

### Task 1: Update Progress type and seed defaults

**Files:**
- Modify: `src/types.ts`
- Modify: `src/seed.ts`

- [ ] **Step 1: Add new fields to Progress interface in types.ts**

In `src/types.ts`, change the `Progress` interface:

```typescript
export interface Progress {
  id: number
  problemId: number
  level: Level
  lastReviewedAt: string | null
  nextReviewAt: string | null
  reviewCount: number
  todayReviewCount: number  // keep for backward compat, will be superseded
  consecutiveMastered: number
  // NEW FIELDS
  forgottenCount: number
  lastForgottenAt: string | null
  dailyTarget: number
  dailyCompleted: number
}
```

- [ ] **Step 2: Add default values to seed.ts initializeData()**

In `src/seed.ts`, update the progress initialization in `initializeData()` (around line 19-28):

```typescript
const progress = problems.map((p, i) => ({
  id: i + 1,
  problemId: p.id,
  level: 'not_started' as const,
  lastReviewedAt: null,
  nextReviewAt: null,
  reviewCount: 0,
  todayReviewCount: 0,
  consecutiveMastered: 0,
  forgottenCount: 0,
  lastForgottenAt: null,
  dailyTarget: 1,
  dailyCompleted: 0
}))
```

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit`
Expected: No type errors from the new fields.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/seed.ts
git commit -m "feat: add forgottenCount, lastForgottenAt, dailyTarget, dailyCompleted to Progress"
```

---

### Task 2: Add forgetScore algorithm and update spaced repetition logic

**Files:**
- Modify: `src/spacedRepetition.ts`

- [ ] **Step 1: Add computeForgetScore and computeDailyTarget functions**

Add to `src/spacedRepetition.ts` (before the existing functions):

```typescript
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
```

- [ ] **Step 2: Shorten mastered intervals in getNextReviewInterval**

Change the mastered intervals in `getNextReviewInterval`:

```typescript
export function getNextReviewInterval(level: Level, consecutiveMastered: number): number {
  switch (level) {
    case 'forgotten':
      return 0
    case 'partial':
      return 1
    case 'hesitant':
      return 2
    case 'mastered': {
      const intervals = [2, 3, 5, 7, 9]  // was [3, 5, 7, 10, 14]
      const idx = Math.min(consecutiveMastered, intervals.length - 1)
      return intervals[idx]
    }
    default:
      return 0
  }
}
```

- [ ] **Step 3: Update computeNextReview to handle new fields**

Replace the `computeNextReview` function:

```typescript
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

  // Compute intermediate state to get forgetScore
  const intermediateProgress = {
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
```

- [ ] **Step 4: Update resetTodayReviewCounts to also reset dailyCompleted and recompute dailyTarget**

Replace `resetTodayReviewCounts`:

```typescript
export function resetTodayReviewCounts(progressList: Progress[]): Progress[] {
  const today = new Date().toISOString().split('T')[0]
  return progressList.map(p => {
    const isNewDay = p.lastReviewedAt && p.lastReviewedAt.split('T')[0] !== today
    const neverReviewed = !p.lastReviewedAt

    if (isNewDay || neverReviewed) {
      const reset = {
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
```

- [ ] **Step 5: Build check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/spacedRepetition.ts
git commit -m "feat: add forgetScore algorithm, shortened intervals, extended reset logic"
```

---

### Task 3: Update App.tsx to persist new reset fields

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update the reset call to persist new fields**

In `src/App.tsx`, the existing reset block (lines 25-29) already iterates the reset results. Update it to also persist `dailyCompleted` and `dailyTarget`:

```typescript
const progressList = await db.progress.toArray()
const reset = resetTodayReviewCounts(progressList)
for (const p of reset) {
  await db.progress.update(p.id, {
    todayReviewCount: p.todayReviewCount,
    dailyCompleted: p.dailyCompleted,
    dailyTarget: p.dailyTarget
  })
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "fix: persist dailyCompleted and dailyTarget resets on startup"
```

---

### Task 4: Fix Heatmap and TrendChart double-counting

**Files:**
- Modify: `src/charts/Heatmap.tsx`
- Modify: `src/charts/TrendChart.tsx`

- [ ] **Step 1: Fix Heatmap.tsx — count unique problems per day**

Replace the counting logic in the `useMemo` (lines 12-15 of Heatmap.tsx):

```typescript
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

  const days: { date: string; count: number; level: number }[] = []
  const today = new Date()
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const count = countMap[dateStr] || 0
    let level = 0
    if (count > 0) level = 1
    if (count >= 3) level = 2
    if (count >= 6) level = 3
    if (count >= 10) level = 4
    days.push({ date: dateStr, count, level })
  }
  return days
}, [logs])
```

- [ ] **Step 2: Fix TrendChart.tsx — count unique problems per day**

Replace the counting logic in the `useMemo` (lines 10-21 of TrendChart.tsx):

```typescript
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
```

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/charts/Heatmap.tsx src/charts/TrendChart.tsx
git commit -m "fix: dedup chart counts by unique problemId per day"
```

---

### Task 5: Update RatingModal to re-enter queue on forgotten

**Files:**
- Modify: `src/components/RatingModal.tsx`

- [ ] **Step 1: Update handleRate to pass re-enter signal**

The RatingModal currently calls `onRated()` after saving. The ReviewQueue parent needs to know if the problem should re-enter the queue (forgotten rating with remaining dailyTarget). We change the `onRated` callback to accept a boolean.

First, update the Props interface and handleRate in `RatingModal.tsx`:

```typescript
interface Props {
  item: QueueItem
  onClose: () => void
  onRated: (shouldReenter: boolean) => void
}
```

Then in `handleRate`, after getting the updated progress, determine if re-entry is needed:

```typescript
async function handleRate(newLevel: Level) {
  const progress = await db.progress.where({ problemId: item.problem.id }).first()
  if (!progress) return

  const oldLevel = progress.level
  const updates = computeNextReview(progress, newLevel)
  await db.progress.update(progress.id, updates)

  const today = new Date().toISOString().split('T')[0]
  const logCount = await db.reviewLogs.count()
  await db.reviewLogs.add({
    id: logCount + 1,
    problemId: item.problem.id,
    date: today,
    oldLevel,
    newLevel,
    reviewedAt: new Date().toISOString()
  })

  const data = await exportToJSON()
  await api.saveData(data)

  const shouldReenter = newLevel === 'forgotten' && updates.dailyCompleted! < updates.dailyTarget!
  onRated(shouldReenter)
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: No errors from RatingModal (ReviewQueue will error until next task — that's expected).

- [ ] **Step 3: Commit**

```bash
git add src/components/RatingModal.tsx
git commit -m "feat: RatingModal signals re-enter when forgotten and dailyCompleted < dailyTarget"
```

---

### Task 6: Update ReviewQueue for same-day re-entry and forgetScore sorting

**Files:**
- Modify: `src/components/ReviewQueue.tsx`

- [ ] **Step 1: Update QueueItem interface**

Add forgetScore and ratio fields to `QueueItem`:

```typescript
interface QueueItem {
  problem: Problem
  progress: Progress
  zone: 'review' | 'newQuota' | 'extraNew'
  forgetScore: number
}
```

- [ ] **Step 2: Update loadQueue to filter by dailyTarget and compute forgetScore**

Rewrite the review zone building in `loadQueue` to filter forgotten problems by dailyTarget and attach forgetScore:

```typescript
async function loadQueue() {
  const problems = await db.problems.toArray()
  const progressList = await db.progress.toArray()
  const settingsArr = await db.settings.toArray()
  const settings = settingsArr[0] || { dailyTotal: 5, dailyNew: 2 }

  const today = new Date().toISOString().split('T')[0]
  const logs = await db.reviewLogs.where({ date: today }).toArray()
  const todayDone = new Set(logs.map(l => l.problemId)).size
  const todayNewCount = new Set(
    logs.filter(l => l.oldLevel === 'not_started').map(l => l.problemId)
  ).size

  const progressMap = new Map(progressList.map(p => [p.problemId, p]))
  const problemMap = new Map(problems.map(p => [p.id, p]))

  const now = new Date()
  const result: QueueItem[] = []

  // Zone 1: Due reviews (forgotten first)
  for (const p of progressList) {
    if (p.level === 'forgotten' && p.dailyCompleted < p.dailyTarget) {
      const problem = problemMap.get(p.problemId)
      if (problem) result.push({ problem, progress: p, zone: 'review', forgetScore: computeForgetScore(p) })
    }
  }
  for (const p of progressList) {
    if (p.nextReviewAt && new Date(p.nextReviewAt) <= now && p.level !== 'forgotten') {
      const problem = problemMap.get(p.problemId)
      if (problem) result.push({ problem, progress: p, zone: 'review', forgetScore: computeForgetScore(p) })
    }
  }

  // Sort review zone: higher forgetScore first
  result.sort((a, b) => b.forgetScore - a.forgetScore)

  // Zone 2: New problems to meet quota
  const newNeeded = Math.max(0, settings.dailyNew - todayNewCount)
  const notStarted = progressList.filter(p => p.level === 'not_started')
  for (let i = 0; i < Math.min(newNeeded, notStarted.length); i++) {
    const problem = problemMap.get(notStarted[i].problemId)
    if (problem && !result.find(r => r.problem.id === problem.id)) {
      result.push({ problem, progress: notStarted[i], zone: 'newQuota', forgetScore: 0 })
    }
  }

  // Zone 3: Extra new to meet total
  const totalNeeded = Math.max(0, settings.dailyTotal - todayDone - result.length)
  const extraNew = notStarted.filter(p => !result.find(r => r.problem.id === problemMap.get(p.problemId)?.id))
  for (let i = 0; i < Math.min(totalNeeded, extraNew.length); i++) {
    const problem = problemMap.get(extraNew[i].problemId)
    if (problem) result.push({ problem, progress: extraNew[i], zone: 'extraNew', forgetScore: 0 })
  }

  setQueue(result)
}
```

- [ ] **Step 3: Update the onRated handler and QueueCard**

Change `onRated` in the RatingModal usage and the QueueCard display to show dailyTarget progress:

```typescript
{ratingItem && (
  <RatingModal
    item={ratingItem}
    onClose={() => setRatingItem(null)}
    onRated={(shouldReenter) => {
      setRatingItem(null)
      loadQueue()
    }}
  />
)}
```

Update QueueCard to show dailyTarget progress instead of todayReviewCount:

```typescript
function QueueCard({ item, onRate }: { item: QueueItem; onRate: () => void }) {
  const levelColors: Record<Level, string> = {
    not_started: 'bg-slate-700 text-slate-400',
    forgotten: 'bg-red-900 text-red-300',
    partial: 'bg-orange-900 text-orange-300',
    hesitant: 'bg-yellow-900 text-yellow-300',
    mastered: 'bg-green-900 text-green-300'
  }

  return (
    <div className="bg-slate-800 rounded-lg p-2 sm:p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-500 text-xs sm:text-sm sm:w-12">{item.problem.leetcodeNumber}</span>
        <a
          href={item.problem.url}
          target="_blank"
          className="text-blue-400 hover:text-blue-300 hover:underline text-sm"
          rel="noreferrer"
        >
          {item.problem.title}
        </a>
        <span className="text-xs text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">
          {item.problem.category}
        </span>
        <span className="text-xs text-slate-500">
          {item.problem.difficulty === 'easy' ? '简单' :
           item.problem.difficulty === 'medium' ? '中等' : '困难'}
        </span>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded ${levelColors[item.progress.level]}`}>
          {LEVEL_LABELS[item.progress.level]}
        </span>
        {item.progress.dailyTarget > 1 && (
          <span className="text-xs text-orange-400">
            {item.progress.dailyCompleted}/{item.progress.dailyTarget}
          </span>
        )}
        {item.forgetScore > 50 && (
          <span className="text-xs text-red-400" title="遗忘严重度">
            ⚠{Math.round(item.forgetScore)}
          </span>
        )}
        <button
          onClick={onRate}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 sm:px-3 py-1.5 rounded-lg"
        >
          评价
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add import for computeForgetScore**

At the top of `ReviewQueue.tsx`, add the import:

```typescript
import { computeForgetScore } from '../spacedRepetition'
```

- [ ] **Step 5: Build check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReviewQueue.tsx
git commit -m "feat: same-day re-entry for forgotten, forgetScore-based queue sorting"
```

---

### Task 7: Update Dashboard to show new fields

**Files:**
- Modify: `src/components/Dashboard.tsx`

- [ ] **Step 1: Update todayDone calculation and queue preview**

In Dashboard's `loadStats`, the `todayDone` already uses `Set` so it's correct. But the queue preview should also filter by `dailyTarget` and show the new fields. Update the queue building section (lines 71-90):

```typescript
// Build today's review queue preview
const progressMap = new Map(progressList.map(p => [p.problemId, p]))
const problemMap = new Map(problems.map(p => [p.id, p]))
const queueItems: QueueItem[] = []

for (const p of progressList) {
  if (p.level === 'forgotten' && p.dailyCompleted < p.dailyTarget) {
    const problem = problemMap.get(p.problemId)
    if (problem) queueItems.push({ problem, progress: p })
  } else if (p.level === 'not_started') {
    const problem = problemMap.get(p.problemId)
    if (problem) queueItems.push({ problem, progress: p })
  } else if (p.nextReviewAt && new Date(p.nextReviewAt) <= new Date()) {
    const problem = problemMap.get(p.problemId)
    if (problem) queueItems.push({ problem, progress: p })
  }
}

queueItems.sort((a, b) => {
  const order: Record<Level, number> = {
    forgotten: 0, not_started: 1, partial: 2, hesitant: 3, mastered: 4
  }
  return order[a.progress.level] - order[b.progress.level]
})
```

And update the queue card display in the Dashboard (replace the `todayReviewCount` display with the new `dailyCompleted/dailyTarget` display, lines 193-194):

```tsx
{item.progress.dailyTarget > 1 && (
  <span className="text-xs text-orange-400">
    {item.progress.dailyCompleted}/{item.progress.dailyTarget}
  </span>
)}
```

- [ ] **Step 2: Build check and verify**

Run: `npx tsc --noEmit`
Expected: No errors.

Run: `npm run dev` (or appropriate start command), verify the dashboard shows the new fields correctly.

- [ ] **Step 3: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: show dailyTarget progress and filter forgotten by dailyTarget in Dashboard"
```

---

### Task 8: Final verification and smoke test

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 2: Start the app and verify**

Run: `npm start`

Manual checks:
1. Open Dashboard — verify today's count matches actual unique problems
2. Go to ReviewQueue — rate a problem as "完全忘记", verify it re-appears in the queue
3. Rate the same problem as "完全忘记" multiple times — verify the `dailyCompleted/dailyTarget` counter increments
4. Once `dailyCompleted >= dailyTarget`, the problem should no longer appear in the queue
5. Go to History — verify Heatmap colors are based on unique problems per day, not total review entries
6. Go to History — verify TrendChart counts are based on unique problems per day
7. Rate a problem as "完全掌握" several days in a row — verify the dailyTarget goes down

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final verification fixes"
```

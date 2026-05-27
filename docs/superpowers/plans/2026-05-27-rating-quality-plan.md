# Same-Day Rating Quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguish first-try mastery from struggled mastery by computing a confidence score based on same-day rating history, downgrading the effective level for low-confidence ratings.

**Architecture:** Add 2 new daily-reset fields to Progress; add `computeConfidenceScore` (7-factor weighted formula) and `getEffectiveLevel` (downgrade mapping) to `spacedRepetition.ts`; modify `computeNextReview` to accept `rawLevel + difficulty`, internally compute effective level, and use it for all downstream logic.

**Tech Stack:** React + TypeScript, Dexie (IndexedDB), SQL.js (Electron), Recharts

---

### Task 1: Add new fields to Progress type, seed defaults, and persistence

**Files:**
- Modify: `src/types.ts`
- Modify: `src/seed.ts`
- Modify: `src/components/AddProblemModal.tsx`
- Modify: `electron/store.ts`

- [ ] **Step 1: Add fields to types.ts**

In `src/types.ts`, add to the `Progress` interface after `dailyCompleted` (line 26):

```typescript
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
  // NEW
  dailyForgottenCount: number
  dailyRatingPath: string
}
```

- [ ] **Step 2: Add defaults to seed.ts initializeData()**

In `src/seed.ts`, add to the progress initialization (after `dailyCompleted: 0`):

```typescript
dailyCompleted: 0,
dailyForgottenCount: 0,
dailyRatingPath: ''
```

- [ ] **Step 3: Add defaults to AddProblemModal.tsx**

In `src/components/AddProblemModal.tsx`, find the `db.progress.add()` call and add the same defaults:

```typescript
dailyCompleted: 0,
dailyForgottenCount: 0,
dailyRatingPath: ''
```

- [ ] **Step 4: Update electron/store.ts**

4a. In the CREATE TABLE progress statement, add 2 columns (after `dailyCompleted`):

```sql
dailyForgottenCount INTEGER DEFAULT 0,
dailyRatingPath TEXT DEFAULT ''
```

4b. Add migration statements after the existing ALTER TABLE block:

```typescript
try { db.run('ALTER TABLE progress ADD COLUMN dailyForgottenCount INTEGER DEFAULT 0') } catch (_) {}
try { db.run('ALTER TABLE progress ADD COLUMN dailyRatingPath TEXT DEFAULT ""') } catch (_) {}
```

4c. Update `ProgressData` interface (after `dailyCompleted`):

```typescript
export interface ProgressData {
  id: number; problemId: number; level: 'not_started' | 'forgotten' | 'partial' | 'hesitant' | 'mastered'
  lastReviewedAt: string | null; nextReviewAt: string | null; reviewCount: number; todayReviewCount: number; consecutiveMastered: number
  forgottenCount: number; lastForgottenAt: string | null; dailyTarget: number; dailyCompleted: number
  dailyForgottenCount: number; dailyRatingPath: string
}
```

4d. Update `seedData()` progStmt INSERT to include 14 columns:

```typescript
const progStmt = db.prepare('INSERT INTO progress (id, problemId, level, lastReviewedAt, nextReviewAt, reviewCount, todayReviewCount, consecutiveMastered, forgottenCount, lastForgottenAt, dailyTarget, dailyCompleted, dailyForgottenCount, dailyRatingPath) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
```

And the run call:

```typescript
progStmt.run([id, id, 'not_started', null, null, 0, 0, 0, 0, null, 1, 0, 0, ''])
```

4e. Update `writeData()` insPr INSERT to include the 2 new columns and update the run call:

```typescript
const insPr = db.prepare('INSERT INTO progress (id, problemId, level, lastReviewedAt, nextReviewAt, reviewCount, todayReviewCount, consecutiveMastered, forgottenCount, lastForgottenAt, dailyTarget, dailyCompleted, dailyForgottenCount, dailyRatingPath) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
```

Run call:

```typescript
for (const p of data.progress) insPr.run([p.id, p.problemId, p.level, p.lastReviewedAt, p.nextReviewAt, p.reviewCount, p.todayReviewCount, p.consecutiveMastered, p.forgottenCount, p.lastForgottenAt, p.dailyTarget, p.dailyCompleted, p.dailyForgottenCount, p.dailyRatingPath])
```

- [ ] **Step 5: Build check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/seed.ts src/components/AddProblemModal.tsx electron/store.ts
git commit -m "feat: add dailyForgottenCount and dailyRatingPath to Progress"
```

---

### Task 2: Add computeConfidenceScore and getEffectiveLevel to spacedRepetition.ts

**Files:**
- Modify: `src/spacedRepetition.ts`

- [ ] **Step 1: Update existing import and add LEVEL_ORDER constants**

Change the existing import on line 1 of `spacedRepetition.ts` from `import { Level, Progress } from './types'` to:

```typescript
import { Level, Progress, Difficulty } from './types'
```

Then, before the existing functions, add:

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
```

- [ ] **Step 2: Add computeConfidenceScore function**

```typescript
export function computeConfidenceScore(
  progress: Progress,
  rawLevel: Level,
  difficulty: Difficulty
): number {
  const today = new Date()
  const A = progress.dailyForgottenCount // today's forgotten count so far
  const B = progress.dailyCompleted + 1  // today's total after this rating

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
  const G_levelChar = rawLevel[0] // 'f', 'p', 'h', 'm', 'n'
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
```

- [ ] **Step 3: Add getEffectiveLevel function**

```typescript
export function getEffectiveLevel(rawLevel: Level, confidenceScore: number): Level {
  const downgradeSteps = confidenceScore >= 85 ? 0
    : confidenceScore >= 60 ? 1
    : confidenceScore >= 35 ? 2
    : 3
  return DOWNGRADE_TABLE[rawLevel][downgradeSteps]
}
```

- [ ] **Step 4: Build check**

Run: `npx tsc --noEmit`
Expected: No errors. (computeNextReview will still have type issue until Task 3 — that's expected.)

- [ ] **Step 5: Commit**

```bash
git add src/spacedRepetition.ts
git commit -m "feat: add computeConfidenceScore and getEffectiveLevel"
```

---

### Task 3: Update computeNextReview to use effectiveLevel

**Files:**
- Modify: `src/spacedRepetition.ts`

- [ ] **Step 1: Change computeNextReview signature and internals**

The function signature changes from `(progress, newLevel)` to `(progress, rawLevel, difficulty)`:

```typescript
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
  const levelChar = effectiveLevel[0] // 'f', 'p', 'h', 'm', 'n'
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
```

- [ ] **Step 2: Update resetTodayReviewCounts**

Add the new fields to the daily reset:

```typescript
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
        dailyForgottenCount: 0,
        dailyRatingPath: '',
        dailyTarget: computeDailyTarget(computeForgetScore(p))
      }
      return reset
    }
    return p
  })
}
```

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit`
Expected: No errors. RatingModal may need update (see Task 4).

- [ ] **Step 4: Commit**

```bash
git add src/spacedRepetition.ts
git commit -m "feat: computeNextReview uses effectiveLevel with confidence score"
```

---

### Task 4: Update RatingModal to pass difficulty

**Files:**
- Modify: `src/components/RatingModal.tsx`

- [ ] **Step 1: Add difficulty to QueueItem and pass to computeNextReview**

In `src/components/RatingModal.tsx`, update the QueueItem interface:

```typescript
interface QueueItem {
  problem: { id: number; title: string; leetcodeNumber: number; difficulty: Difficulty }
  progress: { id: number; level: Level; problemId: number }
}
```

And add the import:
```typescript
import { Difficulty } from '../types'
```

In `handleRate`, change the call to `computeNextReview`:

```typescript
const updates = computeNextReview(progress, newLevel, item.problem.difficulty)
```

The re-entry is handled by ReviewQueue's `loadQueue()` (it filters `level === 'forgotten' && dailyCompleted < dailyTarget`), so no explicit `shouldReenter` signal is needed. `onRated()` stays as `() => void`. Note: `updates.level` now contains the effective level (e.g. 'hesitant'), so the re-entry filter uses the correct downgraded level.

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/RatingModal.tsx
git commit -m "feat: pass difficulty to computeNextReview for confidence scoring"
```

---

### Task 5: Update App.tsx to persist new reset fields

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add new fields to the reset persistence**

In `src/App.tsx`, update the reset loop:

```typescript
for (const p of reset) {
  await db.progress.update(p.id, {
    todayReviewCount: p.todayReviewCount,
    dailyCompleted: p.dailyCompleted,
    dailyTarget: p.dailyTarget,
    dailyForgottenCount: p.dailyForgottenCount,
    dailyRatingPath: p.dailyRatingPath
  })
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "fix: persist dailyForgottenCount and dailyRatingPath resets on startup"
```

---

### Task 6: Final verification and build

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Manual smoke test checklist**

1. Start app, open a problem, rate "完全掌握" first try — verify no downgrade (skill shouldn't appear in queue again)
2. Rate same problem "完全忘记" → "完全掌握" — verify it's treated as hesitant or partial (check nextReviewAt interval)
3. Rate a problem "完全忘记" × 3 → "完全掌握" — verify it's treated as partial or forgotten
4. Check that `dailyForgottenCount` and `dailyRatingPath` reset the next day

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final verification fixes"
```

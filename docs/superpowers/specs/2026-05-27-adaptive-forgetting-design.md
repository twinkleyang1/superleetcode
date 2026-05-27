# Adaptive Forgetting & Chart Dedup — Design Spec

## Problem

1. **Bug**: Heatmap and TrendChart count total reviewLog entries per day instead of unique problems. Reviewing the same problem N times in a day inflates chart data.
2. **Feature**: A problem repeatedly marked "完全忘记" (forgotten) needs aggressive repetition. But "first exposure" forgotten (not_started → forgotten) and "long-gap" forgotten are normal and should not trigger escalation. Meanwhile, continuous mastery should cool down the escalation.

## Data Model Changes

New fields in `Progress`:

| Field | Type | Description |
|---|---|---|
| `forgottenCount` | `number` | Total times marked "完全忘记" |
| `lastForgottenAt` | `string \| null` | ISO date of most recent forgotten rating |
| `dailyTarget` | `number` | How many times this problem should appear today (computed by algorithm) |
| `dailyCompleted` | `number` | How many times already reviewed today |

`todayReviewCount` is superseded by `dailyCompleted`.

## Forget Score Algorithm

### Formula

```
forgetScore = ratioScore(0-40) + countScore(0-30) + recencyScore(0-30)

ratioScore   = (forgottenCount / reviewCount) × 40
countScore   = min(forgottenCount × 6, 30)        // caps at 5 forgotten
recencyScore = last forgotten within 7d → 30
               last forgotten within 14d → 20
               last forgotten within 30d → 10
               over 30d → 0
```

### Mastery Cooldown

Consecutive mastery reduces the forgetScore:

| consecutiveMastered | Multiplier |
|---|---|
| 0-1 | ×1.0 |
| 2-3 | ×0.5 |
| 4 | ×0.25 |
| ≥5 | ×0 (reset to normal rhythm) |

When forgetScore = 0, the problem still follows its normal spaced-repetition interval — it just stops the "multiple-times-per-day" bombardment.

### Daily Target

| forgetScore | dailyTarget |
|---|---|
| 0-20 | 1 |
| 21-50 | 2 |
| 51-80 | 3 |
| 81-100 | 4 |

At the start of each day, `dailyTarget` is recomputed from the current `forgetScore` and `dailyCompleted` is reset to 0.

## Spaced Repetition Intervals (Shortened)

```
mastered: 2 → 3 → 5 → 7 → 9 days  (was: 3 → 5 → 7 → 10 → 14)
forgotten: 0 (same day)
partial: 1 day
hesitant: 2 days
```

## Review Queue Behavior

- Rated **forgotten**: `dailyCompleted++`, problem re-enters queue if `dailyCompleted < dailyTarget` (same-day retry)
- Rated **non-forgotten** (partial/hesitant/mastered): `dailyCompleted++`, exits queue for the day regardless of dailyTarget
- Queue sorting: higher forgetScore first, then lower `dailyCompleted/dailyTarget` ratio first
- `dailyCompleted` resets to 0 when the date changes (same pattern as current `todayReviewCount` reset)

## Chart Dedup Fix

**Heatmap** and **TrendChart** currently use:

```
logs.forEach(l => { map[l.date] = (map[l.date] || 0) + 1 })
```

Change to count unique problem IDs per day:

```
const dailyProblems = new Map<string, Set<number>>()
logs.forEach(l => {
  if (!dailyProblems.has(l.date)) dailyProblems.set(l.date, new Set())
  dailyProblems.get(l.date)!.add(l.problemId)
})
// map[date] = dailyProblems.get(date).size
```

Dashboard and ReviewQueue already use `Set` for `todayDone` — no change needed there.

## Files Touched

| File | Changes |
|---|---|
| `src/types.ts` | Add fields to `Progress` interface |
| `src/spacedRepetition.ts` | New forgetScore algorithm, shortened intervals, mastery cooldown |
| `src/components/RatingModal.tsx` | Update progress after rating with new fields |
| `src/components/ReviewQueue.tsx` | Same-day re-entry, forgetScore-based sorting |
| `src/components/Dashboard.tsx` | Use new dailyTarget/dailyCompleted fields |
| `src/charts/Heatmap.tsx` | Dedup by unique problemId per day |
| `src/charts/TrendChart.tsx` | Dedup by unique problemId per day |
| `src/db.ts` | May need index migration for new fields (Dexie auto-handles) |

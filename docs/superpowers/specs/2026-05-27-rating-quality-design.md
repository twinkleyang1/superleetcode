# Same-Day Rating Quality — Design Spec

## Problem

Currently, every "完全掌握" (mastered) rating is treated equally regardless of same-day context. But:
- **First-try mastery**: Open the problem, solve it cleanly, rate "mastered" — this is true mastery.
- **Struggled mastery**: Rate "forgotten" 2-3 times, finally rate "mastered" — you practiced it into short-term memory but will likely forget soon.

The system should distinguish these cases and downgrade the effective level for struggled mastery.

## Approach

Before applying a rating, compute a **confidence score** (0-100) based on 7 weighted factors. A low confidence score means the user's rating is unreliable, and the effective level is downgraded accordingly.

## New Data Fields

Added to `Progress` (daily reset):

| Field | Type | Default | Description |
|---|---|---|---|
| `dailyForgottenCount` | `number` | 0 | Times rated "forgotten" today (Factor A) |
| `dailyRatingPath` | `string` | `""` | Today's rating sequence, e.g. `"f,f,h,m"` (Factors B, G) |

## Confidence Score Formula

### Factors

| Factor | Description | Formula |
|---|---|---|
| A | Today's forgotten count before this rating | `A × 25` |
| B | Today's total ratings (including this one) | `(B - 1) × 5` |
| C | Days since last review | `max(0, 15 - C × 1.5)` (applied only when A > 0) |
| D | Historical forgetScore | `D × 0.3` |
| F | Current progress level before today | See F_penalty table below |
| G | Today's rating trend (improving vs oscillating) | 15 if oscillating, 0 if improving (see below) |
| I | Problem difficulty | See I_penalty table below |

### F_penalty (current level)

Applied only when A > 0:

| Level | Penalty |
|---|---|
| mastered | 25 |
| hesitant | 18 |
| partial | 12 |
| forgotten | 6 |
| not_started | 0 |

### I_penalty (difficulty)

Applied only when A > 0:

| Difficulty | Penalty |
|---|---|
| easy | 15 |
| medium | 8 |
| hard | 0 |

### Trend (G) detection

Parse `dailyRatingPath`:
- **Improving**: "f,f,h" (forgotten → forgotten → hesitant), "f,m" — levels moving upward
- **Oscillating**: "f,m,f" (forgotten → mastered → forgotten) — levels going up then down

A sequence is "oscillating" if the level ever goes down after going up within the same day.

### Final calculation

```
confidenceScore = 100
  - (B - 1) × 5
  - (A > 0 ? A × 25 + max(0, 15 - C × 1.5) + F_penalty + I_penalty : 0)
  - D × 0.3
  - G_penalty
```

Clamp to [0, 100].

## Effective Level Mapping

| confidenceScore | Downgrade |
|---|---|
| ≥ 85 | No downgrade (use user's chosen level) |
| 60-84 | Downgrade 1 step |
| 35-59 | Downgrade 2 steps |
| < 35 | Downgrade 3 steps |

### Downgrade table

| User chose | −0 | −1 | −2 | −3 |
|---|---|---|---|---|
| mastered | mastered | hesitant | partial | forgotten |
| hesitant | hesitant | partial | forgotten | forgotten |
| partial | partial | forgotten | forgotten | forgotten |
| forgotten | forgotten | forgotten | forgotten | forgotten |

## Integration with Existing System

`computeNextReview` is modified to accept `rawLevel` (user's choice) separately from what it uses internally:

```typescript
export function computeNextReview(
  progress: Progress,
  rawLevel: Level    // what the user clicked
): Partial<Progress>
```

Inside `computeNextReview`:
1. Compute `confidenceScore` from the 7 factors using `progress` and `rawLevel`
2. Derive `effectiveLevel = getEffectiveLevel(rawLevel, confidenceScore)`
3. Use `effectiveLevel` for all subsequent logic (interval, forgetScore, consecutiveMastered, etc.)
4. Update `dailyForgottenCount`: incremented if `rawLevel === 'forgotten'`
5. Update `dailyRatingPath`: append `effectiveLevel[0]` (e.g. `"f,f,h"`)

For same-day re-entry:
- If `effectiveLevel === 'forgotten'` → dailyCompleted++, re-enter queue if < dailyTarget
- If `effectiveLevel !== 'forgotten'` → dailyCompleted++, exit queue for the day

## Daily Reset

At day change, alongside `dailyCompleted`:
- `dailyForgottenCount` → 0
- `dailyRatingPath` → `""`

## Files Touched

| File | Change |
|---|---|
| `src/types.ts` | Add `dailyForgottenCount`, `dailyRatingPath` to Progress |
| `src/spacedRepetition.ts` | Add `computeConfidenceScore`, `getEffectiveLevel`; update `computeNextReview` and `resetTodayReviewCounts` |
| `src/components/RatingModal.tsx` | No changes needed — computeNextReview now handles the logic internally |
| `src/seed.ts` | Default values for new fields |
| `src/components/AddProblemModal.tsx` | Default values for new fields |
| `electron/store.ts` | SQLite columns + migration |

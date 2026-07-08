/**
 * A lightweight SM-2-style spaced-repetition scheduler.
 *
 * Each word carries a review schedule (see WordProgress.review): how many
 * successful reviews in a row (`reps`), the current inter-review interval in
 * days, an ease factor that stretches or shrinks that interval, and the
 * timestamp it next falls due. Answering a question about a word grades that
 * review; a good answer pushes the next review further out, a miss brings it
 * straight back so it is re-drilled soon.
 *
 * The scheduler is deliberately pure and side-effect free so it can be unit
 * tested and reused from both the writer (recordTestResult) and the Daily
 * Practice / Continue Learning queue builders.
 */

export interface ReviewSchedule {
  /** Consecutive successful reviews; a lapse resets this to 0. */
  reps: number
  /** Current spacing between reviews, in days. */
  intervalDays: number
  /** SM-2 ease factor. Never drops below MIN_EASE. */
  ease: number
  /** Unix ms when the word next falls due for review. */
  dueAt: number
  /** Unix ms of the most recent review. */
  lastReviewedAt: number
}

export const DAY_MS = 24 * 60 * 60 * 1000
/** Ease never drops below this, so intervals can't collapse forever (SM-2). */
export const MIN_EASE = 1.3
export const DEFAULT_EASE = 2.5
/**
 * A lapsed word comes back within the same session rather than the next day, so
 * a miss during practice is actually re-drilled while the learner is still here.
 */
export const LAPSE_INTERVAL_DAYS = 10 / (24 * 60) // 10 minutes

/**
 * The recall grade for one answer, on SM-2's 0–5 scale (only the values we use):
 *  - 5 easy   — a confident, correct answer
 *  - 4 good   — correct
 *  - 3 pass   — correct but effortful (a partial spelling that still counted)
 *  - 1 lapse  — wrong
 */
export type RecallGrade = 1 | 3 | 4 | 5

/**
 * Turns a test answer into a recall grade. Choice questions report a boolean;
 * the typing question reports a 0–1 spelling score. A perfect answer is "easy",
 * a partial-but-passing spelling is a "pass", an outright miss is a lapse.
 */
export function gradeFromResult(result: boolean | number): RecallGrade {
  if (typeof result === 'boolean') return result ? 5 : 1
  if (result >= 1) return 5
  if (result >= 0.6) return 4
  if (result > 0) return 3
  return 1
}

/** A fresh schedule for a word reviewed for the very first time. */
function seed(now: number): ReviewSchedule {
  return { reps: 0, intervalDays: 0, ease: DEFAULT_EASE, dueAt: now, lastReviewedAt: now }
}

/**
 * Advances a word's review schedule by one graded answer (SM-2). A passing
 * grade grows the interval — 1 day, then 3, then previous × ease — and nudges
 * the ease up or down; a lapse resets the streak and schedules a quick re-drill
 * while lowering the ease so the word settles more slowly next time.
 */
export function scheduleReview(
  prev: ReviewSchedule | undefined,
  grade: RecallGrade,
  now: number = Date.now(),
): ReviewSchedule {
  const base = prev ?? seed(now)

  if (grade < 3) {
    return {
      reps: 0,
      intervalDays: LAPSE_INTERVAL_DAYS,
      ease: Math.max(MIN_EASE, base.ease - 0.2),
      dueAt: now + LAPSE_INTERVAL_DAYS * DAY_MS,
      lastReviewedAt: now,
    }
  }

  const reps = base.reps + 1
  let intervalDays: number
  if (reps === 1) intervalDays = 1
  else if (reps === 2) intervalDays = 3
  else intervalDays = Math.round(base.intervalDays * base.ease)
  // A word that lapsed (interval reset to minutes) but is graded well again
  // still needs at least a full day before its next review.
  intervalDays = Math.max(1, intervalDays)

  // SM-2 ease update, evaluated at the answer's quality.
  const q = grade
  const ease = Math.max(MIN_EASE, base.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))

  return { reps, intervalDays, ease, dueAt: now + intervalDays * DAY_MS, lastReviewedAt: now }
}

/** A word with no schedule yet is treated as due immediately. */
export function isDue(schedule: ReviewSchedule | undefined, now: number = Date.now()): boolean {
  return !schedule || schedule.dueAt <= now
}

/**
 * How overdue a word is, as a multiple of its interval (0 when not yet due, or
 * a large sentinel when never scheduled). Used to sort the most-lapsed words to
 * the front of a review queue.
 */
export function overdueRatio(
  schedule: ReviewSchedule | undefined,
  now: number = Date.now(),
): number {
  if (!schedule) return Number.POSITIVE_INFINITY
  if (schedule.dueAt > now) return 0
  const intervalMs = Math.max(schedule.intervalDays, LAPSE_INTERVAL_DAYS) * DAY_MS
  return (now - schedule.dueAt) / intervalMs
}

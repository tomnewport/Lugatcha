import { db } from '@/db'
import { loadLocations } from '@/db/locations'
import { WELCOME_CENTER_ID } from '@/db/progress'
import type { Location, LocationProgress, WordProgress } from '@/db/types'
import { isWordLearned } from './test'
import { isDue } from './spacedRepetition'

/**
 * The "Continue Learning" flow: once the day's practice is done, pick up the
 * location the learner is closest to finishing, suggest a fresh one when nothing
 * is in progress, and decide when to fold in a spaced-repetition review so the
 * vocabulary already learned stays fresh. The pure decision functions live here
 * so they can be unit tested away from the DB; loadContinueLearningData gathers
 * what they need.
 */

/** Places that are their own flow (onboarding gate, School, Travel) — never a Continue target. */
const SPECIAL_LOCATIONS = new Set<string>(['school', 'travel', WELCOME_CENTER_ID])

/**
 * Every practised activity type an area must complete once to count as done —
 * the same set the Welcome Center requires (New Words / intro is excluded, since
 * meeting the words is tracked as "all words seen" instead).
 */
const COMPLETION_EXERCISES = [
  'flashcards',
  'listening',
  'phrase-assembly',
  'roleplay',
  'storytime',
  'test',
] as const

/**
 * Most met-but-not-learned words an area may still carry and count as complete.
 * Seeing every word and doing every activity finishes an area, but a big backlog
 * of unlearned words shouldn't be waved through as "done" — keep it to a
 * manageable handful. Measured per area (its own seen-minus-learned count).
 */
export const MAX_UNLEARNED_TO_COMPLETE = 10

export interface LocationSummary {
  location: Location
  /** Theme words that exist here. */
  totalWords: number
  /** Words met (seen) here. */
  seenWords: number
  /** Words fully learned here. */
  knownWords: number
  progress: LocationProgress | undefined
}

/**
 * Complete = every word met, every activity type done once, and no more than a
 * handful of met-but-not-learned words still outstanding (matches the map tile).
 * Keyed on words *seen* rather than *learned*: learned words can lapse back to
 * unlearned in daily practice, so a learned-count gate made completion flicker.
 */
export function isLocationComplete(s: LocationSummary): boolean {
  if (s.totalWords === 0) return false
  const done = new Set(s.progress?.completedExercises ?? [])
  const allSeen = s.seenWords >= s.totalWords
  const allActivities = COMPLETION_EXERCISES.every((e) => done.has(e))
  const unlearned = s.seenWords - s.knownWords
  return allSeen && allActivities && unlearned <= MAX_UNLEARNED_TO_COMPLETE
}

/** Started = the learner has met a word here or finished at least one activity. */
export function isLocationStarted(s: LocationSummary): boolean {
  return s.seenWords > 0 || (s.progress?.completedExercises.length ?? 0) > 0
}

/**
 * How close a location is to complete, 0–1. Weighted toward words seen (the bulk
 * of the work, and the count completion now turns on) with a nudge for the
 * activities completion also needs, so "closest to finishing" ranks a
 * nearly-explored area above a barely-started one — and stays steady rather than
 * jumping as learned words lapse.
 */
export function completionScore(s: LocationSummary): number {
  if (s.totalWords === 0) return 0
  const seen = Math.min(1, s.seenWords / s.totalWords)
  const done = new Set(s.progress?.completedExercises ?? [])
  const activities = COMPLETION_EXERCISES.filter((e) => done.has(e)).length / COMPLETION_EXERCISES.length
  return 0.75 * seen + 0.25 * activities
}

export interface ContinueSuggestion {
  location: Location
  /** 'in-progress' → resume without asking; 'new' → suggest and confirm first. */
  kind: 'in-progress' | 'new'
  score: number
}

/**
 * The location to continue with: the in-progress one closest to finishing, or —
 * when nothing is in progress — the next unstarted location to suggest (which
 * the UI confirms before diving in). Returns null when every eligible location
 * is already complete. `summaries` is expected in the order new locations should
 * be suggested (map order); in-progress locations are ranked by completion.
 */
export function pickContinueTarget(summaries: LocationSummary[]): ContinueSuggestion | null {
  const eligible = summaries.filter((s) => !isLocationComplete(s))

  const inProgress = eligible
    .filter(isLocationStarted)
    .map((s) => ({ s, score: completionScore(s) }))
    .sort((a, b) => b.score - a.score)
  if (inProgress.length > 0) {
    const top = inProgress[0]
    return { location: top.s.location, kind: 'in-progress', score: top.score }
  }

  const fresh = eligible.find((s) => !isLocationStarted(s))
  if (fresh) return { location: fresh.location, kind: 'new', score: 0 }

  return null
}

/** Learned words whose spaced-repetition review has fallen due — the review pool size. */
export function countDueReviewWords(progressList: WordProgress[], now: number = Date.now()): number {
  return progressList.filter((p) => p.seenAt && isWordLearned(p) && isDue(p.review, now)).length
}

/** Many words fading at once → review before the next location, whatever the rotation. */
export const REVIEW_DUE_THRESHOLD = 12
/** Otherwise fold a review into every Nth Continue session. */
export const REVIEW_EVERY = 3

/**
 * Whether the next Continue session should be a spaced-repetition review rather
 * than a location visit — the "mix in daily-practice-style sessions to keep
 * vocab learned" rule. Reviews only when something is actually due: always if a
 * lot has piled up, otherwise on a gentle rotation so retention is woven through
 * without stalling forward progress. `rotation` is the count of Continue
 * sessions started so far.
 */
export function shouldReviewFirst(dueCount: number, rotation: number): boolean {
  if (dueCount <= 0) return false
  if (dueCount >= REVIEW_DUE_THRESHOLD) return true
  return rotation % REVIEW_EVERY === REVIEW_EVERY - 1
}

export interface ContinueData {
  /** Eligible locations (excludes School, Travel, Welcome Center), in map order. */
  summaries: LocationSummary[]
  /** Learned words currently due for review. */
  dueCount: number
}

/** Gathers everything the Continue Learning flow needs in one pass. */
export async function loadContinueLearningData(now: number = Date.now()): Promise<ContinueData> {
  const [locations, allWords, allProgress, allLocationProgress] = await Promise.all([
    loadLocations(),
    db.words.toArray(),
    db.wordProgress.toArray(),
    db.locationProgress.toArray(),
  ])

  const progById = new Map(allProgress.map((p) => [p.wordId, p]))
  const total = new Map<string, number>()
  const seen = new Map<string, number>()
  const known = new Map<string, number>()
  for (const w of allWords) {
    if (w.theme === 'core') continue
    total.set(w.theme, (total.get(w.theme) ?? 0) + 1)
    const p = progById.get(w.id)
    if (p?.seenAt) seen.set(w.theme, (seen.get(w.theme) ?? 0) + 1)
    if (isWordLearned(p)) known.set(w.theme, (known.get(w.theme) ?? 0) + 1)
  }

  const lpById = new Map(allLocationProgress.map((l) => [l.locationId, l]))
  const ordered = [...locations].sort((a, b) =>
    a.gridRow !== b.gridRow ? a.gridRow - b.gridRow : a.gridCol - b.gridCol,
  )
  const summaries = ordered
    .filter((l) => !SPECIAL_LOCATIONS.has(l.id))
    .map((location) => ({
      location,
      totalWords: total.get(location.id) ?? 0,
      seenWords: seen.get(location.id) ?? 0,
      knownWords: known.get(location.id) ?? 0,
      progress: lpById.get(location.id),
    }))

  return { summaries, dueCount: countDueReviewWords(allProgress, now) }
}

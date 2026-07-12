import type { LugatchaDB } from './LugatchaDB'
import type { ExerciseType, TestQuestionType } from './types'
import { TEST_QUESTION_TYPES } from './types'
import { scheduleReview, gradeFromResult } from '@/exercises/spacedRepetition'

const MAX_RESULTS = 4
/** Failed questions on a learned word before it's unlearned (issue #61). */
const FAILS_TO_UNLEARN = 2

/** The onboarding location that gates the rest of the city. */
export const WELCOME_CENTER_ID = 'welcome-center'

/**
 * Activities the learner must finish at the Welcome Center before the city
 * opens — each once, including one Learn Vocabulary session. New Words is
 * tracked by word progress instead (every word met), so it's not listed here.
 */
export const WELCOME_REQUIRED_EXERCISES: ExerciseType[] = [
  'flashcards',
  'listening',
  'phrase-assembly',
  'roleplay',
  'storytime',
  'test',
]

/**
 * Whether the Welcome Center is done. To earn it the learner must:
 *  - meet every basic word (New Words), and
 *  - finish every activity at least once, including one Learn Vocabulary
 *    session. Learning every word to full mastery is NOT required — that
 *    would take many sittings and continues after the city opens.
 * Returns false while the database is still unseeded, so the city stays locked.
 *
 * Once earned, completion latches permanently (`graduatedAt`): daily practice
 * re-tests learned welcome words and two misses un-learn one, which must send
 * the word back into rotation — not silently lock the whole city behind
 * onboarding again (and, before the daily-practice gate was fixed, hang
 * startup in a redirect loop).
 */
export async function isWelcomeCenterComplete(db: LugatchaDB): Promise<boolean> {
  const [words, locationProgress] = await Promise.all([
    db.words.where('theme').equals(WELCOME_CENTER_ID).toArray(),
    db.locationProgress.get(WELCOME_CENTER_ID),
  ])
  if (locationProgress?.graduatedAt) return true
  if (words.length === 0) return false
  const progress = await db.wordProgress.bulkGet(words.map((w) => w.id))
  const allWordsSeen = progress.every((p) => Boolean(p?.seenAt))
  const done = new Set(locationProgress?.completedExercises ?? [])
  const allActivitiesDone = WELCOME_REQUIRED_EXERCISES.every((e) => done.has(e))
  const complete = allWordsSeen && allActivitiesDone

  // Earned now — or provably earned before the latch existed: words beyond
  // the Welcome Center are only reachable with the city open, so any such
  // progress marks a past graduate whose welcome words have since lapsed.
  if (complete || (await hasProgressBeyondWelcome(db))) {
    await latchGraduation(db)
    return true
  }
  return false
}

/** True when any seen word lies outside the Welcome Center's vocabulary. */
async function hasProgressBeyondWelcome(db: LugatchaDB): Promise<boolean> {
  const allProgress = await db.wordProgress.toArray()
  const seenIds = allProgress.filter((p) => p.seenAt).map((p) => p.wordId)
  if (seenIds.length === 0) return false
  const seenWords = await db.words.bulkGet(seenIds)
  return seenWords.some((w) => w && w.theme !== WELCOME_CENTER_ID)
}

/** Permanently records Welcome Center graduation. Idempotent. */
async function latchGraduation(db: LugatchaDB): Promise<void> {
  await db.transaction('rw', db.locationProgress, async () => {
    const existing = await db.locationProgress.get(WELCOME_CENTER_ID)
    if (existing?.graduatedAt) return
    await db.locationProgress.put({
      locationId: WELCOME_CENTER_ID,
      completedExercises: existing?.completedExercises ?? [],
      visits: existing?.visits,
      graduatedAt: Date.now(),
    })
  })
}

/** Records first exposure to each word. No-op for words already seen. */
export async function markWordsSeen(db: LugatchaDB, wordIds: string[]): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.wordProgress, async () => {
    for (const wordId of wordIds) {
      const existing = await db.wordProgress.get(wordId)
      if (existing?.seenAt) continue
      await db.wordProgress.put({
        wordId,
        seenAt: now,
        lastResults: existing?.lastResults ?? [],
      })
    }
  })
}

/** Prepends a flashcard match result, keeping only the most recent four. */
export async function recordMatchResult(
  db: LugatchaDB,
  wordId: string,
  correct: boolean,
): Promise<void> {
  await db.transaction('rw', db.wordProgress, async () => {
    const existing = await db.wordProgress.get(wordId)
    await db.wordProgress.put({
      wordId,
      seenAt: existing?.seenAt,
      lastResults: [correct, ...(existing?.lastResults ?? [])].slice(0, MAX_RESULTS),
    })
  })
}

export interface TestResultOutcome {
  /** The word became fully learned with this answer (cue the confetti). */
  newlyLearned: boolean
  /** A previously-learned word was knocked back to unlearned. */
  unlearned: boolean
}

/**
 * Records one test question result for a word.
 *
 * Choice questions pass a boolean; the typing question passes a 0–1 score (the
 * share of tips left unused — 1 means a perfect, tip-free spelling). A type
 * question only banks 'type' at a full score, but every attempt updates the
 * best `spellMastery` so progress toward mastery is visible. Once all four
 * question types are banked the word is learned. Wrong answers (score 0) on an
 * un-learned word are forgiven; two on a learned word unlearn it so it comes
 * back round for testing.
 */
export async function recordTestResult(
  db: LugatchaDB,
  wordId: string,
  type: TestQuestionType,
  result: boolean | number,
): Promise<TestResultOutcome> {
  const score = typeof result === 'boolean' ? (result ? 1 : 0) : Math.max(0, Math.min(1, result))
  return db.transaction('rw', db.wordProgress, async () => {
    const existing = await db.wordProgress.get(wordId)
    const passed = new Set<TestQuestionType>(existing?.testPassed ?? [])
    const wasLearned = TEST_QUESTION_TYPES.every((t) => passed.has(t))
    let fails = existing?.failsSinceLearned ?? 0
    let learnedAt = existing?.learnedAt
    let spellMastery = existing?.spellMastery ?? 0
    let newlyLearned = false
    let unlearned = false

    if (type === 'type') spellMastery = Math.max(spellMastery, score)

    if (score >= 1) {
      passed.add(type)
      fails = 0
      if (!wasLearned && TEST_QUESTION_TYPES.every((t) => passed.has(t))) {
        learnedAt = Date.now()
        newlyLearned = true
      }
    } else if (score <= 0 && wasLearned) {
      // Only an outright miss (a wrong choice, or spelling given up on) counts
      // against a learned word; a partial spelling is neither pass nor fail.
      fails += 1
      if (fails >= FAILS_TO_UNLEARN) {
        passed.clear()
        learnedAt = undefined
        fails = 0
        spellMastery = 0
        unlearned = true
      }
    }

    // Advance the spaced-repetition schedule so the word falls due for review
    // at a stretch matched to how well it was just recalled.
    const review = scheduleReview(existing?.review, gradeFromResult(result))

    await db.wordProgress.put({
      wordId,
      seenAt: existing?.seenAt ?? Date.now(),
      lastResults: existing?.lastResults ?? [],
      testPassed: [...passed],
      spellMastery,
      learnedAt,
      failsSinceLearned: fails,
      review,
    })
    return { newlyLearned, unlearned }
  })
}

/** Marks an exercise complete for a location. Idempotent. */
export async function completeExercise(
  db: LugatchaDB,
  locationId: string,
  exercise: ExerciseType,
): Promise<void> {
  await db.transaction('rw', db.locationProgress, async () => {
    const existing = await db.locationProgress.get(locationId)
    const completed = existing?.completedExercises ?? []
    if (!completed.includes(exercise)) completed.push(exercise)
    await db.locationProgress.put({
      locationId,
      completedExercises: completed,
      visits: existing?.visits,
      graduatedAt: existing?.graduatedAt,
    })
  })
}

/**
 * Counts one finished exercise at a location, advancing the rotation cursor so
 * the next visit serves a different activity (new words, practice, or a test).
 */
export async function recordLocationVisit(
  db: LugatchaDB,
  locationId: string,
): Promise<void> {
  await db.transaction('rw', db.locationProgress, async () => {
    const existing = await db.locationProgress.get(locationId)
    await db.locationProgress.put({
      locationId,
      completedExercises: existing?.completedExercises ?? [],
      visits: (existing?.visits ?? 0) + 1,
      graduatedAt: existing?.graduatedAt,
    })
  })
}

/**
 * Grades one phrase-building answer into that phrase's spaced-repetition
 * schedule (and marks it met on first contact). Phrases carry no
 * learned/unlearned state — the schedule alone decides when Daily Practice
 * re-serves them. `phraseKey` is the folded Uzbek text (exercises/phrases.ts).
 */
export async function recordPhraseResult(
  db: LugatchaDB,
  phraseKey: string,
  correct: boolean,
): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.phraseProgress, async () => {
    const existing = await db.phraseProgress.get(phraseKey)
    await db.phraseProgress.put({
      phraseKey,
      seenAt: existing?.seenAt ?? now,
      review: scheduleReview(existing?.review, gradeFromResult(correct), now),
    })
  })
}

/** Records that a story was just served, timestamped so the picker can rotate. */
export async function recordStoryShown(db: LugatchaDB, storyId: string): Promise<void> {
  await db.storyProgress.put({ storyId, shownAt: Date.now() })
}

/** When each of the given stories was last shown (absent = never shown). */
export async function loadStoryShownMap(
  db: LugatchaDB,
  storyIds: string[],
): Promise<Map<string, number>> {
  const rows = await db.storyProgress.bulkGet(storyIds)
  const map = new Map<string, number>()
  for (const row of rows) if (row) map.set(row.storyId, row.shownAt)
  return map
}

/** Records that a roleplay variant was just served, timestamped for rotation. */
export async function recordRoleplayShown(db: LugatchaDB, variantId: string): Promise<void> {
  await db.roleplayProgress.put({ variantId, shownAt: Date.now() })
}

/** When each of the given roleplay variants was last shown (absent = never shown). */
export async function loadRoleplayShownMap(
  db: LugatchaDB,
  variantIds: string[],
): Promise<Map<string, number>> {
  const rows = await db.roleplayProgress.bulkGet(variantIds)
  const map = new Map<string, number>()
  for (const row of rows) if (row) map.set(row.variantId, row.shownAt)
  return map
}

/** Records a passed lesson exercise. Idempotent. */
export async function recordLessonExercise(
  db: LugatchaDB,
  lessonId: string,
  exerciseId: string,
): Promise<void> {
  await db.transaction('rw', db.lessonProgress, async () => {
    const existing = await db.lessonProgress.get(lessonId)
    const passed = existing?.exercisesPassed ?? []
    if (!passed.includes(exerciseId)) passed.push(exerciseId)
    await db.lessonProgress.put({
      lessonId,
      completedAt: existing?.completedAt,
      exercisesPassed: passed,
    })
  })
}

/** Marks a lesson complete (wrap-up reached). Keeps the first completion time; increments visitCount. */
export async function completeLesson(db: LugatchaDB, lessonId: string): Promise<void> {
  await db.transaction('rw', db.lessonProgress, async () => {
    const existing = await db.lessonProgress.get(lessonId)
    await db.lessonProgress.put({
      lessonId,
      completedAt: existing?.completedAt ?? Date.now(),
      exercisesPassed: existing?.exercisesPassed ?? [],
      visitCount: (existing?.visitCount ?? 0) + 1,
    })
  })
}

/** Wipes all word, location, and lesson progress. Content tables are untouched. */
export async function resetAllProgress(db: LugatchaDB): Promise<void> {
  await Promise.all([
    db.wordProgress.clear(),
    db.locationProgress.clear(),
    db.lessonProgress.clear(),
    db.storyProgress.clear(),
    db.roleplayProgress.clear(),
    db.phraseProgress.clear(),
  ])
}

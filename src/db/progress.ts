import type { LugatchaDB } from './LugatchaDB'
import type { ExerciseType, TestQuestionType } from './types'
import { TEST_QUESTION_TYPES } from './types'

const MAX_RESULTS = 4
/** Failed questions on a learned word before it's unlearned (issue #61). */
const FAILS_TO_UNLEARN = 2

/** The onboarding location that gates the rest of the city. */
export const WELCOME_CENTER_ID = 'welcome-center'

/**
 * Practice activities the learner must finish at the Welcome Center before the
 * city opens. New Words and the Exam are tracked by word progress instead (every
 * word met, and every word learned), so they're not listed here.
 */
export const WELCOME_REQUIRED_EXERCISES: ExerciseType[] = [
  'flashcards',
  'listening',
  'phrase-assembly',
  'roleplay',
  'storytime',
]

/**
 * Whether the Welcome Center is done. The learner must:
 *  - meet every basic word (New Words),
 *  - finish every practice activity at least once, and
 *  - learn every word — identified and spelled, i.e. all three test question
 *    types passed (the Exam isn't "done" until then).
 * Returns false while the database is still unseeded, so the city stays locked.
 */
export async function isWelcomeCenterComplete(db: LugatchaDB): Promise<boolean> {
  const [words, locationProgress] = await Promise.all([
    db.words.where('theme').equals(WELCOME_CENTER_ID).toArray(),
    db.locationProgress.get(WELCOME_CENTER_ID),
  ])
  if (words.length === 0) return false
  const progress = await db.wordProgress.bulkGet(words.map((w) => w.id))
  const allWordsSeen = progress.every((p) => Boolean(p?.seenAt))
  const allWordsLearned = progress.every((p) =>
    TEST_QUESTION_TYPES.every((t) => p?.testPassed?.includes(t)),
  )
  const done = new Set(locationProgress?.completedExercises ?? [])
  const allActivitiesDone = WELCOME_REQUIRED_EXERCISES.every((e) => done.has(e))
  return allWordsSeen && allWordsLearned && allActivitiesDone
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

    await db.wordProgress.put({
      wordId,
      seenAt: existing?.seenAt ?? Date.now(),
      lastResults: existing?.lastResults ?? [],
      testPassed: [...passed],
      spellMastery,
      learnedAt,
      failsSinceLearned: fails,
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
    })
  })
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
  ])
}

import type { LugatchaDB } from './LugatchaDB'
import type { ExerciseType, TestQuestionType } from './types'
import { TEST_QUESTION_TYPES } from './types'

const MAX_RESULTS = 4
/** Failed questions on a learned word before it's unlearned (issue #61). */
const FAILS_TO_UNLEARN = 2

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
 * A correct answer banks that question type; once all three are banked the word
 * is learned. Wrong answers on un-learned words are forgiven ("the user will
 * pick them up on the next test"), but two wrong answers on a learned word
 * unlearn it so it comes back round for testing.
 */
export async function recordTestResult(
  db: LugatchaDB,
  wordId: string,
  type: TestQuestionType,
  correct: boolean,
): Promise<TestResultOutcome> {
  return db.transaction('rw', db.wordProgress, async () => {
    const existing = await db.wordProgress.get(wordId)
    const passed = new Set<TestQuestionType>(existing?.testPassed ?? [])
    const wasLearned = TEST_QUESTION_TYPES.every((t) => passed.has(t))
    let fails = existing?.failsSinceLearned ?? 0
    let learnedAt = existing?.learnedAt
    let newlyLearned = false
    let unlearned = false

    if (correct) {
      passed.add(type)
      fails = 0
      if (!wasLearned && TEST_QUESTION_TYPES.every((t) => passed.has(t))) {
        learnedAt = Date.now()
        newlyLearned = true
      }
    } else if (wasLearned) {
      fails += 1
      if (fails >= FAILS_TO_UNLEARN) {
        passed.clear()
        learnedAt = undefined
        fails = 0
        unlearned = true
      }
    }

    await db.wordProgress.put({
      wordId,
      seenAt: existing?.seenAt ?? Date.now(),
      lastResults: existing?.lastResults ?? [],
      testPassed: [...passed],
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

/** Marks a lesson complete (wrap-up reached). Keeps the first completion time. */
export async function completeLesson(db: LugatchaDB, lessonId: string): Promise<void> {
  await db.transaction('rw', db.lessonProgress, async () => {
    const existing = await db.lessonProgress.get(lessonId)
    await db.lessonProgress.put({
      lessonId,
      completedAt: existing?.completedAt ?? Date.now(),
      exercisesPassed: existing?.exercisesPassed ?? [],
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

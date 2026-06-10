import type { LugatchaDB } from './LugatchaDB'
import type { ExerciseType } from './types'

const MAX_RESULTS = 4

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
    await db.locationProgress.put({ locationId, completedExercises: completed })
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

import type { ExerciseType, LocationProgress } from '@/db/types'

/** The fixed unlock order every location follows. */
export const EXERCISE_SEQUENCE: ExerciseType[] = [
  'intro',
  'flashcards',
  'phrase-assembly',
  'roleplay',
  'storytime',
]

export const EXERCISE_LABELS: Record<ExerciseType, string> = {
  intro: 'Word Intro',
  flashcards: 'Flashcards',
  'phrase-assembly': 'Phrase Assembly',
  roleplay: 'Roleplay',
  storytime: 'Storytime',
}

export const EXERCISE_DESCRIPTIONS: Record<ExerciseType, string> = {
  intro: 'Meet five new words and hear them spoken',
  flashcards: 'Match Uzbek and English pairs',
  'phrase-assembly': 'Build phrases from a word bank',
  roleplay: 'Hold a conversation, turn by turn',
  storytime: 'Read a short story and translate it',
}

/** The first exercise in the sequence not yet completed, or null when all are done. */
export function nextExercise(progress: LocationProgress | undefined): ExerciseType | null {
  const done = new Set(progress?.completedExercises ?? [])
  for (const exercise of EXERCISE_SEQUENCE) {
    if (!done.has(exercise)) return exercise
  }
  return null
}

/** Completed exercises stay unlocked for replay; otherwise only the next step is playable. */
export function isExerciseUnlocked(
  progress: LocationProgress | undefined,
  exercise: ExerciseType,
): boolean {
  const done = new Set(progress?.completedExercises ?? [])
  return done.has(exercise) || nextExercise(progress) === exercise
}

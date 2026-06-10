import { defineStore } from 'pinia'
import { db } from '@/db'
import type { ExerciseType, LocationProgress } from '@/db/types'

export const EXERCISE_SEQUENCE: ExerciseType[] = [
  'intro',
  'flashcards',
  'phrase-assembly',
  'roleplay',
  'storytime',
]

export const STEP_LABELS: Record<ExerciseType, string> = {
  intro: 'Words',
  flashcards: 'Cards',
  'phrase-assembly': 'Phrase',
  roleplay: 'Chat',
  storytime: 'Story',
}

/** Returns the next uncompleted exercise, or null if all are done. */
export function nextExercise(progress: LocationProgress | undefined): ExerciseType | null {
  const done = new Set(progress?.completedExercises ?? [])
  return EXERCISE_SEQUENCE.find((e) => !done.has(e)) ?? null
}

export const useProgressStore = defineStore('progress', {
  actions: {
    async completeExercise(locationId: string, exercise: ExerciseType): Promise<void> {
      const existing = await db.locationProgress.get(locationId)
      if (existing) {
        if (!existing.completedExercises.includes(exercise)) {
          await db.locationProgress.update(locationId, {
            completedExercises: [...existing.completedExercises, exercise],
          })
        }
      } else {
        await db.locationProgress.put({ locationId, completedExercises: [exercise] })
      }
    },

    async resetLocation(locationId: string): Promise<void> {
      await db.locationProgress.delete(locationId)
    },
  },
})

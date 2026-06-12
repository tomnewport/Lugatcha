import { defineStore } from 'pinia'
import { db } from '@/db'
import type { ExerciseType, TestQuestionType } from '@/db/types'
import {
  markWordsSeen,
  recordMatchResult,
  recordTestResult,
  completeExercise,
  recordLessonExercise,
  completeLesson,
  resetAllProgress,
} from '@/db/progress'

/**
 * Progress lives in Dexie (so it survives offline and reloads); this store is
 * the single write path the exercises use. Reads stay reactive through
 * useLiveQuery, which observes the same tables.
 */
export const useProgressStore = defineStore('progress', {
  actions: {
    markWordsSeen(wordIds: string[]) {
      return markWordsSeen(db, wordIds)
    },
    recordMatchResult(wordId: string, correct: boolean) {
      return recordMatchResult(db, wordId, correct)
    },
    recordTestResult(wordId: string, type: TestQuestionType, correct: boolean) {
      return recordTestResult(db, wordId, type, correct)
    },
    completeExercise(locationId: string, exercise: ExerciseType) {
      return completeExercise(db, locationId, exercise)
    },
    recordLessonExercise(lessonId: string, exerciseId: string) {
      return recordLessonExercise(db, lessonId, exerciseId)
    },
    completeLesson(lessonId: string) {
      return completeLesson(db, lessonId)
    },
    resetAllProgress() {
      return resetAllProgress(db)
    },
  },
})

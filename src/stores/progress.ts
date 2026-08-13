import { defineStore } from 'pinia'
import { db } from '@/db'
import type { ExerciseType, TestQuestionType } from '@/db/types'
import {
  markWordsSeen,
  markWordsKnown,
  markExercisesDone,
  forgetWord,
  recordMatchResult,
  recordTestResult,
  recordPhraseResult,
  completeExercise,
  recordLocationVisit,
  recordStoryShown,
  recordRoleplayShown,
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
    markWordsKnown(wordIds: string[]) {
      return markWordsKnown(db, wordIds)
    },
    markExercisesDone(locationId: string, exercises: ExerciseType[]) {
      return markExercisesDone(db, locationId, exercises)
    },
    forgetWord(wordId: string) {
      return forgetWord(db, wordId)
    },
    recordMatchResult(wordId: string, correct: boolean) {
      return recordMatchResult(db, wordId, correct)
    },
    recordTestResult(
      wordId: string,
      type: TestQuestionType,
      result: boolean | number,
      credit = true,
    ) {
      return recordTestResult(db, wordId, type, result, credit)
    },
    recordPhraseResult(phraseKey: string, correct: boolean) {
      return recordPhraseResult(db, phraseKey, correct)
    },
    completeExercise(locationId: string, exercise: ExerciseType) {
      return completeExercise(db, locationId, exercise)
    },
    recordLocationVisit(locationId: string) {
      return recordLocationVisit(db, locationId)
    },
    recordStoryShown(storyId: string) {
      return recordStoryShown(db, storyId)
    },
    recordRoleplayShown(variantId: string) {
      return recordRoleplayShown(db, variantId)
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

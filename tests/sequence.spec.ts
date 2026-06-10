import { describe, it, expect } from 'vitest'
import { EXERCISE_SEQUENCE, nextExercise, isExerciseUnlocked } from '@/exercises/sequence'

describe('nextExercise', () => {
  it('starts with intro when nothing is completed', () => {
    expect(nextExercise(undefined)).toBe('intro')
    expect(nextExercise({ locationId: 'airport', completedExercises: [] })).toBe('intro')
  })

  it('walks the sequence in order', () => {
    expect(
      nextExercise({ locationId: 'airport', completedExercises: ['intro'] }),
    ).toBe('flashcards')
    expect(
      nextExercise({
        locationId: 'airport',
        completedExercises: ['intro', 'flashcards', 'phrase-assembly'],
      }),
    ).toBe('roleplay')
  })

  it('returns null when everything is done', () => {
    expect(
      nextExercise({ locationId: 'airport', completedExercises: [...EXERCISE_SEQUENCE] }),
    ).toBeNull()
  })
})

describe('isExerciseUnlocked', () => {
  const progress = { locationId: 'airport', completedExercises: ['intro' as const] }

  it('unlocks completed exercises for replay', () => {
    expect(isExerciseUnlocked(progress, 'intro')).toBe(true)
  })

  it('unlocks only the next step', () => {
    expect(isExerciseUnlocked(progress, 'flashcards')).toBe(true)
    expect(isExerciseUnlocked(progress, 'phrase-assembly')).toBe(false)
    expect(isExerciseUnlocked(progress, 'storytime')).toBe(false)
  })

  it('locks everything except intro at the start', () => {
    expect(isExerciseUnlocked(undefined, 'intro')).toBe(true)
    expect(isExerciseUnlocked(undefined, 'roleplay')).toBe(false)
  })
})

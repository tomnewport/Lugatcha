import { describe, it, expect } from 'vitest'
import { buildPotluck, UNLOCK_AT, type LocationStats } from '@/exercises/potluck'
import type { ExerciseType } from '@/db/types'

function stats(overrides: Partial<LocationStats> = {}): LocationStats {
  return {
    locationId: 'airport',
    totalWords: 15,
    seenWords: 0,
    knownWords: 0,
    completed: [],
    ...overrides,
  }
}

function stateOf(potluck: ReturnType<typeof buildPotluck>, type: ExerciseType) {
  return potluck.find((a) => a.type === type)!
}

describe('buildPotluck', () => {
  it('offers only New Words on a first visit', () => {
    const potluck = buildPotluck(stats())
    expect(stateOf(potluck, 'intro').state).toBe('available')
    for (const type of ['flashcards', 'listening', 'phrase-assembly', 'roleplay', 'storytime']) {
      const activity = stateOf(potluck, type as ExerciseType)
      expect(activity.state, type).toBe('locked')
      expect(activity.hint).toMatch(/more words/i)
    }
  })

  it('brings matching and listening to the table after one word session', () => {
    const potluck = buildPotluck(stats({ seenWords: 5, completed: ['intro'] }))
    expect(stateOf(potluck, 'flashcards').state).toBe('available')
    expect(stateOf(potluck, 'listening').state).toBe('available')
    expect(stateOf(potluck, 'phrase-assembly').state).toBe('locked')
  })

  it('keeps phrase building, roleplay and story behind a listening session', () => {
    const enoughWords = stats({ seenWords: 15, completed: ['intro', 'flashcards'] })
    for (const type of ['phrase-assembly', 'roleplay', 'storytime'] as ExerciseType[]) {
      const activity = stateOf(buildPotluck(enoughWords), type)
      expect(activity.state, type).toBe('locked')
      expect(activity.hint).toMatch(/listening/i)
    }
  })

  it('unlocks roleplay and story on a return visit with enough words heard', () => {
    const back = stats({ seenWords: 12, completed: ['intro', 'flashcards', 'listening'] })
    const potluck = buildPotluck(back)
    expect(stateOf(potluck, 'phrase-assembly').state).toBe('available')
    expect(stateOf(potluck, 'roleplay').state).toBe('available')
    expect(stateOf(potluck, 'storytime').state).toBe('available')
  })

  it('respects the threshold boundary exactly', () => {
    const justUnder = buildPotluck(stats({ seenWords: UNLOCK_AT.roleplay - 1, completed: ['listening'] }))
    const atThreshold = buildPotluck(stats({ seenWords: UNLOCK_AT.roleplay, completed: ['listening'] }))
    expect(stateOf(justUnder, 'roleplay').state).toBe('locked')
    expect(stateOf(atThreshold, 'roleplay').state).toBe('available')
  })

  it('caps thresholds for locations with few words', () => {
    const tiny = stats({ totalWords: 6, seenWords: 6, completed: ['listening'] })
    expect(stateOf(buildPotluck(tiny), 'storytime').state).toBe('available')
  })

  it('retires New Words once every word has been met', () => {
    const exhausted = stateOf(buildPotluck(stats({ seenWords: 15 })), 'intro')
    expect(exhausted.state).toBe('locked')
    expect(exhausted.hint).toMatch(/every word/i)
  })

  it('keeps completed activities replayable even when their gate regresses', () => {
    // intro done + all words seen: done flag survives the locked state
    const potluck = buildPotluck(stats({ seenWords: 15, completed: ['intro'] }))
    expect(stateOf(potluck, 'intro').done).toBe(true)
  })
})

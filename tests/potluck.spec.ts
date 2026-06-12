import { describe, it, expect } from 'vitest'
import {
  buildPotluck,
  selectAutoExercise,
  UNLOCK_AT,
  type LocationStats,
} from '@/exercises/potluck'
import type { ExerciseType } from '@/db/types'

function stats(overrides: Partial<LocationStats> = {}): LocationStats {
  return {
    locationId: 'airport',
    totalWords: 15,
    seenWords: 0,
    knownWords: 0,
    completed: [],
    visits: 0,
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

  it('brings all exercise types to the table after one word session', () => {
    const potluck = buildPotluck(stats({ seenWords: 5, completed: ['intro'] }))
    expect(stateOf(potluck, 'flashcards').state).toBe('available')
    expect(stateOf(potluck, 'listening').state).toBe('available')
    expect(stateOf(potluck, 'phrase-assembly').state).toBe('available')
    expect(stateOf(potluck, 'roleplay').state).toBe('available')
    expect(stateOf(potluck, 'storytime').state).toBe('available')
  })

  it('unlocks roleplay and story on a return visit with enough words heard', () => {
    const back = stats({ seenWords: 5, completed: ['intro', 'flashcards', 'listening'] })
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

describe('selectAutoExercise', () => {
  /**
   * Replays a location the way the app does: each visit serves one exercise,
   * then its effect (words met, exercise marked done, cursor advanced) feeds the
   * next selection — exactly the loop LocationView drives through Dexie.
   */
  function walk(totalWords: number, steps: number): ExerciseType[] {
    let seenWords = 0
    const completed = new Set<ExerciseType>()
    const served: ExerciseType[] = []
    for (let visits = 0; visits < steps; visits++) {
      const next = selectAutoExercise(
        stats({ totalWords, seenWords, completed: [...completed], visits }),
      )!
      served.push(next)
      if (next === 'intro') seenWords = Math.min(totalWords, seenWords + 5)
      if (next !== 'test') completed.add(next) // the Test is never retired
    }
    return served
  }

  it('opens a fresh location with New Words', () => {
    expect(selectAutoExercise(stats({ seenWords: 0, visits: 0 }))).toBe('intro')
  })

  it('serves the first test on the fifth visit, not before', () => {
    const served = walk(15, 5)
    expect(served).toEqual(['intro', 'flashcards', 'intro', 'listening', 'test'])
    expect(served.slice(0, 4)).not.toContain('test')
    expect(served[4]).toBe('test')
  })

  it('keeps meeting new words across visits so the seen ring climbs', () => {
    // The reported bug: only the first five words, then never again. New Words
    // must recur while unmet words remain.
    const served = walk(15, 5)
    expect(served.filter((a) => a === 'intro').length).toBeGreaterThanOrEqual(2)
  })

  it('rotates through the practice exercises for variety', () => {
    const served = walk(15, 8)
    const practiced = served.filter((a) => a !== 'intro' && a !== 'test')
    expect(new Set(practiced).size).toBeGreaterThanOrEqual(3)
  })

  it('turns the New Words slot into a test once every word is met', () => {
    // seen == total: intro is retired, so its slots drive learning via testing.
    expect(selectAutoExercise(stats({ totalWords: 10, seenWords: 10, visits: 0 }))).toBe('test')
    expect(selectAutoExercise(stats({ totalWords: 10, seenWords: 10, visits: 2 }))).toBe('test')
  })

  it('reaches a test quickly at a location with only a handful of words', () => {
    // Three words: one intro meets them all, so testing should start right after.
    const served = walk(3, 3)
    expect(served[0]).toBe('intro')
    expect(served).toContain('test')
  })

  it('keeps roleplay and storytime in the rotation indefinitely', () => {
    // The richer exercises must keep recurring, not appear once and starve.
    const served = walk(15, 60)
    expect(served.filter((a) => a === 'roleplay').length).toBeGreaterThanOrEqual(3)
    expect(served.filter((a) => a === 'storytime').length).toBeGreaterThanOrEqual(3)
    // Every practice type gets used, none left behind.
    for (const type of ['flashcards', 'listening', 'phrase-assembly', 'roleplay', 'storytime']) {
      expect(served, type).toContain(type)
    }
  })

  it('always offers an exercise at any location that has words', () => {
    for (let visits = 0; visits < 20; visits++) {
      for (const seenWords of [0, 1, 3, 5, 15]) {
        const next = selectAutoExercise(stats({ totalWords: 15, seenWords, visits }))
        expect(next, `visits=${visits} seen=${seenWords}`).not.toBeNull()
      }
    }
    // Even a one-word location, fully met, still has a test to offer.
    expect(selectAutoExercise(stats({ totalWords: 1, seenWords: 1, visits: 7 }))).not.toBeNull()
  })
})

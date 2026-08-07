import { describe, it, expect } from 'vitest'
import { pickMiniGame, MINI_GAMES } from '@/exercises/miniGames'

/** An rng that hands back a fixed sequence, so a pick can be pinned down. */
function scripted(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

describe('pickMiniGame', () => {
  it('only ever names a game from the roster', () => {
    const rng = scripted([0, 0.17, 0.33, 0.49, 0.5, 0.68, 0.84, 0.99])
    for (let i = 0; i < 40; i++) expect(MINI_GAMES).toContain(pickMiniGame(rng))
  })

  it('splits the roster evenly across the unit interval', () => {
    // The bottom half of the range is the first game, the top half the second.
    expect(pickMiniGame(scripted([0]))).toBe(MINI_GAMES[0])
    expect(pickMiniGame(scripted([0.99]))).toBe(MINI_GAMES[MINI_GAMES.length - 1])
  })

  it('reaches every game in the roster over many rolls', () => {
    let seed = 1
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const seen = new Set(Array.from({ length: 400 }, () => pickMiniGame(rng)))
    expect([...seen].sort()).toEqual([...MINI_GAMES].sort())
  })

  it('stays in range even when the rng returns its exclusive upper bound', () => {
    // Math.random() is [0, 1), but a stub that hands back exactly 1 must not
    // index past the end of the roster.
    expect(MINI_GAMES).toContain(pickMiniGame(() => 1))
  })
})

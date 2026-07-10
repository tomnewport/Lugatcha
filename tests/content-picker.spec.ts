import { describe, it, expect } from 'vitest'
import { pickLeastRecentlyShown } from '@/exercises/contentPicker'

interface Item {
  id: string
}

const items: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('pickLeastRecentlyShown', () => {
  it('returns null for an empty list', () => {
    expect(pickLeastRecentlyShown([], new Map())).toBeNull()
  })

  it('prefers a never-shown item, in list order, over shown ones', () => {
    const shown = new Map([['a', 1000]])
    // b and c are unseen; b comes first so it wins.
    expect(pickLeastRecentlyShown(items, shown)?.id).toBe('b')
  })

  it('keeps the first choice deterministic when nothing has been shown', () => {
    expect(pickLeastRecentlyShown(items, new Map())?.id).toBe('a')
  })

  it('once all are shown, returns the least recently shown', () => {
    const shown = new Map([
      ['a', 3000],
      ['b', 1000],
      ['c', 2000],
    ])
    expect(pickLeastRecentlyShown(items, shown)?.id).toBe('b')
  })

  it('never repeats while an unseen alternative exists', () => {
    // a just shown; b and c never shown → must move off a.
    const shown = new Map([['a', Date.now()]])
    expect(pickLeastRecentlyShown(items, shown)?.id).not.toBe('a')
  })
})

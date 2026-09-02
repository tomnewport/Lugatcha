import { describe, it, expect } from 'vitest'
import { matchGloss, rankByGloss } from '@/exercises/glossSearch'

/**
 * The answer search in a choice question. A plain substring filter buried the
 * answer for *men* — "I" — under every gloss with an i in it; these pin down
 * the order that fixes it. See src/exercises/glossSearch.ts.
 */

const rank = (glosses: string[], query: string) => rankByGloss(glosses, (g) => g, query)

describe('matchGloss', () => {
  it('does not match what the query is not in at all', () => {
    expect(matchGloss('thank you', 'xyz')).toBeNull()
  })

  it('ignores an empty query', () => {
    expect(matchGloss('thank you', '   ')).toBeNull()
  })

  it('ranks an exact gloss above one the query only starts', () => {
    expect(matchGloss('I', 'i')!.tier).toBeGreaterThan(matchGloss('I am tired', 'i')!.tier)
  })

  it('ranks the start of a word above a match inside one', () => {
    expect(matchGloss('here it is', 'is')!.tier).toBeGreaterThan(matchGloss('this', 'is')!.tier)
  })

  it('matches a single sense of a gloss exactly', () => {
    const match = matchGloss('he / she / it', 'she')!
    expect(match.tier).toBe(3)
    expect(match.coverage).toBe(1)
  })

  it('matches a sense with its parenthetical taken off', () => {
    expect(matchGloss('you (polite)', 'you')!.tier).toBe(3)
    expect(matchGloss('a cold (illness)', 'a cold')!.tier).toBe(3)
  })

  it('is case- and spacing-insensitive', () => {
    expect(matchGloss('Thank you', '  THANK   YOU ')!.tier).toBe(3)
  })
})

describe('rankByGloss', () => {
  it('leads with the exact answer, whatever order the options came in', () => {
    const options = ['this', 'with', 'here it is / here you are', 'I', 'I am tired']
    expect(rank(options, 'I')).toEqual([
      'I',
      'I am tired',
      'here it is / here you are',
      'this',
      'with',
    ])
  })

  it('keeps every option the old filter would have found', () => {
    const options = ['this', 'with', 'I', 'thank you']
    expect(rank(options, 'i').sort()).toEqual(['I', 'this', 'with'].sort())
  })

  it('prefers the gloss the query accounts for more of', () => {
    // Both start a word with "me"; "to me" is the sense it accounts for most of.
    expect(rank(['the same', 'to me / for me', 'give me'], 'me')).toEqual([
      'to me / for me',
      'give me',
      'the same',
    ])
  })

  it('leaves the options alone when nothing has been typed', () => {
    const options = ['this', 'with', 'I']
    expect(rank(options, '')).toEqual(options)
  })

  it('drops what does not match', () => {
    expect(rank(['this', 'with', 'I'], 'thank')).toEqual([])
  })

  it('ranks Russian glosses the same way', () => {
    expect(rank(['моя', 'мне / для меня', 'я'], 'я')).toEqual(['я', 'моя', 'мне / для меня'])
  })
})

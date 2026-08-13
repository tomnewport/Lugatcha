import { describe, it, expect, beforeEach } from 'vitest'
import { getBreakdown, breakdownIndex, vocabIndex } from '@/exercises/deagglutination'

const VOCAB: [string, string][] = [
  ['u', 'he/she/it'],
  ['kel', 'come'],
  ["bo'l", 'be/become'],
  ['kitob', 'book'],
  ['bosh', 'head'],
  ['boshqa', 'other'],
  ['kishi', 'person'],
]

beforeEach(() => {
  vocabIndex.value = new Map(VOCAB)
  breakdownIndex.value = new Map()
})

describe('getBreakdown', () => {
  it('analyses a word carrying sentence punctuation', () => {
    // The tapped word arrives exactly as it appears in the sentence, so the
    // full stop must not throw the suffix stripping out of alignment.
    expect(getBreakdown('Kelaman.')).toEqual({ breakdown: ['Kel', 'aman'], gloss: ['come', 'I (present)'] })
    expect(getBreakdown('kitoblarim,')?.breakdown).toEqual(['kitob', 'lar', 'im'])
    expect(getBreakdown('«kitob»')?.breakdown).toEqual(['kitob'])
  })

  it('keeps the display spelling of the stem', () => {
    expect(getBreakdown('Kitobim')?.breakdown).toEqual(['Kitob', 'im'])
  })

  it('glosses one-letter roots', () => {
    expect(getBreakdown('u')?.gloss).toEqual(['he/she/it'])
    expect(getBreakdown('U.')?.gloss).toEqual(['he/she/it'])
  })

  it('folds apostrophe variants before matching', () => {
    expect(getBreakdown('boʻlsin')?.breakdown).toEqual(['boʻl', 'sin'])
  })

  it('lets an exact vocabulary match win over a lookalike split', () => {
    expect(getBreakdown('boshqa')).toEqual({ breakdown: ['boshqa'], gloss: ['other'] })
  })

  it('analyses derivational suffixes', () => {
    expect(getBreakdown('kishilik')?.breakdown).toEqual(['kishi', 'lik'])
  })

  it('returns nothing for punctuation-only or unknown tokens', () => {
    expect(getBreakdown('—')).toBeNull()
    expect(getBreakdown('')).toBeNull()
    expect(getBreakdown('qwertyuiop')).toBeNull()
  })

  it('prefers a curated lesson breakdown, punctuation and all', () => {
    breakdownIndex.value = new Map([
      ['uyimga', { breakdown: ['uy', 'im', 'ga'], gloss: ['house', 'my', 'to'], meaning: 'to my house' }],
    ])
    expect(getBreakdown('Uyimga!')?.meaning).toBe('to my house')
  })
})

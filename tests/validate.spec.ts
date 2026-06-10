import { describe, it, expect } from 'vitest'
import {
  normalizeToken,
  tokenize,
  validateStrictOrder,
  validateLoose,
  contentWords,
  buildDecoys,
} from '@/exercises/validate'

describe('normalizeToken', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeToken('Salom!')).toBe('salom')
    expect(normalizeToken('pasportim.')).toBe('pasportim')
  })

  it('folds Uzbek apostrophe variants together', () => {
    expect(normalizeToken('oʻzbekcha')).toBe(normalizeToken("o'zbekcha"))
    expect(normalizeToken('to’g’ri')).toBe(normalizeToken("to'g'ri"))
  })
})

describe('tokenize', () => {
  it('splits on whitespace and drops empty tokens', () => {
    expect(tokenize('Men Toshkent aeroportiga keldim.')).toEqual([
      'Men',
      'Toshkent',
      'aeroportiga',
      'keldim.',
    ])
  })
})

describe('validateStrictOrder', () => {
  const canonical = ['Mana', 'pasportim.']

  it('accepts the exact order ignoring case and punctuation', () => {
    expect(validateStrictOrder(['mana', 'pasportim'], canonical)).toBe(true)
  })

  it('rejects wrong order', () => {
    expect(validateStrictOrder(['pasportim.', 'Mana'], canonical)).toBe(false)
  })

  it('rejects missing or extra tokens', () => {
    expect(validateStrictOrder(['Mana'], canonical)).toBe(false)
    expect(validateStrictOrder(['Mana', 'pasportim.', 'iltimos'], canonical)).toBe(false)
  })
})

describe('validateLoose', () => {
  const canonical = tokenize('I arrived at Tashkent airport.')

  it('accepts all content words in any order', () => {
    expect(validateLoose(['airport', 'Tashkent', 'arrived'], canonical)).toBe(true)
  })

  it('ignores stopwords in the answer', () => {
    expect(validateLoose(['I', 'arrived', 'at', 'the', 'Tashkent', 'airport'], canonical)).toBe(
      true,
    )
  })

  it('rejects when a content word is missing', () => {
    expect(validateLoose(['arrived', 'Tashkent'], canonical)).toBe(false)
  })

  it('rejects decoy content words', () => {
    expect(validateLoose(['arrived', 'Tashkent', 'airport', 'luggage'], canonical)).toBe(false)
  })
})

describe('contentWords', () => {
  it('drops stopwords and normalises', () => {
    expect(contentWords(['The', 'officer', 'checked', 'my', 'passport.'])).toEqual([
      'officer',
      'checked',
      'passport',
    ])
  })
})

describe('buildDecoys', () => {
  it('never returns tokens that normalise into the answer', () => {
    const decoys = buildDecoys(['Mana', 'pasportim.'], ['mana', 'PASPORTIM', 'chipta', 'non'], 4)
    expect(decoys.sort()).toEqual(['chipta', 'non'])
  })

  it('caps at the requested count and dedupes', () => {
    const decoys = buildDecoys(['a'], ['b', 'b', 'c', 'd', 'e'], 3)
    expect(decoys).toHaveLength(3)
    expect(new Set(decoys).size).toBe(3)
  })
})

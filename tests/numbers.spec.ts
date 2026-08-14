import { describe, it, expect } from 'vitest'
import {
  numberToUzbek,
  generateCountingQuiz,
  uzbekCardinalTokens,
  MAX_UZBEK_CARDINAL,
  UZBEK_NUMBER_WORDS,
} from '@/exercises/numbers'

describe('numberToUzbek', () => {
  it('renders the units and zero', () => {
    const units = ['nol', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"]
    units.forEach((word, n) => expect(numberToUzbek(n)).toBe(word))
  })

  it('renders the tens', () => {
    expect(numberToUzbek(10)).toBe("o'n")
    expect(numberToUzbek(20)).toBe('yigirma')
    expect(numberToUzbek(30)).toBe("o'ttiz")
    expect(numberToUzbek(40)).toBe('qirq')
    expect(numberToUzbek(50)).toBe('ellik')
    expect(numberToUzbek(90)).toBe("to'qson")
  })

  it('chains tens and units biggest-first', () => {
    expect(numberToUzbek(11)).toBe("o'n bir")
    expect(numberToUzbek(15)).toBe("o'n besh")
    expect(numberToUzbek(21)).toBe('yigirma bir')
    expect(numberToUzbek(99)).toBe("to'qson to'qqiz")
  })

  it('drops the bir before a lone hundred or thousand', () => {
    expect(numberToUzbek(100)).toBe('yuz')
    expect(numberToUzbek(1000)).toBe('ming')
  })

  it('renders hundreds and thousands with their multipliers', () => {
    expect(numberToUzbek(200)).toBe('ikki yuz')
    expect(numberToUzbek(245)).toBe('ikki yuz qirq besh')
    expect(numberToUzbek(2000)).toBe('ikki ming')
    expect(numberToUzbek(10000 - 1)).toBe("to'qqiz ming to'qqiz yuz to'qson to'qqiz")
  })

  it('rejects out-of-range and non-integer input', () => {
    expect(() => numberToUzbek(-1)).toThrow()
    expect(() => numberToUzbek(10000)).toThrow()
    expect(() => numberToUzbek(1.5)).toThrow()
  })
})

describe('uzbekCardinalTokens', () => {
  /**
   * The anchors scripts/generate_audio.py pins in NUMBER_SELF_TEST. Both sides
   * render the readings the bazar stitches its audio from, so they have to
   * agree word for word or the clips are looked up under the wrong hashes.
   */
  const ANCHORS: Record<number, string> = {
    0: 'nol',
    7: 'yetti',
    10: "o'n",
    11: "o'n bir",
    21: 'yigirma bir',
    99: "to'qson to'qqiz",
    100: 'yuz',
    1000: 'ming',
    9999: "to'qqiz ming to'qqiz yuz to'qson to'qqiz",
    15000: "o'n besh ming",
    230000: "ikki yuz o'ttiz ming",
    1500000: 'bir million besh yuz ming',
    90000000: "to'qson million",
  }

  it('matches the readings the audio generator records', () => {
    for (const [n, expected] of Object.entries(ANCHORS)) {
      expect(uzbekCardinalTokens(Number(n)).join(' ')).toBe(expected)
    }
  })

  it('agrees with numberToUzbek everywhere numberToUzbek runs', () => {
    for (let n = 0; n <= 9999; n++) {
      expect(uzbekCardinalTokens(n).join(' ')).toBe(numberToUzbek(n))
    }
  })

  it('drops "bir" before ming but keeps it before million', () => {
    expect(uzbekCardinalTokens(1000)).toEqual(['ming'])
    expect(uzbekCardinalTokens(1_000_000)).toEqual(['bir', 'million'])
    expect(uzbekCardinalTokens(1_000_000_000)).toEqual(['bir', 'milliard'])
  })

  it('repeats a word when the number does', () => {
    expect(uzbekCardinalTokens(2_200_000)).toEqual(['ikki', 'million', 'ikki', 'yuz', 'ming'])
  })

  it('skips the groups that are zero', () => {
    expect(uzbekCardinalTokens(1_000_005)).toEqual(['bir', 'million', 'besh'])
  })

  it('splits into one spoken word per element', () => {
    for (const token of uzbekCardinalTokens(987_654_321)) {
      expect(token).not.toContain(' ')
      expect(UZBEK_NUMBER_WORDS).toContain(token)
    }
  })

  it('reaches its stated ceiling and rejects everything past it', () => {
    expect(() => uzbekCardinalTokens(MAX_UZBEK_CARDINAL)).not.toThrow()
    expect(() => uzbekCardinalTokens(MAX_UZBEK_CARDINAL + 1)).toThrow()
    expect(() => uzbekCardinalTokens(-1)).toThrow()
    expect(() => uzbekCardinalTokens(1.5)).toThrow()
  })
})

describe('UZBEK_NUMBER_WORDS', () => {
  it('covers every word a cardinal can be built from', () => {
    const seen = new Set<string>()
    for (const n of [0, 999, 9999, 123_456_789, 999_999_999_999]) {
      for (const token of uzbekCardinalTokens(n)) seen.add(token)
    }
    // "nol" is the one reading that is never part of a larger number.
    seen.delete('nol')
    for (const word of seen) expect(UZBEK_NUMBER_WORDS).toContain(word)
  })

  it('lists no duplicates', () => {
    expect(new Set(UZBEK_NUMBER_WORDS).size).toBe(UZBEK_NUMBER_WORDS.length)
  })
})

describe('generateCountingQuiz', () => {
  it('produces the requested number of well-formed questions', () => {
    const quiz = generateCountingQuiz(8)
    expect(quiz).toHaveLength(8)
    for (const q of quiz) {
      expect(q.value).toBeGreaterThanOrEqual(0)
      expect(q.uzbek).toBe(numberToUzbek(q.value))
      if (q.mode === 'type') {
        expect(q.options).toHaveLength(0)
      } else {
        // Four options, the correct value among them, all distinct
        expect(q.options).toHaveLength(4)
        expect(q.options.some((o) => o.value === q.value)).toBe(true)
        expect(new Set(q.options.map((o) => o.value)).size).toBe(4)
        for (const o of q.options) expect(o.uzbek).toBe(numberToUzbek(o.value))
      }
    }
  })

  it('rotates through all four question modes', () => {
    const modes = new Set(generateCountingQuiz(8).map((q) => q.mode))
    expect(modes).toEqual(new Set(['read', 'listen', 'write', 'type']))
  })

  it('is deterministic for a given rng', () => {
    let s = 42
    const rng = () => {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff
      return s / 0x7fffffff
    }
    let t = 42
    const rng2 = () => {
      t = (Math.imul(t, 1103515245) + 12345) & 0x7fffffff
      return t / 0x7fffffff
    }
    expect(generateCountingQuiz(6, rng)).toEqual(generateCountingQuiz(6, rng2))
  })
})

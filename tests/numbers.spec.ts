import { describe, it, expect } from 'vitest'
import { numberToUzbek, generateCountingQuiz } from '@/exercises/numbers'

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

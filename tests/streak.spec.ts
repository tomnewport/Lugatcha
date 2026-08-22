import { describe, it, expect } from 'vitest'
import {
  streakChips,
  streakString,
  planIncrement,
  recordStreakDay,
  currentStreak,
  skipState,
  SKIP_CAP,
} from '@/streak'

describe('streakChips', () => {
  it('renders the worked examples from the brief', () => {
    expect(streakString(1)).toBe('🔹')
    expect(streakString(2)).toBe('🔹🔸')
    expect(streakString(26)).toBe('💠🔹')
    expect(streakString(74)).toBe('💠✴️🔷🔶🔷🔶🔹🔸🔹🔸')
  })

  it('is empty for a streak of zero', () => {
    expect(streakChips(0)).toEqual([])
  })

  it('fuses five singles into one five-chip', () => {
    expect(streakString(4)).toBe('🔹🔸🔹🔸')
    expect(streakString(5)).toBe('🔷')
    expect(streakString(6)).toBe('🔷🔹')
  })

  it('fuses five five-chips into one twenty-five-chip', () => {
    expect(streakString(24)).toBe('🔷🔶🔷🔶🔹🔸🔹🔸')
    expect(streakString(25)).toBe('💠')
    expect(streakString(50)).toBe('💠✴️')
  })

  it('alternates colour within each tier', () => {
    const chips = streakChips(2)
    expect(chips[0].color).toBe('blue')
    expect(chips[1].color).toBe('orange')
  })
})

describe('planIncrement', () => {
  it('adds a lone single chip when there is no carry', () => {
    const plan = planIncrement(5) // 5 -> 6
    expect(plan.added.symbol).toBe('🔹')
    expect(plan.merges).toHaveLength(0)
  })

  it('fuses a five-chip when the fifth single lands', () => {
    const plan = planIncrement(4) // 4 -> 5
    expect(plan.merges).toHaveLength(1)
    const [merge] = plan.merges
    expect(merge.tier).toBe(0)
    expect(merge.components.map((c) => c.symbol)).toEqual(['🔹', '🔸', '🔹', '🔸', '🔹'])
    expect(merge.result.symbol).toBe('🔷')
  })

  it('cascades two merges when crossing twenty-five', () => {
    const plan = planIncrement(24) // 24 -> 25
    expect(plan.merges).toHaveLength(2)
    expect(plan.merges[0].result.symbol).toBe('🔷') // fifth five-chip
    expect(plan.merges[1].tier).toBe(1)
    expect(plan.merges[1].components.map((c) => c.symbol)).toEqual([
      '🔷',
      '🔶',
      '🔷',
      '🔶',
      '🔷',
    ])
    expect(plan.merges[1].result.symbol).toBe('💠')
  })

  it('the added chip matches the new streak length', () => {
    // First day of all.
    expect(planIncrement(0).added.symbol).toBe('🔹')
    expect(planIncrement(0).merges).toHaveLength(0)
  })
})

describe('recordStreakDay', () => {
  const day = (iso: string) => new Date(`${iso}T12:00:00`)

  it('starts a streak at one on the first practice', () => {
    const update = recordStreakDay(day('2026-06-29'))
    expect(update).toEqual({ from: 0, to: 1, extended: true, skipsSpent: 0 })
    expect(currentStreak(day('2026-06-29'))).toBe(1)
  })

  it('grows the streak when practising on consecutive days', () => {
    recordStreakDay(day('2026-06-29'))
    const update = recordStreakDay(day('2026-06-30'))
    expect(update).toEqual({ from: 1, to: 2, extended: true, skipsSpent: 0 })
  })

  it('does not double-count a second practice on the same day', () => {
    recordStreakDay(day('2026-06-29'))
    const update = recordStreakDay(day('2026-06-29'))
    expect(update).toEqual({ from: 1, to: 1, extended: false, skipsSpent: 0 })
  })

  it('resets to one after a missed day', () => {
    recordStreakDay(day('2026-06-29'))
    const update = recordStreakDay(day('2026-07-02'))
    expect(update).toEqual({ from: 0, to: 1, extended: true, skipsSpent: 0 })
  })
})

describe('recordStreakDay — the rest-day bank', () => {
  const day = (iso: string) => new Date(`${iso}T12:00:00`)

  /** Practise every day from `from` to `to` inclusive. */
  const practiseThrough = (from: string, to: string) => {
    for (const d = new Date(`${from}T12:00:00`); d <= new Date(`${to}T12:00:00`); ) {
      recordStreakDay(new Date(d))
      d.setDate(d.getDate() + 1)
    }
  }

  it('starts a streak with one rest day in the bank', () => {
    recordStreakDay(day('2026-06-01'))
    expect(skipState(day('2026-06-01'))).toEqual({ available: 1, peak: 1, nextInDays: 7 })
  })

  it('forgives a missed day, spending a banked rest day', () => {
    recordStreakDay(day('2026-06-01'))
    recordStreakDay(day('2026-06-02'))
    // 06-03 skipped entirely.
    const update = recordStreakDay(day('2026-06-04'))
    expect(update).toEqual({ from: 2, to: 3, extended: true, skipsSpent: 1 })
    expect(skipState(day('2026-06-04')).available).toBe(0)
  })

  it('earns a rest day a week, and banks no more than the cap', () => {
    practiseThrough('2026-06-01', '2026-06-07')
    expect(skipState(day('2026-06-08')).available).toBe(2) // one week on
    practiseThrough('2026-06-08', '2026-06-30')
    expect(skipState(day('2026-06-30')).available).toBe(SKIP_CAP)
    practiseThrough('2026-07-01', '2026-07-31')
    expect(skipState(day('2026-07-31')).available).toBe(SKIP_CAP)
  })

  it('covers two missed days in one week once a second rest day is banked', () => {
    // The pattern that used to break a streak: two single missed days, three
    // days apart, with a week of practice banked beforehand.
    practiseThrough('2026-06-01', '2026-06-08')
    // 06-09 missed.
    expect(recordStreakDay(day('2026-06-10'))).toEqual({
      from: 8,
      to: 9,
      extended: true,
      skipsSpent: 1,
    })
    // 06-11 missed too — the second banked rest day covers it.
    expect(recordStreakDay(day('2026-06-12'))).toEqual({
      from: 9,
      to: 10,
      extended: true,
      skipsSpent: 1,
    })
    expect(skipState(day('2026-06-12')).available).toBe(0)
  })

  it('spends one rest day per missed day when the bank covers them all', () => {
    practiseThrough('2026-06-01', '2026-06-22') // three banked
    expect(skipState(day('2026-06-22')).available).toBe(3)
    // 06-23, 06-24 and 06-25 all missed — a long weekend away.
    const update = recordStreakDay(day('2026-06-26'))
    expect(update).toEqual({ from: 22, to: 23, extended: true, skipsSpent: 3 })
    expect(skipState(day('2026-06-26')).available).toBe(0)
  })

  it('lapses when the bank cannot cover every missed day', () => {
    practiseThrough('2026-06-01', '2026-06-08') // two banked
    // Three days missed, only two rest days to spend: none are spent.
    const update = recordStreakDay(day('2026-06-12'))
    expect(update).toEqual({ from: 0, to: 1, extended: true, skipsSpent: 0 })
  })

  it('gives the new streak a single fresh rest day after a lapse', () => {
    practiseThrough('2026-06-01', '2026-06-22') // three banked, peak three
    recordStreakDay(day('2026-07-15')) // long gone — lapses
    expect(skipState(day('2026-07-15'))).toEqual({ available: 1, peak: 1, nextInDays: 7 })
  })

  it('counts down to the next rest day', () => {
    recordStreakDay(day('2026-06-01'))
    recordStreakDay(day('2026-06-02'))
    recordStreakDay(day('2026-06-04')) // spends the first, bank empty
    // The clock runs from the start of the streak, not from the spend: a week
    // of streak earns a rest day whether or not one was just used.
    expect(skipState(day('2026-06-04'))).toEqual({ available: 0, peak: 1, nextInDays: 4 })
    expect(skipState(day('2026-06-06')).nextInDays).toBe(2)
    expect(skipState(day('2026-06-08')).available).toBe(1)
  })

  it('reports no countdown once the bank is full', () => {
    practiseThrough('2026-06-01', '2026-06-22')
    expect(skipState(day('2026-06-22')).nextInDays).toBeNull()
  })

  it('remembers the peak so a spent rest day can be warned about', () => {
    practiseThrough('2026-06-01', '2026-06-08') // peak of two
    recordStreakDay(day('2026-06-10')) // 06-09 missed, one spent
    const state = skipState(day('2026-06-10'))
    expect(state).toEqual({ available: 1, peak: 2, nextInDays: 5 })
    expect(state.available).toBeLessThan(state.peak) // the home screen warns
  })

  it('reflects the forgiven streak through currentStreak', () => {
    recordStreakDay(day('2026-06-01'))
    recordStreakDay(day('2026-06-02'))
    // 06-03 skipped; the banked rest day keeps the streak alive through 06-04.
    expect(currentStreak(day('2026-06-04'))).toBe(2)
  })

  it('still lapses when more days are missed than the bank can cover', () => {
    recordStreakDay(day('2026-06-01'))
    const update = recordStreakDay(day('2026-06-04'))
    expect(update).toEqual({ from: 0, to: 1, extended: true, skipsSpent: 0 })
  })
})

describe('migration from the one-a-week skip', () => {
  const day = (iso: string) => new Date(`${iso}T12:00:00`)

  it('keeps a streak whose old skip was already spent, with an empty bank', () => {
    localStorage.setItem('lugatcha.streakCount', '23')
    localStorage.setItem('lugatcha.streakLastDate', '2026-06-10')
    localStorage.setItem('lugatcha.streakSkipDate', '2026-06-08')
    expect(currentStreak(day('2026-06-11'))).toBe(23)
    expect(skipState(day('2026-06-11'))).toEqual({ available: 0, peak: 1, nextInDays: 4 })
    // The old key refills a week after it was spent.
    expect(skipState(day('2026-06-15')).available).toBe(1)
  })

  it('hands an unspent old skip straight to the new bank', () => {
    localStorage.setItem('lugatcha.streakCount', '5')
    localStorage.setItem('lugatcha.streakLastDate', '2026-06-10')
    expect(skipState(day('2026-06-11'))).toEqual({ available: 1, peak: 1, nextInDays: 7 })
  })

  it('drops the old key once the streak is written again', () => {
    localStorage.setItem('lugatcha.streakCount', '23')
    localStorage.setItem('lugatcha.streakLastDate', '2026-06-10')
    localStorage.setItem('lugatcha.streakSkipDate', '2026-06-08')
    recordStreakDay(day('2026-06-11'))
    expect(localStorage.getItem('lugatcha.streakSkipDate')).toBeNull()
    expect(localStorage.getItem('lugatcha.streakCount')).toBe('24')
  })
})

describe('currentStreak', () => {
  const day = (iso: string) => new Date(`${iso}T12:00:00`)

  it('survives until the day after the last practice', () => {
    recordStreakDay(day('2026-06-29'))
    expect(currentStreak(day('2026-06-30'))).toBe(1) // still extendable today
  })

  it('is forgiven by a banked rest day when a day is missed', () => {
    recordStreakDay(day('2026-06-29'))
    expect(currentStreak(day('2026-07-01'))).toBe(1)
  })

  it('lapses to zero once more days are missed than the bank covers', () => {
    recordStreakDay(day('2026-06-29'))
    expect(currentStreak(day('2026-07-02'))).toBe(0)
  })
})

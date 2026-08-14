import { describe, it, expect } from 'vitest'
import {
  advance,
  BANDS,
  BELT_SLOTS,
  BIN_CAPACITY,
  BONUS_ITEMS,
  BONUS_MIN_CLEARED,
  BONUS_PRICES,
  buildKeys,
  convert,
  createGame,
  currencyFor,
  formatConverted,
  formatSom,
  ITEMS,
  KEYPAD,
  msPerToken,
  priceForBand,
  pressToken,
  registerKeys,
  SOM_PER_UNIT,
  startGame,
  TOP_BAND,
  type BazarState,
} from '@/exercises/bazar'
import { uzbekCardinalTokens } from '@/exercises/numbers'

/** A predictable rng: cycles a fixed sequence so a run can be pinned down. */
function scripted(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

/** A cheap deterministic pseudo-random source for long runs. */
function seeded(seed = 1): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

/** Plays the front item's price correctly, one token at a time. */
function bagFront(state: BazarState, rng: () => number = seeded(7)): BazarState {
  let next = state
  const front = next.items[0]
  for (const token of front.tokens) {
    const press = pressToken(next, token, rng)
    expect(press.accepted).toBe(true)
    next = press.state
  }
  return next
}

describe('the stall', () => {
  it('stocks every band on the ladder', () => {
    for (let band = 0; band <= TOP_BAND; band++) {
      expect(ITEMS.filter((i) => i.band === band).length).toBeGreaterThanOrEqual(4)
    }
  })

  it('never lists an item outside the ladder', () => {
    for (const item of ITEMS) {
      expect(item.band).toBeGreaterThanOrEqual(0)
      expect(item.band).toBeLessThanOrEqual(TOP_BAND)
      expect(item.emoji).not.toHaveLength(0)
      expect(item.uzbek).not.toHaveLength(0)
      expect(item.english).not.toHaveLength(0)
    }
  })
})

describe('priceForBand', () => {
  it('keeps the bottom band to a single soʻm digit', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const price = priceForBand(0, () => r)
      expect(price).toBeGreaterThanOrEqual(1)
      expect(price).toBeLessThanOrEqual(9)
    }
  })

  it('lands in its own decade above the bottom band', () => {
    for (let band = 1; band <= TOP_BAND; band++) {
      for (const r of [0, 0.37, 0.99]) {
        const price = priceForBand(band, () => r)
        expect(price).toBeGreaterThanOrEqual(10 ** band)
        expect(price).toBeLessThan(10 ** (band + 1))
      }
    }
  })

  it('never carries more than two significant digits', () => {
    const rng = seeded(3)
    for (let band = 0; band <= TOP_BAND; band++) {
      for (let i = 0; i < 200; i++) {
        const digits = String(priceForBand(band, rng)).replace(/0+$/, '')
        expect(digits.length).toBeLessThanOrEqual(2)
      }
    }
  })

  it('keeps the realistic bands inside a traveller’s budget', () => {
    // Bands 5-7 are where the game spends most of its time; in pounds they
    // should read like real prices rather than lottery wins.
    const cheapest = convert(10 ** 5, 'GBP')
    const dearest = convert(99 * 10 ** 6, 'GBP')
    expect(cheapest).toBeGreaterThan(5)
    expect(dearest).toBeLessThan(10_000)
  })
})

describe('msPerToken', () => {
  it('gives four seconds a word at the start and one in the millions', () => {
    expect(msPerToken(0)).toBe(4000)
    expect(msPerToken(6)).toBe(1000)
  })

  it('never speeds up past its floor', () => {
    expect(msPerToken(TOP_BAND)).toBe(1000)
    expect(msPerToken(99)).toBe(1000)
  })

  it('ramps monotonically', () => {
    for (let band = 1; band <= TOP_BAND; band++) {
      expect(msPerToken(band)).toBeLessThanOrEqual(msPerToken(band - 1))
    }
  })
})

describe('buildKeys', () => {
  it('offers four buttons for a one-word price and eight for the rest', () => {
    expect(buildKeys(['besh'], seeded(1))).toHaveLength(4)
    expect(buildKeys(['ikki', 'yuz', 'ellik'], seeded(1))).toHaveLength(8)
  })

  it('always includes every word the price needs', () => {
    const rng = seeded(11)
    for (const price of [8, 45, 250, 2300, 15_000, 230_000, 2_200_000, 99_000_000]) {
      const tokens = uzbekCardinalTokens(price)
      const keys = buildKeys(tokens, rng)
      for (const token of tokens) expect(keys).toContain(token)
    }
  })

  it('never repeats a button', () => {
    const rng = seeded(5)
    // 2 200 000 says "ikki" twice; the register still shows it once.
    const keys = buildKeys(uzbekCardinalTokens(2_200_000), rng)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('fills up with real number words, not blanks', () => {
    const keys = buildKeys(['bir'], seeded(2))
    for (const key of keys) expect(key.trim()).not.toHaveLength(0)
  })
})

describe('a run', () => {
  it('opens ready, with an item already on the ramp', () => {
    const state = createGame(seeded(1))
    expect(state.status).toBe('ready')
    expect(state.items).toHaveLength(1)
    expect(state.band).toBe(0)
    expect(state.score).toBe(0)
  })

  it('does not move until it is started', () => {
    const state = createGame(seeded(1))
    const { state: still } = advance(state, 5000, seeded(1))
    expect(still.items[0].position).toBe(0)
  })

  it('prices the front item and banks it', () => {
    const started = startGame(createGame(seeded(1)))
    const front = started.items[0]
    const after = bagFront(started)
    expect(after.score).toBe(front.price)
    expect(after.cleared).toBe(1)
    expect(after.items.map((i) => i.id)).not.toContain(front.id)
  })

  it('refuses a token out of order without ending the run', () => {
    const started = startGame(createGame(seeded(1)))
    const front = started.items[0]
    const wrong = front.keys.find((k) => k !== front.tokens[0])!
    const press = pressToken(started, wrong, seeded(1))
    expect(press.accepted).toBe(false)
    expect(press.bagged).toBeNull()
    expect(press.state.items[0].typed).toBe(0)
    expect(press.state.status).toBe('playing')
  })

  it('keeps the dots in step with the tokens entered', () => {
    let state = startGame(createGame(seeded(4)))
    const rng = seeded(4)
    // Wind on to a multi-word price, so there is a partial state to observe.
    while (!state.items.length || state.items[0].tokens.length < 2) {
      state = advance(state, 16, rng).state
      if (state.items.length && state.items[0].tokens.length < 2) state = bagFront(state, rng)
    }
    const front = state.items[0]
    const press = pressToken(state, front.tokens[0], seeded(1))
    expect(press.state.items[0].typed).toBe(1)
    expect(press.bagged).toBeNull()
  })

  it('bins an item that runs off the end of the belt', () => {
    const started = startGame(createGame(seeded(1)))
    const { state, binned } = advance(started, started.items[0].travelMs, seeded(1))
    expect(binned).toHaveLength(1)
    expect(state.binned).toBe(1)
    expect(state.status).toBe('playing')
  })

  it('ends the run on the third binned item', () => {
    let state = startGame(createGame(seeded(1)))
    for (let i = 0; i < BIN_CAPACITY; i++) {
      const step = advance(state, 60_000, seeded(1))
      state = step.state
    }
    expect(state.binned).toBeGreaterThanOrEqual(BIN_CAPACITY)
    expect(state.status).toBe('over')
  })

  it('tops the belt up behind the items already on it', () => {
    let state = startGame(createGame(seeded(1)))
    const rng = seeded(2)
    // Long enough for the opening item to clear a slot and make room behind it,
    // derived from the belt's own timing so tuning the speed can't rot this.
    const slotMs = state.items[0].travelMs / BELT_SLOTS
    for (let elapsed = 0; elapsed < slotMs; elapsed += 60) state = advance(state, 60, rng).state
    expect(state.items.length).toBeGreaterThan(1)
    expect(state.items.length).toBeLessThanOrEqual(BELT_SLOTS + 1)
  })

  it('never lets an item overtake the one in front of it', () => {
    let state = startGame(createGame(seeded(9)))
    const rng = seeded(9)
    for (let step = 0; step < 4000; step++) {
      state = advance(state, 16, rng).state
      if (state.status === 'over') break
      for (let i = 1; i < state.items.length; i++) {
        expect(state.items[i].position).toBeLessThan(state.items[i - 1].position)
      }
    }
  })

  it('steps the prices up a band at a time', () => {
    let state = startGame(createGame(seeded(1)))
    const rng = seeded(1)
    const bandsSeen: number[] = [state.band]
    // Bag everything the belt offers, so the run advances on merit.
    for (let step = 0; step < 20_000 && state.band < TOP_BAND; step++) {
      state = advance(state, 16, rng).state
      if (state.status === 'over') break
      if (state.items.length) state = bagFront(state, rng)
      if (state.band !== bandsSeen[bandsSeen.length - 1]) bandsSeen.push(state.band)
    }
    expect(state.status).toBe('playing')
    expect(bandsSeen).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('serves each band for as long as the ladder says', () => {
    let state = startGame(createGame(seeded(6)))
    const rng = seeded(6)
    const dealtPerBand = new Map<number, Set<number>>()
    for (let step = 0; step < 20_000 && state.band < TOP_BAND; step++) {
      state = advance(state, 16, rng).state
      if (state.status === 'over') break
      // Bonus items borrow stock from whichever band their price suits, so
      // they are not part of the ladder's own count.
      for (const item of state.items.filter((i) => !i.bonus)) {
        if (!dealtPerBand.has(item.item.band)) dealtPerBand.set(item.item.band, new Set())
        dealtPerBand.get(item.item.band)!.add(item.id)
      }
      if (state.items.length) state = bagFront(state, rng)
    }
    for (let band = 0; band < TOP_BAND; band++) {
      expect(dealtPerBand.get(band)?.size).toBe(BANDS[band])
    }
  })

  it('prices every item with the words its register offers', () => {
    let state = startGame(createGame(seeded(12)))
    const rng = seeded(12)
    for (let step = 0; step < 6000; step++) {
      state = advance(state, 16, rng).state
      if (state.status === 'over') break
      for (const item of state.items) {
        expect(item.tokens).toEqual(
          item.bonus ? [...String(item.price)] : uzbekCardinalTokens(item.price),
        )
        for (const token of item.tokens) expect(item.keys).toContain(token)
      }
    }
  })
})

describe('the register', () => {
  it('follows the front of the belt', () => {
    const state = startGame(createGame(seeded(1)))
    expect(registerKeys(state)).toEqual(state.items[0].keys)
  })

  it('is empty when the belt is', () => {
    const empty: BazarState = { ...createGame(seeded(1)), items: [] }
    expect(registerKeys(empty)).toEqual([])
  })
})

describe('the bonus round', () => {
  /** Runs until the bonus takes over, with an rng that always wins the roll. */
  function reachBonus(): BazarState {
    // 0 wins every BONUS_CHANCE roll; it also picks the first of every pool,
    // which is fine — the bonus trigger is what is under test.
    let state = startGame(createGame(scripted([0])))
    const rng = scripted([0])
    for (let step = 0; step < 20_000; step++) {
      const stepped = advance(state, 16, rng)
      state = stepped.state
      if (stepped.bonusStarted || state.status === 'over') break
      if (state.items.length) state = bagFront(state, rng)
    }
    return state
  }

  it('waits for ten correct items before it can happen at all', () => {
    let state = startGame(createGame(scripted([0])))
    const rng = scripted([0])
    for (let step = 0; step < 20_000; step++) {
      const before = state.cleared
      const stepped = advance(state, 16, rng)
      state = stepped.state
      if (stepped.bonusStarted) {
        expect(before).toBeGreaterThanOrEqual(BONUS_MIN_CLEARED)
        return
      }
      if (state.status === 'over') break
      if (state.items.length) state = bagFront(state, rng)
    }
    throw new Error('the bonus round never started')
  })

  it('never rolls at all when the dice say no', () => {
    let state = startGame(createGame(seeded(3)))
    // 0.99 loses every roll; the pick indices it feeds are harmless.
    const rng = scripted([0.99])
    for (let step = 0; step < 8000; step++) {
      const stepped = advance(state, 16, rng)
      state = stepped.state
      expect(stepped.bonusStarted).toBe(false)
      if (state.status === 'over') break
      if (state.items.length) state = bagFront(state, rng)
    }
    expect(state.cleared).toBeGreaterThan(BONUS_MIN_CLEARED)
    expect(state.phase).toBe('shop')
  })

  it('swaps the register for a calculator keypad', () => {
    const state = reachBonus()
    expect(state.phase).toBe('bonus')
    expect(registerKeys(state)).toEqual(KEYPAD)
  })

  it('hides the price behind its digits', () => {
    const state = reachBonus()
    const front = state.items[0]
    expect(front.bonus).toBe(true)
    expect(front.tokens).toEqual([...String(front.price)])
    expect(BONUS_PRICES).toContain(front.price)
  })

  it('cannot end the run — a missed bonus item is only a missed item', () => {
    let state = reachBonus()
    const binnedBefore = state.binned
    const rng = scripted([0])
    for (let step = 0; step < 4000 && state.phase === 'bonus'; step++) {
      state = advance(state, 200, rng).state
    }
    expect(state.binned).toBe(binnedBefore)
    expect(state.status).toBe('playing')
  })

  it('deals ten items, then hands the till back to the shop', () => {
    let state = reachBonus()
    const rng = scripted([0])
    const bonusIds = new Set<number>()
    for (let step = 0; step < 20_000; step++) {
      state = advance(state, 16, rng).state
      for (const item of state.items) if (item.bonus) bonusIds.add(item.id)
      if (state.phase === 'shop') break
      if (state.items.length) state = bagFront(state, rng)
    }
    expect(bonusIds.size).toBe(BONUS_ITEMS)
    expect(state.phase).toBe('shop')
  })

  it('happens at most once a run', () => {
    let state = reachBonus()
    const rng = scripted([0])
    let starts = 0
    for (let step = 0; step < 20_000; step++) {
      const stepped = advance(state, 16, rng)
      state = stepped.state
      if (stepped.bonusStarted) starts++
      if (state.status === 'over') break
      if (state.items.length) state = bagFront(state, rng)
    }
    expect(starts).toBe(0)
    expect(state.bonusUsed).toBe(true)
  })
})

describe('BONUS_PRICES', () => {
  it('is the hundred readings the generator records', () => {
    expect(BONUS_PRICES).toHaveLength(100)
    expect(new Set(BONUS_PRICES).size).toBe(100)
  })

  it('spans a sweet to a carpet', () => {
    expect(Math.min(...BONUS_PRICES)).toBe(1000)
    expect(Math.max(...BONUS_PRICES)).toBe(90_000_000)
  })

  it('keeps every price to two significant digits and readable', () => {
    for (const price of BONUS_PRICES) {
      expect(String(price).replace(/0+$/, '').length).toBeLessThanOrEqual(2)
      expect(uzbekCardinalTokens(price).length).toBeGreaterThan(0)
    }
  })
})

describe('money', () => {
  it('follows the interface language into its own currency', () => {
    expect(currencyFor('en')).toBe('GBP')
    expect(currencyFor('ru')).toBe('RUB')
  })

  it('converts at the configured rate', () => {
    expect(convert(SOM_PER_UNIT.GBP, 'GBP')).toBe(1)
    expect(convert(SOM_PER_UNIT.RUB, 'RUB')).toBe(1)
  })

  it('shows pennies on small prices and none on large ones', () => {
    expect(formatConverted(16_000, 'GBP')).toBe('£1.00')
    expect(formatConverted(1_600_000, 'GBP')).toBe('£100')
  })

  it('never rounds a real price down to nothing', () => {
    expect(formatConverted(8, 'GBP')).toBe('< £0.01')
  })

  it('groups soʻm so the digits stay countable', () => {
    expect(formatSom(230_000, 'en')).toBe('230,000')
  })
})

describe('item glosses', () => {
  it('gives every item a Russian name, so the Russian UI is not half English', () => {
    for (const item of ITEMS) {
      expect(item.russian, `${item.uzbek} has no Russian gloss`).toBeTruthy()
    }
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import {
  advance,
  BANDS,
  BELT_SLOTS,
  MIN_GAP,
  BIN_CAPACITY,
  BONUS_ITEMS,
  BONUS_MIN_CLEARED,
  BONUS_PRICES,
  bandFloor,
  buildRegister,
  MAX_BAND,
  convert,
  createGame,
  currencyFor,
  formatConverted,
  formatSom,
  ITEMS,
  KEYPAD,
  LUXURIES,
  MAX_SIG_FIGS,
  MIN_SIG_FIGS,
  msPerToken,
  priceForBand,
  pressToken,
  readHighScore,
  recordHighScore,
  refillRegister,
  REGISTER_HALF,
  REGISTER_SIZE,
  registerCells,
  SIG_FIG_STEP,
  sigFigsFor,
  SOM_PER_UNIT,
  startGame,
  TOP_BAND,
  type BazarState,
} from '@/exercises/bazar'
import { uzbekCardinalTokens, MAX_UZBEK_CARDINAL } from '@/exercises/numbers'

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
  it('has something honest to sell at every price the ladder deals', () => {
    // Every soʻm from one to the dearest thing on the stall has to belong to
    // something, or a price turns up with nothing to put it on. Checked at the
    // ends of every range and either side of them, which is where a gap would
    // open.
    const edges = ITEMS.flatMap((item) => [item.from - 1, item.from, item.to, item.to + 1])
    const dearest = Math.max(...ITEMS.map((item) => item.to))
    for (const price of edges) {
      if (price < 1 || price > dearest) continue
      const honest = ITEMS.filter((item) => price >= item.from && price <= item.to)
      expect(honest.length, `nothing on the stall costs ${price} soʻm`).toBeGreaterThan(0)
    }
  })

  it('offers a choice at every band the climb reaches', () => {
    for (let band = 0; band <= TOP_BAND; band++) {
      const low = 10 ** band
      const high = 10 ** (band + 1) - 1
      const stock = ITEMS.filter((item) => item.from <= high && item.to >= low)
      expect(stock.length, `band ${band} has too little stock`).toBeGreaterThanOrEqual(4)
    }
  })

  it('prices every item as a real thing', () => {
    for (const item of ITEMS) {
      expect(item.from).toBeGreaterThanOrEqual(1)
      expect(item.to).toBeGreaterThan(item.from)
      // A range wider than three decades is not a price, it is a shrug.
      expect(item.to / item.from).toBeLessThanOrEqual(1000)
      expect(item.emoji).not.toHaveLength(0)
      expect(item.uzbek).not.toHaveLength(0)
      expect(item.english).not.toHaveLength(0)
    }
  })

  it('keeps the everyday things at everyday money', () => {
    // The prices are the point of the game, so a few of them are pinned here
    // in pounds: if the rate or a range drifts far enough to make a cake cost
    // forty pounds again, this is what says so.
    const cost = (uzbek: string) => {
      const item = ITEMS.find((i) => i.uzbek === uzbek)!
      return [convert(item.from, 'GBP'), convert(item.to, 'GBP')]
    }
    const [, breadHigh] = cost('non')
    expect(breadHigh).toBeLessThan(1)
    const [, cakeHigh] = cost('tort')
    expect(cakeHigh).toBeLessThan(25)
    const [, plovHigh] = cost('osh')
    expect(plovHigh).toBeLessThan(5)
    const [carLow] = cost('mashina')
    expect(carLow).toBeGreaterThan(2000)
  })

  it('keeps the absurd prices on the things that were dear anyway', () => {
    expect(LUXURIES.length).toBeGreaterThan(1)
    for (const item of LUXURIES) expect(item.to).toBeGreaterThanOrEqual(10 ** TOP_BAND)
  })
})

describe('priceForBand', () => {
  it('keeps the bottom band to a single soʻm digit', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const price = priceForBand(0, MIN_SIG_FIGS, () => r)
      expect(price).toBeGreaterThanOrEqual(1)
      expect(price).toBeLessThanOrEqual(9)
    }
  })

  it('lands in its own decade above the bottom band', () => {
    for (let band = 1; band <= MAX_BAND; band++) {
      for (let sigFigs = MIN_SIG_FIGS; sigFigs <= MAX_SIG_FIGS; sigFigs++) {
        for (const r of [0, 0.37, 0.99, 1]) {
          const price = priceForBand(band, sigFigs, () => r)
          expect(price).toBeGreaterThanOrEqual(10 ** band)
          expect(price).toBeLessThan(10 ** (band + 1))
        }
      }
    }
  })

  it('carries exactly the significant figures asked for', () => {
    const rng = seeded(3)
    for (let sigFigs = MIN_SIG_FIGS; sigFigs <= MAX_SIG_FIGS; sigFigs++) {
      for (let band = bandFloor(sigFigs); band <= MAX_BAND; band++) {
        for (let i = 0; i < 200; i++) {
          const digits = String(priceForBand(band, sigFigs, rng)).replace(/0+$/, '')
          expect(digits.length).toBeLessThanOrEqual(sigFigs)
        }
      }
    }
  })

  it('shortens the number rather than leave its band, low down the ladder', () => {
    // Nothing below the band a figure needs is ever dealt, but a price asked
    // for there must still be a price for *that* band.
    const rng = seeded(8)
    for (let i = 0; i < 50; i++) {
      const price = priceForBand(0, MAX_SIG_FIGS, rng)
      expect(price).toBeGreaterThanOrEqual(1)
      expect(price).toBeLessThanOrEqual(9)
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
  it('gives four seconds a word at the start and under one in the millions', () => {
    expect(msPerToken(0)).toBe(4000)
    expect(msPerToken(6)).toBe(800)
  })

  it('never speeds up past its floor for the band ramp alone', () => {
    expect(msPerToken(TOP_BAND)).toBe(800)
    expect(msPerToken(99)).toBe(800)
  })

  it('ramps monotonically', () => {
    for (let band = 1; band <= TOP_BAND; band++) {
      expect(msPerToken(band)).toBeLessThanOrEqual(msPerToken(band - 1))
    }
  })

  it('tightens again with every significant figure earned', () => {
    for (const band of [0, 3, TOP_BAND]) {
      for (let sigFigs = MIN_SIG_FIGS + 1; sigFigs <= MAX_SIG_FIGS; sigFigs++) {
        expect(msPerToken(band, sigFigs)).toBeLessThanOrEqual(msPerToken(band, sigFigs - 1))
      }
    }
    // Four figures at the top of the ladder is where a good run ends up, and
    // it still leaves better than half a second a word.
    expect(msPerToken(TOP_BAND, 4)).toBeLessThan(700)
    expect(msPerToken(TOP_BAND, 4)).toBeGreaterThan(500)
  })

  it('never stops tightening, however many figures are earned', () => {
    // The band ramp bottoms out; the figures do not, and neither does the
    // clock. Nothing floors it — the run ends when the player cannot keep up.
    for (let sigFigs = MIN_SIG_FIGS + 1; sigFigs <= MAX_SIG_FIGS; sigFigs++) {
      expect(msPerToken(TOP_BAND, sigFigs)).toBeLessThan(msPerToken(TOP_BAND, sigFigs - 1))
    }
    expect(msPerToken(MAX_BAND, MAX_SIG_FIGS)).toBeLessThan(300)
  })

  it('still gives a longer price more time than a shorter one', () => {
    // Four figures cost more words than two, and the per-word budget is what
    // makes that fair: the item as a whole gets longer, not shorter.
    const short = msPerToken(TOP_BAND, MIN_SIG_FIGS) * uzbekCardinalTokens(20_000_000).length
    const long = msPerToken(TOP_BAND, 4) * uzbekCardinalTokens(23_450_000).length
    expect(long).toBeGreaterThan(short)
  })
})

describe('significant figures', () => {
  it('opens on two and climbs one every twenty items priced', () => {
    expect(sigFigsFor(0)).toBe(MIN_SIG_FIGS)
    expect(sigFigsFor(SIG_FIG_STEP - 1)).toBe(MIN_SIG_FIGS)
    expect(sigFigsFor(SIG_FIG_STEP)).toBe(MIN_SIG_FIGS + 1)
    expect(sigFigsFor(SIG_FIG_STEP * 2)).toBe(MIN_SIG_FIGS + 2)
  })

  it('keeps climbing as long as there are words for the number', () => {
    // No design cap: the only ceiling is the biggest number this app can say.
    expect(sigFigsFor(SIG_FIG_STEP * 3)).toBe(5)
    expect(sigFigsFor(SIG_FIG_STEP * 8)).toBe(10)
    expect(sigFigsFor(SIG_FIG_STEP * (MAX_SIG_FIGS - MIN_SIG_FIGS))).toBe(MAX_SIG_FIGS)
    expect(sigFigsFor(10_000)).toBe(MAX_SIG_FIGS)
    expect(String(MAX_UZBEK_CARDINAL)).toHaveLength(MAX_SIG_FIGS)
  })

  it('restarts the ladder at the smallest band that can carry them', () => {
    // Hundreds for three figures, thousands for four.
    expect(bandFloor(3)).toBe(2)
    expect(bandFloor(4)).toBe(3)
    expect(10 ** bandFloor(4)).toBe(1000)
    // Until there is no bigger band to restart in, and only the precision
    // goes on climbing.
    expect(bandFloor(MAX_SIG_FIGS)).toBe(MAX_BAND)
    expect(bandFloor(99)).toBe(MAX_BAND)
  })

  it('never asks for a price the language cannot read', () => {
    const rng = seeded(31)
    for (let sigFigs = MIN_SIG_FIGS; sigFigs <= MAX_SIG_FIGS; sigFigs++) {
      for (let i = 0; i < 50; i++) {
        const price = priceForBand(bandFloor(sigFigs), sigFigs, rng)
        expect(price).toBeLessThanOrEqual(MAX_UZBEK_CARDINAL)
        expect(uzbekCardinalTokens(price).length).toBeGreaterThan(0)
      }
    }
  })

  it('leaves the register alone — six buttons, however long the price', () => {
    const rng = seeded(21)
    for (let sigFigs = MIN_SIG_FIGS; sigFigs <= MAX_SIG_FIGS; sigFigs++) {
      for (let band = bandFloor(sigFigs); band <= MAX_BAND; band++) {
        const tokens = uzbekCardinalTokens(priceForBand(band, sigFigs, rng))
        expect(buildRegister(tokens, rng)).toHaveLength(REGISTER_SIZE)
      }
    }
  })
})

describe('the board', () => {
  /** The words on one half of a board. */
  const half = (cells: readonly { token: string; half: number | null }[], which: number) =>
    cells.filter((cell) => cell.half === which).map((cell) => cell.token)

  it('is two halves of three, in grid order', () => {
    const cells = buildRegister(uzbekCardinalTokens(230_000), seeded(1))
    expect(cells).toHaveLength(REGISTER_SIZE)
    expect(cells.map((cell) => cell.half)).toEqual([0, 0, 0, 1, 1, 1])
    expect(half(cells, 0)).toHaveLength(REGISTER_HALF)
  })

  it('opens with the first two words up, one in each half', () => {
    const tokens = uzbekCardinalTokens(230_000)
    const cells = buildRegister(tokens, seeded(4))
    expect(half(cells, 0)).toContain(tokens[0])
    expect(half(cells, 1)).toContain(tokens[1])
  })

  it('retires the half the word came from and leaves the other standing', () => {
    const tokens = uzbekCardinalTokens(230_000)
    const rng = seeded(6)
    const opened = buildRegister(tokens, rng)
    const after = refillRegister(opened, tokens, 0, rng)
    // The half that answered goes; the one holding the word now due does not.
    expect(half(after, 1)).toEqual(half(opened, 1))
    expect(half(after, 0)).not.toEqual(half(opened, 0))
    // And it comes back holding the word after next, ready before it is needed.
    expect(half(after, 0)).toContain(tokens[2])
  })

  it('marks the refilled half so the renderer can animate just that half', () => {
    const tokens = uzbekCardinalTokens(230_000)
    const rng = seeded(6)
    const opened = buildRegister(tokens, rng)
    const after = refillRegister(opened, tokens, 0, rng)
    for (const cell of after) {
      expect(cell.seq).toBe(cell.half === 0 ? 1 : 0)
    }
    expect(refillRegister(after, tokens, 1, rng).filter((c) => c.half === 1)[0].seq).toBe(1)
  })

  it('keeps the word due and the one after it up, all the way through a price', () => {
    const rng = seeded(9)
    for (const price of [8, 45, 250, 2300, 15_000, 230_000, 2_200_000, 91_630_000]) {
      const tokens = uzbekCardinalTokens(price)
      let cells = buildRegister(tokens, rng)
      for (let i = 0; i < tokens.length; i++) {
        const words = cells.map((cell) => cell.token)
        expect(words, `${price}: word ${i} of ${tokens.join(' ')}`).toContain(tokens[i])
        if (i + 1 < tokens.length) expect(words).toContain(tokens[i + 1])
        cells = refillRegister(cells, tokens, i, rng)
      }
    }
  })

  it('never shows the same button twice unless the price says it twice', () => {
    const rng = seeded(5)
    // 2 200 000 says "ikki" twice — and only then can both halves want it.
    const tokens = uzbekCardinalTokens(230_000)
    let cells = buildRegister(tokens, rng)
    for (let i = 0; i < tokens.length; i++) {
      const words = cells.map((cell) => cell.token)
      expect(new Set(words).size).toBe(words.length)
      cells = refillRegister(cells, tokens, i, rng)
    }
  })

  it('fills a half with real number words when the price has run out of them', () => {
    // "besh" is one word long, so the second half answers nothing at all.
    const cells = buildRegister(['besh'], seeded(2))
    expect(cells).toHaveLength(REGISTER_SIZE)
    for (const cell of cells) expect(cell.token.trim()).not.toHaveLength(0)
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
    const wrong = front.cells.find((c) => c.token !== front.tokens[0])!.token
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
    // Long enough for the opening item to open a full gap behind it, derived
    // from the belt's own spacing and timing so tuning either can't rot this.
    const gapMs = state.items[0].travelMs * MIN_GAP
    for (let elapsed = 0; elapsed <= gapMs; elapsed += 60) state = advance(state, 60, rng).state
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
    // Bag everything the belt offers, so the run advances on merit — and stop
    // before the first significant figure, which resets the ladder on purpose.
    for (let step = 0; step < 20_000 && state.band < TOP_BAND; step++) {
      const before = state.sigFigs
      state = advance(state, 16, rng).state
      if (state.status === 'over' || state.sigFigs !== before) break
      if (state.items.length) state = bagFront(state, rng)
      if (state.band !== bandsSeen[bandsSeen.length - 1]) bandsSeen.push(state.band)
    }
    expect(state.status).toBe('playing')
    // One band at a time from the bottom, as far as the run got before the
    // first figure was earned — which is a reset, and a different test.
    expect(bandsSeen.length).toBeGreaterThan(3)
    expect(bandsSeen).toEqual(bandsSeen.map((_, i) => i))
  })

  it('climbs the whole ladder inside a single significant figure', () => {
    let state = startGame(createGame(seeded(1)))
    const rng = seeded(1)
    const bandsSeen: number[] = []
    for (let step = 0; step < 40_000 && state.band < TOP_BAND; step++) {
      state = advance(state, 16, rng).state
      if (state.status === 'over') break
      if (state.items.length) state = bagFront(state, rng)
      if (state.sigFigs === 4 && state.band !== bandsSeen[bandsSeen.length - 1]) {
        bandsSeen.push(state.band)
      }
    }
    expect(state.status).toBe('playing')
    // Four figures start at thousands and climb from there, a band at a time,
    // for as long as that figure lasts — which is until the next one is earned.
    expect(bandsSeen.length).toBeGreaterThan(2)
    expect(bandsSeen).toEqual(bandsSeen.map((_, i) => bandFloor(4) + i))
  })

  it('keeps earning figures past the top of the stock ladder', () => {
    let state = startGame(createGame(seeded(3)))
    const rng = seeded(3)
    for (let step = 0; step < 200_000 && state.sigFigs < MAX_SIG_FIGS; step++) {
      state = advance(state, 16, rng).state
      if (state.status === 'over') break
      // Every price the run deals is one the game can say out loud, all the
      // way to the last band there is.
      for (const item of state.items) {
        expect(item.price).toBeLessThanOrEqual(MAX_UZBEK_CARDINAL)
        expect(item.tokens.length).toBeGreaterThan(0)
      }
      if (state.items.length) state = bagFront(state, rng)
    }
    expect(state.status).toBe('playing')
    expect(state.sigFigs).toBe(MAX_SIG_FIGS)
    // Past the stock ladder the magnitude has nowhere left to go, so the band
    // sits at its ceiling and the precision carries the run on alone.
    expect(state.band).toBe(MAX_BAND)
    // The stall keeps selling — its priciest goods, at ludicrous prices.
    expect(state.items.every((i) => i.item.band === TOP_BAND)).toBe(true)
  })

  it('resets the ladder to the smallest band each new figure can carry', () => {
    let state = startGame(createGame(seeded(2)))
    const rng = seeded(2)
    const resets: { sigFigs: number; band: number }[] = []
    for (let step = 0; step < 40_000; step++) {
      const before = state.sigFigs
      const stepped = advance(state, 16, rng)
      state = stepped.state
      if (state.status === 'over') break
      if (state.sigFigs !== before) {
        expect(stepped.sigFigsUp).toBe(true)
        resets.push({ sigFigs: state.sigFigs, band: state.band })
      }
      if (resets.length === 3) break
      if (state.items.length) state = bagFront(state, rng)
    }
    expect(resets).toEqual([
      { sigFigs: 3, band: bandFloor(3) },
      { sigFigs: 4, band: bandFloor(4) },
      { sigFigs: 5, band: bandFloor(5) },
    ])
  })

  it('holds the register at six buttons however hard the run gets', () => {
    let state = startGame(createGame(seeded(15)))
    const rng = seeded(15)
    let checked = 0
    for (let step = 0; step < 40_000; step++) {
      state = advance(state, 16, rng).state
      if (state.status === 'over') break
      for (const item of state.items.filter((i) => !i.bonus)) {
        expect(item.cells).toHaveLength(REGISTER_SIZE)
        checked++
      }
      if (state.sigFigs === MAX_SIG_FIGS) break
      if (state.items.length) state = bagFront(state, rng)
    }
    // Right to the end of the ladder, where a price is twelve figures and
    // seventeen spoken words, the board is still six buttons.
    expect(state.sigFigs).toBe(MAX_SIG_FIGS)
    expect(checked).toBeGreaterThan(0)
  })

  it('serves each band for as long as the ladder says', () => {
    let state = startGame(createGame(seeded(6)))
    const rng = seeded(6)
    const dealtPerBand = new Map<number, Set<number>>()
    // Only the opening climb: a new significant figure deliberately deals a
    // band a second time. An item is counted against the band the ladder was
    // on when it was dealt, which is the first step it is seen on.
    const seen = new Set<number>()
    for (let step = 0; step < 20_000 && state.sigFigs === MIN_SIG_FIGS; step++) {
      state = advance(state, 16, rng).state
      if (state.status === 'over' || state.sigFigs !== MIN_SIG_FIGS) break
      // Bonus prices come from their own list, so they are not part of the
      // ladder's own count.
      for (const item of state.items.filter((i) => !i.bonus)) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        if (!dealtPerBand.has(state.band)) dealtPerBand.set(state.band, new Set())
        dealtPerBand.get(state.band)!.add(item.id)
      }
      if (state.items.length) state = bagFront(state, rng)
    }
    for (let band = 0; band < 4; band++) {
      expect(dealtPerBand.get(band)?.size).toBe(BANDS[band])
    }
  })

  it('never puts a price on something that could not carry it', () => {
    let state = startGame(createGame(seeded(17)))
    const rng = seeded(17)
    let checked = 0
    for (let step = 0; step < 60_000 && state.sigFigs < 8; step++) {
      state = advance(state, 16, rng).state
      if (state.status === 'over') break
      for (const belt of state.items) {
        const { item, price } = belt
        // Either the thing really costs that, or the price has left the real
        // economy altogether and the stall has fallen back on its dearest.
        const honest = price >= item.from && price <= item.to
        expect(
          honest || LUXURIES.includes(item),
          `${item.english} for ${price} soʻm`,
        ).toBe(true)
        checked++
      }
      if (state.items.length) state = bagFront(state, rng)
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('always offers the word the front item is waiting for', () => {
    let state = startGame(createGame(seeded(12)))
    const rng = seeded(12)
    for (let step = 0; step < 6000; step++) {
      state = advance(state, 16, rng).state
      if (state.status === 'over') break
      for (const item of state.items) {
        expect(item.tokens).toEqual(
          item.bonus ? [...String(item.price)] : uzbekCardinalTokens(item.price),
        )
      }
      const front = state.items[0]
      if (!front) continue
      // The board holds the word due and the one after it; the rest of the
      // price is not on it yet, and does not need to be.
      const words = front.cells.map((cell) => cell.token)
      expect(words).toContain(front.tokens[front.typed])
      // Enter a word now and again, so the board is tested part-way through a
      // price as well as at the start of one.
      if (step % 7 === 0) state = pressToken(state, front.tokens[front.typed], rng).state
    }
  })
})

describe('the register', () => {
  it('follows the front of the belt', () => {
    const state = startGame(createGame(seeded(1)))
    expect(registerCells(state)).toEqual(state.items[0].cells)
  })

  it('is empty when the belt is', () => {
    const empty: BazarState = { ...createGame(seeded(1)), items: [] }
    expect(registerCells(empty)).toEqual([])
  })

  it('swaps out the half a correct word came from, and only that half', () => {
    let state = startGame(createGame(seeded(1)))
    const rng = seeded(1)
    // Wind on to a price long enough to have a half left to swap.
    while (!state.items.length || state.items[0].tokens.length < 3) {
      state = advance(state, 16, rng).state
      if (state.items.length && state.items[0].tokens.length < 3) state = bagFront(state, rng)
    }
    const before = registerCells(state)
    const front = state.items[0]
    const after = registerCells(pressToken(state, front.tokens[0], rng).state)
    const moved = after.filter((cell, i) => cell.token !== before[i].token || cell.seq !== before[i].seq)
    expect(moved.map((cell) => cell.half)).toEqual([0, 0, 0])
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
    expect(registerCells(state).map((cell) => cell.token)).toEqual(KEYPAD)
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

describe('high score', () => {
  beforeEach(() => localStorage.clear())

  it('starts at zero and only stores an improvement', () => {
    expect(readHighScore()).toBe(0)
    expect(recordHighScore(230_000)).toBe(true)
    expect(readHighScore()).toBe(230_000)
    expect(recordHighScore(1000)).toBe(false)
    expect(readHighScore()).toBe(230_000)
  })

  it('survives junk in storage', () => {
    localStorage.setItem('lugatcha.bazarHighScore.v2', 'not a number')
    expect(readHighScore()).toBe(0)
  })

  it('ignores a best set under the old prices, and clears it out', () => {
    // Scores from before the significant-figure ramp were earned under
    // different prices; the board starts again rather than showing one.
    localStorage.setItem('lugatcha.bazarHighScore', '99000000')
    expect(readHighScore()).toBe(0)
    expect(localStorage.getItem('lugatcha.bazarHighScore')).toBeNull()
    // Including one an old backup puts back after this release.
    expect(recordHighScore(5000)).toBe(true)
    localStorage.setItem('lugatcha.bazarHighScore', '99000000')
    expect(readHighScore()).toBe(5000)
  })
})

describe('item glosses', () => {
  it('gives every item a Russian name, so the Russian UI is not half English', () => {
    for (const item of ITEMS) {
      expect(item.russian, `${item.uzbek} has no Russian gloss`).toBeTruthy()
    }
  })
})

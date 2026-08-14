/**
 * "Bazar hero" — the mini-game where you price up a market stall (issue #170).
 *
 * Items ride a conveyor belt towards the till. Each wears a pricetag in soʻm,
 * and to get it into the trolley you have to *say* that price: the register
 * below the belt is a grid of Uzbek number words, and you tap them in spoken
 * order — "ikki", "yuz", "o'ttiz", "ming". Grey dots under the tag show how
 * many words the price takes and go green as you find them. Miss an item
 * before it reaches the end of the belt and it drops in the bin; three in the
 * bin and the run is over. Your score is the total value of what you bagged,
 * so the game rewards keeping up as the prices climb.
 *
 * The ramp is the numbers themselves. A run opens on joke items priced in
 * single soʻm — you genuinely cannot buy anything for 8 soʻm — and climbs a
 * band at a time through tens, hundreds and thousands until it settles where a
 * traveller actually spends: hundreds of thousands and millions of soʻm, which
 * is roughly £6–£600. Prices never carry more than two significant digits, so
 * the words stay learnable while the magnitudes get big. The belt speeds up as
 * it climbs too, from two seconds a word down to one.
 *
 * Occasionally, once the player is clearly coping, a bonus round takes over:
 * the pricetags are replaced by a speaker, the register becomes a calculator
 * keypad, and the price is *read aloud* for you to key in as digits. That is
 * the listening half of the same skill, and the reason `BONUS_PRICES` is a
 * fixed list — scripts/generate_audio.py records those hundred readings whole,
 * because recognising a number in natural speech needs natural speech.
 *
 * Everything here is pure and deterministic given an `rng` and a millisecond
 * delta: the component is a renderer and a clock, and the rules are tested
 * directly.
 */
import { uzbekCardinalTokens, UZBEK_NUMBER_WORDS } from './numbers'

// --- Money ------------------------------------------------------------------

/**
 * The currency the learner reads prices *in*, alongside the soʻm price — it
 * follows the interface language, because a Russian-speaking learner converts
 * to roubles, not pounds.
 */
export type Currency = 'GBP' | 'RUB'

/**
 * Soʻm per unit of each currency. Deliberately round: these are here to give a
 * price a sense of scale, not to be a rate. The UI labels every conversion
 * approximate (see `bazar.approx`), and one edit here moves them all when the
 * som drifts far enough to matter.
 */
export const SOM_PER_UNIT: Record<Currency, number> = {
  GBP: 16_000,
  RUB: 160,
}

/** The currency to price in for an interface language. */
export function currencyFor(language: string): Currency {
  return language === 'ru' ? 'RUB' : 'GBP'
}

/** A soʻm price in the learner's own currency, unrounded. */
export function convert(som: number, currency: Currency): number {
  return som / SOM_PER_UNIT[currency]
}

/**
 * The converted price, formatted for display. Fewer decimals as the number
 * grows — "£0.45" and "£1,200" are both readable, "£1,200.00" is noise. Prices
 * too small to show a penny become "< £0.01" rather than a misleading "£0.00".
 */
export function formatConverted(som: number, currency: Currency, locale = 'en'): string {
  const value = convert(som, currency)
  const digits = value < 10 ? 2 : value < 100 ? 1 : 0
  const format = (v: number, d: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(v)
  if (value > 0 && value < 0.005) return `< ${format(0.01, 2)}`
  return format(value, digits)
}

/** A soʻm amount with digit grouping — 230000 reads as "230 000". */
export function formatSom(som: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { useGrouping: true }).format(som)
}

// --- The stall --------------------------------------------------------------

export interface BazarItem {
  emoji: string
  uzbek: string
  english: string
  /** Russian gloss; falls back to `english` when absent, as content does. */
  russian?: string
  /** Which price band this item belongs on; see `BANDS`. */
  band: number
}

/**
 * The stock, cheapest first.
 *
 * Band 0–3 is the joke stretch: at these prices nothing real is for sale, so
 * the stall sells air, smoke and shadows, drifting towards things that might
 * *just* cost a few hundred soʻm — a paperclip, a match, a sheet of paper.
 * From band 4 on the prices are real, and so is the stock: this is a shopping
 * list you could take to a bozor, ending in the big-ticket items a very good
 * run earns the right to see.
 */
export const ITEMS: readonly BazarItem[] = [
  // Band 0 — 1–9 soʻm. Not things. Ideas of things.
  { emoji: '🌬️', uzbek: 'havo', english: 'air', russian: 'воздух', band: 0 },
  { emoji: '🚬', uzbek: 'tutun', english: 'smoke', russian: 'дым', band: 0 },
  { emoji: '🍂', uzbek: 'barg', english: 'a leaf', russian: 'лист', band: 0 },
  { emoji: '🪨', uzbek: 'tosh', english: 'a pebble', russian: 'камешек', band: 0 },
  { emoji: '🌑', uzbek: 'soya', english: 'a shadow', russian: 'тень', band: 0 },
  { emoji: '💨', uzbek: 'chang', english: 'dust', russian: 'пыль', band: 0 },

  // Band 1 — 10–99 soʻm.
  { emoji: '⏳', uzbek: 'qum', english: 'sand', russian: 'песок', band: 1 },
  { emoji: '💧', uzbek: 'tomchi', english: 'a drop', russian: 'капля', band: 1 },
  { emoji: '🫧', uzbek: 'pufak', english: 'a bubble', russian: 'пузырь', band: 1 },
  { emoji: '🪶', uzbek: 'pat', english: 'a feather', russian: 'перо', band: 1 },
  { emoji: '🧂', uzbek: 'tuz', english: 'salt', russian: 'соль', band: 1 },
  { emoji: '🐜', uzbek: 'chumoli', english: 'an ant', russian: 'муравей', band: 1 },

  // Band 2 — 100–990 soʻm.
  { emoji: '📎', uzbek: 'qisqich', english: 'a paperclip', russian: 'скрепка', band: 2 },
  { emoji: '🔥', uzbek: 'gugurt', english: 'a match', russian: 'спичка', band: 2 },
  { emoji: '🧵', uzbek: 'ip', english: 'thread', russian: 'нитка', band: 2 },
  { emoji: '🔘', uzbek: 'tugma', english: 'a button', russian: 'пуговица', band: 2 },
  { emoji: '📄', uzbek: "qog'oz", english: 'a sheet of paper', russian: 'лист бумаги', band: 2 },
  { emoji: '🍬', uzbek: 'saqich', english: 'chewing gum', russian: 'жвачка', band: 2 },

  // Band 3 — 1 000–9 900 soʻm.
  { emoji: '🛍️', uzbek: 'paket', english: 'a carrier bag', russian: 'пакет', band: 3 },
  { emoji: '🖊️', uzbek: 'ruchka', english: 'a pen', russian: 'ручка', band: 3 },
  { emoji: '📰', uzbek: 'gazeta', english: 'a newspaper', russian: 'газета', band: 3 },
  { emoji: '🧼', uzbek: 'sovun', english: 'soap', russian: 'мыло', band: 3 },
  { emoji: '🥚', uzbek: 'tuxum', english: 'an egg', russian: 'яйцо', band: 3 },
  { emoji: '🍭', uzbek: 'konfet', english: 'a sweet', russian: 'конфета', band: 3 },

  // Band 4 — 10 000–99 000 soʻm. Real prices start here.
  { emoji: '🥖', uzbek: 'non', english: 'bread', russian: 'хлеб', band: 4 },
  { emoji: '🍵', uzbek: 'choy', english: 'tea', russian: 'чай', band: 4 },
  { emoji: '🥛', uzbek: 'sut', english: 'milk', russian: 'молоко', band: 4 },
  { emoji: '🍎', uzbek: 'olma', english: 'apples', russian: 'яблоки', band: 4 },
  { emoji: '🍅', uzbek: 'pomidor', english: 'tomatoes', russian: 'помидоры', band: 4 },
  { emoji: '🥟', uzbek: 'somsa', english: 'a samsa', russian: 'самса', band: 4 },
  { emoji: '🧃', uzbek: 'sharbat', english: 'juice', russian: 'сок', band: 4 },
  { emoji: '☕', uzbek: 'kofe', english: 'coffee', russian: 'кофе', band: 4 },
  { emoji: '🌷', uzbek: 'gul', english: 'a flower', russian: 'цветок', band: 4 },
  { emoji: '🧀', uzbek: 'pishloq', english: 'cheese', russian: 'сыр', band: 4 },

  // Band 5 — 100 000–990 000 soʻm.
  { emoji: '🍲', uzbek: 'osh', english: 'plov', russian: 'плов', band: 5 },
  { emoji: '🍢', uzbek: 'kabob', english: 'kebabs', russian: 'шашлык', band: 5 },
  { emoji: '🍰', uzbek: 'tort', english: 'a cake', russian: 'торт', band: 5 },
  { emoji: '📚', uzbek: 'kitob', english: 'a book', russian: 'книга', band: 5 },
  { emoji: '🧲', uzbek: 'magnit', english: 'a fridge magnet', russian: 'магнит на холодильник', band: 5 },
  { emoji: '🚕', uzbek: 'taksi', english: 'a taxi ride', russian: 'поездка на такси', band: 5 },
  { emoji: '🎫', uzbek: 'chipta', english: 'a ticket', russian: 'билет', band: 5 },
  { emoji: '💊', uzbek: 'dori', english: 'medicine', russian: 'лекарство', band: 5 },
  { emoji: '☂️', uzbek: 'soyabon', english: 'an umbrella', russian: 'зонт', band: 5 },
  { emoji: '🧣', uzbek: "ro'mol", english: 'a scarf', russian: 'платок', band: 5 },
  { emoji: '🏺', uzbek: 'sopol', english: 'pottery', russian: 'керамика', band: 5 },
  { emoji: '🧢', uzbek: "do'ppi", english: 'a skullcap', russian: 'тюбетейка', band: 5 },

  // Band 6 — 1–9.9 million soʻm.
  { emoji: '👗', uzbek: "ko'ylak", english: 'a dress', russian: 'платье', band: 6 },
  { emoji: '📱', uzbek: 'telefon', english: 'a phone', russian: 'телефон', band: 6 },
  { emoji: '👜', uzbek: 'sumka', english: 'a handbag', russian: 'сумка', band: 6 },
  { emoji: '👟', uzbek: 'poyabzal', english: 'shoes', russian: 'обувь', band: 6 },
  { emoji: '⌚', uzbek: 'soat', english: 'a watch', russian: 'часы', band: 6 },
  { emoji: '🧳', uzbek: 'chamadon', english: 'a suitcase', russian: 'чемодан', band: 6 },
  { emoji: '🧥', uzbek: 'palto', english: 'a coat', russian: 'пальто', band: 6 },
  { emoji: '🎸', uzbek: 'gitara', english: 'a guitar', russian: 'гитара', band: 6 },
  { emoji: '🧸', uzbek: "o'yinchoq", english: 'a toy', russian: 'игрушка', band: 6 },
  { emoji: '🎩', uzbek: 'shlyapa', english: 'a hat', russian: 'шляпа', band: 6 },
  { emoji: '🚲', uzbek: 'velosiped', english: 'a bicycle', russian: 'велосипед', band: 6 },
  { emoji: '🛏️', uzbek: 'xona', english: 'a hotel room', russian: 'номер в гостинице', band: 6 },

  // Band 7 — 10 million soʻm and up. The endless top of the ladder.
  { emoji: '💻', uzbek: 'kompyuter', english: 'a computer', russian: 'компьютер', band: 7 },
  { emoji: '📺', uzbek: 'televizor', english: 'a television', russian: 'телевизор', band: 7 },
  { emoji: '🛋️', uzbek: 'divan', english: 'a sofa', russian: 'диван', band: 7 },
  { emoji: '🧊', uzbek: 'muzlatgich', english: 'a fridge', russian: 'холодильник', band: 7 },
  { emoji: '💍', uzbek: 'uzuk', english: 'a ring', russian: 'кольцо', band: 7 },
  { emoji: '✈️', uzbek: 'aviachipta', english: 'a plane ticket', russian: 'авиабилет', band: 7 },
  { emoji: '🛵', uzbek: 'mototsikl', english: 'a motorbike', russian: 'мотоцикл', band: 7 },
  { emoji: '🎹', uzbek: 'pianino', english: 'a piano', russian: 'пианино', band: 7 },
  { emoji: '🐎', uzbek: 'ot', english: 'a horse', russian: 'лошадь', band: 7 },
  { emoji: '🚗', uzbek: 'mashina', english: 'a car', russian: 'машина', band: 7 },
]

/**
 * How many items each band serves before the prices step up a decimal place.
 *
 * The cheap bands are a warm-up and go by quickly; the bands that matter — the
 * hundreds of thousands and the millions, where a traveller's actual prices
 * live — are the long ones. The last band never ends: once you are counting in
 * tens of millions the game just keeps dealing until you fill the bin.
 */
export const BANDS: readonly number[] = [3, 3, 3, 3, 4, 6, 8, Infinity]

/** The band the ladder tops out at. */
export const TOP_BAND = BANDS.length - 1

/** The whole run happens between the ramp (0) and the bin (1). */
const BIN_POSITION = 1

/** How many items' worth of belt there is between the ramp and the bin. */
export const BELT_SLOTS = 3

/** Items may not close up tighter than this, so tags never overlap. */
const MIN_GAP = 0.9 / BELT_SLOTS

/** Bin this many and the run is over. */
export const BIN_CAPACITY = 3

/** Seconds a learner gets per spoken word, at the bottom and top of the ramp. */
const START_MS_PER_TOKEN = 2000
const FASTEST_MS_PER_TOKEN = 1000
/** The band where the belt reaches full speed — the millions. */
const FASTEST_BAND = 6

/**
 * Milliseconds of belt time per spoken word of the price.
 *
 * Budgeting per *word* rather than per item is what keeps the ramp fair: a
 * one-word price at the start gets its two seconds, and a four-word price in
 * the millions gets four times a shorter second. The item as a whole is on the
 * belt for `BELT_SLOTS` times this, since it spends most of that queueing
 * behind the items ahead of it.
 */
export function msPerToken(band: number): number {
  const t = Math.min(1, Math.max(0, band / FASTEST_BAND))
  return Math.round(START_MS_PER_TOKEN + (FASTEST_MS_PER_TOKEN - START_MS_PER_TOKEN) * t)
}

/** A price for `band`: one significant digit at the bottom, two above it. */
export function priceForBand(band: number, rng: () => number = Math.random): number {
  if (band <= 0) return 1 + Math.floor(rng() * 9)
  const significand = 10 + Math.floor(rng() * 90)
  return significand * 10 ** (band - 1)
}

// --- The bonus round --------------------------------------------------------

/** Correct items needed before the bonus round can be rolled for at all. */
export const BONUS_MIN_CLEARED = 10
/** Chance per cleared item, once eligible. Rolled at most once a run. */
export const BONUS_CHANCE = 0.2
/** Items in a bonus round. */
export const BONUS_ITEMS = 10
/** The bonus belt is kinder: keying six digits takes longer than saying them. */
const BONUS_MS_PER_TOKEN = 900

const BONUS_SIGNIFICANDS = [
  10, 12, 15, 18, 20, 23, 25, 28, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90,
]
const BONUS_EXPONENTS = [2, 3, 4, 5, 6]

/**
 * The hundred prices the bonus round can read aloud — two significant digits,
 * spanning a boiled sweet (1 000 soʻm) to a very good carpet (90 million).
 *
 * This list is fixed and mirrored in scripts/generate_audio.py, because the
 * bonus round is a *listening* exercise: it needs a whole number spoken
 * naturally, which stitched-together word clips cannot do. Change the rule
 * here and the generator must change with it, or the round falls back to the
 * browser's synthesiser.
 */
export const BONUS_PRICES: readonly number[] = BONUS_EXPONENTS.flatMap((exponent) =>
  BONUS_SIGNIFICANDS.map((significand) => significand * 10 ** exponent),
)

// --- State ------------------------------------------------------------------

export interface BeltItem {
  id: number
  item: BazarItem
  price: number
  /**
   * What has to be entered, in order: the spoken Uzbek words of the price, or
   * — in the bonus round, where the price is heard rather than read — its
   * digits.
   */
  tokens: string[]
  /** The register offered while this item is at the front of the belt. */
  keys: string[]
  /** How many tokens are in, i.e. how many dots have gone green. */
  typed: number
  /** 0 at the ramp, 1 at the bin. */
  position: number
  /** Milliseconds to cross the whole belt. */
  travelMs: number
  /** Bonus items hide their price and never reach the bin. */
  bonus: boolean
}

export type Phase = 'shop' | 'bonus'

export interface BazarState {
  status: 'ready' | 'playing' | 'over'
  phase: Phase
  /** Front of the belt (nearest the bin) first. */
  items: BeltItem[]
  /** Total soʻm in the trolley — the score. */
  score: number
  /** Items priced correctly, across both phases. */
  cleared: number
  /** Items in the bin. `BIN_CAPACITY` of them ends the run. */
  binned: number
  band: number
  /** Items dealt in the current band, against `BANDS[band]`. */
  dealt: number
  /** Bonus items still to deal; 0 outside a bonus round. */
  bonusLeft: number
  /** Set when the bonus has been rolled, so it happens at most once a run. */
  bonusUsed: boolean
  /** True between winning the bonus and the shop belt draining for it. */
  bonusPending: boolean
  nextId: number
}

function shuffleWith<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * The register for a price: every word it needs, padded out with number words
 * it does not, then shuffled.
 *
 * A one-word price gets four buttons and anything longer gets eight, so the
 * grid grows with the difficulty rather than starting at its hardest. The
 * padding is drawn family-first — other tens against a tens word, other scale
 * words against "ming" — because a register of obvious duds is not a choice.
 */
export function buildKeys(tokens: readonly string[], rng: () => number = Math.random): string[] {
  const needed = [...new Set(tokens)]
  const size = Math.max(tokens.length === 1 ? 4 : 8, needed.length)
  const rest = UZBEK_NUMBER_WORDS.filter((word) => !needed.includes(word))
  const family = (word: string) => (UZBEK_NUMBER_WORDS.indexOf(word) / 9) | 0
  const families = new Set(needed.map(family))
  const near = shuffleWith(rest.filter((w) => families.has(family(w))), rng)
  const far = shuffleWith(rest.filter((w) => !families.has(family(w))), rng)
  return shuffleWith([...needed, ...near, ...far].slice(0, size), rng)
}

/**
 * The calculator keypad the bonus round replaces the register with — laid out
 * in reading order for a three-column grid, so 7-8-9 sits on the top row the
 * way a till or a calculator has it, not a phone.
 */
export const KEYPAD: readonly string[] = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0']

function makeItem(
  id: number,
  item: BazarItem,
  price: number,
  tokens: string[],
  keys: string[],
  msPerTokenValue: number,
  bonus: boolean,
): BeltItem {
  return {
    id,
    item,
    price,
    tokens,
    keys,
    typed: 0,
    position: 0,
    travelMs: msPerTokenValue * tokens.length * BELT_SLOTS,
    bonus,
  }
}

/** An item from `band`, avoiding whatever is already on the belt where it can. */
function pickItem(band: number, onBelt: readonly BeltItem[], rng: () => number): BazarItem {
  const stock = ITEMS.filter((i) => i.band === band)
  const inPlay = new Set(onBelt.map((b) => b.item.uzbek))
  const fresh = stock.filter((i) => !inPlay.has(i.uzbek))
  const pool = fresh.length ? fresh : stock
  return pool[Math.floor(rng() * pool.length) % pool.length]
}

function dealShopItem(state: BazarState, rng: () => number): BeltItem {
  const item = pickItem(state.band, state.items, rng)
  const price = priceForBand(state.band, rng)
  const tokens = uzbekCardinalTokens(price)
  return makeItem(state.nextId, item, price, tokens, buildKeys(tokens, rng), msPerToken(state.band), false)
}

function dealBonusItem(state: BazarState, rng: () => number): BeltItem {
  // Bonus stock comes from the bands where the price would be believable, so
  // a 90-million-soʻm price never turns up on a boiled sweet.
  const price = BONUS_PRICES[Math.floor(rng() * BONUS_PRICES.length) % BONUS_PRICES.length]
  const band = Math.min(TOP_BAND, String(price).length - 1)
  const item = pickItem(band, state.items, rng)
  const tokens = [...String(price)]
  return makeItem(state.nextId, item, price, tokens, [...KEYPAD], BONUS_MS_PER_TOKEN, true)
}

/** A run waiting for its first tap. */
export function createGame(rng: () => number = Math.random): BazarState {
  const empty: BazarState = {
    status: 'ready',
    phase: 'shop',
    items: [],
    score: 0,
    cleared: 0,
    binned: 0,
    band: 0,
    dealt: 0,
    bonusLeft: 0,
    bonusUsed: false,
    bonusPending: false,
    nextId: 1,
  }
  // Deal the first item up front so the ready screen shows what is coming.
  return deal(empty, rng)
}

/** Starts a `ready` game; any other status is returned untouched. */
export function startGame(state: BazarState): BazarState {
  return state.status === 'ready' ? { ...state, status: 'playing' } : state
}

/** Puts the next item on the ramp, stepping the band up when one is served out. */
function deal(state: BazarState, rng: () => number): BazarState {
  if (state.phase === 'bonus') {
    if (state.bonusLeft <= 0) return state
    return {
      ...state,
      items: [...state.items, dealBonusItem(state, rng)],
      bonusLeft: state.bonusLeft - 1,
      nextId: state.nextId + 1,
    }
  }
  // A won bonus round starts as soon as the shop belt is clear, so nothing
  // gets binned while the till changes over.
  if (state.bonusPending) return state

  const stepped =
    state.dealt >= BANDS[state.band] && state.band < TOP_BAND
      ? { ...state, band: state.band + 1, dealt: 0 }
      : state
  return {
    ...stepped,
    items: [...stepped.items, dealShopItem(stepped, rng)],
    dealt: stepped.dealt + 1,
    nextId: stepped.nextId + 1,
  }
}

/** Whether the belt has room for another item behind the ones already on it. */
function needsItem(state: BazarState): boolean {
  const last = state.items[state.items.length - 1]
  return !last || last.position >= 1 / BELT_SLOTS
}

export interface Advance {
  state: BazarState
  /** Items that reached the bin on this step — the caller flashes them. */
  binned: BeltItem[]
  /** True on the step the bonus round takes over the till. */
  bonusStarted: boolean
}

/**
 * Moves the belt on by `dtMs`: items advance, anything that runs off the end
 * unpriced goes in the bin, and the ramp is topped up behind them.
 */
export function advance(
  state: BazarState,
  dtMs: number,
  rng: () => number = Math.random,
): Advance {
  if (state.status !== 'playing' || dtMs <= 0) {
    return { state, binned: [], bonusStarted: false }
  }

  // Front of the belt first, so each item can be held behind the one ahead.
  const moved: BeltItem[] = []
  for (const item of state.items) {
    const ahead = moved[moved.length - 1]
    const free = item.position + dtMs / item.travelMs
    const blocked = ahead ? ahead.position - MIN_GAP : BIN_POSITION
    moved.push({ ...item, position: Math.min(free, Math.max(item.position, blocked)) })
  }

  const binned = moved.filter((i) => i.position >= BIN_POSITION && !i.bonus)
  // A bonus item that runs off the end is simply missed — the round is a
  // reward, and its whole point is that nothing can end the run during it.
  let next: BazarState = {
    ...state,
    items: moved.filter((i) => i.position < BIN_POSITION),
    binned: state.binned + binned.length,
  }

  let bonusStarted = false
  if (!next.items.length) {
    if (next.phase === 'bonus' && next.bonusLeft <= 0) {
      // All ten dealt and off the belt — hand the till back to the shop. A
      // belt that empties with items still to come is just a fast player.
      next = { ...next, phase: 'shop' }
    } else if (next.phase === 'shop' && next.bonusPending) {
      next = { ...next, phase: 'bonus', bonusPending: false, bonusLeft: BONUS_ITEMS }
      bonusStarted = true
    }
  }

  if (next.binned >= BIN_CAPACITY) {
    return { state: { ...next, status: 'over' }, binned, bonusStarted }
  }
  if (needsItem(next)) next = deal(next, rng)

  return { state: next, binned, bonusStarted }
}

export interface Press {
  state: BazarState
  /** False when the token was refused — the caller flashes a red X. */
  accepted: boolean
  /** The item that went into the trolley on this press, if any. */
  bagged: BeltItem | null
}

/**
 * Enters one token against the item at the front of the belt.
 *
 * Tokens go in spoken order and a wrong one is simply refused: it costs
 * nothing but the time it took, which on a moving belt is cost enough. When
 * the last one lands the item is bagged, its price is added to the score, and
 * the caller reads the price aloud.
 */
export function pressToken(
  state: BazarState,
  token: string,
  rng: () => number = Math.random,
): Press {
  const front = state.items[0]
  if (state.status !== 'playing' || !front) return { state, accepted: false, bagged: null }
  if (front.tokens[front.typed] !== token) return { state, accepted: false, bagged: null }

  const typed = front.typed + 1
  if (typed < front.tokens.length) {
    return {
      state: { ...state, items: [{ ...front, typed }, ...state.items.slice(1)] },
      accepted: true,
      bagged: null,
    }
  }

  const bagged = { ...front, typed }
  let next: BazarState = {
    ...state,
    items: state.items.slice(1),
    score: state.score + front.price,
    cleared: state.cleared + 1,
  }
  next = rollBonus(next, rng)
  return { state: next, accepted: true, bagged }
}

/**
 * Rolls for the bonus round after a bagged item. It needs a player who is
 * clearly coping — `BONUS_MIN_CLEARED` items in — and then comes up about one
 * item in five, once a run.
 */
function rollBonus(state: BazarState, rng: () => number): BazarState {
  if (state.bonusUsed || state.phase === 'bonus') return state
  if (state.cleared < BONUS_MIN_CLEARED) return state
  if (rng() >= BONUS_CHANCE) return state
  return { ...state, bonusUsed: true, bonusPending: true }
}

/** The register showing under the belt: the front item's keys, or none. */
export function registerKeys(state: BazarState): readonly string[] {
  return state.items[0]?.keys ?? []
}

// --- High score -------------------------------------------------------------

const HIGH_SCORE_KEY = 'lugatcha.bazarHighScore'

export function readHighScore(): number {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY)
    const n = raw === null ? 0 : Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

/** Stores `score` if it beats the stored best; true when it did. */
export function recordHighScore(score: number): boolean {
  if (score <= readHighScore()) return false
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score))
  } catch {
    // private mode — the run still counts, it just is not remembered
  }
  return true
}

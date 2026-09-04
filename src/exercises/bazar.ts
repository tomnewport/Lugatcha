/**
 * "Bazar hero" — the mini-game where you price up a market stall (issue #170).
 *
 * Items ride a conveyor belt towards the till. Each wears a pricetag in soʻm,
 * and to get it into the trolley you have to *say* that price: the register
 * below the belt is a six-button grid of Uzbek number words, and you tap them
 * in spoken order — "ikki", "yuz", "o'ttiz", "ming". The board only ever
 * offers the word you need now and the one after it, and half of it swaps out
 * on every correct tap (see the register section below). Grey dots under the
 * tag show how many words the price takes and go green as you find them. Miss an item
 * before it reaches the end of the belt and it drops in the bin; three in the
 * bin and the run is over. Your score is the total value of what you bagged,
 * so the game rewards keeping up as the prices climb.
 *
 * The ramp is the numbers themselves. A run opens on joke items priced in
 * single soʻm — you genuinely cannot buy anything for 8 soʻm — and climbs a
 * band at a time through tens, hundreds and thousands until it settles where a
 * traveller actually spends: hundreds of thousands and millions of soʻm, which
 * is roughly £6–£600. The belt speeds up as it climbs too, from four seconds a
 * word down to well under one.
 *
 * Magnitude alone runs out of road: once the ladder tops out in the tens of
 * millions, "ikki yuz ming" over and over is a chore rather than a challenge.
 * So the *precision* ramps as well, and it never stops. Prices open on two
 * significant figures and every `SIG_FIG_STEP` items priced correctly buys
 * another one. Each new figure resets the ladder to the smallest band that can
 * carry it — hundreds for three figures, thousands for four — so the number
 * gets longer as the magnitude drops back, and then climbs again, with the
 * clock tightening for each figure earned and never stopping. The only ceiling
 * is `MAX_SIG_FIGS`, which is not a design decision but the point where Uzbek,
 * as this app speaks it, runs out of scale words.
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
import { uzbekCardinalTokens, MAX_UZBEK_CARDINAL, UZBEK_NUMBER_WORDS } from './numbers'

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
  /**
   * What the thing honestly costs at a bozor, in soʻm — the low and high of a
   * fair price for it. A price is dealt first and the stall then offers
   * something that could really carry it, so these ranges are what keeps a
   * cake from turning up at forty pounds.
   */
  from: number
  to: number
}

/**
 * The stock, cheapest first, priced as of 2025 and deliberately loose: these
 * are the range a traveller would recognise as fair, not a price list. £1 is
 * about 16 000 soʻm (see `SOM_PER_UNIT`), so a 350 000 soʻm cake is about £22.
 *
 * The bottom of the list is the joke stretch: at a few soʻm nothing real is
 * for sale, so the stall sells air, smoke and shadows, drifting towards things
 * that might *just* cost a few hundred — a paperclip, a match, a sheet of
 * paper. From bread on it is a shopping list you could take to a bozor, ending
 * in the big-ticket items a very good run earns the right to see.
 *
 * Between them the ranges have to cover every price the ladder can deal
 * without a gap, or a price arrives with nothing to put it on; `LUXURIES`
 * catches the far end, where the numbers stop being real at all.
 */
export const ITEMS: readonly BazarItem[] = [
  // Not things. Ideas of things.
  { emoji: '🌬️', uzbek: 'havo', english: 'air', russian: 'воздух', from: 1, to: 9 },
  { emoji: '🚬', uzbek: 'tutun', english: 'smoke', russian: 'дым', from: 1, to: 9 },
  { emoji: '🍂', uzbek: 'barg', english: 'a leaf', russian: 'лист', from: 1, to: 9 },
  { emoji: '🪨', uzbek: 'tosh', english: 'a pebble', russian: 'камешек', from: 1, to: 9 },
  { emoji: '🌑', uzbek: 'soya', english: 'a shadow', russian: 'тень', from: 1, to: 9 },
  { emoji: '💨', uzbek: 'chang', english: 'dust', russian: 'пыль', from: 1, to: 9 },
  { emoji: '⏳', uzbek: 'qum', english: 'sand', russian: 'песок', from: 10, to: 99 },
  { emoji: '💧', uzbek: 'tomchi', english: 'a drop', russian: 'капля', from: 10, to: 99 },
  { emoji: '🫧', uzbek: 'pufak', english: 'a bubble', russian: 'пузырь', from: 10, to: 99 },
  { emoji: '🪶', uzbek: 'pat', english: 'a feather', russian: 'перо', from: 10, to: 99 },
  { emoji: '🧂', uzbek: 'tuz', english: 'a pinch of salt', russian: 'щепотка соли', from: 10, to: 99 },
  { emoji: '🐜', uzbek: 'chumoli', english: 'an ant', russian: 'муравей', from: 10, to: 99 },

  // Small change: real things, but only just.
  { emoji: '📎', uzbek: 'qisqich', english: 'a paperclip', russian: 'скрепка', from: 100, to: 500 },
  { emoji: '🔥', uzbek: 'gugurt', english: 'a match', russian: 'спичка', from: 100, to: 300 },
  { emoji: '📄', uzbek: "qog'oz", english: 'a sheet of paper', russian: 'лист бумаги', from: 100, to: 600 },
  { emoji: '🔘', uzbek: 'tugma', english: 'a button', russian: 'пуговица', from: 200, to: 1_000 },
  { emoji: '🧵', uzbek: 'ip', english: 'thread', russian: 'нитка', from: 300, to: 2_000 },
  { emoji: '🍭', uzbek: 'konfet', english: 'a sweet', russian: 'конфета', from: 500, to: 2_000 },
  { emoji: '🛍️', uzbek: 'paket', english: 'a carrier bag', russian: 'пакет', from: 500, to: 2_000 },
  { emoji: '🍬', uzbek: 'saqich', english: 'chewing gum', russian: 'жвачка', from: 1_000, to: 4_000 },
  { emoji: '🥚', uzbek: 'tuxum', english: 'an egg', russian: 'яйцо', from: 1_200, to: 2_500 },
  { emoji: '📰', uzbek: 'gazeta', english: 'a newspaper', russian: 'газета', from: 2_000, to: 5_000 },
  { emoji: '🖊️', uzbek: 'ruchka', english: 'a pen', russian: 'ручка', from: 2_000, to: 6_000 },
  { emoji: '🥖', uzbek: 'non', english: 'bread', russian: 'хлеб', from: 2_500, to: 6_000 },
  { emoji: '🧼', uzbek: 'sovun', english: 'soap', russian: 'мыло', from: 5_000, to: 15_000 },

  // The daily shop.
  { emoji: '🥟', uzbek: 'somsa', english: 'a samsa', russian: 'самса', from: 8_000, to: 15_000 },
  { emoji: '🍅', uzbek: 'pomidor', english: 'tomatoes', russian: 'помидоры', from: 8_000, to: 18_000 },
  { emoji: '🍵', uzbek: 'choy', english: 'a pot of tea', russian: 'чайник чая', from: 8_000, to: 20_000 },
  { emoji: '🥛', uzbek: 'sut', english: 'milk', russian: 'молоко', from: 10_000, to: 18_000 },
  { emoji: '🍎', uzbek: 'olma', english: 'apples', russian: 'яблоки', from: 10_000, to: 20_000 },
  { emoji: '🌷', uzbek: 'gul', english: 'a flower', russian: 'цветок', from: 10_000, to: 30_000 },
  { emoji: '🧃', uzbek: 'sharbat', english: 'juice', russian: 'сок', from: 12_000, to: 25_000 },
  { emoji: '🧲', uzbek: 'magnit', english: 'a fridge magnet', russian: 'магнит на холодильник', from: 15_000, to: 40_000 },
  { emoji: '💊', uzbek: 'dori', english: 'medicine', russian: 'лекарство', from: 15_000, to: 150_000 },
  { emoji: '☕', uzbek: 'kofe', english: 'a coffee', russian: 'кофе', from: 18_000, to: 40_000 },
  { emoji: '🚕', uzbek: 'taksi', english: 'a taxi ride', russian: 'поездка на такси', from: 20_000, to: 70_000 },
  { emoji: '🍲', uzbek: 'osh', english: 'a plate of plov', russian: 'порция плова', from: 25_000, to: 50_000 },
  { emoji: '🧸', uzbek: "o'yinchoq", english: 'a toy', russian: 'игрушка', from: 30_000, to: 400_000 },
  { emoji: '🍢', uzbek: 'kabob', english: 'kebabs', russian: 'шашлык', from: 30_000, to: 70_000 },
  { emoji: '🎫', uzbek: 'chipta', english: 'a ticket', russian: 'билет', from: 30_000, to: 120_000 },
  { emoji: '📚', uzbek: 'kitob', english: 'a book', russian: 'книга', from: 40_000, to: 150_000 },
  { emoji: '🧀', uzbek: 'pishloq', english: 'cheese', russian: 'сыр', from: 50_000, to: 120_000 },
  { emoji: '☂️', uzbek: 'soyabon', english: 'an umbrella', russian: 'зонт', from: 50_000, to: 150_000 },

  // Worth going home with.
  { emoji: '🧢', uzbek: "do'ppi", english: 'a skullcap', russian: 'тюбетейка', from: 60_000, to: 250_000 },
  { emoji: '🧣', uzbek: "ro'mol", english: 'a scarf', russian: 'платок', from: 60_000, to: 250_000 },
  { emoji: '🏺', uzbek: 'sopol', english: 'pottery', russian: 'керамика', from: 70_000, to: 400_000 },
  { emoji: '🎩', uzbek: 'shlyapa', english: 'a hat', russian: 'шляпа', from: 80_000, to: 400_000 },
  { emoji: '🍰', uzbek: 'tort', english: 'a cake', russian: 'торт', from: 120_000, to: 350_000 },
  { emoji: '👗', uzbek: "ko'ylak", english: 'a dress', russian: 'платье', from: 200_000, to: 900_000 },
  { emoji: '👜', uzbek: 'sumka', english: 'a handbag', russian: 'сумка', from: 200_000, to: 1_500_000 },
  { emoji: '🛏️', uzbek: 'xona', english: 'a night in a hotel', russian: 'ночь в гостинице', from: 250_000, to: 1_200_000 },
  { emoji: '⌚', uzbek: 'soat', english: 'a watch', russian: 'часы', from: 250_000, to: 3_000_000 },
  { emoji: '👟', uzbek: 'poyabzal', english: 'shoes', russian: 'обувь', from: 300_000, to: 1_500_000 },
  { emoji: '🧳', uzbek: 'chamadon', english: 'a suitcase', russian: 'чемодан', from: 400_000, to: 1_800_000 },
  { emoji: '🧥', uzbek: 'palto', english: 'a coat', russian: 'пальто', from: 600_000, to: 3_000_000 },
  { emoji: '🎸', uzbek: 'gitara', english: 'a guitar', russian: 'гитара', from: 800_000, to: 4_000_000 },
  { emoji: '🚲', uzbek: 'velosiped', english: 'a bicycle', russian: 'велосипед', from: 1_200_000, to: 6_000_000 },

  // The end of the ladder, where a very good run gets to.
  { emoji: '💍', uzbek: 'uzuk', english: 'a ring', russian: 'кольцо', from: 1_500_000, to: 20_000_000 },
  { emoji: '📱', uzbek: 'telefon', english: 'a phone', russian: 'телефон', from: 1_500_000, to: 9_000_000 },
  { emoji: '✈️', uzbek: 'aviachipta', english: 'a plane ticket', russian: 'авиабилет', from: 2_500_000, to: 12_000_000 },
  { emoji: '📺', uzbek: 'televizor', english: 'a television', russian: 'телевизор', from: 3_000_000, to: 18_000_000 },
  { emoji: '🛋️', uzbek: 'divan', english: 'a sofa', russian: 'диван', from: 3_000_000, to: 15_000_000 },
  { emoji: '💻', uzbek: 'kompyuter', english: 'a computer', russian: 'компьютер', from: 5_000_000, to: 25_000_000 },
  { emoji: '🧊', uzbek: 'muzlatgich', english: 'a fridge', russian: 'холодильник', from: 5_000_000, to: 20_000_000 },
  { emoji: '🛵', uzbek: 'mototsikl', english: 'a motorbike', russian: 'мотоцикл', from: 10_000_000, to: 50_000_000 },
  { emoji: '🎹', uzbek: 'pianino', english: 'a piano', russian: 'пианино', from: 12_000_000, to: 60_000_000 },
  { emoji: '🐎', uzbek: 'ot', english: 'a horse', russian: 'лошадь', from: 15_000_000, to: 70_000_000 },
  { emoji: '🚗', uzbek: 'mashina', english: 'a car', russian: 'машина', from: 70_000_000, to: 500_000_000 },
]

/** The dearest thing on the stall. */
const DEAREST = Math.max(...ITEMS.map((item) => item.to))

/**
 * What the stall offers for a price nothing on it could honestly carry.
 *
 * The precision ramp keeps going after the prices stop being real (see
 * `MAX_SIG_FIGS`), so somebody has to sell you a fridge for eight billion
 * soʻm. It is the top tier that does it — everything within a decade of the
 * dearest thing here — which keeps some variety up there and keeps the joke
 * the right way round: absurd prices on the things that were dear anyway.
 */
export const LUXURIES: readonly BazarItem[] = ITEMS.filter((item) => item.to * 10 >= DEAREST)

/**
 * How many prices each band deals before the ladder steps up a decimal place.
 *
 * The cheap bands are a warm-up and go by quickly; the bands that matter — the
 * hundreds of thousands and the millions, where a traveller's actual prices
 * live — are the long ones. The last one never ends: once you are counting in
 * tens of millions the ladder stays there until a new significant figure
 * restarts it (see `bandFloor`).
 */
export const BANDS: readonly number[] = [3, 3, 3, 3, 4, 6, 8, Infinity]

/**
 * The highest band the climb steps up to — the tens of millions, which is a
 * car. Prices above it exist, but only a significant-figure reset puts the
 * ladder there (see `bandFloor`), and by then nothing on the stall is really
 * worth that (see `LUXURIES`).
 */
export const TOP_BAND = BANDS.length - 1

/** The whole run happens between the ramp (0) and the bin (1). */
const BIN_POSITION = 1

/** How many items' worth of belt there is between the ramp and the bin. */
export const BELT_SLOTS = 3

/**
 * Items may not close up tighter than this, so tags never overlap. A pricetag
 * leads with the price at full size and carries a row of word dots under it,
 * which makes an item about four tenths of the belt tall — the gap has to
 * clear that or two tags collide on screen.
 */
export const MIN_GAP = 1.2 / BELT_SLOTS

/** Bin this many and the run is over. */
export const BIN_CAPACITY = 3

/** Milliseconds a learner gets per spoken word, at the bottom and top of the ramp. */
const START_MS_PER_TOKEN = 4000
const FASTEST_MS_PER_TOKEN = 800
/** The band where the belt ramp reaches full speed — the tens of thousands. */
const FASTEST_BAND = 4
/**
 * What each significant figure past the second does to the clock.
 *
 * It compounds with the band ramp rather than replacing it, so the reset that
 * comes with a new figure is a genuine breather — a shorter belt time on a
 * much smaller number — and the endgame, four figures in the tens of millions,
 * is the fastest the game ever gets.
 */
const SIG_FIG_SPEEDUP = 0.9

/**
 * Milliseconds of belt time per spoken word of the price.
 *
 * Budgeting per *word* rather than per item is what keeps the ramp fair: a
 * one-word price at the start gets its four seconds, and a seven-word price in
 * the millions gets seven times a much shorter one. The item as a whole is on
 * the belt for `BELT_SLOTS` times this, since it spends most of that queueing
 * behind the items ahead of it.
 */
export function msPerToken(band: number, sigFigs: number = MIN_SIG_FIGS): number {
  const t = Math.min(1, Math.max(0, band / FASTEST_BAND))
  const base = START_MS_PER_TOKEN + (FASTEST_MS_PER_TOKEN - START_MS_PER_TOKEN) * t
  // No floor under this: the band ramp bottoms out, but the figures keep being
  // earned and keep taking their tenth off, so the game goes on getting faster
  // for as long as a player goes on deserving it.
  return Math.round(base * SIG_FIG_SPEEDUP ** Math.max(0, sigFigs - MIN_SIG_FIGS))
}

// --- Precision --------------------------------------------------------------

/** Significant figures a price opens on. */
export const MIN_SIG_FIGS = 2

/**
 * The last band there is: the biggest decade `uzbekCardinalTokens` can still
 * read out. Uzbek borrows scale words from Russian and this app has learned as
 * far as *milliard*, so the ladder ends in the hundreds of billions of soʻm.
 */
export const MAX_BAND = String(MAX_UZBEK_CARDINAL).length - 1

/**
 * The most significant figures a price can carry: enough to fill the last
 * band, every digit of it significant.
 *
 * There is no design cap on the precision — the board is six buttons whatever
 * the price does (see the register section), so nothing on screen has to grow
 * to keep up, and the figures go on being earned for as long as a player keeps
 * clearing items. This is only where the language this app speaks runs out of
 * words for the number, and it takes some `SIG_FIG_STEP * 10` correct items to
 * get there. Teach `numbers.ts` a bigger scale word and the ladder gets longer
 * on its own.
 */
export const MAX_SIG_FIGS = MAX_BAND + 1

/** Items priced correctly between one significant figure and the next. */
export const SIG_FIG_STEP = 20

/** How many significant figures a player who has priced `cleared` items reads. */
export function sigFigsFor(cleared: number): number {
  return Math.min(MAX_SIG_FIGS, MIN_SIG_FIGS + Math.floor(cleared / SIG_FIG_STEP))
}

/**
 * The band a new significant figure resets the ladder to: the smallest one
 * whose prices can carry every figure. Three figures start at hundreds, four
 * at thousands, and so on until the ladder runs out of bands to restart in —
 * past that the reset stops happening and only the precision climbs.
 */
export function bandFloor(sigFigs: number): number {
  return Math.min(sigFigs - 1, MAX_BAND)
}

/**
 * A price for `band`, carrying `sigFigs` significant figures — or as many as
 * the band has room for, which is what keeps the opening single soʻm single.
 */
export function priceForBand(
  band: number,
  sigFigs: number = MIN_SIG_FIGS,
  rng: () => number = Math.random,
): number {
  const digits = Math.max(1, Math.min(sigFigs, band + 1))
  const low = 10 ** (digits - 1)
  // Clamped, because an rng that hands back exactly 1 must not carry the
  // significand into the next decade and the price into the next band.
  const significand = Math.min(low * 10 - 1, low + Math.floor(rng() * low * 9))
  return significand * 10 ** (band + 1 - digits)
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
  cells: RegisterCell[]
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
  /** Significant figures the prices currently carry; see `sigFigsFor`. */
  sigFigs: number
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

// --- The register -----------------------------------------------------------

/**
 * The register is six buttons: two rows of three, and each row is a *half*.
 *
 * A four-figure price in the millions is seven words long, and a board big
 * enough to hold a choice for all seven at once would take half the screen and
 * be unreadable at speed. So the board only ever answers two questions: the
 * word you need now, and the one you need next. They sit in opposite halves,
 * so entering a word retires the half it came from — that half fades out and
 * spawns the choice for the word after next, while the half holding your new
 * current word stays exactly where it was. The board churns constantly and
 * never grows, and the two words that matter are always on it.
 */
export const REGISTER_COLUMNS = 3
/** Buttons in one half of the board — a row. */
export const REGISTER_HALF = REGISTER_COLUMNS
/** Buttons on the board at once. */
export const REGISTER_SIZE = REGISTER_HALF * 2

export interface RegisterCell {
  token: string
  /**
   * The half of the board this button belongs to, 0 or 1 — or null on the
   * bonus keypad, which is a fixed board and never swaps.
   */
  half: number | null
  /**
   * Bumped every time the half is refilled. The renderer animates a cell whose
   * seq has moved rather than swapping the word under the player's finger.
   */
  seq: number
}

/**
 * One half of the board: the word `token` needs, plus distractors.
 *
 * The padding is drawn family-first — other tens against a tens word, other
 * scale words against "ming" — because a row of obvious duds is not a choice.
 * Words already on the other half are avoided, so the board never shows the
 * same button twice unless the price itself repeats a word.
 */
function buildHalf(
  token: string | undefined,
  half: number,
  seq: number,
  taken: readonly string[],
  rng: () => number,
): RegisterCell[] {
  // A price can run out of words before the board runs out of halves; the
  // spare one is then all distractors, and the item is finished before it
  // could have been needed.
  const needed = token === undefined ? [] : [token]
  const avoid = new Set([...taken, ...needed])
  const rest = UZBEK_NUMBER_WORDS.filter((word) => !avoid.has(word))
  const family = (word: string) => (UZBEK_NUMBER_WORDS.indexOf(word) / 9) | 0
  const families = new Set(needed.map(family))
  const near = shuffleWith(rest.filter((w) => families.has(family(w))), rng)
  const far = shuffleWith(rest.filter((w) => !families.has(family(w))), rng)
  const words = shuffleWith([...needed, ...near, ...far].slice(0, REGISTER_HALF), rng)
  return words.map((word) => ({ token: word, half, seq }))
}

/** The board a shop item opens on: the first word in one half, the second in the other. */
export function buildRegister(
  tokens: readonly string[],
  rng: () => number = Math.random,
): RegisterCell[] {
  const first = buildHalf(tokens[0], 0, 0, [], rng)
  const second = buildHalf(
    tokens[1],
    1,
    0,
    first.map((cell) => cell.token),
    rng,
  )
  return [...first, ...second]
}

/**
 * The board after the word at `index` has been entered: the half it came from
 * is replaced by the choice for `index + 2`, and the other half — which holds
 * the word now due — is left alone.
 */
export function refillRegister(
  cells: readonly RegisterCell[],
  tokens: readonly string[],
  index: number,
  rng: () => number = Math.random,
): RegisterCell[] {
  const half = index % 2
  const keep = cells.filter((cell) => cell.half !== half)
  const seq = Math.max(...cells.filter((cell) => cell.half === half).map((cell) => cell.seq)) + 1
  const fresh = buildHalf(
    tokens[index + 2],
    half,
    seq,
    keep.map((cell) => cell.token),
    rng,
  )
  // Rebuilt in grid order, because half 0 is the top row and half 1 the bottom.
  return half === 0 ? [...fresh, ...keep] : [...keep, ...fresh]
}

/**
 * The calculator keypad the bonus round replaces the register with — laid out
 * in reading order for a three-column grid, so 7-8-9 sits on the top row the
 * way a till or a calculator has it, not a phone.
 */
export const KEYPAD: readonly string[] = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0']

/** The keypad as a board: ten fixed buttons, none of which ever swaps. */
function keypadCells(): RegisterCell[] {
  return KEYPAD.map((token) => ({ token, half: null, seq: 0 }))
}

function makeItem(
  id: number,
  item: BazarItem,
  price: number,
  tokens: string[],
  cells: RegisterCell[],
  msPerTokenValue: number,
  bonus: boolean,
): BeltItem {
  return {
    id,
    item,
    price,
    tokens,
    cells,
    typed: 0,
    position: 0,
    travelMs: msPerTokenValue * tokens.length * BELT_SLOTS,
    bonus,
  }
}

/**
 * Something the stall could honestly sell for `price`, avoiding whatever is
 * already on the belt where it can.
 *
 * The price comes first and the item answers it, rather than the other way
 * round: that is what keeps every tag believable, because an item only ever
 * appears inside its own range.
 */
function pickItem(price: number, onBelt: readonly BeltItem[], rng: () => number): BazarItem {
  const honest = ITEMS.filter((item) => price >= item.from && price <= item.to)
  const stock = honest.length ? honest : LUXURIES
  const inPlay = new Set(onBelt.map((b) => b.item.uzbek))
  const fresh = stock.filter((i) => !inPlay.has(i.uzbek))
  const pool = fresh.length ? fresh : stock
  return pool[Math.floor(rng() * pool.length) % pool.length]
}

function dealShopItem(state: BazarState, rng: () => number): BeltItem {
  const price = priceForBand(state.band, state.sigFigs, rng)
  const item = pickItem(price, state.items, rng)
  const tokens = uzbekCardinalTokens(price)
  return makeItem(
    state.nextId,
    item,
    price,
    tokens,
    buildRegister(tokens, rng),
    msPerToken(state.band, state.sigFigs),
    false,
  )
}

function dealBonusItem(state: BazarState, rng: () => number): BeltItem {
  const price = BONUS_PRICES[Math.floor(rng() * BONUS_PRICES.length) % BONUS_PRICES.length]
  const item = pickItem(price, state.items, rng)
  const tokens = [...String(price)]
  return makeItem(state.nextId, item, price, tokens, keypadCells(), BONUS_MS_PER_TOKEN, true)
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
    sigFigs: MIN_SIG_FIGS,
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

  // A significant figure earned outranks the band step, and resets the ladder:
  // the number gets longer as the magnitude drops back to where that many
  // figures start, and the climb begins again from there.
  const sigFigs = sigFigsFor(state.cleared)
  const stepped =
    sigFigs > state.sigFigs
      ? { ...state, sigFigs, band: bandFloor(sigFigs), dealt: 0 }
      : state.dealt >= BANDS[state.band] && state.band < TOP_BAND
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
  /** True on the step the prices gained a significant figure. */
  sigFigsUp: boolean
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
    return { state, binned: [], bonusStarted: false, sigFigsUp: false }
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
    return { state: { ...next, status: 'over' }, binned, bonusStarted, sigFigsUp: false }
  }
  const sigFigsBefore = next.sigFigs
  if (needsItem(next)) next = deal(next, rng)

  return { state: next, binned, bonusStarted, sigFigsUp: next.sigFigs > sigFigsBefore }
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
    // The half the word came from retires; the keypad is a fixed board.
    const cells = front.bonus
      ? front.cells
      : refillRegister(front.cells, front.tokens, front.typed, rng)
    return {
      state: { ...state, items: [{ ...front, typed, cells }, ...state.items.slice(1)] },
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

/** The board showing under the belt: the front item's, or none. */
export function registerCells(state: BazarState): readonly RegisterCell[] {
  return state.items[0]?.cells ?? []
}

// --- High score -------------------------------------------------------------

/**
 * Where the best run is kept — and which rules it was scored under.
 *
 * The score is the soʻm value of everything bagged, which only means something
 * against runs played the same way. The significant-figure ramp changed the
 * prices themselves, so a number from before it is not a target any more: the
 * key carries a version, and this release starts the board again rather than
 * leaving an incomparable best up there.
 */
const HIGH_SCORE_KEY = 'lugatcha.bazarHighScore.v2'

/** Keys written under earlier rules; see `retireOldScores`. */
const RETIRED_HIGH_SCORE_KEYS = ['lugatcha.bazarHighScore']

/**
 * Throws away the bests from earlier rules.
 *
 * Done on every read rather than once at startup, because a backup taken
 * before this release restores the old key along with everything else, and it
 * would otherwise sit in storage for good (see db/backup.ts, which captures
 * every `lugatcha.*` key by prefix).
 */
function retireOldScores() {
  try {
    for (const key of RETIRED_HIGH_SCORE_KEYS) localStorage.removeItem(key)
  } catch {
    // private mode — there was nothing kept to clear
  }
}

export function readHighScore(): number {
  retireOldScores()
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

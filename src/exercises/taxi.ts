/**
 * "Taksi haydovchi" — the mini-game where a passenger tells you, in Uzbek,
 * where they want to go, and you drive them there.
 *
 * A fare is one instruction and one drop-off. The passenger speaks: *birinchi
 * koʻchadan chapga buriling* — first on the left. You drag the taxi along the
 * streets to where you think that is, and tap it to let them out; get there and
 * they pay. Nothing is timed. The pressure is the meter: every block burns
 * fuel, every word of the instruction you tap to have translated costs money,
 * and a fare pays for its words and its distance at a rate only a little above
 * what the driving costs. Understand the directions and the shift turns a
 * profit; buy the whole instruction in translation and it barely pays at all.
 * Nothing takes money off the driver: the meter belongs to the fare in hand, so
 * the worst a fare can do is eat itself, and that costs one of three lives.
 *
 * The ramp is the *directions*, not the city. A run opens on the shortest
 * thing anyone ever says to a driver — an ordinal and a side — then adds
 * distances (*toʻgʻriga uch kvartal yuring*), then chains two of them together
 * the way real directions come ("go four blocks, turn left"), and finally
 * hangs them off the landmarks you have been driving past all along
 * (*kasalxonada chapga buriling*). The landmarks are labelled on the map in the
 * learner's own language and named in the instruction in Uzbek, so knowing that
 * *kasalxona* is the hospital is the whole of that last step.
 *
 * Two things make left and right worth practising here rather than on a
 * flashcard: they are relative to the way the taxi is *pointing*, which the
 * game changes on you every fare, and the count of "the third on the left"
 * only includes streets that actually exist — a few of this city's are closed.
 *
 * Everything in this module is pure and deterministic given an `rng`: the
 * component is a renderer and an input handler, and the rules are tested
 * directly.
 */

// --- Geometry ---------------------------------------------------------------

/** A point on the street lattice — an intersection, not a pixel. */
export interface Point {
  x: number
  y: number
}

/** Compass headings, clockwise from north. North is up the screen. */
export type Dir = 0 | 1 | 2 | 3

export const NORTH: Dir = 0
export const EAST: Dir = 1
export const SOUTH: Dir = 2
export const WEST: Dir = 3

/** One step in each heading, in lattice units. */
export const DIR_STEPS: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]

export type Side = 'left' | 'right'

export const SIDES: readonly Side[] = ['left', 'right']

/** The heading you face after turning `side` from `dir`. */
export function turnDir(dir: Dir, side: Side): Dir {
  return ((dir + (side === 'right' ? 1 : 3)) % 4) as Dir
}

/** Where the taxi is and which way it is pointing. */
export interface Pose extends Point {
  dir: Dir
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

// --- The city ---------------------------------------------------------------

/**
 * A place a passenger can name.
 *
 * `uzbek` is what is spoken, capitalised because every clause that names a
 * landmark starts with it. The base-language names are the mid-sentence form —
 * "the hospital", not "Hospital" — since that is where they are read; the map
 * capitalises them for its labels.
 */
export interface Landmark {
  id: string
  emoji: string
  /** As the passenger says it, capitalised — every clause starts with it. */
  uzbek: string
  english: string
  russian: string
}

/**
 * The places this city can be built out of, ten of which turn up in any one
 * run.
 *
 * They are the buildings a passenger actually navigates by — somewhere to
 * arrive, somewhere to eat, and the transport that brought you — and their
 * Uzbek names are the vocabulary the last levels test. Adding one here adds
 * nine spoken clauses — three wordings each way at a turn, and three for
 * driving up to it — so scripts/generate_audio.py has to be re-run for it (see
 * {@link allSpokenClauses}).
 */
export const LANDMARKS: readonly Landmark[] = [
  { id: 'hospital', emoji: '🏥', uzbek: 'Kasalxona', english: 'hospital', russian: 'больница' },
  { id: 'hotel', emoji: '🏨', uzbek: 'Mehmonxona', english: 'hotel', russian: 'гостиница' },
  { id: 'museum', emoji: '🏛️', uzbek: 'Muzey', english: 'museum', russian: 'музей' },
  { id: 'bank', emoji: '🏦', uzbek: 'Bank', english: 'bank', russian: 'банк' },
  { id: 'library', emoji: '📚', uzbek: 'Kutubxona', english: 'library', russian: 'библиотека' },
  { id: 'restaurant', emoji: '🍽️', uzbek: 'Restoran', english: 'restaurant', russian: 'ресторан' },
  { id: 'cafe', emoji: '☕', uzbek: 'Kafe', english: 'café', russian: 'кафе' },
  { id: 'choyxona', emoji: '🫖', uzbek: 'Choyxona', english: 'choyxona', russian: 'чайхана' },
  { id: 'bazaar', emoji: '🧺', uzbek: 'Bozor', english: 'bazaar', russian: 'базар' },
  { id: 'park', emoji: '🌳', uzbek: 'Bogʻ', english: 'park', russian: 'парк' },
  { id: 'mosque', emoji: '🕌', uzbek: 'Masjid', english: 'mosque', russian: 'мечеть' },
  { id: 'school', emoji: '🏫', uzbek: 'Maktab', english: 'school', russian: 'школа' },
  { id: 'police', emoji: '🚓', uzbek: 'Politsiya', english: 'police station', russian: 'полиция' },
  { id: 'station', emoji: '🚉', uzbek: 'Vokzal', english: 'train station', russian: 'вокзал' },
  { id: 'metro', emoji: '🚇', uzbek: 'Metro', english: 'metro', russian: 'метро' },
  { id: 'theatre', emoji: '🎭', uzbek: 'Teatr', english: 'theatre', russian: 'театр' },
]

const LANDMARK_BY_ID = new Map(LANDMARKS.map((place) => [place.id, place]))

/** The landmark with this id, or null — the id is data, so never assume. */
export function landmark(id: string): Landmark | null {
  return LANDMARK_BY_ID.get(id) ?? null
}

/** Intersections across and down. Four blocks by five, on a phone. */
export const CITY_WIDTH = 5
export const CITY_HEIGHT = 6

/** Landmarks placed in one city, and how far apart they have to be. */
export const CITY_LANDMARKS = 10
const LANDMARK_SPACING = 2

/**
 * Streets closed off when the city is built.
 *
 * Without them every intersection has a turning on both sides and "the third
 * on the left" is just "three blocks then left" — the counting the instruction
 * asks for only becomes counting when some of the turnings are missing. A
 * removal is kept only if the city stays whole afterwards: connected, and with
 * no intersection left on a single street, which would be a dead end to reverse
 * out of.
 */
export const CLOSED_STREETS = 5

/** Where a landmark stands. */
export interface Place extends Point {
  id: string
}

export interface City {
  width: number
  height: number
  /** `h[y][x]`: the street from (x, y) to (x + 1, y). */
  h: boolean[][]
  /** `v[y][x]`: the street from (x, y) to (x, y + 1). */
  v: boolean[][]
  places: Place[]
}

/** Whether a street leaves `p` in `dir` — the only thing the taxi may drive. */
export function hasRoad(city: City, p: Point, dir: Dir): boolean {
  switch (dir) {
    case NORTH:
      return p.y > 0 && city.v[p.y - 1][p.x]
    case EAST:
      return p.x < city.width - 1 && city.h[p.y][p.x]
    case SOUTH:
      return p.y < city.height - 1 && city.v[p.y][p.x]
    default:
      return p.x > 0 && city.h[p.y][p.x - 1]
  }
}

/** The intersection one block on, or null when the street does not go there. */
export function step(city: City, p: Point, dir: Dir): Point | null {
  if (!hasRoad(city, p, dir)) return null
  const d = DIR_STEPS[dir]
  return { x: p.x + d.x, y: p.y + d.y }
}

/** How many streets meet at an intersection. */
function degree(city: City, p: Point): number {
  let n = 0
  for (const dir of [NORTH, EAST, SOUTH, WEST] as Dir[]) if (hasRoad(city, p, dir)) n++
  return n
}

/** The landmark standing at an intersection, or null. */
export function placeAt(city: City, p: Point): Landmark | null {
  const found = city.places.find((place) => place.x === p.x && place.y === p.y)
  return found ? landmark(found.id) : null
}

function shuffleWith<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function pickOne<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length) % items.length]
}

/** Every intersection, reading order. */
export function intersections(city: City): Point[] {
  const all: Point[] = []
  for (let y = 0; y < city.height; y++) for (let x = 0; x < city.width; x++) all.push({ x, y })
  return all
}

/** Connected, and nowhere to get stranded: what a closure must leave behind. */
function cityIsWhole(city: City): boolean {
  const all = intersections(city)
  if (all.some((p) => degree(city, p) < 2)) return false

  const seen = new Set<string>(['0,0'])
  const queue: Point[] = [{ x: 0, y: 0 }]
  while (queue.length) {
    const p = queue.shift()!
    for (const dir of [NORTH, EAST, SOUTH, WEST] as Dir[]) {
      const next = step(city, p, dir)
      if (!next) continue
      const key = `${next.x},${next.y}`
      if (seen.has(key)) continue
      seen.add(key)
      queue.push(next)
    }
  }
  return seen.size === all.length
}

/** Lays out a fresh city: a full lattice, a few closures, then the landmarks. */
export function buildCity(rng: () => number = Math.random): City {
  const city: City = {
    width: CITY_WIDTH,
    height: CITY_HEIGHT,
    h: Array.from({ length: CITY_HEIGHT }, () =>
      Array.from({ length: CITY_WIDTH - 1 }, () => true),
    ),
    v: Array.from({ length: CITY_HEIGHT - 1 }, () =>
      Array.from({ length: CITY_WIDTH }, () => true),
    ),
    places: [],
  }

  const segments: { grid: 'h' | 'v'; x: number; y: number }[] = []
  for (let y = 0; y < CITY_HEIGHT; y++)
    for (let x = 0; x < CITY_WIDTH - 1; x++) segments.push({ grid: 'h', x, y })
  for (let y = 0; y < CITY_HEIGHT - 1; y++)
    for (let x = 0; x < CITY_WIDTH; x++) segments.push({ grid: 'v', x, y })

  let closed = 0
  for (const seg of shuffleWith(segments, rng)) {
    if (closed >= CLOSED_STREETS) break
    city[seg.grid][seg.y][seg.x] = false
    if (cityIsWhole(city)) closed++
    else city[seg.grid][seg.y][seg.x] = true
  }

  // Landmarks go up spaced out, so "at the bank" never means one of two
  // corners a block apart, and so the map stays readable. A second pass fills
  // the last few in wherever they will go, on the rare layout where a spaced
  // one cannot be found for all of them.
  const names = shuffleWith(LANDMARKS, rng)
  const wanted = Math.min(CITY_LANDMARKS, names.length)
  const spots = shuffleWith(intersections(city), rng)
  for (const spacing of [LANDMARK_SPACING, 1]) {
    for (const spot of spots) {
      if (city.places.length >= wanted) break
      const taken = city.places.some(
        (place) => Math.abs(place.x - spot.x) + Math.abs(place.y - spot.y) < spacing,
      )
      if (taken) continue
      city.places.push({ id: names[city.places.length].id, x: spot.x, y: spot.y })
    }
  }

  return city
}

/** A pose somewhere in the city, pointing along a street it can drive. */
export function randomPose(city: City, rng: () => number = Math.random): Pose {
  const spots = shuffleWith(intersections(city), rng)
  for (const spot of spots) {
    const dirs = ([NORTH, EAST, SOUTH, WEST] as Dir[]).filter((dir) => hasRoad(city, spot, dir))
    if (dirs.length) return { ...spot, dir: pickOne(dirs, rng) }
  }
  return { x: 0, y: 0, dir: EAST }
}

// --- What the passenger says ------------------------------------------------

/**
 * One clause of an instruction.
 *
 * Each is a whole spoken sentence and a whole movement: the passenger says
 * them one after another the way anybody giving directions does, and the route
 * is what you get by doing as you are told, in order.
 */
export type Step =
  | { kind: 'turn'; side: Side; ordinal: number }
  | { kind: 'straight'; blocks: number }
  | { kind: 'turnNow'; side: Side }
  | { kind: 'landmarkTurn'; place: string; side: Side }
  | { kind: 'toLandmark'; place: string }

export type StepKind = Step['kind']

/** Ordinals 1–4, indexed from one. */
export const ORDINALS: readonly string[] = ['', 'birinchi', 'ikkinchi', 'uchinchi', 'toʻrtinchi']
/** Cardinals 1–5, indexed from one — how many blocks to drive. */
export const CARDINALS: readonly string[] = ['', 'bir', 'ikki', 'uch', 'toʻrt', 'besh']
/**
 * The same 1–5 with `-ta`, the counter Uzbek puts on a number in front of a
 * thing being counted. Irregular only at one: *bir* becomes *bitta*.
 */
export const COUNTERS: readonly string[] = ['', 'bitta', 'ikkita', 'uchta', 'toʻrtta', 'beshta']

/** The furthest an instruction ever counts. */
export const MAX_ORDINAL = 4
export const MAX_BLOCKS = 5

/** *chapga* / *oʻngga* — the dative, "to the left". */
const SIDE_TO: Record<Side, string> = { left: 'chapga', right: 'oʻngga' }
/** *chap* / *oʻng* — the bare adjective, for "the left side". */
const SIDE_BARE: Record<Side, string> = { left: 'chap', right: 'oʻng' }
/** *chapdagi* / *oʻngdagi* — "the one on the left". */
const SIDE_ON: Record<Side, string> = { left: 'chapdagi', right: 'oʻngdagi' }

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * One word of a clause, and what it would cost the driver to understand it.
 *
 * `key` names the meaning under `taxi.word.*` rather than carrying it: the
 * translation the driver buys is in their own language, which this module does
 * not know about. Every word of every clause has one, because any of them can
 * be the word that is holding the instruction up.
 */
export interface Word {
  text: string
  /** i18n key under `taxi.word.*`. */
  key: string
  /** The landmark this word names, for the keys that take one. */
  place?: string
}

function word(text: string, key: string, place?: string): Word {
  return place === undefined ? { text, key } : { text, key, place }
}

/** Cardinal meanings 1–5, indexed from one, to match `CARDINALS`. */
const CARDINAL_KEYS = ['', 'one', 'two', 'three', 'four', 'five']
/** And the counted forms, which mean the same but say it with `-ta`. */
const COUNTER_KEYS = ['', 'taOne', 'taTwo', 'taThree', 'taFour', 'taFive']

/** The Uzbek name of a landmark, or an empty string if the id is not one. */
function placeUzbek(id: string): string {
  return landmark(id)?.uzbek ?? ''
}

/**
 * The ways of saying each kind of step, plainest first.
 *
 * Directions are not formulaic in the street, and a game that says everything
 * one way teaches a learner to pattern-match on the shape of the sentence
 * rather than to understand it. So every step has three or four ways of coming
 * out, differing in the noun the counting hangs off (*koʻcha*, *chorraha*,
 * *burilish*), in the verb (*buriling*, *qayriling*; *yuring*, *boring*,
 * *haydang*), and in word order — the sort of variation one passenger to the
 * next actually produces.
 *
 * The first of each list is the plainest, and a run opens on those alone: a
 * level's `voices` says how many of them are in play, so the wording widens as
 * the directions themselves get longer (see {@link LEVELS}).
 *
 * They are functions of the step rather than strings because the words are
 * what the driver buys, one at a time — see {@link Word}.
 */
type Saying<K extends StepKind> = (step: Extract<Step, { kind: K }>) => Word[]

const TURN_SAYINGS: Saying<'turn'>[] = [
  // "Turn left at the first street."
  (step) => [
    word(ORDINALS[step.ordinal], `ordinal${step.ordinal}`),
    word('koʻchadan', 'street'),
    word(SIDE_TO[step.side], step.side),
    word('buriling', 'turn'),
  ],
  // The side first, the way a passenger points before they explain.
  (step) => [
    word(SIDE_ON[step.side], `${step.side}On`),
    word(ORDINALS[step.ordinal], `ordinal${step.ordinal}`),
    word('koʻchaga', 'streetTo'),
    word('buriling', 'turn'),
  ],
  // Counting junctions rather than streets.
  (step) => [
    word(ORDINALS[step.ordinal], `ordinal${step.ordinal}`),
    word('chorrahadan', 'crossroads'),
    word(SIDE_TO[step.side], step.side),
    word('qayriling', 'turnAlt'),
  ],
  // Counting the turnings themselves.
  (step) => [
    word(ORDINALS[step.ordinal], `ordinal${step.ordinal}`),
    word('burilishdan', 'turning'),
    word(SIDE_TO[step.side], step.side),
    word('buriling', 'turn'),
  ],
]

const TURN_NOW_SAYINGS: Saying<'turnNow'>[] = [
  (step) => [word(SIDE_TO[step.side], step.side), word('buriling', 'turn')],
  (step) => [
    word(SIDE_BARE[step.side], `${step.side}Plain`),
    word('tomonga', 'towards'),
    word('buriling', 'turn'),
  ],
  (step) => [word(SIDE_TO[step.side], step.side), word('qayriling', 'turnAlt')],
  // "and then left" — the join a passenger makes between two clauses.
  (step) => [word('keyin', 'then'), word(SIDE_TO[step.side], step.side), word('buriling', 'turn')],
]

const STRAIGHT_SAYINGS: Saying<'straight'>[] = [
  (step) => [
    word('toʻgʻriga', 'straightOn'),
    word(CARDINALS[step.blocks], CARDINAL_KEYS[step.blocks]),
    word('kvartal', 'block'),
    word('yuring', 'go'),
  ],
  // The counted form, and the distance out in front where the ear meets it first.
  (step) => [
    word(COUNTERS[step.blocks], COUNTER_KEYS[step.blocks]),
    word('kvartal', 'block'),
    word('toʻgʻri', 'straightPlain'),
    word('boring', 'goBor'),
  ],
  // Said to a driver rather than to a pedestrian: *haydang*, drive.
  (step) => [
    word(CARDINALS[step.blocks], CARDINAL_KEYS[step.blocks]),
    word('kvartal', 'block'),
    word('toʻgʻriga', 'straightOn'),
    word('haydang', 'drive'),
  ],
]

const LANDMARK_TURN_SAYINGS: Saying<'landmarkTurn'>[] = [
  (step) => [
    word(`${placeUzbek(step.place)}da`, 'atPlace', step.place),
    word(SIDE_TO[step.side], step.side),
    word('buriling', 'turn'),
  ],
  (step) => [
    word(placeUzbek(step.place), 'placeBare', step.place),
    word('yonidan', 'beside'),
    word(SIDE_TO[step.side], step.side),
    word('buriling', 'turn'),
  ],
  // "When you get to the hospital, turn left."
  (step) => [
    word(`${placeUzbek(step.place)}ga`, 'toPlace', step.place),
    word('yetganda', 'whenReached'),
    word(SIDE_TO[step.side], step.side),
    word('buriling', 'turn'),
  ],
]

const TO_LANDMARK_SAYINGS: Saying<'toLandmark'>[] = [
  (step) => [
    word(`${placeUzbek(step.place)}gacha`, 'asFarAsPlace', step.place),
    word('yuring', 'go'),
  ],
  (step) => [word(`${placeUzbek(step.place)}ga`, 'toPlace', step.place), word('boring', 'goBor')],
  (step) => [
    word(`${placeUzbek(step.place)}gacha`, 'asFarAsPlace', step.place),
    word('toʻgʻri', 'straightPlain'),
    word('haydang', 'drive'),
  ],
]

/** How many ways there are of saying a step of this kind. */
export function sayings(kind: StepKind): number {
  switch (kind) {
    case 'turn':
      return TURN_SAYINGS.length
    case 'turnNow':
      return TURN_NOW_SAYINGS.length
    case 'straight':
      return STRAIGHT_SAYINGS.length
    case 'landmarkTurn':
      return LANDMARK_TURN_SAYINGS.length
    default:
      return TO_LANDMARK_SAYINGS.length
  }
}

/** Wraps `say` into range, so callers can pass any index and get a clause. */
function chosen<T>(list: readonly T[], say: number): T {
  return list[((say % list.length) + list.length) % list.length]
}

/**
 * A step broken into its words, said the `say`th way.
 *
 * This is the source of truth for the clause: {@link stepUzbek} joins these
 * up, so the sentence the passenger says and the words the driver can pay to
 * translate can never drift apart. Only the first word is capitalised here —
 * the phrasings are written in the lower case they take mid-sentence, and
 * which of them comes first depends on the phrasing.
 */
export function stepWords(step: Step, say = 0): Word[] {
  const words = (() => {
    switch (step.kind) {
      case 'turn':
        return chosen(TURN_SAYINGS, say)(step)
      case 'straight':
        return chosen(STRAIGHT_SAYINGS, say)(step)
      case 'turnNow':
        return chosen(TURN_NOW_SAYINGS, say)(step)
      case 'landmarkTurn':
        return chosen(LANDMARK_TURN_SAYINGS, say)(step)
      default:
        return chosen(TO_LANDMARK_SAYINGS, say)(step)
    }
  })()
  return words.map((entry, index) =>
    index === 0 ? { ...entry, text: capitalise(entry.text) } : entry,
  )
}

/**
 * A step as the passenger says it, the `say`th way.
 *
 * Every clause is a plain polite imperative — *buriling*, *yuring*, *haydang*
 * — because that is what a passenger uses on a driver, and every one is short
 * enough to be recorded whole. That is the point of splitting an instruction
 * into clauses rather than generating one long sentence: however many ways
 * there are of saying a step, the set of things this game can say stays small
 * and fixed, so it can all be spoken in a real voice rather than stitched
 * together word by word. Keep it that way — see {@link allSpokenClauses}.
 */
export function stepUzbek(step: Step, say = 0): string {
  return `${stepWords(step, say)
    .map((entry) => entry.text)
    .join(' ')}.`
}

/** The word a driver pays for, as it is keyed — case and position aside. */
export function wordKey(text: string): string {
  return text.toLowerCase()
}

/**
 * The whole instruction, one sentence per step.
 *
 * With no `said` it comes out in the plainest wording, which is what the
 * generator compares against when it is avoiding repeating itself: two tellings
 * of the same route are the same fare however differently they are worded.
 */
export function routeUzbek(steps: readonly Step[], said: readonly number[] = []): string {
  return steps.map((step, index) => stepUzbek(step, said[index] ?? 0)).join(' ')
}

/**
 * Every clause this game can ever speak.
 *
 * scripts/generate_audio.py builds the identical list so each one is recorded
 * in a real voice; tests/taxi.spec.ts checks that nothing a run generates falls
 * outside it. It is finite precisely because instructions are assembled from
 * clauses rather than written as sentences.
 */
export function allSpokenClauses(): string[] {
  const clauses: string[] = []
  const every = (step: Step) => {
    for (let say = 0; say < sayings(step.kind); say++) clauses.push(stepUzbek(step, say))
  }
  for (const side of SIDES) {
    for (let ordinal = 1; ordinal <= MAX_ORDINAL; ordinal++) {
      every({ kind: 'turn', side, ordinal })
    }
    every({ kind: 'turnNow', side })
    for (const place of LANDMARKS) every({ kind: 'landmarkTurn', place: place.id, side })
  }
  for (let blocks = 1; blocks <= MAX_BLOCKS; blocks++) every({ kind: 'straight', blocks })
  for (const place of LANDMARKS) every({ kind: 'toLandmark', place: place.id })
  return clauses
}

// --- Following the directions -----------------------------------------------

export interface Route {
  /** Every intersection driven through, the starting one first. */
  path: Point[]
  /** Where the passenger gets out. */
  dest: Point
  /** The way the taxi is pointing when it arrives. */
  dir: Dir
}

/** Steps that leave you facing somewhere new, and so end with a turn. */
function isTurn(step: Step): boolean {
  return step.kind === 'turn' || step.kind === 'turnNow' || step.kind === 'landmarkTurn'
}

/**
 * Drives the instruction and reports where it ends, or null when the city does
 * not allow it — the street runs out, there is no such turning, that landmark
 * is not ahead of you.
 *
 * The one rule that is not spoken: **an instruction that ends on a turn ends
 * one block into the street it turned into.** "First on the left" names a
 * street, and a passenger who names a street means to be dropped off *on* it,
 * not on the corner before it — and it is what makes left different from right,
 * which on the corner itself they would not be. The game shows the route it
 * meant after every drop-off, so the rule is learned by watching rather than by
 * being told.
 */
export function resolve(city: City, start: Pose, steps: readonly Step[]): Route | null {
  if (!steps.length) return null

  let at: Point = { x: start.x, y: start.y }
  let dir = start.dir
  const path: Point[] = [at]

  /** One block on, recorded. Null when there is no street to take. */
  const forward = (): boolean => {
    const next = step(city, at, dir)
    if (!next) return false
    at = next
    path.push(at)
    return true
  }

  for (const instruction of steps) {
    switch (instruction.kind) {
      case 'straight': {
        for (let i = 0; i < instruction.blocks; i++) if (!forward()) return null
        break
      }
      case 'turn': {
        // Counting starts at the *next* junction: the turning you are sitting
        // on is the one you are coming out of, not the first one ahead.
        let counted = 0
        for (;;) {
          if (!forward()) return null
          if (!hasRoad(city, at, turnDir(dir, instruction.side))) continue
          if (++counted === instruction.ordinal) break
        }
        dir = turnDir(dir, instruction.side)
        break
      }
      case 'turnNow': {
        const turned = turnDir(dir, instruction.side)
        if (!hasRoad(city, at, turned)) return null
        dir = turned
        break
      }
      case 'landmarkTurn':
      case 'toLandmark': {
        for (;;) {
          if (!forward()) return null
          if (placeAt(city, at)?.id === instruction.place) break
        }
        if (instruction.kind === 'landmarkTurn') {
          const turned = turnDir(dir, instruction.side)
          if (!hasRoad(city, at, turned)) return null
          dir = turned
        }
        break
      }
    }
  }

  if (isTurn(steps[steps.length - 1]) && !forward()) return null
  return { path, dest: at, dir }
}

// --- The ramp ---------------------------------------------------------------

export interface Level {
  /** The shapes of instruction offered, as lists of step kinds. */
  shapes: readonly (readonly StepKind[])[]
  /** How far "the nth on the left" may count at this level. */
  ordinal: number
  /** How many blocks "go straight on" may ask for. */
  blocks: number
  /**
   * How many of each step's wordings are in play, plainest first.
   *
   * A driver on their first fare has enough to do working out which way is
   * left; the wording widens once the directions themselves are familiar.
   */
  voices: number
  /** Fares to deliver before the next level; the last one never ends. */
  fares: number
}

/**
 * The shift, level by level.
 *
 * It opens on the shortest instruction there is and adds one idea at a time:
 * a distance, then two clauses in a row, then the landmarks. The last level
 * runs for as long as the driver does.
 */
export const LEVELS: readonly Level[] = [
  { shapes: [['turn']], ordinal: 2, blocks: 3, voices: 1, fares: 3 },
  { shapes: [['turn'], ['straight']], ordinal: 3, blocks: 3, voices: 2, fares: 3 },
  {
    shapes: [['turn'], ['straight'], ['straight', 'turnNow']],
    ordinal: 3,
    blocks: 4,
    voices: 2,
    fares: 4,
  },
  {
    shapes: [['turn'], ['straight', 'turnNow'], ['turn', 'straight'], ['turn', 'turn']],
    ordinal: 4,
    blocks: 4,
    voices: 3,
    fares: 4,
  },
  {
    shapes: [
      ['landmarkTurn'],
      ['toLandmark', 'turnNow'],
      ['straight', 'turnNow'],
      ['turn', 'turn'],
    ],
    ordinal: 4,
    blocks: 5,
    voices: 3,
    fares: 5,
  },
  {
    shapes: [
      ['landmarkTurn', 'turn'],
      ['toLandmark', 'turnNow'],
      ['straight', 'turnNow', 'turn'],
      ['turn', 'landmarkTurn'],
      ['turn', 'straight'],
      ['landmarkTurn'],
    ],
    ordinal: 4,
    blocks: 5,
    voices: 4,
    fares: Infinity,
  },
]

/** The level a driver is on after delivering `delivered` fares. */
export function levelFor(delivered: number): number {
  let left = delivered
  for (let level = 0; level < LEVELS.length; level++) {
    if (left < LEVELS[level].fares) return level
    left -= LEVELS[level].fares
  }
  return LEVELS.length - 1
}

/** Every way one step kind can be filled in, in this city at this level. */
function stepChoices(city: City, kind: StepKind, level: Level): Step[] {
  switch (kind) {
    case 'turn':
      return SIDES.flatMap((side) =>
        Array.from({ length: level.ordinal }, (_, i) => ({
          kind: 'turn' as const,
          side,
          ordinal: i + 1,
        })),
      )
    case 'straight':
      return Array.from({ length: level.blocks }, (_, i) => ({
        kind: 'straight' as const,
        blocks: i + 1,
      }))
    case 'turnNow':
      return SIDES.map((side) => ({ kind: 'turnNow' as const, side }))
    case 'landmarkTurn':
      return city.places.flatMap((place) =>
        SIDES.map((side) => ({ kind: 'landmarkTurn' as const, place: place.id, side })),
      )
    default:
      return city.places.map((place) => ({ kind: 'toLandmark' as const, place: place.id }))
  }
}

/** Every filled-in instruction of one shape. */
function shapeInstructions(city: City, shape: readonly StepKind[], level: Level): Step[][] {
  let built: Step[][] = [[]]
  for (const kind of shape) {
    const choices = stepChoices(city, kind, level)
    built = built.flatMap((prefix) => choices.map((choice) => [...prefix, choice]))
  }
  return built
}

/** The shortest and longest drive a fare may be, so none is trivial or a trek. */
const MIN_BLOCKS = 2
const MAX_ROUTE_BLOCKS = 12

// --- The meter --------------------------------------------------------------

/**
 * The money, all of it in soʻm, and all of it in thousands.
 *
 * A fare pays for the words it took to say and the distance it covers, and the
 * driver pays for the fuel to get there and for every word they could not
 * manage without. The rate is set a little above the fuel so that a fare driven
 * straight to the door turns a profit and a fare found by wandering does not —
 * that margin, `DISTANCE_RATE` minus one block of fuel, is the whole game.
 *
 * The numbers are small on purpose: a fare comes out around 6 000–15 000 soʻm,
 * which is roughly what a short hop across Tashkent actually costs, and a word
 * costs about what a minute of driving does. Understand the instruction and the
 * shift pays; buy the whole thing in translation and you have worked for
 * nothing.
 */
export const FUEL_PER_BLOCK = 1_000
export const WORD_PRICE = 1_000
export const DISTANCE_RATE = 1.25

/** What a fare is worth: a word each, plus the distance at `DISTANCE_RATE`. */
export function fareValue(words: number, blocks: number): number {
  return (words + Math.round(DISTANCE_RATE * blocks)) * FUEL_PER_BLOCK
}

/** A fare: what was said, what it pays, and where doing as you are told puts you. */
export interface Fare {
  steps: Step[]
  /** Which wording each step came out in; see {@link sayings}. */
  said: number[]
  /** Each step as it is spoken — also the unit the audio is recorded in. */
  clauses: string[]
  /** The same clauses word by word, for the driver to buy meanings from. */
  words: Word[][]
  /** How many words there are in all — half of what the fare pays for. */
  wordCount: number
  /** Blocks between the pick-up and the door: the other half. */
  blocks: number
  /** What it pays on arrival, in soʻm. */
  pay: number
  route: Route
  /** The pose the instruction was given from; left and right depend on it. */
  from: Pose
}

/**
 * Puts an instruction into words: one of the level's wordings per step, drawn
 * independently, so a two-clause fare can come out in two different voices the
 * way a real one does.
 */
function makeFare(
  steps: Step[],
  route: Route,
  from: Pose,
  voices: number,
  rng: () => number,
): Fare {
  const said = steps.map((step) => Math.floor(rng() * Math.min(voices, sayings(step.kind))))
  const words = steps.map((step, index) => stepWords(step, said[index]))
  const wordCount = words.reduce((total, clause) => total + clause.length, 0)
  const blocks = route.path.length - 1
  return {
    steps,
    said,
    clauses: steps.map((step, index) => stepUzbek(step, said[index])),
    words,
    wordCount,
    blocks,
    pay: fareValue(wordCount, blocks),
    route,
    from,
  }
}

/**
 * Picks one fare for `pose`, or null when this city cannot offer the level's
 * instructions from there — a taxi pointing at a wall has nothing to be told.
 *
 * Every instruction the level allows is tried and the impossible ones thrown
 * away, so what comes back is always drivable. A shape is chosen before an
 * instruction is, so a level's rarer shapes turn up as often as its common
 * ones rather than in proportion to how many ways there are to fill them in.
 */
export function pickFare(
  city: City,
  pose: Pose,
  level: Level,
  rng: () => number = Math.random,
  avoid?: string,
): Fare | null {
  const byShape: { steps: Step[]; route: Route }[][] = []
  for (const shape of level.shapes) {
    const drivable: { steps: Step[]; route: Route }[] = []
    for (const steps of shapeInstructions(city, shape, level)) {
      const route = resolve(city, pose, steps)
      if (!route) continue
      const blocks = route.path.length - 1
      if (blocks < MIN_BLOCKS || blocks > MAX_ROUTE_BLOCKS) continue
      if (samePoint(route.dest, pose)) continue
      drivable.push({ steps, route })
    }
    // Sending the driver the same way twice running reads as a bug, so drop
    // the repeat wherever there is anything else to say. Two tellings of one
    // route count as the same fare, which is why this compares the plainest
    // wording of each rather than the wording it will end up in.
    const fresh = drivable.filter((option) => routeUzbek(option.steps) !== avoid)
    const usable = fresh.length ? fresh : drivable
    if (usable.length) byShape.push(usable)
  }
  if (!byShape.length) return null
  // The wording is only chosen once the route is, so a level with four voices
  // does not cost four times the search.
  const picked = pickOne(pickOne(byShape, rng), rng)
  return makeFare(picked.steps, picked.route, pose, level.voices, rng)
}

// --- State ------------------------------------------------------------------

/**
 * What a drop-off came to.
 *
 * A wrong corner is not a life lost on its own: directions can be read more
 * than one way, and the driver has already paid for the mistake out of the
 * fare. The passenger stays in the cab and says this is not it — until they
 * have said it {@link PATIENCE} times, at which point they get out where they
 * are and the fare is written off.
 */
export type DropResult = 'arrived' | 'refused' | 'gaveUp' | 'ignored'

/** How a fare ended: paid, walked out on, or driven into the ground. */
export type FareEnd = 'arrived' | 'gaveUp' | 'broke'

/** A fare that has ended, kept on state so the map can show what was meant. */
export interface Outcome {
  result: FareEnd
  /** Where the passenger was let out; the taxi's corner when the money ran out. */
  dropped: Point
  /** The route the instruction described — drawn on the map however it ended. */
  route: Route
  steps: Step[]
  /** The wording it was actually given in, so the review echoes what was said. */
  said: number[]
  /** Soʻm banked; zero unless they arrived. */
  paid: number
}

/** Wrong corners one passenger will sit through before giving up on you. */
export const PATIENCE = 3

/**
 * Fares a driver may write off before the shift is over.
 *
 * Nothing takes money off a driver: what is on the meter belongs to the fare
 * being driven, and the worst a fare can do is eat itself. A fare that ends
 * without a passenger at their door — driven into the ground, or abandoned by
 * the passenger — costs one of these instead.
 */
export const LIVES = 3

export interface TaxiState {
  status: 'ready' | 'playing' | 'over'
  city: City
  taxi: Pose
  /** The fare being driven, or null once the shift is over. */
  fare: Fare | null
  /** Where the taxi has driven since this fare started, for the trail. */
  trail: Point[]
  /** Set between a drop-off that ended the fare and the next passenger. */
  outcome: Outcome | null
  /** Soʻm banked from fares already delivered — the score, and it only rises. */
  takings: number
  /** Fares left to write off before the shift ends; see {@link LIVES}. */
  lives: number
  /** Soʻm of the current fare already spent on fuel and translations. */
  spent: number
  /** Fares delivered; the ramp is keyed off it. */
  delivered: number
  /** Wrong corners tried on the current fare, against `PATIENCE`. */
  patience: number
  /** Words of this fare already paid for, keyed by {@link wordKey}. */
  bought: string[]
  /** Bumped per fare, so the component can tell a new instruction from a redraw. */
  fareId: number
}

/** The level the run is currently on. */
export function currentLevel(state: TaxiState): Level {
  return LEVELS[levelFor(state.delivered)]
}

/**
 * Puts a fare on the meter, moving the taxi across town if this corner has
 * nothing to offer.
 *
 * The next passenger is normally waiting where the last one got out — that is
 * what makes the city feel like one place rather than a fresh puzzle each time.
 * A taxi facing the edge of the map has nothing it can be told, though, so it
 * pulls out the other way first, and only if that corner is hopeless too is it
 * flagged down somewhere else entirely.
 */
export function nextFare(state: TaxiState, rng: () => number = Math.random): TaxiState {
  const level = currentLevel(state)
  const avoid = state.fare ? routeUzbek(state.fare.steps) : undefined

  const here = ([NORTH, EAST, SOUTH, WEST] as Dir[])
    .filter((dir) => dir !== state.taxi.dir && hasRoad(state.city, state.taxi, dir))
    .map((dir) => ({ x: state.taxi.x, y: state.taxi.y, dir }))

  let pose = state.taxi
  let fare = pickFare(state.city, pose, level, rng, avoid)
  for (const turned of shuffleWith(here, rng)) {
    if (fare) break
    pose = turned
    fare = pickFare(state.city, pose, level, rng, avoid)
  }
  for (let tries = 0; !fare && tries < 40; tries++) {
    pose = randomPose(state.city, rng)
    fare = pickFare(state.city, pose, level, rng, avoid)
  }
  if (!fare) return state

  return {
    ...state,
    taxi: pose,
    fare,
    trail: [{ x: pose.x, y: pose.y }],
    outcome: null,
    patience: 0,
    spent: 0,
    bought: [],
  }
}

/** A shift waiting for its first tap, with the first passenger already in. */
export function createGame(rng: () => number = Math.random): TaxiState {
  const city = buildCity(rng)
  const empty: TaxiState = {
    status: 'ready',
    city,
    taxi: randomPose(city, rng),
    fare: null,
    trail: [],
    outcome: null,
    takings: 0,
    lives: LIVES,
    spent: 0,
    delivered: 0,
    patience: 0,
    bought: [],
    fareId: 0,
  }
  return { ...nextFare(empty, rng), fareId: 1 }
}

/** Starts a `ready` game; any other status is returned untouched. */
export function startGame(state: TaxiState): TaxiState {
  return state.status === 'ready' ? { ...state, status: 'playing' } : state
}

/** Soʻm still on the meter for the fare being driven. */
export function purse(state: TaxiState): number {
  return state.fare ? Math.max(0, state.fare.pay - state.spent) : 0
}

/**
 * Writes the current fare off: the driver keeps nothing and a life goes.
 *
 * The taxi and the route stay on screen, because a fare lost is the one the
 * driver most needs to see the answer to.
 */
function writeOff(state: TaxiState, result: FareEnd): TaxiState {
  const lives = state.lives - 1
  return {
    ...state,
    lives: Math.max(0, lives),
    status: lives <= 0 ? 'over' : state.status,
    outcome: state.fare
      ? {
          result,
          dropped: { x: state.taxi.x, y: state.taxi.y },
          route: state.fare.route,
          steps: state.fare.steps,
          said: state.fare.said,
          paid: 0,
        }
      : state.outcome,
  }
}

/**
 * Takes money off the meter, and writes the fare off if that empties it.
 *
 * Spending is always against the fare in hand, never against the shift's
 * takings, so a driver cannot end a fare poorer than they began it — the worst
 * that can happen is that the whole purse goes on fuel and translations, and
 * then it is a life rather than money that is lost.
 */
function spend(state: TaxiState, som: number): TaxiState {
  const spent = state.spent + som
  const next = { ...state, spent }
  return state.fare && spent >= state.fare.pay ? writeOff(next, 'broke') : next
}

/**
 * Drives one block in `dir`, if there is a street there, and burns the fuel.
 *
 * Doubling back rubs the trail out behind you rather than drawing over it, so
 * what is on the map is always the route the taxi would take now — a driver
 * who thinks better of a turning has not "been" down it. The fuel is spent
 * either way: reconsidering costs the same as being right first time, which is
 * exactly why it pays to listen to the whole instruction before pulling out.
 */
export function drive(state: TaxiState, dir: Dir): TaxiState {
  if (state.status !== 'playing' || state.outcome) return state
  const next = step(state.city, state.taxi, dir)
  if (!next) return state

  const previous = state.trail[state.trail.length - 2]
  const trail =
    previous && samePoint(previous, next) ? state.trail.slice(0, -1) : [...state.trail, next]
  return spend({ ...state, taxi: { ...next, dir }, trail }, FUEL_PER_BLOCK)
}

/**
 * Buys the meaning of one word of the instruction.
 *
 * It is bought for the whole fare rather than for the one place it appears:
 * paying twice for *buriling* in the same breath would teach nothing the first
 * payment did not. A word already bought is free to tap again, which is what
 * makes the bought half of an instruction re-readable while you drive.
 */
export function buyWord(state: TaxiState, text: string): TaxiState {
  const key = wordKey(text)
  if (state.status !== 'playing' || state.outcome) return state
  if (state.bought.includes(key)) return state
  return spend({ ...state, bought: [...state.bought, key] }, WORD_PRICE)
}

/** What one drop-off did: the new state, and how the passenger took it. */
export interface Drop {
  state: TaxiState
  result: DropResult
  /** Soʻm earned; zero unless they arrived. */
  paid: number
}

/**
 * Lets the passenger out where the taxi is standing.
 *
 * The corner alone is judged: a driver who found the right street the long way
 * round still found it, and has already paid for the detour in fuel. A wrong
 * corner is refused rather than punished — the passenger stays put and says so
 * — until they have said it {@link PATIENCE} times and give up on you, which
 * writes the fare off for a life. Arriving banks whatever is left on the meter.
 * Every ending carries the route the instruction meant, which the map then
 * draws: being shown the answer is how the rules of "first on the left" are
 * actually learned.
 */
export function dropOff(state: TaxiState): Drop {
  if (state.status !== 'playing' || !state.fare || state.outcome) {
    return { state, result: 'ignored', paid: 0 }
  }

  const dropped = { x: state.taxi.x, y: state.taxi.y }
  const { route, steps, said } = state.fare

  if (samePoint(dropped, route.dest)) {
    const paid = purse(state)
    return {
      state: {
        ...state,
        takings: state.takings + paid,
        delivered: state.delivered + 1,
        outcome: { result: 'arrived', dropped, route, steps, said, paid },
      },
      result: 'arrived',
      paid,
    }
  }

  const patience = state.patience + 1
  if (patience < PATIENCE) {
    return { state: { ...state, patience }, result: 'refused', paid: 0 }
  }
  return { state: writeOff({ ...state, patience }, 'gaveUp'), result: 'gaveUp', paid: 0 }
}

/**
 * Clears the last drop-off and flags down the next passenger.
 *
 * The taxi stays where it stopped either way. A passenger who gave up got out
 * on the wrong corner, and that corner is now on screen next to the route they
 * wanted — which is a better place to start reading the next instruction from
 * than anywhere the game could move the driver to.
 */
export function continueRun(state: TaxiState, rng: () => number = Math.random): TaxiState {
  if (!state.outcome) return state
  if (state.status === 'over') return { ...state, outcome: null, fare: null }

  const next = nextFare({ ...state, outcome: null }, rng)
  return { ...next, fareId: state.fareId + 1 }
}

// --- High score -------------------------------------------------------------

/** The best takings, in soʻm — the most a shift ever banked. */
const HIGH_SCORE_KEY = 'lugatcha.taxiHighScore'

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
    // private mode — the shift still counts, it just is not remembered
  }
  return true
}

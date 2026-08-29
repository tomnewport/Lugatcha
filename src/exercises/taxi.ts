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
 * profit; buy the whole instruction in translation, or find the door by trying
 * every corner, and it does not. Running out of money is the only way to lose.
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
 * three spoken clauses, so scripts/generate_audio.py has to be re-run for it
 * (see {@link allSpokenClauses}).
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

/** The furthest an instruction ever counts. */
export const MAX_ORDINAL = 4
export const MAX_BLOCKS = 5

const SIDE_WORDS: Record<Side, string> = { left: 'chapga', right: 'oʻngga' }

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

/** Cardinal meanings 1–5, indexed from one, to match `CARDINALS`. */
const CARDINAL_KEYS = ['', 'one', 'two', 'three', 'four', 'five']

/**
 * A step broken into its words.
 *
 * This is the source of truth for the clause: {@link stepUzbek} joins these
 * up, so the sentence the passenger says and the words the driver can pay to
 * translate can never drift apart.
 */
export function stepWords(step: Step): Word[] {
  switch (step.kind) {
    case 'turn':
      return [
        { text: capitalise(ORDINALS[step.ordinal]), key: `ordinal${step.ordinal}` },
        { text: 'koʻchadan', key: 'street' },
        { text: SIDE_WORDS[step.side], key: step.side },
        { text: 'buriling', key: 'turn' },
      ]
    case 'straight':
      return [
        { text: 'Toʻgʻriga', key: 'straightOn' },
        { text: CARDINALS[step.blocks], key: CARDINAL_KEYS[step.blocks] },
        { text: 'kvartal', key: 'block' },
        { text: 'yuring', key: 'go' },
      ]
    case 'turnNow':
      return [
        { text: capitalise(SIDE_WORDS[step.side]), key: step.side },
        { text: 'buriling', key: 'turn' },
      ]
    case 'landmarkTurn':
      return [
        { text: `${landmark(step.place)?.uzbek ?? ''}da`, key: 'atPlace', place: step.place },
        { text: SIDE_WORDS[step.side], key: step.side },
        { text: 'buriling', key: 'turn' },
      ]
    default:
      return [
        { text: `${landmark(step.place)?.uzbek ?? ''}gacha`, key: 'toPlace', place: step.place },
        { text: 'yuring', key: 'go' },
      ]
  }
}

/**
 * A step as the passenger says it.
 *
 * Every clause is a plain polite imperative — *buriling*, *yuring* — because
 * that is what a passenger uses on a driver, and every one is short enough to
 * be recorded whole. That is the point of splitting an instruction into
 * clauses rather than generating one long sentence: the set of things this game
 * can say is small and fixed, so it can all be spoken in a real voice rather
 * than stitched together word by word. Keep it that way — see
 * {@link allSpokenClauses}.
 */
export function stepUzbek(step: Step): string {
  return `${stepWords(step)
    .map((word) => word.text)
    .join(' ')}.`
}

/** The word a driver pays for, as it is keyed — case and position aside. */
export function wordKey(text: string): string {
  return text.toLowerCase()
}

/** The whole instruction, one sentence per step. */
export function routeUzbek(steps: readonly Step[]): string {
  return steps.map(stepUzbek).join(' ')
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
  for (const side of SIDES) {
    for (let ordinal = 1; ordinal <= MAX_ORDINAL; ordinal++) {
      clauses.push(stepUzbek({ kind: 'turn', side, ordinal }))
    }
    clauses.push(stepUzbek({ kind: 'turnNow', side }))
    for (const place of LANDMARKS) {
      clauses.push(stepUzbek({ kind: 'landmarkTurn', place: place.id, side }))
    }
  }
  for (let blocks = 1; blocks <= MAX_BLOCKS; blocks++) {
    clauses.push(stepUzbek({ kind: 'straight', blocks }))
  }
  for (const place of LANDMARKS) {
    clauses.push(stepUzbek({ kind: 'toLandmark', place: place.id }))
  }
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
  { shapes: [['turn']], ordinal: 2, blocks: 3, fares: 3 },
  { shapes: [['turn'], ['straight']], ordinal: 3, blocks: 3, fares: 3 },
  {
    shapes: [['turn'], ['straight'], ['straight', 'turnNow']],
    ordinal: 3,
    blocks: 4,
    fares: 4,
  },
  {
    shapes: [['turn'], ['straight', 'turnNow'], ['turn', 'straight'], ['turn', 'turn']],
    ordinal: 4,
    blocks: 4,
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
/** What the driver starts the shift holding. */
export const START_FLOAT = 20_000

/** What a fare pays: a word each, plus the distance at `DISTANCE_RATE`. */
export function fareValue(words: number, blocks: number): number {
  return (words + Math.round(DISTANCE_RATE * blocks)) * FUEL_PER_BLOCK
}

/** A fare: what was said, what it pays, and where doing as you are told puts you. */
export interface Fare {
  steps: Step[]
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

function makeFare(steps: Step[], route: Route, from: Pose): Fare {
  const words = steps.map(stepWords)
  const wordCount = words.reduce((total, clause) => total + clause.length, 0)
  const blocks = route.path.length - 1
  return {
    steps,
    clauses: steps.map(stepUzbek),
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
  const byShape: Fare[][] = []
  for (const shape of level.shapes) {
    const fares: Fare[] = []
    for (const steps of shapeInstructions(city, shape, level)) {
      const route = resolve(city, pose, steps)
      if (!route) continue
      const blocks = route.path.length - 1
      if (blocks < MIN_BLOCKS || blocks > MAX_ROUTE_BLOCKS) continue
      if (samePoint(route.dest, pose)) continue
      fares.push(makeFare(steps, route, pose))
    }
    // Saying the same thing twice running reads as a bug, so drop the repeat
    // wherever there is anything else to say.
    const fresh = fares.filter((fare) => routeUzbek(fare.steps) !== avoid)
    const usable = fresh.length ? fresh : fares
    if (usable.length) byShape.push(usable)
  }
  if (!byShape.length) return null
  return pickOne(pickOne(byShape, rng), rng)
}

// --- State ------------------------------------------------------------------

/**
 * What a drop-off came to.
 *
 * A wrong corner is not a life lost: directions can be read more than one way,
 * and the driver has already paid for the mistake in fuel. The passenger simply
 * stays in the cab and says this is not it — until they have said it
 * {@link PATIENCE} times, at which point they get out where they are and the
 * fare goes unpaid.
 */
export type DropResult = 'arrived' | 'refused' | 'gaveUp' | 'ignored'

/** A drop-off that ended the fare, kept on state so the map can show it. */
export interface Outcome {
  result: 'arrived' | 'gaveUp'
  /** Where the passenger was let out. */
  dropped: Point
  /** The route the instruction described — drawn on the map either way. */
  route: Route
  steps: Step[]
  /** Soʻm paid; zero unless they arrived. */
  paid: number
}

/** Wrong corners one passenger will sit through before giving up on you. */
export const PATIENCE = 3

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
  /** Soʻm in hand: fares in, fuel and translations out. Nothing left ends it. */
  balance: number
  /** The most the driver ever held — the score, since a shift can only end broke. */
  peak: number
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
    balance: START_FLOAT,
    peak: START_FLOAT,
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

/**
 * Takes money off the meter, and ends the shift if that empties it.
 *
 * A driver with nothing left cannot buy the fuel for the next block, so
 * reaching zero is the end of it. Nothing else can end a shift.
 */
function spend(state: TaxiState, som: number): TaxiState {
  const balance = state.balance - som
  return { ...state, balance, status: balance <= 0 ? 'over' : state.status }
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
 * — until they have said it {@link PATIENCE} times and give up on you, which is
 * the only way to lose a fare outright. Either ending carries the route the
 * instruction meant, which the map then draws: being shown the answer is how
 * the rules of "first on the left" are actually learned.
 */
export function dropOff(state: TaxiState): Drop {
  if (state.status !== 'playing' || !state.fare || state.outcome) {
    return { state, result: 'ignored', paid: 0 }
  }

  const dropped = { x: state.taxi.x, y: state.taxi.y }
  const { route, steps, pay } = state.fare

  if (samePoint(dropped, route.dest)) {
    const balance = state.balance + pay
    return {
      state: {
        ...state,
        balance,
        peak: Math.max(state.peak, balance),
        delivered: state.delivered + 1,
        outcome: { result: 'arrived', dropped, route, steps, paid: pay },
      },
      result: 'arrived',
      paid: pay,
    }
  }

  const patience = state.patience + 1
  if (patience < PATIENCE) {
    return { state: { ...state, patience }, result: 'refused', paid: 0 }
  }
  return {
    state: {
      ...state,
      patience,
      outcome: { result: 'gaveUp', dropped, route, steps, paid: 0 },
    },
    result: 'gaveUp',
    paid: 0,
  }
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

/** The best takings, in soʻm — the most the driver ever had in hand at once. */
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

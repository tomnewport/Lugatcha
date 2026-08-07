/**
 * "Number snake" — the bonus mini-game that plays after a completed daily
 * practice session.
 *
 * It is classic snake with one twist: the only food that grows the snake is the
 * *next number in the counting sequence*, written in Uzbek. Five fruits sit on
 * the board at a time — one correct, four decoys — and eating the right one
 * clears the board and lays out a fresh set for the next number.
 *
 * The decoys are deliberately chosen to be confusable in the two ways Uzbek
 * numbers actually trip a learner up:
 *   - two that *sound/read* alike (the smallest Levenshtein distances from the
 *     target's Uzbek reading, taken from outside the near band), and
 *   - two that sit within ±3 of the target, where you know the word but lose
 *     your place in the count.
 *
 * Everything here is pure and deterministic given an `rng`, so the component
 * stays a thin renderer and the rules can be tested directly.
 */
import { numberToUzbek } from './numbers'

/** numberToUzbek's upper bound. */
const MAX_NUMBER = 9999

/** Fruit the numbers wear. One distinct fruit per number on the board. */
export const FRUITS = [
  '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
  '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍏', '🍐',
] as const

/** Decoys drawn from ±this many either side of the target. */
const NEAR_SPAN = 3
const NEAR_DECOYS = 2
const SPELLING_DECOYS = 2
/** One correct number plus four decoys. */
export const FOOD_COUNT = 1 + NEAR_DECOYS + SPELLING_DECOYS

/** Snake length at the start of a run. */
const START_LENGTH = 3

/** Keep food off these edge columns/rows so the Uzbek label is not clipped. */
const EDGE_MARGIN_X = 1
const EDGE_MARGIN_Y = 1

/**
 * Cells directly ahead of the head that stay empty when a round is dealt. A
 * number appearing right under the snake's nose is unfair: there is no time to
 * read it, and a decoy there is an ambush rather than a mistake.
 */
const PATH_CLEARANCE = 5

export interface Point {
  x: number
  y: number
}

export interface Board {
  cols: number
  rows: number
}

export interface Food extends Point {
  value: number
  uzbek: string
  emoji: string
  correct: boolean
}

export type Direction = 'up' | 'down' | 'left' | 'right'

export type OverReason = { kind: 'self' } | { kind: 'wrong'; picked: Food; expected: number }

export interface GameState {
  board: Board
  /** Head first. */
  snake: Point[]
  dir: Direction
  /** Turns swiped ahead of time; one is consumed per tick. */
  queued: Direction[]
  /** The number that must be eaten next. */
  target: number
  foods: Food[]
  score: number
  status: 'ready' | 'playing' | 'over'
  over: OverReason | null
}

export interface Tick {
  state: GameState
  /** The correct food eaten on this tick, if any — the caller speaks it. */
  ate: Food | null
  over: OverReason | null
}

// --- Word similarity --------------------------------------------------------

/** Standard Levenshtein edit distance, two rows of the DP matrix. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let curr = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

function shuffleWith<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** The ±NEAR_SPAN band around `value`, excluding the value itself. */
function nearBand(value: number): number[] {
  const band: number[] = []
  for (let d = -NEAR_SPAN; d <= NEAR_SPAN; d++) {
    const n = value + d
    if (d !== 0 && n >= 0 && n <= MAX_NUMBER) band.push(n)
  }
  return band
}

/**
 * Four decoys for `value`: the two closest by Levenshtein distance on the Uzbek
 * reading (drawn from outside the ±3 band, so the two kinds of decoy stay
 * distinct) and two from within ±3.
 */
export function pickDecoys(value: number, rng: () => number = Math.random): number[] {
  const band = nearBand(value)
  const banned = new Set([value, ...band])
  const word = numberToUzbek(value)

  // Candidates for the spelling decoys: the counting range a learner has met,
  // widened to always reach past the target.
  const ceiling = Math.min(MAX_NUMBER, Math.max(99, value + 30))
  const candidates: number[] = []
  for (let n = 0; n <= ceiling; n++) {
    if (!banned.has(n)) candidates.push(n)
  }

  // Shuffle before the stable sort so equal distances break randomly.
  const spelling = shuffleWith(candidates, rng)
    .map((n) => ({ n, d: levenshtein(word, numberToUzbek(n)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, SPELLING_DECOYS)
    .map((c) => c.n)

  const near = shuffleWith(band, rng).slice(0, NEAR_DECOYS)

  return [...spelling, ...near]
}

// --- Board layout -----------------------------------------------------------

function key(p: Point): string {
  return `${p.x},${p.y}`
}

/** Chebyshev distance — food is spaced by this so labels rarely collide. */
function chebyshev(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

/**
 * Places `values` on free cells, the first one flagged correct. Cells are kept
 * two apart where possible, and off the edges where labels would be clipped.
 */
export function placeFoods(
  values: number[],
  board: Board,
  blocked: Point[],
  rng: () => number = Math.random,
): Food[] {
  const taken = new Set(blocked.map(key))
  const cells: Point[] = []
  for (let y = 0; y < board.rows - EDGE_MARGIN_Y; y++) {
    for (let x = EDGE_MARGIN_X; x < board.cols - EDGE_MARGIN_X; x++) {
      if (!taken.has(key({ x, y }))) cells.push({ x, y })
    }
  }

  const shuffled = shuffleWith(cells, rng)
  const chosen: Point[] = []
  // Two passes: spread out first, then fill any shortfall on a cramped board.
  for (const spacing of [2, 1]) {
    for (const cell of shuffled) {
      if (chosen.length >= values.length) break
      if (chosen.some((c) => chebyshev(c, cell) < spacing)) continue
      chosen.push(cell)
    }
    if (chosen.length >= values.length) break
  }

  const fruits = shuffleWith(FRUITS, rng)
  // Shuffle so the correct number is not always the first cell laid down.
  const items = shuffleWith(
    values.map((value, i) => ({ value, correct: i === 0, emoji: fruits[i % fruits.length] })),
    rng,
  )
  // A board too cramped for every fruit still has to hold the correct one.
  const kept =
    items.length <= chosen.length
      ? items
      : [items.find((i) => i.correct)!, ...items.filter((i) => !i.correct)].slice(0, chosen.length)

  return kept.map((item, i) => ({
    ...item,
    uzbek: numberToUzbek(item.value),
    x: chosen[i].x,
    y: chosen[i].y,
  }))
}

/** Where the snake is headed: its current direction plus any swiped turns. */
export interface Course {
  dir: Direction
  /** Turns already swiped and waiting their tick; consumed one per step. */
  queued?: Direction[]
}

/**
 * The next PATH_CLEARANCE cells the head will cross on its present course —
 * following any queued turns first, then carrying straight on.
 */
export function pathAhead(head: Point, course: Course, board: Board): Point[] {
  const cells: Point[] = []
  const turns = [...(course.queued ?? [])]
  let heading = course.dir
  let cell = head
  for (let i = 0; i < PATH_CLEARANCE; i++) {
    if (turns.length) heading = turns.shift()!
    cell = wrap(moved(cell, heading), board)
    cells.push(cell)
  }
  return cells
}

/**
 * A fresh set of five fruits for `target`, off the snake's own cells and off
 * the stretch of board it is about to drive through.
 */
export function buildRound(
  target: number,
  board: Board,
  snake: Point[],
  course: Course,
  rng: () => number = Math.random,
): Food[] {
  const blocked = [...snake, ...pathAhead(snake[0], course, board)]
  return placeFoods([target, ...pickDecoys(target, rng)], board, blocked, rng)
}

// --- Game rules -------------------------------------------------------------

function opposite(dir: Direction): Direction {
  return dir === 'up' ? 'down' : dir === 'down' ? 'up' : dir === 'left' ? 'right' : 'left'
}

function moved(p: Point, dir: Direction): Point {
  if (dir === 'up') return { x: p.x, y: p.y - 1 }
  if (dir === 'down') return { x: p.x, y: p.y + 1 }
  if (dir === 'left') return { x: p.x - 1, y: p.y }
  return { x: p.x + 1, y: p.y }
}

/** Edges wrap: the challenge is the numbers, not the walls. */
function wrap(p: Point, board: Board): Point {
  return {
    x: (p.x + board.cols) % board.cols,
    y: (p.y + board.rows) % board.rows,
  }
}

/** A run waiting for its first swipe. Counting starts at `start`. */
export function createGame(board: Board, rng: () => number = Math.random, start = 1): GameState {
  const y = Math.floor(board.rows / 2)
  const headX = Math.floor(board.cols / 2)
  const snake: Point[] = []
  for (let i = 0; i < START_LENGTH; i++) {
    snake.push({ x: Math.max(0, headX - i), y })
  }
  return {
    board,
    snake,
    dir: 'right',
    queued: [],
    target: start,
    foods: buildRound(start, board, snake, { dir: 'right' }, rng),
    score: 0,
    status: 'ready',
    over: null,
  }
}

/** Starts a `ready` game; any other status is returned untouched. */
export function startGame(state: GameState): GameState {
  return state.status === 'ready' ? { ...state, status: 'playing' } : state
}

/**
 * Queues a turn. Reversing onto yourself and repeating the current heading are
 * both ignored; at most two turns are held so a quick double-swipe registers.
 */
export function queueTurn(state: GameState, dir: Direction): GameState {
  if (state.status === 'over') return state
  const last = state.queued.length ? state.queued[state.queued.length - 1] : state.dir
  if (dir === last || dir === opposite(last)) return state
  if (state.queued.length >= 2) return state
  return { ...state, queued: [...state.queued, dir] }
}

/** Advances one tick: consume a queued turn, move the head, resolve what it hits. */
export function advance(state: GameState, rng: () => number = Math.random): Tick {
  if (state.status !== 'playing') return { state, ate: null, over: null }

  const queued = [...state.queued]
  const dir = queued.length ? queued.shift()! : state.dir
  const head = wrap(moved(state.snake[0], dir), state.board)
  const food = state.foods.find((f) => f.x === head.x && f.y === head.y) ?? null

  if (food && !food.correct) {
    const over: OverReason = { kind: 'wrong', picked: food, expected: state.target }
    return {
      state: { ...state, dir, queued, snake: [head, ...state.snake], status: 'over', over },
      ate: null,
      over,
    }
  }

  // The tail cell frees up as the snake moves, unless this bite grows it.
  const grow = food !== null
  const body = grow ? state.snake : state.snake.slice(0, -1)
  if (body.some((p) => p.x === head.x && p.y === head.y)) {
    const over: OverReason = { kind: 'self' }
    return { state: { ...state, dir, queued, status: 'over', over }, ate: null, over }
  }

  const snake = [head, ...body]
  if (!grow) return { state: { ...state, dir, queued, snake }, ate: null, over: null }

  const target = state.target + 1
  return {
    state: {
      ...state,
      dir,
      queued,
      snake,
      score: state.score + 1,
      target,
      foods: buildRound(target, state.board, snake, { dir, queued }, rng),
    },
    ate: food,
    over: null,
  }
}

/** Milliseconds per tick — the snake speeds up as the count climbs. */
export function tickInterval(score: number): number {
  return Math.max(120, 260 - score * 8)
}

// --- High score -------------------------------------------------------------

const HIGH_SCORE_KEY = 'lugatcha.snakeHighScore'

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

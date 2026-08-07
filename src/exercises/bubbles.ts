/**
 * "Bubble trouble" — the colour mini-game that plays from the School's Colours
 * group.
 *
 * It is the arcade classic (walk left and right, fire a harpoon straight up,
 * big bubbles split into smaller ones) with one twist that makes it a
 * vocabulary game: **the harpoon only bites the colour named at the bottom of
 * the screen**, and that name is written in Uzbek. Every other bubble is immune
 * — the rope passes straight through it — but every bubble can still knock you
 * over, so a board you cannot shoot is a board you have to dodge.
 *
 * The difficulty ramp is the palette itself. A run opens with a single colour,
 * so the first shot cannot be wrong, and every bubble popped adds one more
 * colour to the pool until all ten are in play. Split children are dealt fresh
 * colours from that pool rather than inheriting their parent's, so popping a
 * bubble genuinely changes what is on the board and the target has to be read
 * again.
 *
 * Two rules keep it fair:
 *   - the named colour is always a colour that is actually on the board, so
 *     there is never a shot that cannot be taken (`ensureTarget`), and
 *   - the learner can re-roll the name with the die (`rerollTarget`), which
 *     always lands on a *different* colour when the board offers one.
 *
 * Everything here is pure and deterministic given an `rng`: the component is
 * only a renderer and an input loop, and the rules are unit-tested directly.
 */
import type { Word } from '@/db/types'

// --- Colours ----------------------------------------------------------------

export interface BubbleColour {
  /** Word id, e.g. "core.colour-red". */
  id: string
  /** The Uzbek name — the whole point of the game. */
  uzbek: string
  /** Hex fill, straight from the vocabulary data. */
  swatch: string
}

/** The playable colours of a vocab group: its words that carry a swatch. */
export function coloursFromWords(words: readonly Word[]): BubbleColour[] {
  const seen = new Set<string>()
  const colours: BubbleColour[] = []
  for (const w of words) {
    if (!w.swatch || seen.has(w.id)) continue
    seen.add(w.id)
    colours.push({ id: w.id, uzbek: w.uzbek, swatch: w.swatch })
  }
  return colours
}

// --- Arena and physics ------------------------------------------------------

/**
 * The arena is measured in abstract units, 100 wide, so the rules never depend
 * on pixels. The renderer picks a scale and a height to suit the viewport.
 */
export const ARENA_WIDTH = 100
export const MIN_ARENA_HEIGHT = 55
export const MAX_ARENA_HEIGHT = 135

export interface Arena {
  width: number
  height: number
}

/** 0 is the biggest bubble; SIZE_COUNT - 1 pops instead of splitting. */
export type BubbleSize = 0 | 1 | 2 | 3
export const SIZE_COUNT = 4

const RADII = [7.2, 5, 3.4, 2.3]
/**
 * How high each size bounces, as a fraction of the arena's height. Fixed per
 * size — that predictability is what makes a bounce something you can aim at —
 * but relative, so a tall phone gets a tall game rather than dead space above
 * the bubbles.
 */
const APEX_FRACTION = [0.74, 0.58, 0.44, 0.32]
/** Horizontal drift per size; the small ones are the quick ones. */
const DRIFT = [10, 12.5, 15, 17.5]

export const GRAVITY = 95

const PLAYER_WIDTH = 5.5
const PLAYER_HEIGHT = 8
/** Arena units per second on foot. The same cap applies however you steer. */
export const PLAYER_SPEED = 54
/** Arena heights per second, so the shot takes the same time on any screen. */
const HARPOON_SPEED_FACTOR = 1.25

const START_LIVES = 3
/** Big bubbles dealt at the hardest level. */
const MAX_BIG = 4

/** Longest slice the integrator will take, so nothing tunnels at low frame rates. */
const MAX_STEP = 1 / 120

export function bubbleRadius(size: BubbleSize): number {
  return RADII[size]
}

/** Upward speed that lands a bounce exactly on this size's apex. */
function bounceSpeed(size: BubbleSize, arena: Arena): number {
  return Math.sqrt(2 * GRAVITY * APEX_FRACTION[size] * arena.height)
}

/** How high above the floor a bubble of this size turns around. */
export function apexHeight(size: BubbleSize, arena: Arena): number {
  return APEX_FRACTION[size] * arena.height
}

// --- State ------------------------------------------------------------------

export interface Bubble {
  id: number
  /** Centre, in arena units; y grows downward, the floor is `arena.height`. */
  x: number
  y: number
  vx: number
  vy: number
  size: BubbleSize
  colour: BubbleColour
}

export interface Harpoon {
  x: number
  /** Height of the rope's tip; the rope runs from here down to the floor. */
  tipY: number
  /** Immune bubbles already passed through, so each is announced only once. */
  pinged: number[]
}

export type Move = -1 | 0 | 1

export type Status = 'ready' | 'playing' | 'cleared' | 'over'

export interface BubbleGame {
  arena: Arena
  /** Every colour the group offers. */
  pool: BubbleColour[]
  /** Colours in play — starts at one and grows with every pop. */
  palette: BubbleColour[]
  bubbles: Bubble[]
  /** Player centre on the floor. */
  playerX: number
  move: Move
  /**
   * Where a dragging finger is asking the player to stand. The walk there is
   * still capped at PLAYER_SPEED, so the avatar follows behind the finger
   * rather than snapping to it. `null` hands steering back to `move`.
   */
  aimX: number | null
  harpoon: Harpoon | null
  /** The colour named at the bottom; always present on the board. */
  target: BubbleColour
  popped: number
  lives: number
  level: number
  status: Status
  nextId: number
}

export type GameEvent =
  /** A bubble of the named colour was hit. */
  | { kind: 'pop'; colour: BubbleColour; size: BubbleSize }
  /** The rope passed through a bubble of the wrong colour. */
  | { kind: 'immune'; id: number; colour: BubbleColour }
  /** The named colour changed — the renderer speaks it. */
  | { kind: 'target'; colour: BubbleColour }
  | { kind: 'hurt'; lives: number }
  | { kind: 'cleared'; level: number }
  | { kind: 'over' }

export interface StepResult {
  state: BubbleGame
  events: GameEvent[]
}

// --- Random helpers ---------------------------------------------------------

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length) % items.length]
}

// --- The named colour -------------------------------------------------------

/** The distinct colours currently on the board, in first-seen order. */
export function coloursOnBoard(bubbles: readonly Bubble[]): BubbleColour[] {
  const seen = new Map<string, BubbleColour>()
  for (const b of bubbles) if (!seen.has(b.colour.id)) seen.set(b.colour.id, b.colour)
  return [...seen.values()]
}

/**
 * Re-points the target at a colour that is actually on the board. A board that
 * has run empty keeps its name — there is nothing to point at, and the level is
 * over anyway.
 */
export function ensureTarget(state: BubbleGame, rng: () => number = Math.random): BubbleGame {
  const onBoard = coloursOnBoard(state.bubbles)
  if (!onBoard.length) return state
  if (onBoard.some((c) => c.id === state.target.id)) return state
  return { ...state, target: pick(onBoard, rng) }
}

/**
 * The die: names a different colour from the board. With only one colour left
 * in front of you there is nothing to swap to, so the name stands.
 */
export function rerollTarget(state: BubbleGame, rng: () => number = Math.random): BubbleGame {
  const others = coloursOnBoard(state.bubbles).filter((c) => c.id !== state.target.id)
  if (!others.length) return state
  return { ...state, target: pick(others, rng) }
}

/** Adds one unused colour to the palette. Once all ten are in, it stays put. */
function growPalette(state: BubbleGame, rng: () => number): BubbleColour[] {
  const inUse = new Set(state.palette.map((c) => c.id))
  const fresh = state.pool.filter((c) => !inUse.has(c.id))
  if (!fresh.length) return state.palette
  return [...state.palette, pick(fresh, rng)]
}

// --- Dealing a level --------------------------------------------------------

/** Big bubbles on a level: one to start, climbing to MAX_BIG. */
export function bigBubblesForLevel(level: number): number {
  return Math.min(MAX_BIG, 1 + Math.floor((level - 1) / 2))
}

function makeBubble(
  id: number,
  size: BubbleSize,
  x: number,
  y: number,
  vx: number,
  vy: number,
  colour: BubbleColour,
): Bubble {
  return { id, size, x, y, vx, vy, colour }
}

/**
 * Lays out a level's bubbles, spaced across the arena and dropped from a little
 * under the ceiling so the opening seconds are readable.
 */
export function dealLevel(
  state: BubbleGame,
  rng: () => number = Math.random,
): { bubbles: Bubble[]; nextId: number } {
  const count = bigBubblesForLevel(state.level)
  const bubbles: Bubble[] = []
  let nextId = state.nextId
  const lane = state.arena.width / (count + 1)
  const radius = bubbleRadius(0)

  for (let i = 0; i < count; i++) {
    const x = lane * (i + 1)
    bubbles.push(
      makeBubble(
        nextId++,
        0,
        // Nudge off the lane centre so a level never looks mechanical.
        Math.min(state.arena.width - radius, Math.max(radius, x + (rng() - 0.5) * lane * 0.4)),
        radius + 2 + rng() * 6,
        (rng() < 0.5 ? -1 : 1) * DRIFT[0],
        0,
        pick(state.palette, rng),
      ),
    )
  }
  return { bubbles, nextId }
}

/**
 * A fresh run: one colour, one big bubble, three lives. `pool` must hold at
 * least one colour — the caller picks a group that has swatched words.
 */
export function createGame(
  arena: Arena,
  pool: readonly BubbleColour[],
  rng: () => number = Math.random,
): BubbleGame {
  const colours = [...pool]
  const first = pick(colours, rng)
  const base: BubbleGame = {
    arena,
    pool: colours,
    palette: [first],
    bubbles: [],
    playerX: arena.width / 2,
    move: 0,
    aimX: null,
    harpoon: null,
    target: first,
    popped: 0,
    lives: START_LIVES,
    level: 1,
    status: 'ready',
    nextId: 1,
  }
  const { bubbles, nextId } = dealLevel(base, rng)
  return ensureTarget({ ...base, bubbles, nextId }, rng)
}

/** Starts a `ready` game; any other status is handed back untouched. */
export function startGame(state: BubbleGame): BubbleGame {
  return state.status === 'ready' ? { ...state, status: 'playing' } : state
}

/** Deals the next level, keeping the palette, score and lives. */
export function nextLevel(state: BubbleGame, rng: () => number = Math.random): BubbleGame {
  const advanced = { ...state, level: state.level + 1, harpoon: null, status: 'playing' as Status }
  const { bubbles, nextId } = dealLevel(advanced, rng)
  return ensureTarget({ ...advanced, bubbles, nextId }, rng)
}

/** Re-deals the level after a hit, at the same difficulty. */
function redealLevel(state: BubbleGame, rng: () => number): BubbleGame {
  // A stale aim would march the player off to wherever the last drag ended.
  const reset = { ...state, harpoon: null, playerX: state.arena.width / 2, move: 0, aimX: null }
  const { bubbles, nextId } = dealLevel(reset, rng)
  return ensureTarget({ ...reset, bubbles, nextId }, rng)
}

// --- Input ------------------------------------------------------------------

export function setMove(state: BubbleGame, move: Move): BubbleGame {
  return { ...state, move }
}

/**
 * Points the player at an arena x — the drag. Steering this way overrides the
 * pads and the keyboard until `clearAim`, but obeys the same speed limit.
 */
export function setAim(state: BubbleGame, aimX: number): BubbleGame {
  return { ...state, aimX }
}

/** Ends a drag, handing steering back to the pads and the keyboard. */
export function clearAim(state: BubbleGame): BubbleGame {
  return state.aimX === null ? state : { ...state, aimX: null }
}

/** One rope at a time — the core constraint of the original. */
export function fire(state: BubbleGame): BubbleGame {
  if (state.status !== 'playing' || state.harpoon) return state
  return { ...state, harpoon: { x: state.playerX, tipY: state.arena.height, pinged: [] } }
}

// --- Collision --------------------------------------------------------------

/** The rope is a vertical segment at `x`, from its tip down to the floor. */
function ropeHits(bubble: Bubble, harpoon: Harpoon): boolean {
  const r = bubbleRadius(bubble.size)
  return Math.abs(bubble.x - harpoon.x) < r && bubble.y + r >= harpoon.tipY
}

/** Circle against the player's box on the floor. */
function playerHit(bubble: Bubble, state: BubbleGame): boolean {
  const r = bubbleRadius(bubble.size)
  const left = state.playerX - PLAYER_WIDTH / 2
  const right = state.playerX + PLAYER_WIDTH / 2
  const top = state.arena.height - PLAYER_HEIGHT
  const nearestX = Math.min(right, Math.max(left, bubble.x))
  const nearestY = Math.min(state.arena.height, Math.max(top, bubble.y))
  const dx = bubble.x - nearestX
  const dy = bubble.y - nearestY
  return dx * dx + dy * dy < r * r
}

/** The two children of a split, dealt fresh colours from the palette. */
function split(
  bubble: Bubble,
  nextId: number,
  palette: readonly BubbleColour[],
  arena: Arena,
  rng: () => number,
) {
  const size = (bubble.size + 1) as BubbleSize
  const speed = DRIFT[size]
  // Children leave with a shared upward kick, so a split reads as one burst.
  const lift = -bounceSpeed(size, arena) * 0.55
  return [-1, 1].map((dir, i) =>
    makeBubble(nextId + i, size, bubble.x, bubble.y, dir * speed, lift, pick(palette, rng)),
  )
}

// --- The tick ---------------------------------------------------------------

/**
 * Advances the world by `dt` seconds, in slices small enough that nothing
 * passes through anything. Returns the new state plus whatever the renderer
 * needs to react to (sounds, haptics, banners).
 */
export function step(
  state: BubbleGame,
  dt: number,
  rng: () => number = Math.random,
): StepResult {
  if (state.status !== 'playing') return { state, events: [] }

  const events: GameEvent[] = []
  let next = state
  // A backgrounded tab hands back a huge dt; cap it rather than fast-forward.
  let remaining = Math.min(dt, 0.1)

  while (remaining > 0 && next.status === 'playing') {
    const slice = Math.min(MAX_STEP, remaining)
    remaining -= slice
    next = stepOnce(next, slice, rng, events)
  }

  return { state: next, events }
}

function stepOnce(
  state: BubbleGame,
  dt: number,
  rng: () => number,
  events: GameEvent[],
): BubbleGame {
  const { arena } = state

  // --- Player ---
  const halfPlayer = PLAYER_WIDTH / 2
  const reach = PLAYER_SPEED * dt
  // A drag closes the gap to the finger at walking pace, landing exactly on it
  // once within reach rather than overshooting and jittering.
  const stride =
    state.aimX === null
      ? state.move * reach
      : Math.max(-reach, Math.min(reach, state.aimX - state.playerX))
  const playerX = Math.min(
    arena.width - halfPlayer,
    Math.max(halfPlayer, state.playerX + stride),
  )

  // --- Bubbles ---
  const bubbles = state.bubbles.map((b) => {
    const r = bubbleRadius(b.size)
    let { x, y, vx, vy } = b
    x += vx * dt
    vy += GRAVITY * dt
    y += vy * dt

    if (x - r < 0) {
      x = r
      vx = Math.abs(vx)
    } else if (x + r > arena.width) {
      x = arena.width - r
      vx = -Math.abs(vx)
    }

    if (y + r > arena.height) {
      // The fixed apex is what makes the bounce predictable enough to aim at.
      y = arena.height - r
      vy = -bounceSpeed(b.size, arena)
    } else if (y - r < 0) {
      y = r
      vy = Math.abs(vy)
    }

    return { ...b, x, y, vx, vy }
  })

  let next: BubbleGame = { ...state, playerX, bubbles }

  // --- Harpoon ---
  if (next.harpoon) {
    const tipY = next.harpoon.tipY - HARPOON_SPEED_FACTOR * arena.height * dt
    let harpoon: Harpoon | null = { ...next.harpoon, tipY }
    const struck = next.bubbles.find((b) => ropeHits(b, harpoon!) && b.colour.id === next.target.id)

    if (struck) {
      events.push({ kind: 'pop', colour: struck.colour, size: struck.size })
      const palette = growPalette(next, rng)
      const rest = next.bubbles.filter((b) => b.id !== struck.id)
      const children =
        struck.size < SIZE_COUNT - 1
          ? split(struck, next.nextId, palette, next.arena, rng)
          : []

      next = {
        ...next,
        palette,
        bubbles: [...rest, ...children],
        nextId: next.nextId + children.length,
        popped: next.popped + 1,
        harpoon: null,
      }

      const before = next.target
      next = ensureTarget(next, rng)
      if (next.target.id !== before.id) events.push({ kind: 'target', colour: next.target })

      if (!next.bubbles.length) {
        events.push({ kind: 'cleared', level: next.level })
        return { ...next, status: 'cleared' }
      }
    } else {
      // Wrong colour: the rope goes straight through, announced once each.
      const pinged = [...harpoon.pinged]
      for (const b of next.bubbles) {
        if (ropeHits(b, harpoon) && !pinged.includes(b.id)) {
          pinged.push(b.id)
          events.push({ kind: 'immune', id: b.id, colour: b.colour })
        }
      }
      harpoon = tipY <= 0 ? null : { ...harpoon, pinged }
      next = { ...next, harpoon }
    }
  }

  // --- The player's own skin ---
  if (next.bubbles.some((b) => playerHit(b, next))) {
    const lives = next.lives - 1
    if (lives <= 0) {
      events.push({ kind: 'hurt', lives: 0 })
      events.push({ kind: 'over' })
      return { ...next, lives: 0, harpoon: null, status: 'over' }
    }
    events.push({ kind: 'hurt', lives })
    return redealLevel({ ...next, lives }, rng)
  }

  return next
}

// --- Geometry for the renderer ----------------------------------------------

export const PLAYER_SIZE = { width: PLAYER_WIDTH, height: PLAYER_HEIGHT }

// --- High score -------------------------------------------------------------

const HIGH_SCORE_KEY = 'lugatcha.bubblesHighScore'

export function readHighScore(): number {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY)
    const n = raw === null ? 0 : Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

/** Stores `score` when it beats the stored best; true when it did. */
export function recordHighScore(score: number): boolean {
  if (score <= readHighScore()) return false
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score))
  } catch {
    // private mode — the run still counts, it just is not remembered
  }
  return true
}

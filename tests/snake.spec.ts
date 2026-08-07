import { describe, it, expect, beforeEach } from 'vitest'
import {
  levenshtein,
  pickDecoys,
  placeFoods,
  buildRound,
  pathAhead,
  createGame,
  startGame,
  queueTurn,
  advance,
  tickInterval,
  readHighScore,
  recordHighScore,
  FOOD_COUNT,
  type Direction,
  type GameState,
} from '@/exercises/snake'
import { numberToUzbek } from '@/exercises/numbers'

/** Deterministic rng: cycles a fixed sequence so rounds are reproducible. */
function seeded(seed = 1): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const board = { cols: 10, rows: 14 }

describe('levenshtein', () => {
  it('is zero for identical strings and counts single edits', () => {
    expect(levenshtein('besh', 'besh')).toBe(0)
    expect(levenshtein('besh', 'bosh')).toBe(1)
    expect(levenshtein('olti', 'oltmish')).toBe(3)
  })

  it('falls back to length when one side is empty', () => {
    expect(levenshtein('', 'yetti')).toBe(5)
    expect(levenshtein('yetti', '')).toBe(5)
  })
})

describe('pickDecoys', () => {
  it('returns four distinct decoys that are never the answer', () => {
    for (let value = 0; value < 60; value++) {
      const decoys = pickDecoys(value, seeded(value + 1))
      expect(decoys).toHaveLength(4)
      expect(new Set(decoys).size).toBe(4)
      expect(decoys).not.toContain(value)
      expect(decoys.every((n) => n >= 0)).toBe(true)
    }
  })

  it('puts two decoys within ±3 of the answer', () => {
    for (let value = 0; value < 40; value++) {
      const decoys = pickDecoys(value, seeded(value + 7))
      const near = decoys.filter((n) => Math.abs(n - value) <= 3)
      expect(near).toHaveLength(2)
    }
  })

  it('picks the other two by shortest Levenshtein distance from outside that band', () => {
    const value = 20
    const word = numberToUzbek(value)
    const spelling = pickDecoys(value, seeded(3)).filter((n) => Math.abs(n - value) > 3)
    expect(spelling).toHaveLength(2)

    // Nothing outside the ±3 band should be a closer spelling than what was picked.
    const worst = Math.max(...spelling.map((n) => levenshtein(word, numberToUzbek(n))))
    for (let n = 0; n <= 99; n++) {
      if (Math.abs(n - value) <= 3) continue
      expect(levenshtein(word, numberToUzbek(n))).toBeGreaterThanOrEqual(worst)
    }
  })
})

describe('placeFoods', () => {
  it('lays out one correct fruit and four decoys on free, distinct cells', () => {
    const snake = [
      { x: 5, y: 7 },
      { x: 4, y: 7 },
      { x: 3, y: 7 },
    ]
    const foods = buildRound(7, board, snake, { dir: 'right' }, seeded(11))

    expect(foods).toHaveLength(FOOD_COUNT)
    expect(foods.filter((f) => f.correct)).toHaveLength(1)
    expect(foods.find((f) => f.correct)!.value).toBe(7)
    expect(foods.find((f) => f.correct)!.uzbek).toBe('yetti')

    const cells = new Set(foods.map((f) => `${f.x},${f.y}`))
    expect(cells.size).toBe(FOOD_COUNT)
    for (const seg of snake) expect(cells.has(`${seg.x},${seg.y}`)).toBe(false)
    for (const food of foods) {
      expect(food.x).toBeGreaterThan(0)
      expect(food.x).toBeLessThan(board.cols - 1)
      expect(food.y).toBeLessThan(board.rows - 1)
      expect(food.emoji).toBeTruthy()
      expect(food.uzbek).toBe(numberToUzbek(food.value))
    }
    // Distinct fruit so two numbers are never told apart by their label alone.
    expect(new Set(foods.map((f) => f.emoji)).size).toBe(FOOD_COUNT)
  })

  it('leaves the five cells ahead of the head clear, whichever way it faces', () => {
    for (const dir of ['up', 'down', 'left', 'right'] as Direction[]) {
      const snake = [{ x: 5, y: 7 }]
      const ahead = pathAhead(snake[0], { dir }, board)
      expect(ahead).toHaveLength(5)

      for (let seed = 1; seed <= 25; seed++) {
        const foods = buildRound(12, board, snake, { dir }, seeded(seed))
        for (const cell of ahead) {
          expect(foods.some((f) => f.x === cell.x && f.y === cell.y)).toBe(false)
        }
      }
    }
  })

  it('clears the path across a wrapped edge too', () => {
    // Heading down off the bottom row: the clear stretch reappears at the top.
    const snake = [{ x: 5, y: board.rows - 1 }]
    const ahead = pathAhead(snake[0], { dir: 'down' }, board)
    expect(ahead).toEqual([0, 1, 2, 3, 4].map((y) => ({ x: 5, y })))

    for (let seed = 1; seed <= 25; seed++) {
      const foods = buildRound(12, board, snake, { dir: 'down' }, seeded(seed))
      for (const cell of ahead) {
        expect(foods.some((f) => f.x === cell.x && f.y === cell.y)).toBe(false)
      }
    }
  })

  it('follows queued turns when clearing the path', () => {
    // Swiped down then left: the cleared stretch bends with the snake.
    const snake = [{ x: 5, y: 5 }]
    const course = { dir: 'right' as Direction, queued: ['down', 'left'] as Direction[] }
    expect(pathAhead(snake[0], course, board)).toEqual([
      { x: 5, y: 6 },
      { x: 4, y: 6 },
      { x: 3, y: 6 },
      { x: 2, y: 6 },
      { x: 1, y: 6 },
    ])

    for (let seed = 1; seed <= 25; seed++) {
      const foods = buildRound(12, board, snake, course, seeded(seed))
      for (const cell of pathAhead(snake[0], course, board)) {
        expect(foods.some((f) => f.x === cell.x && f.y === cell.y)).toBe(false)
      }
    }
  })

  it('clears the path from where the head lands after a bite', () => {
    const rng = seeded(21)
    let state = startGame(createGame(board, rng))
    const correct = state.foods.find((f) => f.correct)!
    state = { ...state, snake: [{ x: correct.x - 1, y: correct.y }], dir: 'right' }

    const tick = advance(state, rng)
    expect(tick.ate).not.toBeNull() // the round really was re-dealt
    const after = tick.state
    for (const cell of pathAhead(after.snake[0], { dir: after.dir, queued: after.queued }, board)) {
      expect(after.foods.some((f) => f.x === cell.x && f.y === cell.y)).toBe(false)
    }
  })

  it('keeps the correct fruit even when the board has too few cells', () => {
    const tiny = { cols: 3, rows: 2 }
    const foods = placeFoods([4, 1, 2, 3, 5], tiny, [], seeded(5))
    expect(foods.length).toBeLessThan(FOOD_COUNT)
    expect(foods.filter((f) => f.correct)).toHaveLength(1)
    expect(foods.find((f) => f.correct)!.value).toBe(4)
  })
})

/** Steers the snake onto `target` and ticks until it is eaten. */
function eat(state: GameState, target: { x: number; y: number }, rng: () => number) {
  let current = state
  for (let guard = 0; guard < 200; guard++) {
    const head = current.snake[0]
    if (head.x === target.x && head.y === target.y) return current
    const dir: Direction =
      head.x !== target.x ? (target.x > head.x ? 'right' : 'left') : target.y > head.y ? 'down' : 'up'
    current = queueTurn(current, dir)
    const result = advance(current, rng)
    current = result.state
    if (current.status === 'over') return current
  }
  throw new Error('snake never reached the food')
}

describe('game rules', () => {
  it('starts ready, with a three-segment snake and the first number on the board', () => {
    const state = createGame(board, seeded(2))
    expect(state.status).toBe('ready')
    expect(state.snake).toHaveLength(3)
    expect(state.target).toBe(1)
    expect(state.score).toBe(0)
    expect(state.foods.find((f) => f.correct)!.uzbek).toBe('bir')
    // A ready game does not move.
    expect(advance(state).state).toBe(state)
  })

  it('grows, scores and moves on to the next number when the right fruit is eaten', () => {
    const rng = seeded(4)
    const start = startGame(createGame(board, rng))
    const correct = start.foods.find((f) => f.correct)!
    const after = eat(start, correct, rng)

    expect(after.status).toBe('playing')
    expect(after.score).toBe(1)
    expect(after.target).toBe(2)
    expect(after.snake).toHaveLength(4)
    expect(after.foods.find((f) => f.correct)!.value).toBe(2)
    // The old set is gone: every fruit on the board is new.
    expect(after.foods.some((f) => f.x === correct.x && f.y === correct.y && f.value === correct.value)).toBe(false)
  })

  it('reports the eaten number so the caller can speak it', () => {
    const rng = seeded(9)
    let state = startGame(createGame(board, rng))
    const correct = state.foods.find((f) => f.correct)!
    // Park the head one cell short of the fruit, then inspect that single tick.
    state = { ...state, snake: [{ x: correct.x - 1, y: correct.y }], dir: 'right' }
    const tick = advance(state, rng)
    expect(tick.ate?.value).toBe(1)
    expect(tick.ate?.uzbek).toBe('bir')
    expect(tick.over).toBeNull()
  })

  it('ends the run on a wrong number and says which one was needed', () => {
    const rng = seeded(6)
    const start = startGame(createGame(board, rng))
    const decoy = start.foods.find((f) => !f.correct)!
    const after = eat(start, decoy, rng)

    expect(after.status).toBe('over')
    expect(after.over).toEqual({ kind: 'wrong', picked: decoy, expected: 1 })
    expect(after.score).toBe(0)
  })

  it('wraps around the edges instead of crashing into them', () => {
    const rng = seeded(8)
    let state = startGame(createGame(board, rng))
    state = { ...state, foods: [], snake: [{ x: board.cols - 1, y: 3 }], dir: 'right' }
    const after = advance(state, rng).state
    expect(after.snake[0]).toEqual({ x: 0, y: 3 })
    expect(after.status).toBe('playing')
  })

  it('ends the run when the snake bites itself', () => {
    const rng = seeded(10)
    const snake = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 4, y: 6 },
      { x: 4, y: 5 },
      { x: 4, y: 4 },
    ]
    const state: GameState = { ...startGame(createGame(board, rng)), snake, dir: 'left', foods: [] }
    const after = advance(state, rng)
    expect(after.state.status).toBe('over')
    expect(after.over).toEqual({ kind: 'self' })
  })

  it('ignores reversals and repeats, and holds at most two queued turns', () => {
    const state = startGame(createGame(board, seeded(12))) // heading right
    expect(queueTurn(state, 'left').queued).toEqual([])
    expect(queueTurn(state, 'right').queued).toEqual([])

    const turned = queueTurn(queueTurn(queueTurn(state, 'up'), 'left'), 'down')
    expect(turned.queued).toEqual(['up', 'left'])
  })

  it('consumes one queued turn per tick', () => {
    const rng = seeded(13)
    let state = { ...startGame(createGame(board, rng)), foods: [] }
    state = queueTurn(queueTurn(state, 'up'), 'left')
    state = advance(state, rng).state
    expect(state.dir).toBe('up')
    expect(state.queued).toEqual(['left'])
    state = advance(state, rng).state
    expect(state.dir).toBe('left')
    expect(state.queued).toEqual([])
  })

  it('speeds up as the score climbs, down to a floor', () => {
    expect(tickInterval(0)).toBeGreaterThan(tickInterval(5))
    expect(tickInterval(100)).toBe(120)
  })
})

describe('high score', () => {
  beforeEach(() => localStorage.clear())

  it('starts at zero and only stores an improvement', () => {
    expect(readHighScore()).toBe(0)
    expect(recordHighScore(4)).toBe(true)
    expect(readHighScore()).toBe(4)
    expect(recordHighScore(3)).toBe(false)
    expect(readHighScore()).toBe(4)
    expect(recordHighScore(9)).toBe(true)
    expect(readHighScore()).toBe(9)
  })

  it('survives junk in storage', () => {
    localStorage.setItem('lugatcha.snakeHighScore', 'not a number')
    expect(readHighScore()).toBe(0)
  })
})

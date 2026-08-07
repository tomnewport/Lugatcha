import { describe, it, expect, beforeEach } from 'vitest'
import {
  coloursFromWords,
  coloursOnBoard,
  ensureTarget,
  rerollTarget,
  bigBubblesForLevel,
  bubbleRadius,
  apexHeight,
  createGame,
  startGame,
  setMove,
  setAim,
  clearAim,
  fire,
  step,
  nextLevel,
  readHighScore,
  recordHighScore,
  ARENA_WIDTH,
  SIZE_COUNT,
  PLAYER_SIZE,
  PLAYER_SPEED,
  type Arena,
  type Bubble,
  type BubbleColour,
  type BubbleGame,
  type BubbleSize,
} from '@/exercises/bubbles'
import type { Word } from '@/db/types'

/** Deterministic rng: cycles a fixed sequence so runs are reproducible. */
function seeded(seed = 1): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const arena: Arena = { width: ARENA_WIDTH, height: 70 }

const POOL: BubbleColour[] = [
  { id: 'c.red', uzbek: 'qizil', swatch: '#d1342f' },
  { id: 'c.blue', uzbek: "ko'k", swatch: '#2563b8' },
  { id: 'c.green', uzbek: 'yashil', swatch: '#2f9e44' },
  { id: 'c.yellow', uzbek: 'sariq', swatch: '#f5c518' },
]

function colour(id: string): BubbleColour {
  return POOL.find((c) => c.id === id)!
}

/** A bubble parked where it will not touch the player or a wall. */
function bubble(id: number, c: BubbleColour, over: Partial<Bubble> = {}): Bubble {
  return { id, x: 50, y: 20, vx: 0, vy: 0, size: 0, colour: c, ...over }
}

/** A playing game with an explicit board, bypassing the random deal. */
function gameWith(bubbles: Bubble[], over: Partial<BubbleGame> = {}): BubbleGame {
  const base = startGame(createGame(arena, POOL, seeded()))
  return {
    ...base,
    bubbles,
    nextId: Math.max(0, ...bubbles.map((b) => b.id)) + 1,
    target: bubbles[0]?.colour ?? base.target,
    ...over,
  }
}

describe('coloursFromWords', () => {
  it('keeps only words that carry a swatch', () => {
    const words = [
      { id: 'core.colour-red', uzbek: 'qizil', english: 'red', theme: 'core', swatch: '#d1342f' },
      { id: 'core.non-colour', uzbek: 'non', english: 'bread', theme: 'core' },
    ] as Word[]
    expect(coloursFromWords(words)).toEqual([
      { id: 'core.colour-red', uzbek: 'qizil', swatch: '#d1342f' },
    ])
  })

  it('drops duplicate ids', () => {
    const words = [
      { id: 'core.colour-red', uzbek: 'qizil', english: 'red', theme: 'core', swatch: '#d1342f' },
      { id: 'core.colour-red', uzbek: 'qizil', english: 'red', theme: 'core', swatch: '#000000' },
    ] as Word[]
    expect(coloursFromWords(words)).toHaveLength(1)
  })
})

describe('a new run', () => {
  it('opens on a single colour, so the first shot cannot be wrong', () => {
    const game = createGame(arena, POOL, seeded(7))
    expect(game.palette).toHaveLength(1)
    expect(coloursOnBoard(game.bubbles)).toEqual([game.palette[0]])
    expect(game.target.id).toBe(game.palette[0].id)
  })

  it('deals one big bubble and three lives, and waits to be started', () => {
    const game = createGame(arena, POOL, seeded(3))
    expect(game.bubbles).toHaveLength(1)
    expect(game.bubbles[0].size).toBe(0)
    expect(game.lives).toBe(3)
    expect(game.level).toBe(1)
    expect(game.status).toBe('ready')
  })

  it('does not move until it is started', () => {
    const game = createGame(arena, POOL, seeded())
    expect(step(game, 0.5, seeded()).state).toBe(game)
  })
})

describe('bigBubblesForLevel', () => {
  it('starts at one and climbs to a cap of four', () => {
    expect(bigBubblesForLevel(1)).toBe(1)
    expect(bigBubblesForLevel(2)).toBe(1)
    expect(bigBubblesForLevel(3)).toBe(2)
    expect(bigBubblesForLevel(9)).toBe(4)
    expect(bigBubblesForLevel(40)).toBe(4)
  })
})

describe('the named colour', () => {
  it('is left alone while it is still on the board', () => {
    const game = gameWith([bubble(1, colour('c.red')), bubble(2, colour('c.blue'), { x: 20 })], {
      target: colour('c.blue'),
    })
    expect(ensureTarget(game, seeded()).target.id).toBe('c.blue')
  })

  it('re-points at a colour that is on the board when its own has gone', () => {
    const game = gameWith([bubble(1, colour('c.green'))], { target: colour('c.yellow') })
    expect(ensureTarget(game, seeded()).target.id).toBe('c.green')
  })

  it('stands when the board is empty — there is nothing left to point at', () => {
    const game = gameWith([], { target: colour('c.yellow') })
    expect(ensureTarget(game, seeded()).target.id).toBe('c.yellow')
  })
})

describe('the die', () => {
  it('always lands on a different colour that is on the board', () => {
    const game = gameWith(
      [
        bubble(1, colour('c.red')),
        bubble(2, colour('c.blue'), { x: 20 }),
        bubble(3, colour('c.green'), { x: 80 }),
      ],
      { target: colour('c.red') },
    )
    const rng = seeded(5)
    for (let i = 0; i < 25; i++) {
      const rolled = rerollTarget(game, rng)
      expect(rolled.target.id).not.toBe('c.red')
      expect(coloursOnBoard(game.bubbles).map((c) => c.id)).toContain(rolled.target.id)
    }
  })

  it('never names a colour that is not on the board', () => {
    const game = gameWith([bubble(1, colour('c.red')), bubble(2, colour('c.blue'), { x: 20 })])
    const rng = seeded(11)
    for (let i = 0; i < 25; i++) {
      expect(['c.red', 'c.blue']).toContain(rerollTarget(game, rng).target.id)
    }
  })

  it('leaves the name alone when only one colour is left in front of you', () => {
    const game = gameWith([bubble(1, colour('c.red')), bubble(2, colour('c.red'), { x: 20 })])
    expect(rerollTarget(game, seeded()).target.id).toBe('c.red')
  })
})

describe('firing', () => {
  it('sends the rope up from the player, one at a time', () => {
    const game = gameWith([bubble(1, colour('c.red'))], { playerX: 30 })
    const fired = fire(game)
    expect(fired.harpoon).toMatchObject({ x: 30, tipY: arena.height })
    // A second press while a rope is up changes nothing.
    expect(fire(fired)).toBe(fired)
  })

  it('is ignored before the run has started', () => {
    const game = createGame(arena, POOL, seeded())
    expect(fire(game).harpoon).toBeNull()
  })

  it('retracts once the rope reaches the ceiling', () => {
    // Fired from the far side of the arena, so it climbs without meeting anything.
    let state = fire(gameWith([bubble(1, colour('c.red'), { x: 5, y: 10 })], { playerX: 90 }))
    expect(state.harpoon).not.toBeNull()
    for (let i = 0; i < 120 && state.harpoon; i++) state = step(state, 1 / 60, seeded()).state
    expect(state.harpoon).toBeNull()
  })

  it('never fast-forwards a backgrounded tab in one huge jump', () => {
    const game = fire(gameWith([bubble(1, colour('c.red'), { x: 5, y: 10 })], { playerX: 90 }))
    // Ten seconds away is capped at 0.1s, so the rope barely leaves the floor
    // instead of teleporting to the ceiling.
    const after = step(game, 10, seeded()).state
    expect(after.harpoon).not.toBeNull()
    expect(after.harpoon!.tipY).toBeGreaterThan(arena.height * 0.8)
  })
})

describe('hitting a bubble', () => {
  /** Runs the world until `done`, or gives up — keeps the physics honest. */
  function until(
    game: BubbleGame,
    done: (r: ReturnType<typeof step>) => boolean,
    rng = seeded(),
  ): ReturnType<typeof step> {
    let state = game
    for (let i = 0; i < 400; i++) {
      const result = step(state, 1 / 60, rng)
      state = result.state
      if (done(result)) return result
      if (state.status === 'over') break
    }
    throw new Error('the world never reached the expected state')
  }

  it('pops the named colour and splits it in two', () => {
    const game = fire(
      gameWith([bubble(1, colour('c.red'), { x: 50, y: 25 })], {
        playerX: 50,
        target: colour('c.red'),
      }),
    )
    const result = until(game, (r) => r.events.some((e) => e.kind === 'pop'))
    expect(result.state.bubbles).toHaveLength(2)
    expect(result.state.bubbles.every((b) => b.size === 1)).toBe(true)
    expect(result.state.popped).toBe(1)
    expect(result.state.harpoon).toBeNull()
  })

  it('passes straight through every other colour, announcing each once', () => {
    const game = fire(
      gameWith([bubble(1, colour('c.blue'), { x: 50, y: 25 })], {
        playerX: 50,
        target: colour('c.red'),
      }),
    )
    let state = game
    let immune = 0
    let popped = 0
    for (let i = 0; i < 200 && state.harpoon; i++) {
      const result = step(state, 1 / 60, seeded())
      state = result.state
      immune += result.events.filter((e) => e.kind === 'immune').length
      popped += result.events.filter((e) => e.kind === 'pop').length
    }
    expect(popped).toBe(0)
    expect(immune).toBe(1)
    // The bubble survived untouched.
    expect(state.bubbles).toHaveLength(1)
  })

  it('pops the smallest size out of existence instead of splitting it', () => {
    const smallest = (SIZE_COUNT - 1) as BubbleSize
    const game = fire(
      gameWith([bubble(1, colour('c.red'), { x: 50, y: 25, size: smallest })], {
        playerX: 50,
        target: colour('c.red'),
      }),
    )
    const result = until(game, (r) => r.events.some((e) => e.kind === 'cleared'))
    expect(result.state.bubbles).toHaveLength(0)
    expect(result.state.status).toBe('cleared')
  })

  it('adds a colour to the palette for every bubble popped', () => {
    const game = fire(
      gameWith([bubble(1, colour('c.red'), { x: 50, y: 25 })], {
        playerX: 50,
        target: colour('c.red'),
        palette: [colour('c.red')],
      }),
    )
    const result = until(game, (r) => r.events.some((e) => e.kind === 'pop'))
    expect(result.state.palette).toHaveLength(2)
    expect(result.state.palette[0].id).toBe('c.red')
  })

  it('stops growing the palette once every colour is in play', () => {
    const game = fire(
      gameWith([bubble(1, colour('c.red'), { x: 50, y: 25 })], {
        playerX: 50,
        target: colour('c.red'),
        palette: [...POOL],
      }),
    )
    const result = until(game, (r) => r.events.some((e) => e.kind === 'pop'))
    expect(result.state.palette).toHaveLength(POOL.length)
  })

  it('keeps the name on the board after a split re-colours it away', () => {
    const game = fire(
      gameWith([bubble(1, colour('c.red'), { x: 50, y: 25 })], {
        playerX: 50,
        target: colour('c.red'),
        palette: [...POOL],
      }),
    )
    const result = until(game, (r) => r.events.some((e) => e.kind === 'pop'))
    const onBoard = coloursOnBoard(result.state.bubbles).map((c) => c.id)
    expect(onBoard).toContain(result.state.target.id)
  })

  it('announces the name whenever a pop changes it', () => {
    // Both children are forced onto colours the board did not have.
    const game = fire(
      gameWith([bubble(1, colour('c.red'), { x: 50, y: 25 })], {
        playerX: 50,
        target: colour('c.red'),
        palette: [colour('c.blue')],
      }),
    )
    const result = until(game, (r) => r.events.some((e) => e.kind === 'pop'))
    expect(result.state.target.id).toBe('c.blue')
    expect(result.events).toContainEqual({ kind: 'target', colour: colour('c.blue') })
  })
})

describe('the physics', () => {
  it('bounces a bubble off the side walls without letting it escape', () => {
    let state = gameWith([bubble(1, colour('c.red'), { x: 50, y: 20, vx: 60 })], {
      target: colour('c.red'),
    })
    for (let i = 0; i < 600; i++) {
      state = step(state, 1 / 60, seeded()).state
      if (state.status !== 'playing') break
      for (const b of state.bubbles) {
        const r = bubbleRadius(b.size)
        expect(b.x).toBeGreaterThanOrEqual(r - 1e-6)
        expect(b.x).toBeLessThanOrEqual(arena.width - r + 1e-6)
      }
    }
  })

  it('bounces back to the same height every time — the apex is fixed', () => {
    // Parked in a corner the player cannot reach, so only gravity acts.
    let state = gameWith([bubble(1, colour('c.red'), { x: 50, y: 20, vx: 0 })], {
      target: colour('c.red'),
      playerX: 5,
    })
    const apexes: number[] = []
    let previousVy = state.bubbles[0].vy
    for (let i = 0; i < 900; i++) {
      state = step(state, 1 / 120, seeded()).state
      const b = state.bubbles[0]
      // y grows downward, so the top of a bounce is where vy turns from
      // negative (rising) to positive (falling again).
      if (previousVy < 0 && b.vy >= 0) apexes.push(b.y)
      previousVy = b.vy
    }
    expect(apexes.length).toBeGreaterThan(1)
    const spread = Math.max(...apexes) - Math.min(...apexes)
    expect(spread).toBeLessThan(1)
    // And it is the apex the rules advertise, measured up from the floor.
    const reached = arena.height - bubbleRadius(0) - apexes[0]
    expect(reached).toBeCloseTo(apexHeight(0, arena), 0)
  })

  it('scales the bounce to the arena, so a tall screen is not dead space', () => {
    const tall: Arena = { width: ARENA_WIDTH, height: 120 }
    expect(apexHeight(0, tall)).toBeGreaterThan(apexHeight(0, arena))
    // Every size still turns around inside the arena rather than at the ceiling.
    for (const size of [0, 1, 2, 3] as BubbleSize[]) {
      expect(apexHeight(size, tall)).toBeLessThan(tall.height - bubbleRadius(size))
    }
  })

  it('keeps the sizes ordered — bigger bubbles bounce higher', () => {
    const heights = ([0, 1, 2, 3] as BubbleSize[]).map((s) => apexHeight(s, arena))
    expect(heights).toEqual([...heights].sort((a, b) => b - a))
  })

  it('walks at the advertised speed', () => {
    let state = setMove(gameWith([bubble(1, colour('c.red'), { y: 15 })], { playerX: 20 }), 1)
    // A second of walking, in the sub-steps the loop would really take.
    for (let i = 0; i < 60; i++) state = step(state, 1 / 60, seeded()).state
    expect(state.playerX - 20).toBeCloseTo(PLAYER_SPEED, 1)
  })

  it('walks the player without letting them leave the arena', () => {
    let state = setMove(gameWith([bubble(1, colour('c.red'), { y: 15 })]), -1)
    for (let i = 0; i < 300; i++) state = step(state, 1 / 60, seeded()).state
    expect(state.playerX).toBeCloseTo(PLAYER_SIZE.width / 2, 5)

    state = setMove(state, 1)
    for (let i = 0; i < 300; i++) state = step(state, 1 / 60, seeded()).state
    expect(state.playerX).toBeCloseTo(arena.width - PLAYER_SIZE.width / 2, 5)
  })
})

describe('dragging the avatar', () => {
  /** A quiet board, so only the steering moves the player. */
  function walker(playerX: number) {
    return gameWith([bubble(1, colour('c.red'), { x: 50, y: 12, vx: 0, vy: 0 })], { playerX })
  }

  it('follows behind the finger instead of snapping to it', () => {
    const state = setAim(walker(20), 90)
    const after = step(state, 1 / 60, seeded()).state
    // One frame closes one frame's worth of the gap, no more.
    expect(after.playerX).toBeGreaterThan(20)
    expect(after.playerX - 20).toBeCloseTo(PLAYER_SPEED / 60, 3)
    expect(after.playerX).toBeLessThan(90)
  })

  it('is held to the same speed limit as the pads', () => {
    let dragged = setAim(walker(20), 95)
    let walked = setMove(walker(20), 1)
    for (let i = 0; i < 30; i++) {
      dragged = step(dragged, 1 / 60, seeded()).state
      walked = step(walked, 1 / 60, seeded()).state
    }
    expect(dragged.playerX).toBeCloseTo(walked.playerX, 5)
  })

  it('arrives on the finger and settles there without jittering', () => {
    let state = setAim(walker(50), 62)
    for (let i = 0; i < 60; i++) state = step(state, 1 / 60, seeded()).state
    expect(state.playerX).toBeCloseTo(62, 5)
    // Still exactly there many frames later — no overshoot-and-correct.
    for (let i = 0; i < 30; i++) state = step(state, 1 / 60, seeded()).state
    expect(state.playerX).toBeCloseTo(62, 5)
  })

  it('walks the shorter way when the finger is to the left', () => {
    const after = step(setAim(walker(80), 30), 1 / 60, seeded()).state
    expect(after.playerX).toBeLessThan(80)
  })

  it('will not drag the player out of the arena', () => {
    let state = setAim(walker(50), 500)
    for (let i = 0; i < 200; i++) state = step(state, 1 / 60, seeded()).state
    expect(state.playerX).toBeCloseTo(arena.width - PLAYER_SIZE.width / 2, 5)

    state = setAim(state, -500)
    for (let i = 0; i < 200; i++) state = step(state, 1 / 60, seeded()).state
    expect(state.playerX).toBeCloseTo(PLAYER_SIZE.width / 2, 5)
  })

  it('overrides the pads while the drag is live', () => {
    // Pad says left, finger says right: the finger wins.
    const state = setAim(setMove(walker(50), -1), 90)
    const after = step(state, 1 / 60, seeded()).state
    expect(after.playerX).toBeGreaterThan(50)
  })

  it('hands steering back to the pads when the drag ends', () => {
    let state = clearAim(setAim(setMove(walker(50), -1), 90))
    expect(state.aimX).toBeNull()
    state = step(state, 1 / 60, seeded()).state
    expect(state.playerX).toBeLessThan(50)
  })

  it('drops a stale aim when a hit re-deals the level', () => {
    // Mid-drag, and flattened by a bubble dropping on where they were headed.
    const struck = setAim(
      gameWith(
        [bubble(1, colour('c.blue'), { x: 50, y: arena.height - PLAYER_SIZE.height - 8 })],
        { playerX: 50, lives: 2 },
      ),
      54,
    )
    let state = struck
    for (let i = 0; i < 200 && state.lives === 2; i++) {
      state = step(state, 1 / 60, seeded()).state
    }
    expect(state.lives).toBe(1)
    expect(state.aimX).toBeNull()
    expect(state.playerX).toBeCloseTo(arena.width / 2, 5)
  })
})

describe('getting hit', () => {
  it('costs a life and re-deals the level, whatever the colour', () => {
    // A wrong-colour bubble dropped straight onto the player.
    const game = gameWith(
      [bubble(1, colour('c.blue'), { x: 50, y: arena.height - PLAYER_SIZE.height - 8 })],
      { playerX: 50, target: colour('c.blue'), level: 1 },
    )
    let state = game
    let hurt = false
    for (let i = 0; i < 200 && !hurt; i++) {
      const result = step(state, 1 / 60, seeded())
      state = result.state
      hurt = result.events.some((e) => e.kind === 'hurt')
    }
    expect(hurt).toBe(true)
    expect(state.lives).toBe(2)
    expect(state.status).toBe('playing')
    expect(state.bubbles).toHaveLength(bigBubblesForLevel(1))
  })

  it('ends the run when the last life goes', () => {
    const game = gameWith(
      [bubble(1, colour('c.blue'), { x: 50, y: arena.height - PLAYER_SIZE.height - 8 })],
      { playerX: 50, lives: 1 },
    )
    let state = game
    for (let i = 0; i < 200 && state.status === 'playing'; i++) {
      state = step(state, 1 / 60, seeded()).state
    }
    expect(state.status).toBe('over')
    expect(state.lives).toBe(0)
  })
})

describe('nextLevel', () => {
  it('deals a harder board but keeps the palette and the score', () => {
    const cleared = gameWith([], {
      status: 'cleared',
      level: 3,
      popped: 9,
      palette: [...POOL],
    })
    const advanced = nextLevel(cleared, seeded(4))
    expect(advanced.level).toBe(4)
    expect(advanced.status).toBe('playing')
    expect(advanced.popped).toBe(9)
    expect(advanced.palette).toHaveLength(POOL.length)
    expect(advanced.bubbles).toHaveLength(bigBubblesForLevel(4))
    // The invariant survives the new deal.
    expect(coloursOnBoard(advanced.bubbles).map((c) => c.id)).toContain(advanced.target.id)
  })
})

describe('high score', () => {
  beforeEach(() => localStorage.clear())

  it('starts at zero and keeps only the best', () => {
    expect(readHighScore()).toBe(0)
    expect(recordHighScore(4)).toBe(true)
    expect(readHighScore()).toBe(4)
    expect(recordHighScore(2)).toBe(false)
    expect(readHighScore()).toBe(4)
  })
})

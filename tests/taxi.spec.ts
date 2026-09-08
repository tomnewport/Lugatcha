import { describe, it, expect } from 'vitest'
import {
  allSpokenClauses,
  buildCity,
  CITY_HEIGHT,
  CITY_LANDMARKS,
  CITY_WIDTH,
  buyWord,
  canDrive,
  FIRST_SECONDS,
  LAST_SECONDS,
  secondsFor,
  tick,
  continueRun,
  createGame,
  currentLevel,
  drive,
  dropOff,
  EAST,
  hasRoad,
  intersections,
  landmark,
  LANDMARKS,
  LEVELS,
  levelFor,
  MAX_BLOCKS,
  MAX_ORDINAL,
  NORTH,
  fareValue,
  FUEL_PER_BLOCK,
  kindsBy,
  LIVES,
  MAX_REDIRECT_STEPS,
  pickFare,
  pickRedirect,
  placeAt,
  purse,
  resolve,
  routeUzbek,
  samePoint,
  sayings,
  SOUTH,
  startGame,
  stepUzbek,
  stepWords,
  turnDir,
  WEST,
  WORD_PRICE,
  type City,
  type Dir,
  type Place,
  type Point,
  type Step,
  type TaxiState,
} from '@/exercises/taxi'
import { readFileSync } from 'node:fs'
import en from '@/i18n/locales/en'
import ru from '@/i18n/locales/ru'

// Shared with scripts/generate_audio.py --self-test: the clause list is written
// out in both languages, and both are pinned here so a wording added to one and
// not the other cannot slip through as a silently unrecorded line.
const recordedClauses: string[] = JSON.parse(
  readFileSync(new URL('./taxi-clauses.json', import.meta.url), 'utf8'),
).clauses

/** A cheap deterministic pseudo-random source, so a shift can be replayed. */
function seeded(seed = 1): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

/** A city with every street open — the plain grid the rules are stated on. */
function lattice(width = 5, height = 5, places: Place[] = []): City {
  return {
    width,
    height,
    h: Array.from({ length: height }, () => Array.from({ length: width - 1 }, () => true)),
    v: Array.from({ length: height - 1 }, () => Array.from({ length: width }, () => true)),
    places,
  }
}

/** The heading that gets you from `a` to the adjacent `b`. */
function headingBetween(a: Point, b: Point): Dir {
  if (b.y < a.y) return NORTH
  if (b.x > a.x) return EAST
  if (b.y > a.y) return SOUTH
  return WEST
}

/** Every way of saying a step, as indexes into its phrasings. */
function everySaying(step: Step): number[] {
  return Array.from({ length: sayings(step.kind) }, (_, say) => say)
}

/** Every instruction the game can ever put together, one step at a time. */
function everyStep(): Step[] {
  const steps: Step[] = []
  for (const side of ['left', 'right'] as const) {
    for (let ordinal = 1; ordinal <= 4; ordinal++) steps.push({ kind: 'turn', side, ordinal })
    steps.push({ kind: 'turnNow', side })
    for (const place of LANDMARKS) steps.push({ kind: 'landmarkTurn', place: place.id, side })
  }
  for (let blocks = 1; blocks <= 5; blocks++) steps.push({ kind: 'straight', blocks })
  for (const place of LANDMARKS) steps.push({ kind: 'toLandmark', place: place.id })
  return steps
}

/** Drives the taxi along the fare's own route, block by block. */
function driveRoute(state: TaxiState): TaxiState {
  const path = state.fare!.route.path
  let next = state
  for (let i = 1; i < path.length; i++) {
    next = drive(next, headingBetween(path[i - 1], path[i]))
  }
  return next
}

/** Drives the fare's route but stops a block short: the classic wrong corner. */
function driveShort(state: TaxiState): TaxiState {
  const path = state.fare!.route.path
  let next = state
  for (let i = 1; i < path.length - 1; i++) {
    next = drive(next, headingBetween(path[i - 1], path[i]))
  }
  return next
}

/** Drives back and forth over one block until the meter is empty. */
function runDry(state: TaxiState): TaxiState {
  const open = ([NORTH, EAST, SOUTH, WEST] as Dir[]).find((dir) =>
    canDrive(state.city, state.taxi, dir),
  )!
  let next = state
  for (let i = 0; i < 40 && !next.outcome; i++) {
    next = drive(next, i % 2 ? (((open + 2) % 4) as Dir) : open)
  }
  return next
}

describe('the city', () => {
  it('leaves every corner on at least two streets, all of them reachable', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const city = buildCity(seeded(seed))
      const all = intersections(city)

      for (const p of all) {
        const streets = ([NORTH, EAST, SOUTH, WEST] as Dir[]).filter((d) => canDrive(city, p, d))
        expect(streets.length).toBeGreaterThanOrEqual(2)
      }

      const seen = new Set(['0,0'])
      const queue: Point[] = [{ x: 0, y: 0 }]
      while (queue.length) {
        const p = queue.shift()!
        for (const dir of [NORTH, EAST, SOUTH, WEST] as Dir[]) {
          if (!canDrive(city, p, dir)) continue
          const to = { x: p.x + [0, 1, 0, -1][dir], y: p.y + [-1, 0, 1, 0][dir] }
          const key = `${to.x},${to.y}`
          if (seen.has(key)) continue
          seen.add(key)
          queue.push(to)
        }
      }
      expect(seen.size).toBe(all.length)
    }
  })

  it('runs a street off every edge, so the map has no corners that are only bends', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const city = buildCity(seeded(seed))

      for (const p of intersections(city)) {
        // A street leaving the map is a street: it is counted like any other,
        // and the taxi is the only thing that cannot take it.
        const leaving = ([NORTH, EAST, SOUTH, WEST] as Dir[]).filter(
          (dir) => hasRoad(city, p, dir) && !canDrive(city, p, dir),
        )
        const sides =
          (p.x === 0 ? 1 : 0) +
          (p.x === city.width - 1 ? 1 : 0) +
          (p.y === 0 ? 1 : 0) +
          (p.y === city.height - 1 ? 1 : 0)
        expect(leaving).toHaveLength(sides)
      }

      // Which is what the corners of the map are for: two of their four
      // streets run out of the window, and none of them is ever closed.
      for (const dir of [NORTH, WEST] as Dir[]) {
        expect(hasRoad(city, { x: 0, y: 0 }, dir)).toBe(true)
        expect(canDrive(city, { x: 0, y: 0 }, dir)).toBe(false)
      }
    }
  })

  it('counts a turning that leaves the map, and never sends the taxi down one', () => {
    const city = lattice(5, 5)
    const east = { x: 0, y: 0, dir: EAST }

    // Driving along the top of the map, every street on the left is one that
    // leaves it: the passenger can see them, so they count, and the first on
    // the left is one block on rather than four.
    expect(hasRoad(city, { x: 1, y: 0 }, NORTH)).toBe(true)
    expect(resolve(city, east, [{ kind: 'turn', side: 'left', ordinal: 1 }])).toBeNull()

    // The same count on the other side is a street the taxi can take.
    expect(resolve(city, east, [{ kind: 'turn', side: 'right', ordinal: 1 }])?.dest).toEqual({
      x: 1,
      y: 1,
    })
  })

  it('closes some streets, or "the third on the left" would just be counting blocks', () => {
    const closed = Array.from({ length: 10 }, (_, seed) => {
      const city = buildCity(seeded(seed + 1))
      const open = city.h.flat().filter(Boolean).length + city.v.flat().filter(Boolean).length
      const total = CITY_HEIGHT * (CITY_WIDTH - 1) + (CITY_HEIGHT - 1) * CITY_WIDTH
      return total - open
    })
    expect(Math.min(...closed)).toBeGreaterThan(0)
  })

  it('puts up a full set of landmarks, each of them a real place, none stacked', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const city = buildCity(seeded(seed))
      expect(city.places).toHaveLength(CITY_LANDMARKS)

      const ids = city.places.map((place) => place.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(landmark(id)).not.toBeNull()

      const corners = city.places.map((place) => `${place.x},${place.y}`)
      expect(new Set(corners).size).toBe(corners.length)
    }
  })

  it('finds the landmark standing on a corner, and nothing on the empty ones', () => {
    const city = lattice(5, 5, [{ id: 'bank', x: 2, y: 2 }])
    expect(placeAt(city, { x: 2, y: 2 })?.id).toBe('bank')
    expect(placeAt(city, { x: 2, y: 3 })).toBeNull()
  })
})

describe('turning', () => {
  it('turns left anticlockwise and right clockwise', () => {
    expect(turnDir(NORTH, 'left')).toBe(WEST)
    expect(turnDir(NORTH, 'right')).toBe(EAST)
    expect(turnDir(WEST, 'left')).toBe(SOUTH)
    expect(turnDir(EAST, 'right')).toBe(SOUTH)
  })
})

describe('following the directions', () => {
  const city = lattice(5, 5)
  const north = { x: 2, y: 4, dir: NORTH }

  it('counts the turnings ahead, not the one it is standing on', () => {
    // Facing north from (2,4), every corner has a street to the west, so the
    // first on the left is one block on — never the junction underneath.
    const route = resolve(city, north, [{ kind: 'turn', side: 'left', ordinal: 1 }])
    expect(route?.path).toEqual([
      { x: 2, y: 4 },
      { x: 2, y: 3 },
      { x: 1, y: 3 },
    ])
    expect(route?.dest).toEqual({ x: 1, y: 3 })
    expect(route?.dir).toBe(WEST)
  })

  it('drives one block into the street it was told to take', () => {
    // Which is the whole difference between left and right: on the corner
    // itself the two instructions would land in the same place.
    const left = resolve(city, north, [{ kind: 'turn', side: 'left', ordinal: 2 }])
    const right = resolve(city, north, [{ kind: 'turn', side: 'right', ordinal: 2 }])
    expect(left?.dest).toEqual({ x: 1, y: 2 })
    expect(right?.dest).toEqual({ x: 3, y: 2 })
  })

  it('stops exactly where a distance runs out, still pointing the same way', () => {
    const route = resolve(city, north, [{ kind: 'straight', blocks: 3 }])
    expect(route?.dest).toEqual({ x: 2, y: 1 })
    expect(route?.dir).toBe(NORTH)
    expect(route?.path).toHaveLength(4)
  })

  it('reads two clauses in the order they were said', () => {
    const route = resolve(city, north, [
      { kind: 'straight', blocks: 2 },
      { kind: 'turnNow', side: 'right' },
    ])
    // Two blocks north to (2,2), turn right, then one block into that street.
    expect(route?.dest).toEqual({ x: 3, y: 2 })
    expect(route?.dir).toBe(EAST)
  })

  it('skips the streets that are closed when it counts', () => {
    const gapped = lattice(5, 5)
    gapped.h[3][1] = false // no street west out of (2,3)
    const route = resolve(gapped, north, [{ kind: 'turn', side: 'left', ordinal: 1 }])
    expect(route?.dest).toEqual({ x: 1, y: 2 })
  })

  it('gives up when the instruction runs off the edge of the city', () => {
    const edge = { x: 0, y: 4, dir: NORTH }
    expect(resolve(city, edge, [{ kind: 'turn', side: 'left', ordinal: 1 }])).toBeNull()
    expect(resolve(city, north, [{ kind: 'straight', blocks: 5 }])).toBeNull()
  })

  it('gives up on a turn with no street to turn into', () => {
    const edge = { x: 0, y: 2, dir: NORTH }
    expect(resolve(city, edge, [{ kind: 'turnNow', side: 'left' }])).toBeNull()
  })

  it('drives up to a landmark and stops there, facing the same way', () => {
    const withBank = lattice(5, 5, [{ id: 'bank', x: 2, y: 2 }])
    const route = resolve(withBank, north, [{ kind: 'toLandmark', place: 'bank' }])
    expect(route?.dest).toEqual({ x: 2, y: 2 })
    expect(route?.dir).toBe(NORTH)
  })

  it('turns at the landmark and carries on into the street', () => {
    const withBank = lattice(5, 5, [{ id: 'bank', x: 2, y: 2 }])
    const route = resolve(withBank, north, [{ kind: 'landmarkTurn', place: 'bank', side: 'left' }])
    expect(route?.dest).toEqual({ x: 1, y: 2 })
    expect(route?.dir).toBe(WEST)
  })

  it('gives up when the landmark is not on the road ahead', () => {
    const withBank = lattice(5, 5, [{ id: 'bank', x: 0, y: 0 }])
    expect(resolve(withBank, north, [{ kind: 'toLandmark', place: 'bank' }])).toBeNull()
  })

  it('refuses an empty instruction rather than dropping the fare on the spot', () => {
    expect(resolve(city, north, [])).toBeNull()
  })

  it('remembers which blocks each clause was worth, for the map to read back', () => {
    const route = resolve(city, north, [
      { kind: 'straight', blocks: 2 },
      { kind: 'turnNow', side: 'left' },
    ])!
    // Two blocks north, then the turn — and the block driven into the street
    // it turned into belongs to the clause that named it, not to the driving
    // before it.
    expect(route.legs).toEqual([2, 3])
    expect(route.path.slice(0, route.legs[0] + 1)).toEqual([
      { x: 2, y: 4 },
      { x: 2, y: 3 },
      { x: 2, y: 2 },
    ])
    expect(route.path.slice(route.legs[0], route.legs[1] + 1)).toEqual([
      { x: 2, y: 2 },
      { x: 1, y: 2 },
    ])
  })

  it('remembers the way each clause left the taxi pointing, even a bare turn', () => {
    // From the middle of the city, where turning twice is possible at all.
    const route = resolve(city, { x: 2, y: 2, dir: NORTH }, [
      { kind: 'turnNow', side: 'left' },
      { kind: 'turnNow', side: 'left' },
    ])!
    // Two turns on the spot: the first covers no ground at all, and the
    // heading is the only thing it has to show for itself.
    expect(route.legs[0]).toBe(0)
    expect(route.dirs).toEqual([WEST, SOUTH])
    expect(route.dirs[route.dirs.length - 1]).toBe(route.dir)
  })

  it('gives every clause a leg, in order, covering the whole route', () => {
    const rng = seeded(11)
    const built = buildCity(seeded(7))
    for (const level of LEVELS) {
      for (let i = 0; i < 20; i++) {
        const pose = { x: i % built.width, y: (i * 3) % built.height, dir: (i % 4) as Dir }
        const fare = pickFare(built, pose, level, rng)
        if (!fare) continue
        const { legs, path } = fare.route
        expect(legs).toHaveLength(fare.steps.length)
        expect(legs[legs.length - 1]).toBe(path.length - 1)
        for (let leg = 1; leg < legs.length; leg++) {
          expect(legs[leg]).toBeGreaterThanOrEqual(legs[leg - 1])
        }
      }
    }
  })
})

describe('what the passenger says', () => {
  it('says each clause as one plain sentence', () => {
    expect(stepUzbek({ kind: 'turn', side: 'left', ordinal: 1 })).toBe(
      'Birinchi koʻchadan chapga buriling.',
    )
    expect(stepUzbek({ kind: 'turn', side: 'right', ordinal: 3 })).toBe(
      'Uchinchi koʻchadan oʻngga buriling.',
    )
    expect(stepUzbek({ kind: 'straight', blocks: 4 })).toBe('Toʻgʻriga toʻrt kvartal yuring.')
    expect(stepUzbek({ kind: 'turnNow', side: 'left' })).toBe('Chapga buriling.')
    expect(stepUzbek({ kind: 'landmarkTurn', place: 'hospital', side: 'right' })).toBe(
      'Kasalxonada oʻngga buriling.',
    )
    expect(stepUzbek({ kind: 'toLandmark', place: 'hotel' })).toBe('Mehmonxonagacha yuring.')
  })

  it('joins the clauses into one instruction', () => {
    const steps: Step[] = [
      { kind: 'straight', blocks: 2 },
      { kind: 'turnNow', side: 'left' },
    ]
    expect(routeUzbek(steps)).toBe('Toʻgʻriga ikki kvartal yuring. Chapga buriling.')
  })

  it('builds every wording out of the very words the driver can buy', () => {
    // The sentence and the price list are the same thing, so a word can never
    // appear in one and not the other, in any of the wordings.
    for (const step of everyStep()) {
      for (const say of everySaying(step)) {
        const joined = stepWords(step, say)
          .map((word) => word.text)
          .join(' ')
        expect(`${joined}.`).toBe(stepUzbek(step, say))
      }
    }
  })

  it('has a meaning to sell for every word of every wording', () => {
    const words = en.taxi.word as Record<string, string>
    const russian = ru.taxi.word as Record<string, string>
    for (const step of everyStep()) {
      for (const say of everySaying(step)) {
        for (const word of stepWords(step, say)) {
          expect(words[word.key]).toBeTruthy()
          expect(russian[word.key]).toBeTruthy()
          // A word that names a landmark has to be able to say which one.
          expect(words[word.key].includes('{place}')).toBe(word.place !== undefined)
        }
      }
    }
  })

  it('says every step more than one way, and never the same way twice', () => {
    for (const step of everyStep()) {
      const said = everySaying(step).map((say) => stepUzbek(step, say))
      expect(said.length).toBeGreaterThanOrEqual(3)
      expect(new Set(said).size).toBe(said.length)
      // Each is a whole sentence: opens on a capital, closes on a stop.
      for (const clause of said) {
        expect(clause.endsWith('.')).toBe(true)
        expect(clause[0]).toBe(clause[0].toUpperCase())
      }
    }
  })

  it('wraps an out-of-range wording rather than coming back empty', () => {
    const step: Step = { kind: 'turnNow', side: 'left' }
    expect(stepUzbek(step, sayings('turnNow'))).toBe(stepUzbek(step, 0))
    expect(stepUzbek(step, -1)).toBe(stepUzbek(step, sayings('turnNow') - 1))
  })

  it('speaks only the clauses the recordings were made from', () => {
    // If this fails, a wording changed: copy the received list into
    // tests/taxi-clauses.json, mirror the change in scripts/generate_audio.py,
    // and re-run the generator so the new lines get recorded.
    expect([...allSpokenClauses()].sort()).toEqual(recordedClauses)
  })

  it('lists every clause it can speak, with no repeats', () => {
    const clauses = allSpokenClauses()
    expect(new Set(clauses).size).toBe(clauses.length)
    // Two sides for every ordinal and every landmark, one bare turn each way,
    // one line per distance and one "carry on to" per landmark — each of them
    // in every wording there is.
    expect(clauses).toHaveLength(
      2 *
        (MAX_ORDINAL * sayings('turn') +
          sayings('turnNow') +
          LANDMARKS.length * sayings('landmarkTurn')) +
        MAX_BLOCKS * sayings('straight') +
        LANDMARKS.length * sayings('toLandmark'),
    )
  })
})

describe('the ramp', () => {
  it('starts on the shortest instruction there is', () => {
    expect(LEVELS[0].shapes).toEqual([['turn']])
  })

  it("steps up a level once a level's worth of fares is in", () => {
    expect(levelFor(0)).toBe(0)
    expect(levelFor(LEVELS[0].fares - 1)).toBe(0)
    expect(levelFor(LEVELS[0].fares)).toBe(1)
    expect(levelFor(LEVELS[0].fares + LEVELS[1].fares)).toBe(2)
  })

  it('tops out on the last level rather than running off the end', () => {
    expect(levelFor(500)).toBe(LEVELS.length - 1)
  })

  it('opens on one wording and widens as the directions get longer', () => {
    expect(LEVELS[0].voices).toBe(1)
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].voices).toBeGreaterThanOrEqual(LEVELS[i - 1].voices)
    }
    expect(LEVELS[LEVELS.length - 1].voices).toBeGreaterThanOrEqual(3)
  })

  it('says a first fare the plainest way there is', () => {
    const rng = seeded(12)
    const city = buildCity(seeded(6))
    for (let i = 0; i < 20; i++) {
      const pose = { x: i % city.width, y: (i * 3) % city.height, dir: (i % 4) as Dir }
      const fare = pickFare(city, pose, LEVELS[0], rng)
      if (!fare) continue
      expect(fare.said).toEqual(fare.steps.map(() => 0))
    }
  })

  it('reaches every wording of every step once the level allows them', () => {
    const rng = seeded(4)
    const city = buildCity(seeded(2))
    const last = LEVELS[LEVELS.length - 1]
    const heard = new Map<string, Set<number>>()
    for (let i = 0; i < 400; i++) {
      const pose = { x: i % city.width, y: (i * 7) % city.height, dir: (i % 4) as Dir }
      const fare = pickFare(city, pose, last, rng)
      if (!fare) continue
      fare.steps.forEach((step, index) => {
        const seen = heard.get(step.kind) ?? new Set<number>()
        seen.add(fare.said[index])
        heard.set(step.kind, seen)
      })
    }
    for (const [kind, seen] of heard) {
      expect(seen.size).toBe(Math.min(last.voices, sayings(kind as Step['kind'])))
    }
  })

  it('introduces the landmarks only once the driver knows the streets', () => {
    const early = LEVELS.slice(0, 4).flatMap((level) => level.shapes.flat())
    expect(early).not.toContain('landmarkTurn')
    expect(early).not.toContain('toLandmark')
    const late = LEVELS[LEVELS.length - 1].shapes.flat()
    expect(late).toContain('landmarkTurn')
  })
})

describe('picking a fare', () => {
  it('only ever offers an instruction this city can actually be driven', () => {
    const rng = seeded(11)
    for (let seed = 1; seed <= 8; seed++) {
      const city = buildCity(seeded(seed))
      for (const level of LEVELS) {
        for (let i = 0; i < 20; i++) {
          const pose = { x: i % city.width, y: (i * 3) % city.height, dir: (i % 4) as Dir }
          const fare = pickFare(city, pose, level, rng)
          if (!fare) continue
          const route = resolve(city, pose, fare.steps)
          expect(route).not.toBeNull()
          expect(route!.dest).toEqual(fare.route.dest)
          expect(fare.steps.map((s) => s.kind)).toHaveLength(fare.clauses.length)
        }
      }
    }
  })

  it('never sends a passenger to the corner they are standing on', () => {
    const rng = seeded(5)
    const city = buildCity(seeded(3))
    for (const level of LEVELS) {
      for (let i = 0; i < 30; i++) {
        const pose = { x: i % city.width, y: (i * 2) % city.height, dir: (i % 4) as Dir }
        const fare = pickFare(city, pose, level, rng)
        if (!fare) continue
        expect(fare.route.dest).not.toEqual({ x: pose.x, y: pose.y })
        expect(fare.route.path.length - 1).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('only speaks lines that have been recorded', () => {
    const recorded = new Set(allSpokenClauses())
    const rng = seeded(19)
    const city = buildCity(seeded(4))
    for (const level of LEVELS) {
      for (let i = 0; i < 40; i++) {
        const pose = { x: i % city.width, y: (i * 5) % city.height, dir: (i % 4) as Dir }
        const fare = pickFare(city, pose, level, rng)
        if (!fare) continue
        for (const clause of fare.clauses) expect(recorded).toContain(clause)
        expect(fare.clauses).toEqual(fare.steps.map((step, i) => stepUzbek(step, fare.said[i])))
      }
    }
  })
})

describe('driving', () => {
  it('only goes where there is a street, and turns to face the way it went', () => {
    // Parked in the top-left corner, where two of the four streets run off
    // the map rather than to the next intersection.
    const base = startGame(createGame(seeded(2)))
    const state = { ...base, taxi: { x: 0, y: 0, dir: EAST }, trail: [{ x: 0, y: 0 }] }
    expect(drive(state, NORTH)).toBe(state)
    expect(drive(state, WEST)).toBe(state)

    const open = ([EAST, SOUTH] as Dir[]).find((dir) => canDrive(state.city, state.taxi, dir))!
    const moved = drive(state, open)
    expect(moved.taxi.dir).toBe(open)
    expect(moved.trail).toHaveLength(2)
  })

  it('rubs the trail out again when the driver doubles back', () => {
    const state = startGame(createGame(seeded(8)))
    const open = ([NORTH, EAST, SOUTH, WEST] as Dir[]).find((dir) =>
      canDrive(state.city, state.taxi, dir),
    )!
    const there = drive(state, open)
    const back = drive(there, ((open + 2) % 4) as Dir)
    expect(back.trail).toHaveLength(1)
    expect(back.taxi).toMatchObject({ x: state.taxi.x, y: state.taxi.y })
  })

  it('stays put before the shift starts', () => {
    const ready = createGame(seeded(6))
    const open = ([NORTH, EAST, SOUTH, WEST] as Dir[]).find((dir) =>
      canDrive(ready.city, ready.taxi, dir),
    )!
    expect(drive(ready, open)).toBe(ready)
  })
})

describe('dropping off', () => {
  it('banks whatever is left on the meter when the taxi is on the right corner', () => {
    const driven = driveRoute(startGame(createGame(seeded(21))))
    const left = purse(driven)
    const drop = dropOff(driven)
    expect(drop.result).toBe('arrived')
    expect(drop.paid).toBe(left)
    expect(drop.state.takings).toBe(left)
    expect(drop.state.delivered).toBe(1)
    expect(drop.state.status).toBe('playing')
    expect(drop.state.outcome?.result).toBe('arrived')
  })

  it('is worth the words said and the distance covered, a little over the fuel', () => {
    const state = startGame(createGame(seeded(21)))
    const fare = state.fare!
    expect(fare.pay).toBe(fareValue(fare.wordCount, fare.blocks))
    // The margin over the fuel is what makes a well-driven fare worth taking.
    expect(fare.pay).toBeGreaterThan(fare.blocks * FUEL_PER_BLOCK)
  })

  it('puts the driver right from where they stopped, for nothing', () => {
    const state = driveShort(startGame(createGame(seeded(21)))) // a block short
    const drop = dropOff(state, seeded(4))
    expect(drop.result).toBe('redirected')
    expect(drop.paid).toBe(0)
    expect(drop.state.outcome).toBeNull()
    expect(drop.state.corrections).toBe(1)
    // Nothing but the driving has been charged for, and the fare is the fare
    // that was agreed when the passenger got in.
    expect(drop.state.spent).toBe(state.spent)
    expect(drop.state.lives).toBe(state.lives)
    expect(drop.state.fare!.pay).toBe(state.fare!.pay)
    expect(purse(drop.state)).toBe(purse(state))

    // Same door, described again from the corner the taxi is standing on.
    const fare = drop.state.fare!
    expect(fare.route.dest).toEqual(state.fare!.route.dest)
    expect(fare.from).toEqual(state.taxi)
    expect(fare.route.path[0]).toEqual({ x: state.taxi.x, y: state.taxi.y })
    expect(drop.state.trail).toEqual([{ x: state.taxi.x, y: state.taxi.y }])
    // A new instruction, so the component reads it out rather than redrawing.
    expect(drop.state.fareId).toBe(state.fareId + 1)
  })

  it('pays out in full when the correction is followed', () => {
    const state = dropOff(driveShort(startGame(createGame(seeded(21)))), seeded(4)).state
    const drop = dropOff(driveRoute(state))
    expect(drop.result).toBe('arrived')
    expect(drop.paid).toBe(purse(state) - state.fare!.blocks * FUEL_PER_BLOCK)
    expect(drop.state.delivered).toBe(1)
  })

  it('says the same thing twice on the corner it was said on', () => {
    // Nothing has changed since the passenger spoke, and there is only one way
    // of putting it: repeating it word for word would read as the game not
    // having noticed the drop-off, so the instruction simply stands.
    const state = startGame(createGame(seeded(21)))
    const drop = dropOff(state, seeded(4)) // let them out where they got in
    expect(drop.result).toBe('refused')
    expect(drop.state).toBe(state)
  })

  it('never costs a life, however many corners are tried', () => {
    let state = startGame(createGame(seeded(13)))
    const rng = seeded(5)
    const dest = state.fare!.route.dest
    const fuel = state.spent
    let corrected = 0
    for (let i = 0; i < 4; i++) {
      const open = ([NORTH, EAST, SOUTH, WEST] as Dir[]).filter((dir) =>
        canDrive(state.city, state.taxi, dir),
      )
      state = drive(state, open[i % open.length])
      expect(samePoint(state.taxi, dest)).toBe(false)
      const drop = dropOff(state, rng)
      expect(drop.result).not.toBe('arrived')
      if (drop.result === 'redirected') corrected++
      state = drop.state
      expect(state.fare!.route.dest).toEqual(dest)
      expect(state.lives).toBe(LIVES)
      expect(state.status).toBe('playing')
      expect(state.outcome).toBeNull()
    }
    // Only the wandering was charged for: four blocks of fuel, and not a soʻm
    // for any of the wrong corners.
    expect(state.spent).toBe(fuel + 4 * FUEL_PER_BLOCK)
    expect(purse(state)).toBeGreaterThan(0)
    expect(corrected).toBeGreaterThanOrEqual(3)
    expect(state.corrections).toBe(corrected)
  })

  it('corrects the driver in the words they have already met', () => {
    // A correction is free, so it must not be a way of hearing the vocabulary
    // of a level the driver has not reached.
    for (let seed = 1; seed <= 20; seed++) {
      let state = startGame(createGame(seeded(seed)))
      const rng = seeded(seed + 100)
      // The first level says *the nth street on the left* and nothing else,
      // plus the bare "turn left" a correction is always allowed — which is
      // made of words that clause already contains.
      const allowed = kindsBy(levelFor(state.delivered))
      expect(allowed.sort()).toEqual(['turn', 'turnNow'])
      for (let i = 0; i < 3; i++) {
        state = driveShort(state)
        const drop = dropOff(state, rng)
        if (drop.result !== 'redirected') break
        state = drop.state
        for (const step of state.fare!.steps) expect(allowed).toContain(step.kind)
        expect(state.fare!.steps.length).toBeLessThanOrEqual(MAX_REDIRECT_STEPS)
      }
    }
  })

  it('can point the way back from all but a few of the corners in a city', () => {
    // The first level is the tight one: *the nth street on the left* is all
    // anyone can say, and it still reaches nine corners in ten.
    let found = 0
    let corners = 0
    for (let seed = 1; seed <= 10; seed++) {
      const rng = seeded(seed)
      const game = createGame(rng)
      const dest = game.fare!.route.dest
      for (const p of intersections(game.city)) {
        if (p.x === dest.x && p.y === dest.y) continue
        for (const dir of [NORTH, EAST, SOUTH, WEST] as Dir[]) {
          if (!canDrive(game.city, p, dir)) continue
          corners++
          const put = pickRedirect(game.city, { ...p, dir }, dest, 0, rng)
          if (!put) continue
          found++
          // Whatever it says, it says it to the door and it drives — and it
          // is cut into clauses the same way driving it would be.
          expect(resolve(game.city, { ...p, dir }, put.steps)).toEqual(put.route)
        }
      }
    }
    expect(found / corners).toBeGreaterThan(0.85)
  })

  it('leaves the instruction as it was given when the door is too far to describe', () => {
    // A correction is a dozen blocks at the outside, so a door sixteen away
    // cannot be pointed at from here in any words at all.
    const far = lattice(9, 9)
    expect(pickRedirect(far, { x: 0, y: 0, dir: EAST }, { x: 8, y: 8 }, 0, seeded(2))).toBeNull()

    // The same corner put to a whole drop-off: the passenger has nothing to
    // add, so what they said stands and the fare carries on untouched.
    const state = startGame(createGame(seeded(21)))
    const stranded: TaxiState = {
      ...state,
      city: far,
      taxi: { x: 0, y: 0, dir: EAST },
      fare: { ...state.fare!, route: { ...state.fare!.route, dest: { x: 8, y: 8 } } },
    }
    const drop = dropOff(stranded, seeded(2))
    expect(drop.result).toBe('refused')
    expect(drop.state).toBe(stranded)
  })

  it('ignores a second tap once the fare is over', () => {
    const state = startGame(createGame(seeded(9)))
    const arrived = dropOff(driveRoute(state)).state
    const again = dropOff(arrived)
    expect(again.result).toBe('ignored')
    expect(again.state).toBe(arrived)
  })

  it('leaves the taxi where it stopped, and starts the next fare from there', () => {
    const state = runDry(startGame(createGame(seeded(17))))
    expect(state.outcome?.result).toBe('broke')
    const next = continueRun(state, seeded(3))
    expect(next.taxi).toMatchObject({ x: state.taxi.x, y: state.taxi.y })
    expect(next.trail).toEqual([{ x: state.taxi.x, y: state.taxi.y }])
    expect(next.outcome).toBeNull()
    expect(next.corrections).toBe(0)
    expect(next.spent).toBe(0)
    expect(next.fareId).toBe(state.fareId + 1)
  })

  it('picks up the next passenger where the last one got out', () => {
    const state = dropOff(driveRoute(startGame(createGame(seeded(21))))).state
    const next = continueRun(state, seeded(3))
    expect(next.taxi).toMatchObject(state.fare!.route.dest)
  })
})

describe('the meter', () => {
  it('opens empty and only ever goes up', () => {
    const state = createGame(seeded(21))
    expect(state.takings).toBe(0)
    expect(state.lives).toBe(LIVES)
    expect(purse(state)).toBe(state.fare!.pay)

    const paid = dropOff(driveRoute(startGame(state))).state
    expect(paid.takings).toBeGreaterThan(0)
  })

  it('takes the fuel out of the fare, not out of the takings', () => {
    const state = startGame(createGame(seeded(2)))
    const open = ([NORTH, EAST, SOUTH, WEST] as Dir[]).find((dir) =>
      canDrive(state.city, state.taxi, dir),
    )!
    const there = drive(state, open)
    expect(there.spent).toBe(FUEL_PER_BLOCK)
    expect(purse(there)).toBe(purse(state) - FUEL_PER_BLOCK)
    expect(there.takings).toBe(state.takings)
    // Thinking better of it costs the same again — the fuel is already burnt.
    const back = drive(there, ((open + 2) % 4) as Dir)
    expect(back.spent).toBe(2 * FUEL_PER_BLOCK)
  })

  it('sells a word once, and gives it back for nothing after that', () => {
    const state = startGame(createGame(seeded(21)))
    const word = state.fare!.words[0][0]
    const bought = buyWord(state, word.text)
    expect(bought.spent).toBe(WORD_PRICE)
    expect(bought.bought).toContain(word.text.toLowerCase())
    // The same word, however it is capitalised, is already paid for.
    expect(buyWord(bought, word.text.toUpperCase())).toBe(bought)
  })

  it('forgets what was bought when the next passenger gets in', () => {
    let state = startGame(createGame(seeded(21)))
    state = buyWord(state, state.fare!.words[0][0].text)
    expect(state.bought).toHaveLength(1)
    state = continueRun(dropOff(driveRoute(state)).state, seeded(3))
    expect(state.bought).toEqual([])
  })

  it('always leaves something over for a driver who buys every word and drives straight', () => {
    // The whole promise of the rate: translation is never the thing that
    // bankrupts you, it is just the thing that leaves you working for pennies.
    let state = startGame(createGame(seeded(55)))
    const rng = seeded(8)
    for (let fare = 0; fare < 15; fare++) {
      for (const clause of state.fare!.words) {
        for (const word of clause) state = buyWord(state, word.text)
      }
      const drop = dropOff(driveRoute(state))
      expect(drop.result).toBe('arrived')
      expect(drop.paid).toBeGreaterThan(0)
      state = continueRun(drop.state, rng)
    }
    expect(state.lives).toBe(LIVES)
  })

  it('writes the fare off when the driving eats all of it, and costs a life', () => {
    let state = startGame(createGame(seeded(31)))
    const fare = state.fare!
    // Drive back and forth over one block until the purse is gone.
    const open = ([NORTH, EAST, SOUTH, WEST] as Dir[]).find((dir) =>
      canDrive(state.city, state.taxi, dir),
    )!
    for (let i = 0; i < fare.pay / FUEL_PER_BLOCK && !state.outcome; i++) {
      state = drive(state, i % 2 ? (((open + 2) % 4) as Dir) : open)
    }
    expect(state.outcome?.result).toBe('broke')
    expect(state.lives).toBe(LIVES - 1)
    expect(state.takings).toBe(0)
    expect(state.status).toBe('playing')
    // The route is still on the table, because that is the thing to look at.
    expect(state.outcome?.route.dest).toEqual(fare.route.dest)
  })

  it('ends the shift on the third fare written off, and only then', () => {
    let state = startGame(createGame(seeded(13)))
    for (let life = 1; life <= LIVES; life++) {
      state = runDry(state)
      expect(state.lives).toBe(LIVES - life)
      if (life < LIVES) {
        expect(state.status).toBe('playing')
        state = continueRun(state, seeded(life))
      }
    }
    expect(state.status).toBe('over')
  })
})

describe('the clock', () => {
  it('gives fifteen seconds at the start and takes one off every other fare', () => {
    expect(secondsFor(0)).toBe(FIRST_SECONDS)
    expect(secondsFor(1)).toBe(FIRST_SECONDS)
    expect(secondsFor(2)).toBe(FIRST_SECONDS - 1)
    expect(secondsFor(3)).toBe(FIRST_SECONDS - 1)
    expect(secondsFor(4)).toBe(FIRST_SECONDS - 2)
  })

  it('never drops below five, however long the shift runs', () => {
    expect(secondsFor(2 * (FIRST_SECONDS - LAST_SECONDS))).toBe(LAST_SECONDS)
    expect(secondsFor(1000)).toBe(LAST_SECONDS)
  })

  it('starts every fare on the clock its driver has earned', () => {
    const state = startGame(createGame(seeded(21)))
    expect(state.clock).toBe(FIRST_SECONDS * 1000)
    expect(state.clockFull).toBe(state.clock)

    // Delivered fares are what tighten it, so a driver eight fares in is on
    // eleven seconds whatever else has happened.
    const eight = continueRun({ ...dropOff(driveRoute(state)).state, delivered: 8 })
    expect(eight.clock).toBe(secondsFor(8) * 1000)
  })

  it('counts down while the fare is being driven', () => {
    const state = startGame(createGame(seeded(3)))
    const later = tick(state, 4000)
    expect(later.clock).toBe(state.clock - 4000)
    expect(later.outcome).toBeNull()
    expect(later.lives).toBe(state.lives)
  })

  it('writes the fare off when it runs out, and shows what was meant', () => {
    const state = startGame(createGame(seeded(3)))
    const out = tick(state, state.clock)
    expect(out.clock).toBe(0)
    expect(out.outcome?.result).toBe('timeout')
    expect(out.outcome?.route).toEqual(state.fare!.route)
    expect(out.outcome?.steps).toEqual(state.fare!.steps)
    expect(out.outcome?.paid).toBe(0)
    expect(out.lives).toBe(state.lives - 1)
    expect(out.takings).toBe(state.takings)
  })

  it('stops once the fare is over, and before the shift has started', () => {
    const ready = createGame(seeded(3))
    expect(tick(ready, 5000)).toBe(ready)

    const out = tick(startGame(ready), 60_000)
    expect(tick(out, 5000)).toBe(out)
  })

  it('ends the shift when the last life goes with it', () => {
    const state = { ...startGame(createGame(seeded(3))), lives: 1 }
    const out = tick(state, state.clock)
    expect(out.lives).toBe(0)
    expect(out.status).toBe('over')
  })

  it('keeps running through a correction: the clock belongs to the journey', () => {
    // Otherwise a hopeful drop-off on any old corner would be a way of buying
    // time, which is the one thing being put right must not be worth.
    const rng = seeded(4)
    let state = startGame(createGame(seeded(21)))
    state = tick(state, 2000)
    const drop = dropOff(driveShort(state), rng)
    expect(drop.result).toBe('redirected')
    expect(drop.state.clock).toBe(state.clock)
    expect(drop.state.clockFull).toBe(state.clockFull)
  })
})

describe('a whole shift', () => {
  it('drives a perfect run up the levels, and banks it', () => {
    let state = startGame(createGame(seeded(77)))
    const rng = seeded(101)

    for (let fare = 0; fare < 40; fare++) {
      expect(state.fare).not.toBeNull()
      expect(state.status).toBe('playing')
      const drop = dropOff(driveRoute(state))
      expect(drop.result).toBe('arrived')
      state = continueRun(drop.state, rng)
    }

    expect(state.delivered).toBe(40)
    expect(state.lives).toBe(LIVES)
    expect(currentLevel(state)).toBe(LEVELS[LEVELS.length - 1])
    // A fare is worth more than the fuel it takes, so reading the directions
    // is what pays: about five thousand soʻm a fare.
    expect(state.takings).toBeGreaterThan(40 * 4 * FUEL_PER_BLOCK)
  })

  it('works for pennies when every word has to be translated', () => {
    let read = startGame(createGame(seeded(77)))
    let translated = startGame(createGame(seeded(77)))
    const readRng = seeded(101)
    const translatedRng = seeded(101)

    for (let fare = 0; fare < 12; fare++) {
      read = continueRun(dropOff(driveRoute(read)).state, readRng)
      for (const clause of translated.fare!.words) {
        for (const word of clause) translated = buyWord(translated, word.text)
      }
      translated = continueRun(dropOff(driveRoute(translated)).state, translatedRng)
    }

    // Both shifts delivered every passenger; only one of them made a living.
    expect(translated.delivered).toBe(read.delivered)
    expect(translated.takings).toBeGreaterThan(0)
    expect(translated.takings * 4).toBeLessThan(read.takings)
  })
})

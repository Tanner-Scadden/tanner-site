import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import {
  DRAFT_MS,
  PRINTS,
  PRINT_LIFE,
  REST_FRAME,
  WALK_FRAMES,
  type Pets,
  type Plan,
  type Point,
  type Rooms,
  draftOf,
  drafted,
  frameOf,
  initialPets,
  movePets,
  planFor,
  restingPets,
  printAlpha,
  stepPets,
} from './house.ts'

// A 280 x 190 house like the mock: Work and Open Source on top, Outside
// Work and D-13 below.
const rooms: Rooms = {
  house: { x: 20, y: 20, w: 280, h: 190 },
  work: { x: 20, y: 20, w: 150, h: 108 },
  oss: { x: 170, y: 20, w: 130, h: 108 },
  outside: { x: 20, y: 128, w: 205, h: 82 },
  locked: { x: 225, y: 128, w: 75, h: 82 },
}
const plan = planFor(rooms)

const inside = ({ x, y }: Point, r: { x: number; y: number; w: number; h: number }) =>
  x >= r.x - 0.01 && x <= r.x + r.w + 0.01 && y >= r.y - 0.01 && y <= r.y + r.h + 0.01

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

// Steps 60fps frames for `ms`, from `from`.
const run = (
  pets: Pets,
  { from = 0, ms, pointer = null, still = false }: { from?: number; ms: number; pointer?: Point | null; still?: boolean },
) => {
  let state = pets
  for (let now = from; now <= from + ms; now += 1000 / 60) {
    state = stepPets(state, { now, plan, pointer, still })
  }
  return state
}

describe('planFor', () => {
  it('leaves a gap in the bottom wall for the front door', () => {
    const bottom = Arr.filter(
      plan.walls,
      w => w.from.y === 210 && w.to.y === 210 && w.width > 2,
    )
    assert.strictEqual(bottom.length, 2)
    const [a, b] = bottom
    const gap = Math.abs(b!.to.x - a!.from.x)
    assert.isAbove(gap, 20)
    assert.isTrue(plan.door.x > a!.from.x && plan.door.x < b!.to.x)
    assert.isAbove(plan.door.y, 210)
  })

  it('keeps the yard inside Outside Work', () => {
    assert.isTrue(inside(plan.yard, rooms.outside))
    assert.isTrue(inside({ x: plan.yard.x + plan.yard.w, y: plan.yard.y + plan.yard.h }, rooms.outside))
  })
})

describe('draftOf', () => {
  it('draws nothing at the start and everything at the end', () => {
    assert.isTrue(Arr.every(draftOf(plan.walls, { since: 0, still: false }), r => r === 0))
    assert.isTrue(Arr.every(draftOf(plan.walls, { since: DRAFT_MS, still: false }), r => r === 1))
  })

  it('drafts the walls in order, one at a time', () => {
    const half = draftOf(plan.walls, { since: DRAFT_MS / 2, still: false })
    const partial = Arr.filter(half, r => r > 0 && r < 1)
    assert.isAtMost(partial.length, 1)
    // Once a wall is unfinished, every later wall is untouched.
    const first = Option.getOrElse(Arr.findFirstIndex(half, r => r < 1), () => half.length)
    assert.isTrue(Arr.every(half.slice(first + 1), r => r === 0))
  })

  it('is already drawn when motion is reduced', () => {
    assert.isTrue(Arr.every(draftOf(plan.walls, { since: 0, still: true }), r => r === 1))
    assert.isTrue(drafted({ since: 0, still: true }))
    assert.isFalse(drafted({ since: 0, still: false }))
  })
})

describe('the pets', () => {
  it('come in through the front door and stay in the yard', () => {
    const pets = initialPets(plan, 7)
    assert.deepStrictEqual(pets.teddy.at, plan.door)
    const later = run(pets, { ms: 20_000 })
    assert.isTrue(inside(later.teddy.at, plan.yard))
    assert.isTrue(inside(later.rain.at, plan.yard))
  })

  it('Teddy comes over to the pointer and sits by it', () => {
    const pointer = { x: 60, y: 50 }
    const later = run(initialPets(plan, 3), { ms: 6000, pointer })
    assert.isAtMost(distance(later.teddy.at, pointer), 14)
  })

  it('Teddy never follows the pointer out of the house', () => {
    const later = run(initialPets(plan, 3), { ms: 6000, pointer: { x: 900, y: -400 } })
    assert.isTrue(inside(later.teddy.at, plan.inside))
  })

  it('Rain bolts when Teddy gets close', () => {
    const home = restingPets(plan)
    const close: Pets = {
      ...home,
      teddy: { ...home.teddy, at: { x: home.rain.at.x - 5, y: home.rain.at.y } },
    }
    const next = stepPets(close, { now: 0, plan, pointer: null, still: false })
    assert.isTrue(next.rain.fleeing)
    assert.isAbove(distance(next.rain.target, close.teddy.at), 24)
  })

  it('leave paw prints as they walk, and only a few', () => {
    const later = run(initialPets(plan, 11), { ms: 4000 })
    assert.isAbove(later.teddy.prints.length, 0)
    assert.isAtMost(later.teddy.prints.length, PRINTS)
  })

  it('let their paw prints fade away', () => {
    const home = restingPets(plan)
    const walking: Pets = { ...home, teddy: { ...home.teddy, target: { x: home.teddy.at.x - 40, y: home.teddy.at.y } } }
    // Walk a moment, then sit long enough for every print to fade.
    const walked = run(walking, { ms: 600 })
    assert.isAbove(walked.teddy.prints.length, 0)
    const [first] = walked.teddy.prints
    assert.isAbove(printAlpha(first!, first!.t + 10), 0.9)
    assert.strictEqual(printAlpha(first!, first!.t + PRINT_LIFE), 0)
    const faded = run(walked, { from: 600, ms: PRINT_LIFE + 100, pointer: walked.teddy.at })
    assert.strictEqual(faded.teddy.prints.length, 0)
  })

  it('walk through the walking frames, face where they go, and rest when they stop', () => {
    const home = restingPets(plan)
    assert.strictEqual(frameOf(home.teddy), REST_FRAME)
    const walking: Pets = { ...home, teddy: { ...home.teddy, target: { x: home.teddy.at.x - 40, y: home.teddy.at.y } } }
    const frames = Arr.makeBy(30, i => frameOf(run(walking, { ms: i * 30 }).teddy))
    assert.isTrue(Arr.every(Arr.range(0, WALK_FRAMES - 1), f => frames.includes(f)))
    assert.strictEqual(run(walking, { ms: 300 }).teddy.facing, -1)
    assert.strictEqual(frameOf(run(walking, { ms: 3000 }).teddy), REST_FRAME)
  })

  it('sit still when motion is reduced', () => {
    const home = restingPets(plan)
    const later = run(home, { ms: 3000, still: true, pointer: { x: 60, y: 50 } })
    assert.deepStrictEqual(later.teddy.at, home.teddy.at)
    assert.deepStrictEqual(later.rain.at, home.rain.at)
  })

  it('keep their place in the yard when the house resizes', () => {
    const bigger: Plan = planFor({
      house: { x: 40, y: 40, w: 560, h: 380 },
      work: { x: 40, y: 40, w: 300, h: 216 },
      oss: { x: 340, y: 40, w: 260, h: 216 },
      outside: { x: 40, y: 256, w: 410, h: 164 },
      locked: { x: 450, y: 256, w: 150, h: 164 },
    })
    const moved = movePets(restingPets(plan), { from: plan, to: bigger })
    assert.isTrue(inside(moved.teddy.at, bigger.yard))
    assert.isTrue(inside(moved.rain.at, bigger.yard))
  })
})

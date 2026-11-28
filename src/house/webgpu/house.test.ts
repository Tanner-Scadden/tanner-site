import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import {
  ALERT_FRAME,
  DRAFT_MS,
  FILL_MS,
  MAX_WALLS,
  PRINTS,
  PRINT_LIFE,
  REST_FRAME,
  ROOMS,
  SKETCH_MS,
  WALK_FRAMES,
  type Door,
  type Pets,
  type Plan,
  type Point,
  type Rooms,
  areaOf,
  barkOf,
  crosses,
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

const rooms: Rooms = {
  house: { x: 20, y: 20, w: 280, h: 190 },
  library: { x: 20, y: 20, w: 80, h: 108 },
  work: { x: 100, y: 20, w: 98, h: 108 },
  oss: { x: 198, y: 20, w: 102, h: 108 },
  outside: { x: 20, y: 128, w: 210, h: 82 },
  locked: { x: 230, y: 128, w: 70, h: 82 },
}
const inWork = { x: 150, y: 50 }
const CASE = 0.9
const plan = planFor(rooms)

const inside = ({ x, y }: Point, r: { x: number; y: number; w: number; h: number }) =>
  x >= r.x - 0.01 && x <= r.x + r.w + 0.01 && y >= r.y - 0.01 && y <= r.y + r.h + 0.01

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

const run = (
  pets: Pets,
  {
    from = 0,
    ms,
    pointer = Option.none(),
    still = false,
  }: { from?: number; ms: number; pointer?: Option.Option<Point>; still?: boolean },
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

  it('stands the walls and the door up, and leaves the markings on the floor', () => {
    const outer = Arr.filter(plan.walls, w => w.width > 2)
    assert.isTrue(Arr.every(outer, w => w.rise === 1))
    const dashed = Arr.filter(plan.walls, w => w.dash > 0)
    assert.isAbove(dashed.length, 0)
    assert.isTrue(Arr.every(dashed, w => w.rise === 0))
    const door = Arr.filter(
      plan.walls,
      w => w.rise > 0.8 && w.rise < 1 && !inside(w.from, rooms.library),
    )
    assert.strictEqual(door.length, 1)
  })

  const furniture = Arr.filter(
    plan.walls,
    w => w.rise > 0 && w.rise < 1 && inside(w.from, rooms.library) && inside(w.to, rooms.library),
  )
  const boards = Arr.filter(furniture, w => w.rise <= 0.06 && distance(w.from, w.to) > rooms.library.w * 0.8)
  const books = Arr.filter(furniture, w => w.rise !== CASE && !boards.includes(w))

  it('stands a bookcase in the library, with a board under each shelf', () => {
    assert.strictEqual(Arr.filter(furniture, w => w.rise === CASE && w.base === 0).length, 2)
    assert.strictEqual(boards.length, 3)
    assert.strictEqual(Arr.filter(boards, w => w.base > 0).length, 2)
    assert.isTrue(Arr.every(boards, w => w.base + w.rise <= CASE + 1e-9))
  })

  const spines = Arr.filter(books, w => w.from.y === w.to.y)
  const covers = Arr.filter(books, w => w.from.x === w.to.x)

  it('fills its two shelves with books of different heights', () => {
    assert.isAtLeast(spines.length, 16)
    assert.strictEqual(new Set(Arr.map(spines, w => w.base)).size, 2)
    assert.isAtLeast(new Set(Arr.map(spines, w => w.rise)).size, 8)
    assert.isAtLeast(Arr.filter(spines, w => w.gold === 1).length, 4)
    assert.strictEqual(Arr.filter(spines, w => w.rise < 0.15).length, 1)
  })

  it('gives every book depth: two covers running back from its spine', () => {
    assert.strictEqual(covers.length, spines.length * 2)
    assert.strictEqual(books.length, spines.length * 3)
    assert.isTrue(Arr.every(covers, w => distance(w.from, w.to) > 2))
  })

  it('leans a few books, and nothing else', () => {
    const leaning = Arr.filter(spines, w => w.lean.x !== 0)
    assert.isAtLeast(leaning.length, 3)
    assert.isTrue(Arr.some(leaning, w => w.lean.x > 0) && Arr.some(leaning, w => w.lean.x < 0))
    assert.isTrue(Arr.every(spines, w => w.lean.y === 0))
    const rest = Arr.filter(plan.walls, w => !books.includes(w))
    assert.isTrue(Arr.every(rest, w => w.lean.x === 0 && w.lean.y === 0))
  })

  it('keeps every book on its shelf, under the board above', () => {
    for (const book of books) {
      assert.isAtMost(book.base + book.rise, CASE)
      for (const board of boards) {
        assert.isFalse(
          book.base < board.base + board.rise && book.base + book.rise > board.base,
          'a book runs through a board',
        )
      }
    }
  })

  it('keeps the library\'s furniture clear of its doorway', () => {
    const toLibrary: ReadonlyArray<Door> = Arr.filter(plan.doors, d => d.between.includes('library'))
    const mouths = Arr.flatMap(toLibrary, d => d.mouths)
    assert.strictEqual(mouths.length, 2)
    assert.isTrue(
      Arr.every(furniture, w => Arr.every(mouths, m => distance(m, w.from) > 8 && distance(m, w.to) > 8)),
    )
  })

  it('lays a rug in the library, clear of the shelves', () => {
    const rug = Arr.filter(
      plan.walls,
      w => w.rise === 0 && w.gold === 1 && w.dash > 0 && inside(w.from, rooms.library) && inside(w.to, rooms.library),
    )
    assert.strictEqual(rug.length, 4)
    assert.isTrue(Arr.every(rug, w => w.from.x > rooms.library.x + 7.5 && w.from.y > rooms.library.y + 7.5))
  })

  it('fits every wall in what the renderer draws', () => {
    assert.isAtMost(plan.walls.length, MAX_WALLS)
  })

  it('keeps the yard inside Personal Life', () => {
    assert.isTrue(inside(plan.yard, rooms.outside))
    assert.isTrue(inside({ x: plan.yard.x + plan.yard.w, y: plan.yard.y + plan.yard.h }, rooms.outside))
  })
})

describe('draftOf', () => {
  const at = (since: number) => draftOf({ since, still: false })

  it('draws nothing at the start and everything at the end', () => {
    const start = at(0)
    assert.strictEqual(start.sketch, 0)
    assert.strictEqual(start.fill, 0)
    assert.isTrue(Arr.every(start.rooms, r => r === 0))
    const end = at(DRAFT_MS)
    assert.strictEqual(end.sketch, 1)
    assert.strictEqual(end.fill, 1)
    assert.isTrue(Arr.every(end.rooms, r => r === 1))
  })

  it('sketches the whole blueprint before anything fills in', () => {
    const sketching = at(SKETCH_MS / 2)
    assert.isTrue(sketching.sketch > 0 && sketching.sketch < 1)
    assert.strictEqual(sketching.fill, 0)
    assert.isTrue(Arr.every(sketching.rooms, r => r === 0))
    const sketched = at(SKETCH_MS)
    assert.strictEqual(sketched.sketch, 1)
    assert.strictEqual(sketched.fill, 0)
  })

  it('fills the rooms in one after another', () => {
    const { rooms: filling } = at(SKETCH_MS + FILL_MS / 3)
    assert.isTrue(Arr.some(filling, r => r > 0 && r < 1))
    Arr.forEach(Arr.zip(filling, Arr.drop(filling, 1)), ([before, after]) =>
      assert.isAtLeast(before, after),
    )
  })

  it('fills the library in first, like the page', () => {
    assert.strictEqual(ROOMS[0], 'library')
  })

  it('is already drawn when motion is reduced', () => {
    const still = draftOf({ since: 0, still: true })
    assert.strictEqual(still.sketch, 1)
    assert.strictEqual(still.fill, 1)
    assert.isTrue(Arr.every(still.rooms, r => r === 1))
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
    const pointer = inWork
    const later = run(initialPets(plan, 3), { ms: 6000, pointer: Option.some(pointer) })
    assert.isAtMost(distance(later.teddy.at, pointer), 14)
  })

  it('Teddy play-bows and barks once he catches the pointer', () => {
    const pointer = inWork
    const later = run(initialPets(plan, 3), { ms: 6000, pointer: Option.some(pointer) })
    assert.isTrue(later.teddy.alert)
    assert.strictEqual(frameOf(later.teddy), ALERT_FRAME)
    const barks = Arr.makeBy(120, i => barkOf(run(later, { from: 6000, ms: i * 20, pointer: Option.some(pointer) }).teddy, 6000 + i * 20))
    assert.isTrue(Arr.some(barks, Option.isSome))
    const calm = run(later, { from: 6000, ms: 100 })
    assert.isFalse(calm.teddy.alert)
  })

  it('Rain ignores the pointer, but sometimes sits up to watch it', () => {
    const pointer = inWork
    const later = run(initialPets(plan, 5), { ms: 20_000, pointer: Option.some(pointer) })
    assert.isTrue(inside(later.rain.at, plan.yard))
    const home = restingPets(plan)
    const resting: Pets = {
      ...home,
      rain: { ...home.rain, restUntil: 10_000, curious: true },
    }
    const watching = stepPets(resting, { now: 0, plan, pointer: Option.some(pointer), still: false })
    assert.isTrue(watching.rain.alert)
    assert.strictEqual(watching.rain.facing, Math.sign(pointer.x - home.rain.at.x))
    const napping = stepPets({ ...resting, rain: { ...resting.rain, curious: false } }, { now: 0, plan, pointer: Option.some(pointer), still: false })
    assert.isFalse(napping.rain.alert)
  })

  it('Teddy never follows the pointer out of the house', () => {
    const later = run(initialPets(plan, 3), { ms: 6000, pointer: Option.some({ x: 900, y: -400 }) })
    assert.isTrue(inside(later.teddy.at, plan.inside))
  })

  it('Rain bolts when Teddy gets close', () => {
    const home = restingPets(plan)
    const close: Pets = {
      ...home,
      teddy: { ...home.teddy, at: { x: home.rain.at.x - 5, y: home.rain.at.y } },
    }
    const next = stepPets(close, { now: 0, plan, pointer: Option.none(), still: false })
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
    const walked = run(walking, { ms: 600 })
    assert.isAbove(walked.teddy.prints.length, 0)
    const [first] = walked.teddy.prints
    assert.isAbove(printAlpha(first!, first!.t + 10), 0.9)
    assert.strictEqual(printAlpha(first!, first!.t + PRINT_LIFE), 0)
    const faded = run(walked, { from: 600, ms: PRINT_LIFE + 100, pointer: Option.some(walked.teddy.at) })
    assert.strictEqual(faded.teddy.prints.length, 0)
  })

  it('walk through the walking frames, face where they go, and rest when they stop', () => {
    const home = restingPets(plan)
    assert.strictEqual(frameOf(home.teddy), REST_FRAME)
    const walking: Pets = { ...home, teddy: { ...home.teddy, target: { x: home.teddy.at.x - 40, y: home.teddy.at.y } } }
    const frames = Arr.makeBy(30, i => frameOf(run(walking, { ms: i * 30 }).teddy))
    assert.isTrue(Arr.every(Arr.range(0, WALK_FRAMES - 1), f => frames.includes(f)))
    assert.strictEqual(run(walking, { ms: 300 }).teddy.facing, -1)
    assert.strictEqual(frameOf(run(walking, { ms: 1300 }).teddy), REST_FRAME)
  })

  it('sit still when motion is reduced', () => {
    const home = restingPets(plan)
    const later = run(home, { ms: 3000, still: true, pointer: Option.some(inWork) })
    assert.deepStrictEqual(later.teddy.at, home.teddy.at)
    assert.deepStrictEqual(later.rain.at, home.rain.at)
  })

  it('still has Teddy play-bow in place, without barking, when the pointer comes right up to him', () => {
    const home = restingPets(plan)
    const near = { x: home.teddy.at.x + 10, y: home.teddy.at.y }
    const bowing = run(home, { ms: 500, still: true, pointer: Option.some(near) })
    assert.isTrue(bowing.teddy.alert)
    assert.deepStrictEqual(bowing.teddy.at, home.teddy.at)
    assert.strictEqual(bowing.teddy.facing, 1)
    assert.strictEqual(bowing.teddy.barkAt, home.teddy.barkAt)
    const away = run(bowing, { from: 600, ms: 100, still: true })
    assert.isFalse(away.teddy.alert)
  })

  it('keep their place in the yard when the house resizes', () => {
    const bigger: Plan = planFor({
      house: { x: 40, y: 40, w: 560, h: 380 },
      library: { x: 40, y: 40, w: 160, h: 216 },
      work: { x: 200, y: 40, w: 196, h: 216 },
      oss: { x: 396, y: 40, w: 204, h: 216 },
      outside: { x: 40, y: 256, w: 420, h: 164 },
      locked: { x: 460, y: 256, w: 140, h: 164 },
    })
    const moved = movePets(restingPets(plan), { from: plan, to: bigger })
    assert.isTrue(inside(moved.teddy.at, bigger.yard))
    assert.isTrue(inside(moved.rain.at, bigger.yard))
  })

  const throughWall = (a: Point, b: Point) =>
    Arr.some(plan.walls, w => w.rise > 0 && crosses({ from: a, to: b }, w))

  const walkThrough = (pets: Pets, ms: number, pointer: Option.Option<Point>) => {
    let state = pets
    for (let now = 0; now <= ms; now += 1000 / 60) {
      const next = stepPets(state, { now, plan, pointer, still: false })
      assert.isFalse(throughWall(state.teddy.at, next.teddy.at), `Teddy went through a wall at ${now}ms`)
      assert.isFalse(throughWall(state.rain.at, next.rain.at), `Rain went through a wall at ${now}ms`)
      state = next
    }
    return state
  }

  it('come in through the front door, not the walls', () => {
    for (const seed of Arr.range(1, 24)) walkThrough(initialPets(plan, seed), 12_000, Option.none())
  })

  it('Teddy goes room to room through the doorways to reach the pointer', () => {
    const pointer = { x: 260, y: 50 }
    const later = walkThrough(initialPets(plan, 3), 8000, Option.some(pointer))
    assert.strictEqual(areaOf(plan, later.teddy.at), 'oss')
    assert.isAtMost(distance(later.teddy.at, pointer), 14)
    const home = walkThrough(later, 8000, Option.none())
    assert.strictEqual(areaOf(plan, home.teddy.at), 'outside')
  })

  it('Teddy goes through Work into the library, round the bookcases', () => {
    const pointer = { x: 26, y: 26 }
    const later = walkThrough(initialPets(plan, 3), 8000, Option.some(pointer))
    assert.strictEqual(areaOf(plan, later.teddy.at), 'library')
    assert.isTrue(later.teddy.alert)
    assert.isAbove(later.teddy.at.x, rooms.library.x + 7.5)
    assert.isAbove(later.teddy.at.y, rooms.library.y + 7.5)
  })

  it('Teddy gets into the library on a phone-sized plan too', () => {
    const small = planFor({
      house: { x: 16, y: 16, w: 301, h: 183 },
      library: { x: 16, y: 16, w: 82, h: 88 },
      work: { x: 98, y: 16, w: 104, h: 88 },
      oss: { x: 202, y: 16, w: 115, h: 88 },
      outside: { x: 16, y: 104, w: 222, h: 95 },
      locked: { x: 238, y: 104, w: 79, h: 95 },
    })
    assert.isAtMost(small.walls.length, MAX_WALLS)
    let state = initialPets(small, 3)
    const pointer = { x: 60, y: 60 }
    for (let now = 0; now <= 8000; now += 1000 / 60) {
      const next = stepPets(state, { now, plan: small, pointer: Option.some(pointer), still: false })
      assert.isFalse(
        Arr.some(small.walls, w => w.rise > 0 && crosses({ from: state.teddy.at, to: next.teddy.at }, w)),
        `Teddy went through a wall at ${now}ms`,
      )
      state = next
    }
    assert.strictEqual(areaOf(small, state.teddy.at), 'library')
    assert.isTrue(state.teddy.alert)
  })

  it('Teddy waits at the door of D-13, since it stays closed', () => {
    const later = walkThrough(initialPets(plan, 3), 8000, Option.some({ x: 262, y: 170 }))
    assert.notStrictEqual(areaOf(plan, later.teddy.at), 'locked')
    assert.isTrue(later.teddy.alert)
  })
})


import { Array as Arr, Option } from 'effect'
import { dual } from 'effect/Function'

import { stepSince } from '../../gpu/loop.ts'
import { clamp01, nextRandom } from '../../gpu/math.ts'

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface Rooms {
  readonly house: Rect
  readonly library: Rect
  readonly work: Rect
  readonly oss: Rect
  readonly outside: Rect
  readonly locked: Rect
}

export interface Wall {
  readonly from: Point
  readonly to: Point
  readonly width: number
  readonly gold: number
  readonly dash: number
  readonly alpha: number
  readonly rise: number
  readonly base: number
  readonly lean: Point
}

export type Area = 'library' | 'work' | 'oss' | 'outside' | 'locked' | 'porch'

export interface Door {
  readonly between: readonly [Area, Area]
  readonly mouths: readonly [Point, Point]
}

export interface Obstacle {
  readonly from: Point
  readonly to: Point
  readonly around: Point
}

export interface Plan {
  readonly rooms: Rooms
  readonly doors: ReadonlyArray<Door>
  readonly obstacles: ReadonlyArray<Obstacle>
  readonly walls: ReadonlyArray<Wall>
  readonly door: Point
  readonly yard: Rect
  readonly inside: Rect
}

export const SKETCH_MS = 900
export const FILL_MS = 1500
export const DRAFT_MS = SKETCH_MS + FILL_MS
const OUTER = 2.4
const INNER = 1.6
const THIN = 0.8
const ARC_STEPS = 10
const SHELF_OFF = 2.5
const SHELF_DEPTH = 5
const CASE_RISE = 0.9
const BOARD = 0.03
const KICK = BOARD * 2
const SHELVES = 2
export const MAX_WALLS = 192

const pt = (x: number, y: number): Point => ({ x, y })

const wall = (
  from: Point,
  to: Point,
  width: number,
  {
    gold = 0,
    dash = 0,
    alpha = 0.9,
    rise = 1,
    base = 0,
    lean = { x: 0, y: 0 },
  }: { gold?: number; dash?: number; alpha?: number; rise?: number; base?: number; lean?: Point } = {},
): Wall => ({ from, to, width, gold, dash, alpha, rise, base, lean })

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)

const swing = (hinge: Point, radius: number, from: number, to: number): ReadonlyArray<Wall> =>
  Arr.makeBy(ARC_STEPS, i => {
    const a = from + ((to - from) * i) / ARC_STEPS
    const b = from + ((to - from) * (i + 1)) / ARC_STEPS
    return wall(
      pt(hinge.x + radius * Math.cos(a), hinge.y + radius * Math.sin(a)),
      pt(hinge.x + radius * Math.cos(b), hinge.y + radius * Math.sin(b)),
      THIN,
      { dash: 3, alpha: 0.7, rise: 0 },
    )
  })

const inset = (r: Rect, by: number): Rect => ({
  x: r.x + by,
  y: r.y + by,
  w: Math.max(0, r.w - 2 * by),
  h: Math.max(0, r.h - 2 * by),
})

interface Book {
  readonly w: number
  readonly rise: number
  readonly gold?: number
  readonly lean?: number
}
const gap = (w: number): Book => ({ w, rise: 0 })
const BACK_SHELVES: ReadonlyArray<ReadonlyArray<Book>> = [
  [
    { w: 2, rise: 0.8 },
    { w: 1.5, rise: 0.95 },
    { w: 2.5, rise: 0.72, gold: 1 },
    { w: 1.5, rise: 0.88, lean: 18 },
    gap(2.5),
    { w: 2, rise: 0.92 },
    { w: 1.5, rise: 0.78 },
    { w: 2, rise: 0.86, gold: 1 },
    gap(1.5),
    { w: 5, rise: 0.22 },
    gap(1),
    { w: 1.5, rise: 0.9, lean: -8 },
    { w: 2, rise: 0.76 },
  ],
  [
    { w: 1.5, rise: 0.86 },
    { w: 2, rise: 0.74, gold: 1 },
    { w: 1.5, rise: 0.94, lean: 24 },
    gap(3),
    { w: 2.5, rise: 0.8 },
    { w: 1.5, rise: 0.9 },
    { w: 2, rise: 0.7 },
    { w: 1.5, rise: 0.84 },
    gap(2),
    { w: 2, rise: 0.92, gold: 1, lean: -14 },
    { w: 1.5, rise: 0.78, lean: 10 },
    gap(1.5),
  ],
]
const BETWEEN = 0.35
const SPINE = SHELF_OFF + SHELF_DEPTH * 0.92
const PAGES = SHELF_OFF + SHELF_DEPTH * 0.2

const underShelf = (shelf: number): number => {
  if (shelf > 0) return BOARD
  return KICK
}

const bookcase = (
  from: Point,
  to: Point,
  into: Point,
  shelves: ReadonlyArray<ReadonlyArray<Book>>,
): ReadonlyArray<Wall> => {
  const off = (p: Point, by: number) => pt(p.x + into.x * by, p.y + into.y * by)
  const along = (t: number) => pt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)
  const length = distance(from, to)
  const dir = pt((to.x - from.x) / length, (to.y - from.y) / length)
  const frame = { alpha: 0.8 }
  const tall = CASE_RISE / SHELVES
  const row = (books: ReadonlyArray<Book>, shelf: number): ReadonlyArray<Wall> => {
    const floor = shelf * tall + underShelf(shelf)
    const room = tall - BOARD - underShelf(shelf)
    const units = Arr.reduce(books, 0, (sum, b) => sum + b.w) + BETWEEN * (books.length + 1)
    const starts = Arr.scan(books, BETWEEN / units, (at, b) => at + (b.w + BETWEEN) / units)
    return Arr.flatMap(books, (b, i): ReadonlyArray<Wall> => {
      if (b.rise <= 0) return []
      const left = along(starts[i] ?? 0)
      const right = along((starts[i] ?? 0) + b.w / units)
      const angle = ((b.lean ?? 0) * Math.PI) / 180
      const lean = pt(dir.x * Math.tan(angle), dir.y * Math.tan(angle))
      const look = { gold: b.gold ?? 0, rise: b.rise * room * Math.cos(angle), base: floor, lean }
      return [
        wall(off(left, SPINE), off(right, SPINE), THIN, { ...look, alpha: 0.85 }),
        wall(off(left, PAGES), off(left, SPINE), THIN, { ...look, alpha: 0.55 }),
        wall(off(right, PAGES), off(right, SPINE), THIN, { ...look, alpha: 0.55 }),
      ]
    })
  }
  const front = (base: number, rise: number) =>
    wall(off(from, SHELF_OFF + SHELF_DEPTH), off(to, SHELF_OFF + SHELF_DEPTH), THIN, {
      ...frame,
      rise,
      base,
    })
  const end = (at: Point) =>
    wall(off(at, SHELF_OFF), off(at, SHELF_OFF + SHELF_DEPTH), THIN, { ...frame, rise: CASE_RISE })
  return [
    wall(off(from, SHELF_OFF + SHELF_DEPTH), off(to, SHELF_OFF + SHELF_DEPTH), THIN, { alpha: 0.6, rise: 0 }),
    front(0, KICK),
    end(from),
    end(to),
    ...Arr.makeBy(SHELVES, i => front((i + 1) * tall - BOARD, BOARD)),
    ...Arr.flatMap(shelves, row),
  ]
}

const rugOf = (library: Rect): Rect => {
  const w = (library.w - 2 * (SHELF_OFF + SHELF_DEPTH)) * 0.75
  const h = library.h * 0.4
  return { x: library.x + (library.w - w) / 2, y: library.y + (library.h - h) / 2, w, h }
}

const rug = (r: Rect): ReadonlyArray<Wall> => {
  const mark = { gold: 1, dash: 3, alpha: 0.5, rise: 0 }
  const [a, b, c, d] = [pt(r.x, r.y), pt(r.x + r.w, r.y), pt(r.x + r.w, r.y + r.h), pt(r.x, r.y + r.h)]
  return [wall(a, b, THIN, mark), wall(b, c, THIN, mark), wall(c, d, THIN, mark), wall(d, a, THIN, mark)]
}

const SHELVED = SHELF_OFF + SHELF_DEPTH

export const planFor = (rooms: Rooms): Plan => {
  const { house, library, work, outside, locked } = rooms
  const left = house.x
  const top = house.y
  const right = house.x + house.w
  const bottom = house.y + house.h
  const middle = work.y + work.h
  const split = work.x + work.w
  const stacks = library.x + library.w
  const lockX = locked.x

  const doorWidth = Math.min(30, outside.w * 0.3)
  const doorLeft = outside.x + outside.w * 0.38
  const doorRight = doorLeft + doorWidth

  const hallWidth = Math.min(28, work.w * 0.3)
  const hallLeft = work.x + work.w * 0.35
  const sideWidth = Math.min(24, work.h * 0.3)
  const sideTop = work.y + work.h * 0.45
  const stacksWidth = Math.min(24, library.h * 0.3)
  const stacksTop = library.y + library.h * 0.5

  const walls: ReadonlyArray<Wall> = [
    wall(pt(doorLeft, bottom), pt(left, bottom), OUTER),
    wall(pt(left, bottom), pt(left, top), OUTER),
    wall(pt(left, top), pt(right, top), OUTER),
    wall(pt(right, top), pt(right, bottom), OUTER),
    wall(pt(right, bottom), pt(doorRight, bottom), OUTER),
    wall(pt(left, middle), pt(hallLeft, middle), INNER),
    wall(pt(hallLeft + hallWidth, middle), pt(right, middle), INNER),
    wall(pt(split, top), pt(split, sideTop), INNER),
    wall(pt(split, sideTop + sideWidth), pt(split, middle), INNER),
    wall(pt(stacks, top), pt(stacks, stacksTop), INNER),
    wall(pt(stacks, stacksTop + stacksWidth), pt(stacks, middle), INNER),
    wall(pt(lockX, middle), pt(lockX, bottom), INNER),
    wall(pt(doorLeft, bottom), pt(doorLeft, bottom - doorWidth), THIN, { alpha: 0.8, rise: 0.82 }),
    ...swing(pt(doorLeft, bottom), doorWidth, -Math.PI / 2, 0),
    ...swing(pt(hallLeft, middle), hallWidth, 0, Math.PI / 2),
    ...bookcase(pt(library.x + SHELF_OFF, top), pt(stacks - SHELF_OFF, top), pt(0, 1), BACK_SHELVES),
    ...rug(rugOf(library)),
    wall(
      pt(locked.x + 8, locked.y + 8),
      pt(locked.x + locked.w - 8, locked.y + locked.h - 8),
      THIN,
      { gold: 1, dash: 4, alpha: 0.6, rise: 0 },
    ),
    wall(
      pt(locked.x + locked.w - 8, locked.y + 8),
      pt(locked.x + 8, locked.y + locked.h - 8),
      THIN,
      { gold: 1, dash: 4, alpha: 0.6, rise: 0 },
    ),
  ]

  const across = (x: number, y: number, dx: number, dy: number): readonly [Point, Point] => [
    pt(x - dx * STEP_IN, y - dy * STEP_IN),
    pt(x + dx * STEP_IN, y + dy * STEP_IN),
  ]
  const doors: ReadonlyArray<Door> = [
    { between: ['outside', 'porch'], mouths: across((doorLeft + doorRight) / 2, bottom, 0, 1) },
    { between: ['work', 'outside'], mouths: across(hallLeft + hallWidth / 2, middle, 0, 1) },
    { between: ['work', 'oss'], mouths: across(split, sideTop + sideWidth / 2, 1, 0) },
    { between: ['library', 'work'], mouths: across(stacks, stacksTop + stacksWidth / 2, 1, 0) },
  ]

  const obstacles: ReadonlyArray<Obstacle> = [
    {
      from: pt(doorLeft, bottom),
      to: pt(doorLeft, bottom - doorWidth),
      around: pt(doorLeft, bottom - doorWidth - STEP_IN),
    },
  ]

  return {
    rooms,
    doors,
    obstacles,
    walls,
    door: pt((doorLeft + doorRight) / 2, bottom + 14),
    yard: inset(outside, 14),
    inside: inset(house, 8),
  }
}


const STEP_IN = 10
const WALL_GAP = 7
export const ROOMS = ['library', 'work', 'oss', 'outside', 'locked'] as const
export type Room = (typeof ROOMS)[number]
const OPEN: ReadonlyArray<Room> = ['library', 'work', 'oss', 'outside']
const isOpen = (area: Area): area is Room => Arr.contains(OPEN, area)

const within = (p: Point, r: Rect): boolean =>
  p.x >= r.x - 0.01 && p.x <= r.x + r.w + 0.01 && p.y >= r.y - 0.01 && p.y <= r.y + r.h + 0.01

export const areaOf: {
  (p: Point): (plan: Plan) => Area
  (plan: Plan, p: Point): Area
} = dual(2, (plan: Plan, p: Point): Area =>
  Option.getOrElse(
    Arr.findFirst(ROOMS, room => within(p, plan.rooms[room])),
    (): Area => 'porch',
  ),
)

const floorOf = (plan: Plan, room: Room): Rect => {
  const floor = inset(plan.rooms[room], WALL_GAP)
  if (room === 'library') return { ...floor, y: floor.y + SHELVED, h: Math.max(0, floor.h - SHELVED) }
  return floor
}

const nearest = (p: Point, points: ReadonlyArray<Point>): Point =>
  Arr.reduce(points, p, (best, q) => {
    if (best === p || distance(p, q) < distance(p, best)) return q
    return best
  })

export const reachable: {
  (p: Point): (plan: Plan) => Point
  (plan: Plan, p: Point): Point
} = dual(2, (plan: Plan, p: Point): Point => {
  const area = areaOf(plan, p)
  if (isOpen(area)) return clampTo(p, floorOf(plan, area))
  return nearest(p, Arr.map(OPEN, room => clampTo(p, floorOf(plan, room))))
})

const otherSide = (door: Door, at: Area): Option.Option<Area> => {
  const [a, b] = door.between
  if (a === at) return Option.some(b)
  if (b === at) return Option.some(a)
  return Option.none()
}

const route = (plan: Plan, from: Area, to: Area): Option.Option<ReadonlyArray<Door>> => {
  let frontier: ReadonlyArray<{ readonly at: Area; readonly doors: ReadonlyArray<Door> }> = [
    { at: from, doors: [] },
  ]
  const seen = new Set<Area>([from])
  while (frontier.length > 0) {
    const found = Arr.findFirst(frontier, step => step.at === to)
    if (Option.isSome(found)) return Option.some(found.value.doors)
    frontier = Arr.flatMap(frontier, step =>
      Arr.flatMap(plan.doors, door => {
        const next = otherSide(door, step.at)
        if (Option.isNone(next) || seen.has(next.value)) return []
        seen.add(next.value)
        return [{ at: next.value, doors: [...step.doors, door] }]
      }),
    )
  }
  return Option.none()
}

const onSegment = (p: Point, a: Point, b: Point): boolean => {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby || 1
  const t = clamp01(((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)
  return distance(p, pt(a.x + abx * t, a.y + aby * t)) < 1.5
}

export interface Segment {
  readonly from: Point
  readonly to: Point
}

export const crosses: {
  (wall: Segment): (path: Segment) => boolean
  (path: Segment, wall: Segment): boolean
} = dual(2, ({ from: a, to: b }: Segment, { from: p, to: q }: Segment): boolean => {
  const side = (o: Point, u: Point, v: Point) => (u.x - o.x) * (v.y - o.y) - (u.y - o.y) * (v.x - o.x)
  return side(p, q, a) * side(p, q, b) < 0 && side(a, b, p) * side(a, b, q) < 0
})

const roundObstacles = (plan: Plan, at: Point, stop: Point): Point =>
  Option.getOrElse(
    Option.map(
      Arr.findFirst(plan.obstacles, o => crosses({ from: at, to: stop }, o)),
      o => o.around,
    ),
    () => stop,
  )

export interface Trip {
  readonly at: Point
  readonly target: Point
}

const mouthsFrom = (door: Door, here: Area): readonly [Point, Point] => {
  if (door.between[0] === here) return door.mouths
  return [door.mouths[1], door.mouths[0]]
}

export const nextStop: {
  (trip: Trip): (plan: Plan) => Point
  (plan: Plan, trip: Trip): Point
} = dual(2, (plan: Plan, { at, target }: Trip): Point => {
  const here = areaOf(plan, at)
  const there = areaOf(plan, target)
  if (here === there) return roundObstacles(plan, at, target)
  const door = Option.flatMap(route(plan, here, there), Arr.head)
  if (Option.isNone(door)) return at
  const [near, far] = mouthsFrom(door.value, here)
  if (onSegment(at, near, far)) return far
  return roundObstacles(plan, at, near)
})

export interface Drafting {
  readonly since: number
  readonly still: boolean
}

export interface Draft {
  readonly sketch: number
  readonly fill: number
  readonly rooms: ReadonlyArray<number>
}

const ROOM_STAGGER = 0.35

const easeInOut = (t: number): number => {
  if (t < 0.5) return 2 * t * t
  return 1 - (-2 * t + 2) ** 2 / 2
}

export const draftOf = ({ since, still }: Drafting): Draft => {
  if (still || since >= DRAFT_MS) return { sketch: 1, fill: 1, rooms: Arr.map(ROOMS, () => 1) }
  const sketch = easeInOut(clamp01(since / SKETCH_MS))
  const filling = clamp01((since - SKETCH_MS) / FILL_MS)
  const span = 1 + (ROOMS.length - 1) * ROOM_STAGGER
  return {
    sketch,
    fill: easeInOut(filling),
    rooms: Arr.map(ROOMS, (_, i) => easeInOut(clamp01(filling * span - i * ROOM_STAGGER))),
  }
}

export const drafted = ({ since, still }: Drafting): boolean => still || since >= DRAFT_MS


export type PetName = 'teddy' | 'rain'

export interface Pet {
  readonly name: PetName
  readonly at: Point
  readonly target: Point
  readonly speed: number
  readonly restUntil: number
  readonly fleeing: boolean
  readonly heading: Point
  readonly facing: number
  readonly moving: boolean
  readonly gait: number
  readonly alert: boolean
  readonly curious: boolean
  readonly barkAt: number
  readonly nextBark: number
  readonly stride: number
  readonly prints: ReadonlyArray<Print>
}

export interface Print {
  readonly at: Point
  readonly heading: Point
  readonly t: number
}

export interface Pets {
  readonly seed: number
  readonly teddy: Pet
  readonly rain: Pet
  readonly last: Option.Option<number>
}

export interface PetTick {
  readonly now: number
  readonly plan: Plan
  readonly pointer: Option.Option<Point>
  readonly still: boolean
}

export const PRINT_LIFE = 3200
export const PRINTS = 40
const PRINT_EVERY = 9
const PRINT_SIDE = 2.6
const FRAME_EVERY = 5
const TEDDY_WALK = 45
const TEDDY_RUN = 95
const RAIN_WALK = 22
const RAIN_RUN = 120
const HEEL = 12
const PERSONAL_SPACE = 24
export const BARK_MS = 450
const CURIOUS = 0.45
const PLAY_SLACK = 8
const STILL_REACH = 30
const ARRIVED = 0.5

const randomIn = (seed: number, r: Rect): readonly [number, Point] => {
  const [s1, u] = nextRandom(seed)
  const [s2, v] = nextRandom(s1)
  return [s2, pt(r.x + u * r.w, r.y + v * r.h)]
}

const randomBetween = (seed: number, lo: number, hi: number): readonly [number, number] => {
  const [s, u] = nextRandom(seed)
  return [s, lo + u * (hi - lo)]
}

const clampTo = (p: Point, r: Rect): Point =>
  pt(Math.min(r.x + r.w, Math.max(r.x, p.x)), Math.min(r.y + r.h, Math.max(r.y, p.y)))

const pet = (name: PetName, at: Point, target: Point, speed: number): Pet => ({
  name,
  at,
  target,
  speed,
  restUntil: 0,
  fleeing: false,
  heading: pt(0, -1),
  facing: 1,
  moving: false,
  gait: 0,
  alert: false,
  curious: false,
  barkAt: Number.NEGATIVE_INFINITY,
  nextBark: 0,
  stride: 0,
  prints: [],
})

export const initialPets: {
  (seed: number): (plan: Plan) => Pets
  (plan: Plan, seed: number): Pets
} = dual(2, (plan: Plan, seed: number): Pets => {
  const [s1, teddyTo] = randomIn(seed, plan.yard)
  const [s2, rainTo] = randomIn(s1, plan.yard)
  return {
    seed: s2,
    teddy: pet('teddy', plan.door, teddyTo, TEDDY_WALK),
    rain: pet('rain', pt(plan.door.x + 6, plan.door.y + 4), rainTo, RAIN_WALK),
    last: Option.none(),
  }
})

const fresh = (prints: ReadonlyArray<Print>, now: number): ReadonlyArray<Print> =>
  Arr.filter(prints, p => now - p.t < PRINT_LIFE)

const facingToward = (dx: number, beyond: number, facing: number): number => {
  if (Math.abs(dx) > beyond) return Math.sign(dx)
  return facing
}

const printSide = (gait: number): number => {
  if (gait % (PRINT_EVERY * 2) < PRINT_EVERY) return PRINT_SIDE
  return -PRINT_SIDE
}

const walk = (p: Pet, plan: Plan, dt: number, now: number): Pet => {
  const prints = fresh(p.prints, now)
  const stop = nextStop(plan, { at: p.at, target: p.target })
  const dx = stop.x - p.at.x
  const dy = stop.y - p.at.y
  const d = Math.hypot(dx, dy)
  if (d <= ARRIVED || dt <= 0) return { ...p, moving: false, prints }
  const moved = Math.min(d, p.speed * dt)
  const heading = pt(dx / d, dy / d)
  const at = pt(p.at.x + heading.x * moved, p.at.y + heading.y * moved)
  const facing = facingToward(heading.x, 0.2, p.facing)
  const stride = p.stride + moved
  const walked = { ...p, at, heading, facing, moving: true, gait: p.gait + moved }
  if (stride < PRINT_EVERY) return { ...walked, stride, prints }
  const side = printSide(p.gait)
  const print: Print = {
    at: pt(at.x - heading.y * side, at.y + heading.x * side),
    heading,
    t: now,
  }
  return { ...walked, stride: stride - PRINT_EVERY, prints: Arr.takeRight([...prints, print], PRINTS) }
}

export const WALK_FRAMES = 4
export const REST_FRAME = WALK_FRAMES
export const ALERT_FRAME = WALK_FRAMES + 1
export const frameOf = (p: Pet): number => {
  if (p.moving) return Math.floor(p.gait / FRAME_EVERY) % WALK_FRAMES
  if (p.alert) return ALERT_FRAME
  return REST_FRAME
}

export const barkOf: {
  (now: number): (p: Pet) => Option.Option<number>
  (p: Pet, now: number): Option.Option<number>
} = dual(2, (p: Pet, now: number): Option.Option<number> => {
  const t = (now - p.barkAt) / BARK_MS
  return Option.liftPredicate(t, t => t >= 0 && t < 1)
})

export const printAlpha: {
  (now: number): (print: Print) => number
  (print: Print, now: number): number
} = dual(2, (print: Print, now: number): number => clamp01(1 - (now - print.t) / PRINT_LIFE))

const arrived = (p: Pet): boolean => distance(p.at, p.target) <= ARRIVED

const heelOf = (plan: Plan, p: Pet, to: Point, d: number): Point => {
  if (d <= HEEL) return p.at
  return reachable(plan, pt(to.x - ((to.x - p.at.x) / d) * HEEL, to.y - ((to.y - p.at.y) / d) * HEEL))
}

const slackOf = (p: Pet): number => {
  if (p.alert) return PLAY_SLACK
  return 1
}

const nextBarkOf = (p: Pet, now: number): number => {
  if (p.alert) return p.nextBark
  return now + 120
}

const calmed = (p: Pet): Pet => {
  if (p.alert) return { ...p, alert: false }
  return p
}

const walking = (p: Pet, speed: number): Pet => {
  if (p.speed === speed) return p
  return { ...p, speed }
}

const teddyChases = (seed: number, p: Pet, tick: PetTick, pointer: Point): readonly [number, Pet] => {
  const plan = tick.plan
  const to = reachable(plan, pointer)
  const d = distance(p.at, to)
  const heel = heelOf(plan, p, to, d)
  const sameRoom = areaOf(plan, p.at) === areaOf(plan, to)
  if (!sameRoom || distance(p.at, heel) > slackOf(p)) {
    return [seed, { ...p, target: heel, speed: TEDDY_RUN, restUntil: 0, alert: false }]
  }
  const facing = facingToward(to.x - p.at.x, 1, p.facing)
  const caught = { ...p, target: p.at, facing, restUntil: 0, alert: true }
  const nextBark = nextBarkOf(p, tick.now)
  if (tick.now < nextBark) return [seed, { ...caught, nextBark }]
  const [s, wait] = randomBetween(seed, 700, 1800)
  return [s, { ...caught, barkAt: tick.now, nextBark: tick.now + wait }]
}

const teddyPlans = (seed: number, p: Pet, tick: PetTick): readonly [number, Pet] =>
  Option.match(tick.pointer, {
    onNone: () => teddyRoams(seed, p, tick),
    onSome: pointer => teddyChases(seed, p, tick, pointer),
  })

const teddyRoams = (seed: number, p: Pet, tick: PetTick): readonly [number, Pet] => {
  const calm = calmed(p)
  if (!arrived(calm)) return [seed, walking(calm, TEDDY_WALK)]
  if (calm.restUntil === 0) {
    const [s, rest] = randomBetween(seed, 600, 2200)
    return [s, { ...calm, restUntil: tick.now + rest }]
  }
  if (tick.now < calm.restUntil) return [seed, calm]
  const [s, target] = randomIn(seed, tick.plan.yard)
  return [s, { ...calm, target, speed: TEDDY_WALK, restUntil: 0 }]
}

const farSideOf = (yard: Rect, x: number): number => {
  if (x < yard.x + yard.w / 2) return yard.x + yard.w
  return yard.x
}

const lookAt = (p: Pet, seen: Option.Option<Point>, beyond: number): Pet => {
  const alert = Option.isSome(seen)
  const facing = Option.match(seen, {
    onNone: () => p.facing,
    onSome: pointer => facingToward(pointer.x - p.at.x, beyond, p.facing),
  })
  if (alert === p.alert && facing === p.facing) return p
  return { ...p, alert, facing }
}

const rainPlans = (
  seed: number,
  p: Pet,
  teddy: Pet,
  tick: PetTick,
): readonly [number, Pet] => {
  if (!p.fleeing && distance(p.at, teddy.at) < PERSONAL_SPACE) {
    const yard = tick.plan.yard
    const x = farSideOf(yard, teddy.at.x)
    const [s, y] = randomBetween(seed, yard.y, yard.y + yard.h)
    return [s, { ...p, target: pt(x, y), speed: RAIN_RUN, fleeing: true, restUntil: 0, alert: false }]
  }
  if (!arrived(p)) return [seed, calmed(p)]
  if (p.restUntil === 0) {
    const [s1, nap] = randomBetween(seed, 2500, 7000)
    const [s2, roll] = nextRandom(s1)
    return [s2, { ...p, fleeing: false, speed: RAIN_WALK, restUntil: tick.now + nap, curious: roll < CURIOUS }]
  }
  if (tick.now < p.restUntil) {
    const watched = Option.filter(tick.pointer, () => p.curious)
    return [seed, lookAt(p, watched, 2)]
  }
  const [s, target] = randomIn(seed, tick.plan.yard)
  return [s, { ...p, target, speed: RAIN_WALK, restUntil: 0, alert: false }]
}

const playInPlace = (p: Pet, tick: PetTick): Pet =>
  lookAt(
    p,
    Option.filter(tick.pointer, pointer => distance(p.at, pointer) <= STILL_REACH),
    1,
  )

export const stepPets: {
  (tick: PetTick): (pets: Pets) => Pets
  (pets: Pets, tick: PetTick): Pets
} = dual(2, (pets: Pets, tick: PetTick): Pets => {
  if (tick.still) return { ...pets, teddy: playInPlace(pets.teddy, tick), last: Option.some(tick.now) }
  const dt = stepSince({ before: pets.last, now: tick.now })
  const [s1, teddyPlan] = teddyPlans(pets.seed, pets.teddy, tick)
  const teddy = walk(teddyPlan, tick.plan, dt, tick.now)
  const [s2, rainPlan] = rainPlans(s1, pets.rain, teddy, tick)
  const rain = walk(rainPlan, tick.plan, dt, tick.now)
  return { seed: s2, teddy, rain, last: Option.some(tick.now) }
})

export const restingPets = (plan: Plan): Pets => {
  const { yard } = plan
  const teddyAt = pt(yard.x + yard.w * 0.45, yard.y + yard.h * 0.6)
  const rainAt = pt(yard.x + yard.w * 0.85, yard.y + yard.h * 0.3)
  return {
    seed: 1,
    teddy: { ...pet('teddy', teddyAt, teddyAt, TEDDY_WALK), heading: pt(1, 0) },
    rain: { ...pet('rain', rainAt, rainAt, RAIN_WALK), heading: pt(-1, 0), facing: -1 },
    last: Option.none(),
  }
}

export const wakePets = (pets: Pets): Pets => ({ ...pets, last: Option.none() })

export interface Replan {
  readonly from: Plan
  readonly to: Plan
}

const roomsAround = (from: Plan, to: Plan, area: Area): readonly [Rect, Rect] => {
  if (area === 'porch') return [from.rooms.house, to.rooms.house]
  return [from.rooms[area], to.rooms[area]]
}

export const movePets: {
  (replan: Replan): (pets: Pets) => Pets
  (pets: Pets, replan: Replan): Pets
} = dual(2, (pets: Pets, { from, to }: Replan): Pets => {
  const map = (p: Point): Point => {
    const [a, b] = roomsAround(from, to, areaOf(from, p))
    if (a.w <= 0 || a.h <= 0) return p
    return pt(b.x + ((p.x - a.x) / a.w) * b.w, b.y + ((p.y - a.y) / a.h) * b.h)
  }
  const move = (p: Pet): Pet => ({
    ...p,
    at: map(p.at),
    target: map(p.target),
    prints: Arr.map(p.prints, print => ({ ...print, at: map(print.at) })),
  })
  return { ...pets, teddy: move(pets.teddy), rain: move(pets.rain) }
})

// NOTE: the rules for the floor plan drawing, as plain data in and plain data
// out, so the walls, the drafting and the pets are testable without a GPU.
// The renderer only draws what these return.
//
// The library at the back left is the blog. Bookcases stand along its back
// and side walls, full of books of different heights, round a rug. All of it is drawn like the walls, only smaller: each book
// is a short panel, so once the house rises the shelves show their spines.
//
// The plan is drafted once: first the whole blueprint is sketched at once,
// every wall a faint fine line, then the rooms fill in one after another and
// the walls fill out to their full weight. Then the house rises into 3D (see
// ./view), and
// once it's up, Teddy and Rain move in through the front door. Teddy wanders
// the Personal Life room, chases the pointer whenever it's on the house, and
// play-bows and barks once he catches it. Rain ignores it and does her own
// thing: mostly naps, sometimes sits up to watch it, and bolts when Teddy
// gets too close. With motion reduced the house is simply up, and the pets
// sit still.

import { Array as Arr, Option } from 'effect'
import { dual } from 'effect/Function'

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

// The house and its rooms, in CSS px from the canvas's corner.
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
  // 1 draws in gold, 0 in ink.
  readonly gold: number
  // Dash length in px, or 0 for a solid line.
  readonly dash: number
  readonly alpha: number
  // How much of the full wall height it stands, once the house rises. 0
  // keeps it a mark on the floor.
  readonly rise: number
}

// The rooms a pet can be in, and the porch outside the front door.
export type Area = 'library' | 'work' | 'oss' | 'outside' | 'locked' | 'porch'

// A gap in a wall the pets can walk through: a spot just inside each side,
// so going from one to the other crosses the gap straight on.
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
  // Every way between the rooms. D-13 has none: it's closed.
  readonly doors: ReadonlyArray<Door>
  // Things standing inside a room, like the open front door, and the spot
  // past the end of each to walk round it by.
  readonly obstacles: ReadonlyArray<Obstacle>
  // In drafting order.
  readonly walls: ReadonlyArray<Wall>
  // Where the pets come in: just outside the front door.
  readonly door: Point
  // Where they live.
  readonly yard: Rect
  // Where Teddy can follow the pointer.
  readonly inside: Rect
}

// Sketching the lines, then filling in the rooms and walls.
export const SKETCH_MS = 900
export const FILL_MS = 1500
export const DRAFT_MS = SKETCH_MS + FILL_MS
const OUTER = 2.4
const INNER = 1.6
const THIN = 0.8
const ARC_STEPS = 10
// The library's bookcases: how far off the wall they stand, how deep they
// are, and how tall their ends stand. The books stand inside, a little short.
const SHELF_OFF = 2.5
const SHELF_DEPTH = 5
const CASE_RISE = 0.72
// The walls the renderer has room for.
export const MAX_WALLS = 96

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
  }: { gold?: number; dash?: number; alpha?: number; rise?: number } = {},
): Wall => ({ from, to, width, gold, dash, alpha, rise })

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)

// A quarter circle around `hinge`, as short dashed segments.
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

// A row of books: each one's width, in shares of the shelf, how tall it
// stands as a share of a wall, and whether its spine is gold. A width of 0
// is a gap. Uneven on purpose, so the row reads as books, not a fence: a few
// tall ones, a gold spine here and there, a gap, and one lying flat.
interface Book {
  readonly w: number
  readonly rise: number
  readonly gold?: number
}
const gap = (w: number): Book => ({ w, rise: 0 })
const BACK_ROW: ReadonlyArray<Book> = [
  { w: 2, rise: 0.5 },
  { w: 1.5, rise: 0.6 },
  { w: 2.5, rise: 0.44, gold: 1 },
  { w: 1.5, rise: 0.56 },
  gap(2.5),
  { w: 2, rise: 0.64 },
  { w: 1.5, rise: 0.52 },
  { w: 2, rise: 0.58, gold: 1 },
  { w: 1.5, rise: 0.46 },
  gap(1.5),
  // Lying flat, a short stack.
  { w: 5, rise: 0.14 },
  gap(1.5),
  { w: 1.5, rise: 0.6 },
  { w: 2, rise: 0.48 },
  { w: 1.5, rise: 0.55, gold: 1 },
  { w: 2, rise: 0.62 },
]
const SIDE_ROW: ReadonlyArray<Book> = [
  { w: 2, rise: 0.54 },
  { w: 1.5, rise: 0.62, gold: 1 },
  { w: 2, rise: 0.46 },
  gap(2),
  { w: 1.5, rise: 0.58 },
  { w: 2.5, rise: 0.5 },
  { w: 1.5, rise: 0.6 },
  gap(1.5),
  { w: 5, rise: 0.14 },
  gap(1),
  { w: 2, rise: 0.56, gold: 1 },
  { w: 1.5, rise: 0.48 },
]
// The sliver between two books, in shares of the shelf.
const BETWEEN = 0.35

// A bookcase along a wall, from `from` to `to`, standing `SHELF_DEPTH` into
// the room along `into`. On the floor, its outline; standing up, its two
// ends and a row of books, each a short panel facing the room, so once the
// house rises they read as spines of different heights.
//
// Books along a side wall would be seen edge on, so there they stand
// `across` the shelf instead: each one a thin slab facing the viewer, like
// the row seen from its end.
const bookcase = (
  from: Point,
  to: Point,
  into: Point,
  books: ReadonlyArray<Book>,
  across = false,
): ReadonlyArray<Wall> => {
  const off = (p: Point, by: number) => pt(p.x + into.x * by, p.y + into.y * by)
  const along = (t: number) => pt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)
  const units =
    Arr.reduce(books, 0, (sum, b) => sum + b.w) + BETWEEN * (books.length + 1)
  // Where each book starts along the shelf, as a share of it.
  const starts = Arr.scan(books, BETWEEN / units, (at, b) => at + (b.w + BETWEEN) / units)
  // A gap stands nothing.
  const spines = Arr.flatMap(books, (b, i): ReadonlyArray<Wall> => {
    const at = starts[i] ?? 0
    const look = { gold: b.gold ?? 0, alpha: 0.85, rise: b.rise }
    // Lying flat, it's a low panel along the shelf either way.
    const flat = b.rise < 0.2
    return b.rise <= 0
      ? []
      : across && !flat
        ? [wall(off(along(at), SHELF_OFF + 0.5), off(along(at), SHELF_OFF + SHELF_DEPTH - 0.5), THIN, look)]
        : [
            wall(
              off(along(at), SHELF_OFF + SHELF_DEPTH * 0.7),
              off(along(at + b.w / units), SHELF_OFF + SHELF_DEPTH * 0.7),
              THIN,
              look,
            ),
          ]
  })
  const end = (at: Point) =>
    wall(off(at, SHELF_OFF), off(at, SHELF_OFF + SHELF_DEPTH), THIN, { alpha: 0.8, rise: CASE_RISE })
  return [
    wall(off(from, SHELF_OFF + SHELF_DEPTH), off(to, SHELF_OFF + SHELF_DEPTH), THIN, {
      alpha: 0.6,
      rise: 0,
    }),
    end(from),
    end(to),
    ...spines,
  ]
}

// The rug lies in the middle of the library, under its label, clear of the
// shelves.
const rugOf = (library: Rect): Rect => {
  const w = (library.w - 2 * (SHELF_OFF + SHELF_DEPTH)) * 0.75
  const h = library.h * 0.4
  return { x: library.x + (library.w - w) / 2, y: library.y + (library.h - h) / 2, w, h }
}

// A rug, as a dashed gold outline on the floor.
const rug = (r: Rect): ReadonlyArray<Wall> => {
  const mark = { gold: 1, dash: 3, alpha: 0.5, rise: 0 }
  const [a, b, c, d] = [pt(r.x, r.y), pt(r.x + r.w, r.y), pt(r.x + r.w, r.y + r.h), pt(r.x, r.y + r.h)]
  return [wall(a, b, THIN, mark), wall(b, c, THIN, mark), wall(c, d, THIN, mark), wall(d, a, THIN, mark)]
}

// How far the bookcases take up the library's back and side.
const SHELVED = SHELF_OFF + SHELF_DEPTH

// Every wall of the house, in the order the pens draft them: the outside
// walls clockwise from the front door, the inside walls, the doors, the
// library's furniture, and the locked room's cross last.
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
  // The library's doorway into Work, a little lower, clear of the shelves.
  const stacksWidth = Math.min(24, library.h * 0.3)
  const stacksTop = library.y + library.h * 0.5

  const walls: ReadonlyArray<Wall> = [
    // The outside, clockwise from the front door.
    wall(pt(doorLeft, bottom), pt(left, bottom), OUTER),
    wall(pt(left, bottom), pt(left, top), OUTER),
    wall(pt(left, top), pt(right, top), OUTER),
    wall(pt(right, top), pt(right, bottom), OUTER),
    wall(pt(right, bottom), pt(doorRight, bottom), OUTER),
    // Down the middle, with a doorway from Work into Personal Life.
    wall(pt(left, middle), pt(hallLeft, middle), INNER),
    wall(pt(hallLeft + hallWidth, middle), pt(right, middle), INNER),
    // Between Work and Open Source, with a doorway.
    wall(pt(split, top), pt(split, sideTop), INNER),
    wall(pt(split, sideTop + sideWidth), pt(split, middle), INNER),
    // Between the library and Work, with a doorway.
    wall(pt(stacks, top), pt(stacks, stacksTop), INNER),
    wall(pt(stacks, stacksTop + stacksWidth), pt(stacks, middle), INNER),
    // The locked room.
    wall(pt(lockX, middle), pt(lockX, bottom), INNER),
    // The front door, open, and its swing. The door stands a little shorter
    // than the walls.
    wall(pt(doorLeft, bottom), pt(doorLeft, bottom - doorWidth), THIN, { alpha: 0.8, rise: 0.82 }),
    ...swing(pt(doorLeft, bottom), doorWidth, -Math.PI / 2, 0),
    // The doorway's swing into Personal Life.
    ...swing(pt(hallLeft, middle), hallWidth, 0, Math.PI / 2),
    // The library: bookcases along the back wall and down the side, and a
    // rug in the middle of the floor.
    ...bookcase(pt(library.x + SHELF_OFF, top), pt(stacks - SHELF_OFF, top), pt(0, 1), BACK_ROW),
    ...bookcase(pt(left, top + SHELVED + SHELF_OFF), pt(left, middle - SHELF_OFF), pt(1, 0), SIDE_ROW, true),
    ...rug(rugOf(library)),
    // D-13, crossed out.
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

  // A spot STEP_IN px each side of a doorway's middle.
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

  // The open front door stands in Personal Life, hinged at the wall.
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

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

// ---------------------------------------------------------------------------
// Getting around
// ---------------------------------------------------------------------------

// How far a doorway's mouths sit from its wall, and how far the pets keep
// off the walls otherwise.
const STEP_IN = 10
const WALL_GAP = 7
// Also the order the rooms fill in: page order, so the library first.
export const ROOMS = ['library', 'work', 'oss', 'outside', 'locked'] as const
export type Room = (typeof ROOMS)[number]
// The rooms Teddy can get into. D-13 is closed.
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

// Where in a room a pet can stand without touching a wall, or in the
// library, a bookcase.
const floorOf = (plan: Plan, room: Room): Rect => {
  const floor = inset(plan.rooms[room], WALL_GAP)
  return room === 'library'
    ? { x: floor.x + SHELVED, y: floor.y + SHELVED, w: Math.max(0, floor.w - SHELVED), h: Math.max(0, floor.h - SHELVED) }
    : floor
}

const nearest = (p: Point, points: ReadonlyArray<Point>): Point =>
  Arr.reduce(points, p, (best, q) => (best === p || distance(p, q) < distance(p, best) ? q : best))

// The spot Teddy can reach that's closest to `p`: on the floor of the room
// it's in, or of the nearest open room when it's in D-13 or off the house.
export const reachable: {
  (p: Point): (plan: Plan) => Point
  (plan: Plan, p: Point): Point
} = dual(2, (plan: Plan, p: Point): Point => {
  const area = areaOf(plan, p)
  return isOpen(area)
    ? clampTo(p, floorOf(plan, area))
    : nearest(p, Arr.map(OPEN, room => clampTo(p, floorOf(plan, room))))
})

// The doors to go through, in order, to get from one area to another, or
// null when there's no way.
const route = (plan: Plan, from: Area, to: Area): ReadonlyArray<Door> | null => {
  let frontier: ReadonlyArray<{ readonly at: Area; readonly doors: ReadonlyArray<Door> }> = [
    { at: from, doors: [] },
  ]
  const seen = new Set<Area>([from])
  while (frontier.length > 0) {
    const found = Arr.findFirst(frontier, step => step.at === to)
    if (Option.isSome(found)) return found.value.doors
    frontier = Arr.flatMap(frontier, step =>
      Arr.flatMap(plan.doors, door => {
        const [a, b] = door.between
        const next = a === step.at ? b : b === step.at ? a : null
        if (next === null || seen.has(next)) return []
        seen.add(next)
        return [{ at: next, doors: [...step.doors, door] }]
      }),
    )
  }
  return null
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

// Whether walking straight along `path` goes through `wall`.
export const crosses: {
  (wall: Segment): (path: Segment) => boolean
  (path: Segment, wall: Segment): boolean
} = dual(2, ({ from: a, to: b }: Segment, { from: p, to: q }: Segment): boolean => {
  const side = (o: Point, u: Point, v: Point) => (u.x - o.x) * (v.y - o.y) - (u.y - o.y) * (v.x - o.x)
  return side(p, q, a) * side(p, q, b) < 0 && side(a, b, p) * side(a, b, q) < 0
})

// Heads round anything standing in the way of a straight walk to `stop`.
const roundObstacles = (plan: Plan, at: Point, stop: Point): Point =>
  Option.getOrElse(
    Option.map(
      Arr.findFirst(plan.obstacles, o => crosses({ from: at, to: stop }, o)),
      o => o.around,
    ),
    () => stop,
  )

// Where a pet heads next on its way to `target`: straight there within a
// room, or else to the next doorway, then through it. Every room is a
// rectangle, so a straight line inside one never meets a wall, only
// whatever stands in it.
export interface Trip {
  readonly at: Point
  readonly target: Point
}

export const nextStop: {
  (trip: Trip): (plan: Plan) => Point
  (plan: Plan, trip: Trip): Point
} = dual(2, (plan: Plan, { at, target }: Trip): Point => {
  const here = areaOf(plan, at)
  const there = areaOf(plan, target)
  if (here === there) return roundObstacles(plan, at, target)
  const doors = route(plan, here, there)
  const [door] = doors ?? []
  if (door === undefined) return at
  const [near, far] = door.between[0] === here ? door.mouths : [door.mouths[1], door.mouths[0]]
  // Partway through the doorway already: keep going.
  return onSegment(at, near, far) ? far : roundObstacles(plan, at, near)
})

// How far the drafting has got, `since` ms after it started.
export interface Drafting {
  // Ms since drafting started.
  readonly since: number
  readonly still: boolean
}

export interface Draft {
  // 0 to 1: how much of every line is sketched. They all draw at once.
  readonly sketch: number
  // 0 to 1: how far the walls have filled out to their full weight.
  readonly fill: number
  // 0 to 1 for each room, in ROOMS order: how much of its floor is filled.
  readonly rooms: ReadonlyArray<number>
}

// Each room starts filling this far, as a share of its own fill time, after
// the one before.
const ROOM_STAGGER = 0.35

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

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

// ---------------------------------------------------------------------------
// The pets
// ---------------------------------------------------------------------------

export type PetName = 'teddy' | 'rain'

export interface Pet {
  readonly name: PetName
  readonly at: Point
  readonly target: Point
  // CSS px per second, toward the target.
  readonly speed: number
  // Resting until this time, or 0 when it's on the move.
  readonly restUntil: number
  // Rain only: running from Teddy.
  readonly fleeing: boolean
  // The way it last moved, for the paw prints.
  readonly heading: Point
  // 1 facing right, -1 facing left.
  readonly facing: number
  // Whether it moved this frame, and how far it has walked in all, which
  // picks the walking frame.
  readonly moving: boolean
  readonly gait: number
  // The alert pose: Teddy's play bow, or Rain sitting up to watch.
  readonly alert: boolean
  // Rain only: whether this rest she'd rather watch the pointer than nap.
  readonly curious: boolean
  // Teddy only: when he last barked, and when he'll bark next.
  readonly barkAt: number
  readonly nextBark: number
  // Distance walked since the last paw print.
  readonly stride: number
  // Paw prints that haven't faded yet, oldest first.
  readonly prints: ReadonlyArray<Print>
}

// A paw print: where it is, which way the paw pointed, and when it was left.
export interface Print {
  readonly at: Point
  readonly heading: Point
  readonly t: number
}

export interface Pets {
  readonly seed: number
  readonly teddy: Pet
  readonly rain: Pet
  // The previous frame's time, or null at the start of a burst.
  readonly last: number | null
}

export interface PetTick {
  readonly now: number
  readonly plan: Plan
  // The pointer on the house, or null when it's elsewhere.
  readonly pointer: Point | null
  readonly still: boolean
}

// Paw prints fade out over PRINT_LIFE ms, and there are never more than
// PRINTS per pet.
export const PRINT_LIFE = 3200
export const PRINTS = 40
const PRINT_EVERY = 9
const PRINT_SIDE = 2.6
// Px walked per walking frame.
const FRAME_EVERY = 5
const TEDDY_WALK = 45
const TEDDY_RUN = 95
const RAIN_WALK = 22
const RAIN_RUN = 120
// Teddy sits this close to the pointer, and Rain bolts at this distance.
const HEEL = 12
const PERSONAL_SPACE = 24
// How long a bark shows, and how often Rain watches instead of napping.
export const BARK_MS = 450
const CURIOUS = 0.45
const PLAY_SLACK = 8
// With motion reduced, how close the pointer has to come to Teddy.
const STILL_REACH = 30
const ARRIVED = 0.5
const LONGEST_STEP_S = 0.05

// A small, pure random source: the next seed and a number from 0 to 1.
const next = (seed: number): readonly [number, number] => {
  const s = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296]
}

const randomIn = (seed: number, r: Rect): readonly [number, Point] => {
  const [s1, u] = next(seed)
  const [s2, v] = next(s1)
  return [s2, pt(r.x + u * r.w, r.y + v * r.h)]
}

const randomBetween = (seed: number, lo: number, hi: number): readonly [number, number] => {
  const [s, u] = next(seed)
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

// Both pets wait at the front door, already headed somewhere in the yard.
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
    last: null,
  }
})

// Prints older than PRINT_LIFE are gone.
const fresh = (prints: ReadonlyArray<Print>, now: number): ReadonlyArray<Print> =>
  Arr.filter(prints, p => now - p.t < PRINT_LIFE)

// Moves a pet toward its target, leaving paw prints as it goes.
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
  // Turning around only for a clear sideways step, so walking up or down
  // doesn't flicker.
  const facing = Math.abs(heading.x) > 0.2 ? Math.sign(heading.x) : p.facing
  const stride = p.stride + moved
  const walked = { ...p, at, heading, facing, moving: true, gait: p.gait + moved }
  if (stride < PRINT_EVERY) return { ...walked, stride, prints }
  // Prints alternate left and right of the path.
  const side = p.gait % (PRINT_EVERY * 2) < PRINT_EVERY ? PRINT_SIDE : -PRINT_SIDE
  const print: Print = {
    at: pt(at.x - heading.y * side, at.y + heading.x * side),
    heading,
    t: now,
  }
  return { ...walked, stride: stride - PRINT_EVERY, prints: Arr.takeRight([...prints, print], PRINTS) }
}

// Which sprite frame a pet shows: a walking frame while it moves, or its
// resting pose (Teddy sits, Rain curls up).
export const WALK_FRAMES = 4
export const REST_FRAME = WALK_FRAMES
export const ALERT_FRAME = WALK_FRAMES + 1
export const frameOf = (p: Pet): number =>
  p.moving ? Math.floor(p.gait / FRAME_EVERY) % WALK_FRAMES : p.alert ? ALERT_FRAME : REST_FRAME

// 0 to 1 through a bark that's showing, or null when Teddy is quiet.
export const barkOf: {
  (now: number): (p: Pet) => number | null
  (p: Pet, now: number): number | null
} = dual(2, (p: Pet, now: number): number | null => {
  const t = (now - p.barkAt) / BARK_MS
  return t >= 0 && t < 1 ? t : null
})

// 1 for a fresh print, down to 0 as it fades.
export const printAlpha: {
  (now: number): (print: Print) => number
  (print: Print, now: number): number
} = dual(2, (print: Print, now: number): number => clamp01(1 - (now - print.t) / PRINT_LIFE))

const arrived = (p: Pet): boolean => distance(p.at, p.target) <= ARRIVED

// What Teddy wants: to chase the pointer if it's on the house, and once he
// catches it, to play-bow and bark at it. Otherwise somewhere in the yard
// after a short sit.
const teddyPlans = (seed: number, p: Pet, tick: PetTick): readonly [number, Pet] => {
  if (tick.pointer !== null) {
    const plan = tick.plan
    const to = reachable(plan, tick.pointer)
    const d = distance(p.at, to)
    // He sits a little short of it, on its side of any wall.
    const heel =
      d <= HEEL
        ? p.at
        : reachable(plan, pt(to.x - ((to.x - p.at.x) / d) * HEEL, to.y - ((to.y - p.at.y) / d) * HEEL))
    const sameRoom = areaOf(plan, p.at) === areaOf(plan, to)
    // Once he's playing, a little pointer wiggle doesn't get him up again.
    if (!sameRoom || distance(p.at, heel) > (p.alert ? PLAY_SLACK : 1)) {
      const target = sameRoom && d <= HEEL ? p.at : heel
      return [seed, { ...p, target, speed: TEDDY_RUN, restUntil: 0, alert: false }]
    }
    // Caught it: down into a play bow, facing it, barking now and then. The
    // first bark comes right away.
    const facing = Math.abs(to.x - p.at.x) > 1 ? Math.sign(to.x - p.at.x) : p.facing
    const caught = { ...p, target: p.at, facing, restUntil: 0, alert: true }
    const nextBark = p.alert ? p.nextBark : tick.now + 120
    if (tick.now < nextBark) return [seed, { ...caught, nextBark }]
    const [s, wait] = randomBetween(seed, 700, 1800)
    return [s, { ...caught, barkAt: tick.now, nextBark: tick.now + wait }]
  }
  const calm = p.alert ? { ...p, alert: false } : p
  if (!arrived(calm)) return [seed, calm.speed === TEDDY_WALK ? calm : { ...calm, speed: TEDDY_WALK }]
  if (calm.restUntil === 0) {
    const [s, rest] = randomBetween(seed, 600, 2200)
    return [s, { ...calm, restUntil: tick.now + rest }]
  }
  if (tick.now < calm.restUntil) return [seed, calm]
  const [s, target] = randomIn(seed, tick.plan.yard)
  return [s, { ...calm, target, speed: TEDDY_WALK, restUntil: 0 }]
}

// What Rain wants: her own thing. A long rest, a short stroll, and to be far
// from Teddy. She never follows the pointer, but on some rests she sits up
// and watches it instead of napping.
const rainPlans = (
  seed: number,
  p: Pet,
  teddy: Pet,
  tick: PetTick,
): readonly [number, Pet] => {
  if (!p.fleeing && distance(p.at, teddy.at) < PERSONAL_SPACE) {
    // Bolt to the far side of the yard from Teddy.
    const yard = tick.plan.yard
    const x = teddy.at.x < yard.x + yard.w / 2 ? yard.x + yard.w : yard.x
    const [s, y] = randomBetween(seed, yard.y, yard.y + yard.h)
    return [s, { ...p, target: pt(x, y), speed: RAIN_RUN, fleeing: true, restUntil: 0, alert: false }]
  }
  if (!arrived(p)) return [seed, p.alert ? { ...p, alert: false } : p]
  if (p.restUntil === 0) {
    const [s1, nap] = randomBetween(seed, 2500, 7000)
    const [s2, roll] = next(s1)
    return [s2, { ...p, fleeing: false, speed: RAIN_WALK, restUntil: tick.now + nap, curious: roll < CURIOUS }]
  }
  if (tick.now < p.restUntil) {
    // Watching: sitting up and turned toward the pointer, while it's here.
    const watching = p.curious && tick.pointer !== null
    const facing =
      watching && tick.pointer !== null && Math.abs(tick.pointer.x - p.at.x) > 2
        ? Math.sign(tick.pointer.x - p.at.x)
        : p.facing
    return [seed, watching === p.alert && facing === p.facing ? p : { ...p, alert: watching, facing }]
  }
  const [s, target] = randomIn(seed, tick.plan.yard)
  return [s, { ...p, target, speed: RAIN_WALK, restUntil: 0, alert: false }]
}

// With motion reduced Teddy stays put, but still play-bows, without
// barking, while the pointer is right by him.
const playInPlace = (p: Pet, tick: PetTick): Pet => {
  const near = tick.pointer !== null && distance(p.at, tick.pointer) <= STILL_REACH
  const facing =
    near && tick.pointer !== null && Math.abs(tick.pointer.x - p.at.x) > 1
      ? Math.sign(tick.pointer.x - p.at.x)
      : p.facing
  return near === p.alert && facing === p.facing ? p : { ...p, alert: near, facing }
}

export const stepPets: {
  (tick: PetTick): (pets: Pets) => Pets
  (pets: Pets, tick: PetTick): Pets
} = dual(2, (pets: Pets, tick: PetTick): Pets => {
  if (tick.still) return { ...pets, teddy: playInPlace(pets.teddy, tick), last: tick.now }
  const dt = pets.last === null ? 0 : Math.min((tick.now - pets.last) / 1000, LONGEST_STEP_S)
  const [s1, teddyPlan] = teddyPlans(pets.seed, pets.teddy, tick)
  const teddy = walk(teddyPlan, tick.plan, dt, tick.now)
  const [s2, rainPlan] = rainPlans(s1, pets.rain, teddy, tick)
  const rain = walk(rainPlan, tick.plan, dt, tick.now)
  return { seed: s2, teddy, rain, last: tick.now }
})

// With motion reduced the pets are already home: Teddy by the door, Rain
// curled up in the corner.
export const restingPets = (plan: Plan): Pets => {
  const { yard } = plan
  const teddyAt = pt(yard.x + yard.w * 0.45, yard.y + yard.h * 0.6)
  const rainAt = pt(yard.x + yard.w * 0.85, yard.y + yard.h * 0.3)
  return {
    seed: 1,
    teddy: { ...pet('teddy', teddyAt, teddyAt, TEDDY_WALK), heading: pt(1, 0) },
    rain: { ...pet('rain', rainAt, rainAt, RAIN_WALK), heading: pt(-1, 0), facing: -1 },
    last: null,
  }
}

// A burst of frames starts fresh, so its first dt is 0, not the rest time.
export const wakePets = (pets: Pets): Pets => ({ ...pets, last: null })

// Rooms can move when the page reflows, so the pets keep their spot within
// the room they're in rather than their spot on the canvas.
export interface Replan {
  readonly from: Plan
  readonly to: Plan
}

export const movePets: {
  (replan: Replan): (pets: Pets) => Pets
  (pets: Pets, replan: Replan): Pets
} = dual(2, (pets: Pets, { from, to }: Replan): Pets => {
  const map = (p: Point): Point => {
    const area = areaOf(from, p)
    const [a, b] = area === 'porch' ? [from.rooms.house, to.rooms.house] : [from.rooms[area], to.rooms[area]]
    return a.w <= 0 || a.h <= 0
      ? p
      : pt(b.x + ((p.x - a.x) / a.w) * b.w, b.y + ((p.y - a.y) / a.h) * b.h)
  }
  const move = (p: Pet): Pet => ({
    ...p,
    at: map(p.at),
    target: map(p.target),
    prints: Arr.map(p.prints, print => ({ ...print, at: map(print.at) })),
  })
  return { ...pets, teddy: move(pets.teddy), rain: move(pets.rain) }
})

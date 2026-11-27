// NOTE: the rules for the floor plan drawing, as plain data in and plain data
// out, so the walls, the drafting and the pets are testable without a GPU.
// The renderer only draws what these return.
//
// The plan is drafted once: pens trace every wall one after another, then
// the front door swings in. Once it's drawn, Teddy and Rain move in through
// the front door. Teddy wanders the Outside Work room, chases the pointer
// whenever it's on the house, and play-bows and barks once he catches it.
// Rain ignores it and does her own thing: mostly naps, sometimes sits up to
// watch it, and bolts when Teddy gets too close. With motion reduced the plan is simply there, and the
// pets sit still.

import { Array as Arr } from 'effect'
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
}

export interface Plan {
  // In drafting order.
  readonly walls: ReadonlyArray<Wall>
  // Where the pets come in: just outside the front door.
  readonly door: Point
  // Where they live.
  readonly yard: Rect
  // Where Teddy can follow the pointer.
  readonly inside: Rect
}

export const DRAFT_MS = 2400
const OUTER = 2.4
const INNER = 1.6
const THIN = 0.8
const ARC_STEPS = 10

const pt = (x: number, y: number): Point => ({ x, y })

const wall = (
  from: Point,
  to: Point,
  width: number,
  { gold = 0, dash = 0, alpha = 0.9 }: { gold?: number; dash?: number; alpha?: number } = {},
): Wall => ({ from, to, width, gold, dash, alpha })

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
      { dash: 3, alpha: 0.7 },
    )
  })

const inset = (r: Rect, by: number): Rect => ({
  x: r.x + by,
  y: r.y + by,
  w: Math.max(0, r.w - 2 * by),
  h: Math.max(0, r.h - 2 * by),
})

// Every wall of the house, in the order the pens draft them: the outside
// walls clockwise from the front door, the inside walls, the doors, and the
// locked room's cross last.
export const planFor = ({ house, work, outside, locked }: Rooms): Plan => {
  const left = house.x
  const top = house.y
  const right = house.x + house.w
  const bottom = house.y + house.h
  const middle = work.y + work.h
  const split = work.x + work.w
  const lockX = locked.x

  const doorWidth = Math.min(30, outside.w * 0.3)
  const doorLeft = outside.x + outside.w * 0.38
  const doorRight = doorLeft + doorWidth

  const hallWidth = Math.min(28, work.w * 0.3)
  const hallLeft = work.x + work.w * 0.35
  const sideWidth = Math.min(24, work.h * 0.3)
  const sideTop = work.y + work.h * 0.45

  const walls: ReadonlyArray<Wall> = [
    // The outside, clockwise from the front door.
    wall(pt(doorLeft, bottom), pt(left, bottom), OUTER),
    wall(pt(left, bottom), pt(left, top), OUTER),
    wall(pt(left, top), pt(right, top), OUTER),
    wall(pt(right, top), pt(right, bottom), OUTER),
    wall(pt(right, bottom), pt(doorRight, bottom), OUTER),
    // Down the middle, with a doorway from Work into Outside Work.
    wall(pt(left, middle), pt(hallLeft, middle), INNER),
    wall(pt(hallLeft + hallWidth, middle), pt(right, middle), INNER),
    // Between Work and Open Source, with a doorway.
    wall(pt(split, top), pt(split, sideTop), INNER),
    wall(pt(split, sideTop + sideWidth), pt(split, middle), INNER),
    // The locked room.
    wall(pt(lockX, middle), pt(lockX, bottom), INNER),
    // The front door, open, and its swing.
    wall(pt(doorLeft, bottom), pt(doorLeft, bottom - doorWidth), THIN, { alpha: 0.8 }),
    ...swing(pt(doorLeft, bottom), doorWidth, -Math.PI / 2, 0),
    // The doorway's swing into Outside Work.
    ...swing(pt(hallLeft, middle), hallWidth, 0, Math.PI / 2),
    // D-13, crossed out.
    wall(
      pt(locked.x + 8, locked.y + 8),
      pt(locked.x + locked.w - 8, locked.y + locked.h - 8),
      THIN,
      { gold: 1, dash: 4, alpha: 0.6 },
    ),
    wall(
      pt(locked.x + locked.w - 8, locked.y + 8),
      pt(locked.x + 8, locked.y + locked.h - 8),
      THIN,
      { gold: 1, dash: 4, alpha: 0.6 },
    ),
  ]

  return {
    walls,
    door: pt((doorLeft + doorRight) / 2, bottom + 14),
    yard: inset(outside, 14),
    inside: inset(house, 8),
  }
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

// 0 to 1 for each wall: how much of it is drawn, `since` ms after drafting
// started. One pen works through the walls in order at a steady speed, so a
// long wall takes longer than a short one.
export interface Drafting {
  // Ms since drafting started.
  readonly since: number
  readonly still: boolean
}

export const draftOf: {
  (at: Drafting): (walls: ReadonlyArray<Wall>) => ReadonlyArray<number>
  (walls: ReadonlyArray<Wall>, at: Drafting): ReadonlyArray<number>
} = dual(2, (walls: ReadonlyArray<Wall>, { since, still }: Drafting): ReadonlyArray<number> => {
  if (still || since >= DRAFT_MS) return Arr.map(walls, () => 1)
  if (since <= 0) return Arr.map(walls, () => 0)
  const lengths = Arr.map(walls, w => distance(w.from, w.to))
  const total = Arr.reduce(lengths, 0, (sum, l) => sum + l)
  const head = clamp01(since / DRAFT_MS) * total
  // Where each wall starts along the pen's path.
  const starts = Arr.scan(lengths, 0, (sum, l) => sum + l)
  return Arr.map(lengths, (length, i) => {
    const start = starts[i] ?? 0
    return length <= 0 ? (head >= start ? 1 : 0) : clamp01((head - start) / length)
  })
})

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
const walk = (p: Pet, dt: number, now: number): Pet => {
  const prints = fresh(p.prints, now)
  const dx = p.target.x - p.at.x
  const dy = p.target.y - p.at.y
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
    const to = clampTo(tick.pointer, tick.plan.inside)
    const d = distance(p.at, to)
    // Once he's playing, a little pointer wiggle doesn't get him up again.
    if (d > (p.alert ? HEEL + PLAY_SLACK : HEEL + 1)) {
      const target = pt(to.x - ((to.x - p.at.x) / d) * HEEL, to.y - ((to.y - p.at.y) / d) * HEEL)
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

export const stepPets: {
  (tick: PetTick): (pets: Pets) => Pets
  (pets: Pets, tick: PetTick): Pets
} = dual(2, (pets: Pets, tick: PetTick): Pets => {
  if (tick.still) return { ...pets, last: tick.now }
  const dt = pets.last === null ? 0 : Math.min((tick.now - pets.last) / 1000, LONGEST_STEP_S)
  const [s1, teddyPlan] = teddyPlans(pets.seed, pets.teddy, tick)
  const teddy = walk(teddyPlan, dt, tick.now)
  const [s2, rainPlan] = rainPlans(s1, pets.rain, teddy, tick)
  const rain = walk(rainPlan, dt, tick.now)
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
// the yard rather than their spot on the canvas.
export interface Replan {
  readonly from: Plan
  readonly to: Plan
}

export const movePets: {
  (replan: Replan): (pets: Pets) => Pets
  (pets: Pets, replan: Replan): Pets
} = dual(2, (pets: Pets, { from, to }: Replan): Pets => {
  const map = (p: Point): Point =>
    from.yard.w <= 0 || from.yard.h <= 0
      ? p
      : pt(
          to.yard.x + ((p.x - from.yard.x) / from.yard.w) * to.yard.w,
          to.yard.y + ((p.y - from.yard.y) / from.yard.h) * to.yard.h,
        )
  const move = (p: Pet): Pet => ({
    ...p,
    at: map(p.at),
    target: map(p.target),
    prints: Arr.map(p.prints, print => ({ ...print, at: map(print.at) })),
  })
  return { ...pets, teddy: move(pets.teddy), rain: move(pets.rain) }
})

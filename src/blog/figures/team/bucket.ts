import { Array as Arr, Boolean as Bool, Option, Order, Schema } from 'effect'

import { clamp01, random, smooth } from '../../animation/kit.ts'

export const BOUNDS = { x: 1.6, y: 0.9 } as const
export const PEOPLE = 5

export const BUCKET = {
  x: 0,
  base: 0.66,
  rim: -0.02,
  baseHalf: 0.3,
  rimHalf: 0.4,
  wall: 0.035,
} as const
export const FLOOR = BUCKET.base
export const INNER_BASE = BUCKET.base - BUCKET.wall * 0.6
const RISE = 0.034

const BEFORE = 14
const AFTER = 2
export const MAX_KICKS = 6
export const SPRAY = 36

const FIRST = 0.7
const LAST_BEFORE = 7.4
const FALL = 0.75
const JOIN = 0.35
const POP = 0.6
export const RIPPLE_FOR = 1.8

export const KICK_AT = 7.9
export const KICK_SHARE = 0.58
const HIT = 0.08
const LURCH_FOR = 0.16
const SPILL_START = 0.14
const SPILL_FOR = 0.5
const ROCK_FOR = 0.7
const LURCH = 0.55
export const KICK_SETTLE = HIT + 2.8
const FLASH_FOR = 0.7
const AFTER_LANDS = [10.9, 12.3] as const
const REST = 2.2

export interface Person {
  readonly x: number
  readonly y: number
}

const Side = Schema.Literals([1, -1])
type Side = typeof Side.Type

export const Bead = Schema.Struct({
  delay: Schema.Finite,
  flight: Schema.Finite,
  reach: Schema.Finite,
  lift: Schema.Finite,
  radius: Schema.Finite,
})
export type Bead = typeof Bead.Type

export const Event = Schema.TaggedUnion({
  Drop: { from: Schema.Finite, start: Schema.Finite, lands: Schema.Finite, across: Schema.Finite },
  Kick: { from: Schema.Finite, at: Schema.Finite, share: Schema.Finite, side: Side, beads: Schema.Array(Bead) },
})
export type Event = typeof Event.Type
export type Drop = typeof Event.cases.Drop.Type
export type Kick = typeof Event.cases.Kick.Type

export interface Timeline {
  readonly seed: number
  readonly people: ReadonlyArray<Person>
  readonly events: ReadonlyArray<Event>
  readonly kicker: number
  readonly end: number
}

export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3

const eventTime = Event.match({ Drop: drop => drop.lands, Kick: kick => kick.at })
const byTime = Order.mapInput(Order.Number, eventTime)
export const dropsOf = (timeline: Timeline): ReadonlyArray<Drop> =>
  Arr.filter(timeline.events, (event): event is Drop => event._tag === 'Drop')
export const kicksOf = (timeline: Timeline): ReadonlyArray<Kick> =>
  Arr.filter(timeline.events, (event): event is Kick => event._tag === 'Kick')

const sideOf = (person: Person): Side => {
  if (person.x < BUCKET.x) return 1
  return -1
}

const makeKick = (
  people: ReadonlyArray<Person>,
  from: number,
  at: number,
  share: number,
  seed: number,
): Kick => {
  const next = random(seed)
  const between = (lo: number, hi: number) => lo + (hi - lo) * next()
  const count = Math.max(4, Math.round(SPRAY * share))
  return Event.cases.Kick.make({
    from,
    at,
    share,
    side: sideOf(people[from]!),
    beads: Arr.map(
      Arr.range(0, count - 1),
      (i): Bead => ({
        delay: SPILL_START + (SPILL_FOR * 0.75 * i) / count + between(0, 0.05),
        flight: between(0.24, 0.4),
        reach: between(0.05, 0.2) + 0.35 * (1 - i / count) * between(0.5, 1),
        lift: between(0, 0.08),
        radius: between(1.5, 2.6),
      }),
    ),
  })
}

export const buildTimeline = (seed: number): Timeline => {
  const next = random(seed)
  const between = (lo: number, hi: number) => lo + (hi - lo) * next()

  const people = Arr.map(
    Arr.range(0, PEOPLE - 1),
    (i): Person => ({
      x: -1.12 + (2.24 * i) / (PEOPLE - 1) + between(-0.06, 0.06),
      y: -0.64 + between(-0.07, 0.07),
    }),
  )
  const kicker = Bool.match(next() < 0.5, { onTrue: () => 1, onFalse: () => 3 })

  const gaps = Arr.map(Arr.range(1, BEFORE - 1), () => between(0.7, 1.3))
  const total = Arr.reduce(gaps, 0, (sum, gap) => sum + gap)
  const span = LAST_BEFORE - FALL - FIRST
  const starts = Arr.scan(gaps, FIRST, (at, gap) => at + (gap / total) * span)

  const pick = (from: ReadonlyArray<number>, last: number) => {
    const choices = Arr.filter(from, i => i !== last)
    return choices[Math.floor(next() * choices.length)]!
  }
  const everyone = Arr.range(0, PEOPLE - 1)
  const others = Arr.filter(everyone, i => i !== kicker)
  let last = -1
  const before = Arr.map(starts, (start): Drop => {
    last = pick(everyone, last)
    return Event.cases.Drop.make({ from: last, start, lands: start + FALL, across: between(-0.6, 0.6) })
  })
  const after = Arr.map(AFTER_LANDS, (at): Drop => {
    last = pick(others, last)
    const lands = at + between(-0.15, 0.15)
    return Event.cases.Drop.make({ from: last, start: lands - FALL, lands, across: between(-0.5, 0.5) })
  })

  const kick = makeKick(people, kicker, KICK_AT, KICK_SHARE, seed * 31 + 7)
  return {
    seed,
    people,
    events: Arr.sort([...before, ...after, kick], byTime),
    kicker,
    end: after[AFTER - 1]!.lands + REST,
  }
}

export const withKicks = (timeline: Timeline, times: ReadonlyArray<number>, share = 0.5): Timeline => {
  const room = MAX_KICKS - kicksOf(timeline).length
  const added = Arr.map(Arr.take(times, Math.max(0, room)), (at, i) => {
    const giver = Option.match(
      Arr.findLast(dropsOf(timeline), drop => drop.start <= at),
      { onNone: () => timeline.kicker, onSome: drop => drop.from },
    )
    return makeKick(timeline.people, giver, at, share, timeline.seed * 977 + i * 131 + Math.round(at * 1000))
  })
  return { ...timeline, events: Arr.sort([...timeline.events, ...added], byTime) }
}

const joinedOf = (drop: Drop, time: number) => smooth((time - drop.lands) / JOIN)
const spillOf = (kick: Kick, time: number) => smooth((time - kick.at - SPILL_START) / SPILL_FOR)

const lurchOf = (kick: Kick, time: number): number => {
  const since = time - kick.at - HIT
  if (since <= 0) return 0
  if (since < LURCH_FOR) return easeOut(since / LURCH_FOR)
  const s = since - LURCH_FOR
  return Math.exp(-2.6 * s) * Math.abs(Math.cos((Math.PI * s) / ROCK_FOR)) * (1 - smooth((s - 1.3) / 0.4))
}

const lurchAngle = (share: number) => LURCH * Math.min(1, 0.45 + share)

export const fillAt = (timeline: Timeline, time: number): number =>
  Arr.reduce(timeline.events, 0, (water, event) => {
    if (eventTime(event) > time) return water
    return Event.match(event, {
      Drop: drop => water + joinedOf(drop, time),
      Kick: kick => water * (1 - kick.share * spillOf(kick, time)),
    })
  })

export const peakAt = (timeline: Timeline, time: number): number =>
  Arr.reduce(
    Arr.filter(kicksOf(timeline), kick => kick.at <= time),
    fillAt(timeline, time),
    (most, kick) => Math.max(most, fillAt(timeline, kick.at)),
  )

export const levelOf = (water: number): number => INNER_BASE - water * RISE

export interface FramePerson {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly grown: number
  readonly giving: number
  readonly heat: number
}

export interface FrameDrop {
  readonly x: number
  readonly y: number
  readonly tail: readonly [number, number]
}

export interface Ripple {
  readonly x: number
  readonly age: number
}

export interface Water {
  readonly amount: number
  readonly level: number
  readonly slope: number
  readonly ripples: ReadonlyArray<Ripple>
}

export interface FrameBead {
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly flying: boolean
}

export interface FramePuddle {
  readonly from: number
  readonly to: number
  readonly fresh: number
}

export interface FrameFlash {
  readonly x: number
  readonly y: number
  readonly progress: number
  readonly share: number
}

export interface FrameStrike {
  readonly from: readonly [number, number]
  readonly to: readonly [number, number]
  readonly reach: number
  readonly strength: number
}

export interface Frame {
  readonly people: ReadonlyArray<FramePerson>
  readonly drops: ReadonlyArray<FrameDrop>
  readonly water: Water
  readonly beads: ReadonlyArray<FrameBead>
  readonly puddles: ReadonlyArray<FramePuddle>
  readonly flashes: ReadonlyArray<FrameFlash>
  readonly strikes: ReadonlyArray<FrameStrike>
  readonly angle: number
  readonly side: 1 | -1
  readonly grown: number
  readonly peak: number
}

export const posed =
  (angle: number, side: 1 | -1) =>
  ([x, y]: readonly [number, number]): readonly [number, number] => {
    const px = BUCKET.x + side * BUCKET.baseHalf
    const py = BUCKET.base
    const dx = x - px
    const dy = y - py
    const a = angle * side
    return [px + dx * Math.cos(a) - dy * Math.sin(a), py + dx * Math.sin(a) + dy * Math.cos(a)]
  }

export const halfAt = (y: number): number => {
  const t = (BUCKET.base - y) / (BUCKET.base - BUCKET.rim)
  return BUCKET.baseHalf + (BUCKET.rimHalf - BUCKET.baseHalf) * t - BUCKET.wall
}

export const surfaceAt = (water: Water, x: number): number => {
  const ripple = Arr.reduce(water.ripples, 0, (sum, { x: x0, age }) => {
    const front = 0.06 + 0.32 * age
    const d = Math.abs(x - x0) - front
    const fade = Math.exp(-2.4 * age) * (1 - smooth((age - RIPPLE_FOR + 0.5) / 0.5))
    const dip = 0.018 * Math.exp(-((x - x0) ** 2) / 0.002) * Math.exp(-12 * age)
    return sum + dip + 0.011 * fade * Math.cos(d * 40) * Math.exp(-(d * d) / 0.006)
  })
  return water.level - water.slope * x + ripple
}

interface Pose {
  readonly angle: number
  readonly side: Side
}

const UPRIGHT = { angle: 0, side: 1 } satisfies Pose

const poseAt = (timeline: Timeline, time: number): Pose =>
  Arr.reduce(kicksOf(timeline), UPRIGHT, (pose: Pose, kick): Pose => {
    const angle = lurchAngle(kick.share) * lurchOf(kick, time)
    if (angle > pose.angle) return { angle, side: kick.side }
    return pose
  })

const slopeAt = (timeline: Timeline, time: number, angle: number, side: 1 | -1): number => {
  const level = Math.tan(angle * side)
  const slosh = Arr.reduce(timeline.events, 0, (sum, event) => {
    if (event._tag === 'Kick') {
      const s = time - event.at - HIT
      if (s <= 0) return sum
      const fade = Math.exp(-1.9 * s) * (1 - smooth((s - 2.2) / 0.6))
      return sum + event.side * 0.32 * Math.min(1, event.share * 1.6) * fade * Math.sin((2 * Math.PI * s) / 0.9)
    }
    const age = time - event.lands
    if (age <= 0 || age > RIPPLE_FOR) return sum
    const fade = Math.exp(-2.2 * age) * (1 - smooth((age - RIPPLE_FOR + 0.5) / 0.5))
    return sum - Math.sign(event.across) * 0.035 * fade * Math.sin((2 * Math.PI * age) / 0.6)
  })
  return level + slosh
}

const dropPoint = (timeline: Timeline, drop: Drop, level: number, u: number): readonly [number, number] => {
  const person = timeline.people[drop.from]!
  const x = BUCKET.x + drop.across * halfAt(level)
  const top = person.y + 0.05
  return [person.x + (x - person.x) * smooth(u), top + (level - top) * u * u]
}

export const frameAt = (timeline: Timeline, time: number): Frame => {
  const { angle, side } = poseAt(timeline, time)
  const fill = fillAt(timeline, time)
  const level = levelOf(fill)
  const drops = dropsOf(timeline)
  const kicks = Arr.filter(kicksOf(timeline), kick => kick.at <= time)

  const people = Arr.map(timeline.people, (person, id): FramePerson => {
    const giving = Arr.reduce(drops, 0, (most, drop) => {
      if (drop.from !== id) return most
      const t = (time - drop.start + 0.25) / 0.6
      if (t <= 0 || t >= 1) return most
      return Math.max(most, Math.sin(Math.PI * t))
    })
    const heat = Option.match(
      Arr.findLast(kicks, kick => kick.from === id),
      { onNone: () => 0, onSome: kick => 0.75 + 0.25 * (1 - smooth((time - kick.at) / 0.8)) },
    )
    return { id, x: person.x, y: person.y, grown: smooth((time - id * 0.06) / POP), giving, heat }
  })

  const falling = Arr.flatMap(drops, (drop): ReadonlyArray<FrameDrop> => {
    if (time < drop.start || time >= drop.lands) return []
    const u = (time - drop.start) / FALL
    const at = levelOf(fill + 0.5)
    const [x, y] = dropPoint(timeline, drop, at, u)
    return [{ x, y, tail: dropPoint(timeline, drop, at, Math.max(0, u - 0.12)) }]
  })

  const ripples = Arr.flatMap(drops, (drop): ReadonlyArray<Ripple> => {
    const age = time - drop.lands
    if (age < 0 || age > RIPPLE_FOR) return []
    return [{ x: drop.across * halfAt(level), age }]
  })

  const beads = Arr.flatMap(kicks, (kick): ReadonlyArray<FrameBead> => {
    const full = lurchAngle(kick.share)
    const lip = (lean: number) => posed(lean, kick.side)([BUCKET.x + kick.side * BUCKET.rimHalf, BUCKET.rim])
    const over = lip(full)
    return Arr.flatMap(kick.beads, (bead): ReadonlyArray<FrameBead> => {
      const start = kick.at + bead.delay
      if (time < start) return []
      const u = clamp01((time - start) / bead.flight)
      const [mx, my] = lip(full * lurchOf(kick, start))
      const lx = over[0] + kick.side * bead.reach
      const x = mx + (lx - mx) * u
      const y = my + (FLOOR - my) * u * u - bead.lift * Math.sin(Math.PI * u) * (1 - u)
      return [{ x, y: Math.min(FLOOR, y), radius: bead.radius, flying: u < 1 }]
    })
  })

  const puddles = Arr.map(kicks, (kick): FramePuddle => {
    const since = time - kick.at - SPILL_START
    const spread = smooth(since / (SPILL_FOR + 0.35))
    const foot = BUCKET.x + kick.side * (BUCKET.baseHalf + 0.03)
    const reach = (0.12 + 0.7 * kick.share) * spread
    return { from: foot, to: foot + kick.side * reach, fresh: 1 - smooth((since - 0.6) / 1.2) }
  })

  const flashes = Arr.flatMap(kicks, (kick): ReadonlyArray<FrameFlash> => {
    const progress = (time - kick.at) / FLASH_FOR
    const from = timeline.people[kick.from]!
    if (progress < 1) return [{ x: from.x, y: from.y, progress, share: kick.share }]
    return []
  })

  const strikes = Arr.flatMap(kicks, (kick): ReadonlyArray<FrameStrike> => {
    const since = time - kick.at
    if (since >= 0.4) return []
    const from = timeline.people[kick.from]!
    const wall = posed(0, kick.side)([BUCKET.x - kick.side * (BUCKET.rimHalf - 0.03), BUCKET.rim + 0.18])
    return [
      {
        from: [from.x, from.y],
        to: wall,
        reach: easeOut(since / HIT),
        strength: 1 - smooth((since - HIT) / (0.4 - HIT)),
      },
    ]
  })

  return {
    people,
    drops: falling,
    water: { amount: fill, level, slope: slopeAt(timeline, time, angle, side), ripples },
    beads,
    puddles,
    flashes,
    strikes,
    angle,
    side,
    grown: smooth(time / POP),
    peak: peakAt(timeline, time),
  }
}

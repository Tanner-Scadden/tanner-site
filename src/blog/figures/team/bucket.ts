import { Array as Arr, Option, Order } from 'effect'

import { clamp01, random, smooth } from '../../animation/kit.ts'

// The figure lives in a box this wide and tall, in world units.
export const BOUNDS = { x: 1.6, y: 0.9 } as const
export const PEOPLE = 5

// The bucket: a tapered pail standing on the floor, its base centred here.
export const BUCKET = {
  x: 0,
  base: 0.66,
  rim: -0.02,
  // Half its width at the base and at the rim.
  baseHalf: 0.3,
  rimHalf: 0.4,
  // How thick its walls are, inside.
  wall: 0.035,
} as const
export const FLOOR = BUCKET.base
// The inside of the bucket's floor, where the water starts.
export const INNER_BASE = BUCKET.base - BUCKET.wall * 0.6
// How far one drop lifts the water.
const RISE = 0.034

// How many drops land before the kick, and after it.
const BEFORE = 14
const AFTER = 2
// The most kicks a run can hold, the one it starts with included.
export const MAX_KICKS = 6
// How many beads a kick that spills everything would throw.
export const SPRAY = 36

// When the first drop leaves, and when the last one before the kick lands.
const FIRST = 0.7
const LAST_BEFORE = 7.4
// How long a drop takes to fall, and its water to join the rest.
const FALL = 0.75
const JOIN = 0.35
// How long teammates and the bucket take to appear.
const POP = 0.6
// How long a drop's ripple runs before the surface is still again.
export const RIPPLE_FOR = 1.8

// The run's own kick, and how much of the water it spills.
export const KICK_AT = 7.9
export const KICK_SHARE = 0.58
// After a kick, in seconds from it: the foot lands, the bucket lurches
// over, and the water slops out over the lip.
const HIT = 0.08
const LURCH_FOR = 0.16
const SPILL_START = 0.14
const SPILL_FOR = 0.5
// It rocks back and forth on its edge, smaller each time, and is still
// about two seconds after.
const ROCK_FOR = 0.7
// How far over a kick that spills everything would push it.
const LURCH = 0.55
// Seconds until a kick has played out: the bucket's still, the water's
// stopped sloshing, and the spill has settled.
export const KICK_SETTLE = HIT + 2.8
// How long the red flash takes to fade.
const FLASH_FOR = 0.7
// The drops after it land at about these times.
const AFTER_LANDS = [10.9, 12.3] as const
// The water goes still for this long after the last drop before the run
// ends, so it eases into the hold.
const REST = 2.2

export interface Person {
  readonly x: number
  readonly y: number
}

// A teammate lets a drop go. It lands in the bucket FALL seconds later.
export interface Drop {
  readonly _tag: 'Drop'
  readonly from: number
  readonly start: number
  readonly lands: number
  // Where across the surface it lands, from -1 to 1.
  readonly across: number
}

// A bead of a spill: when after the kick it leaves the lip, how long it
// flies, and how far past the lip it ends up on the floor.
export interface Bead {
  readonly delay: number
  readonly flight: number
  readonly reach: number
  readonly lift: number
  readonly radius: number
}

// Someone kicks the bucket. It lurches away from them and loses
// `share` of whatever water is in it.
export interface Kick {
  readonly _tag: 'Kick'
  readonly from: number
  readonly at: number
  readonly share: number
  // Which way it goes over: 1 to the right, -1 to the left.
  readonly side: 1 | -1
  readonly beads: ReadonlyArray<Bead>
}

export type Event = Drop | Kick

export interface Timeline {
  readonly seed: number
  readonly people: ReadonlyArray<Person>
  // In time order: drops by when they land, kicks by when they happen.
  readonly events: ReadonlyArray<Event>
  // Whoever kicks in the run itself.
  readonly kicker: number
  readonly end: number
}

export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3

const eventTime = (event: Event) => (event._tag === 'Drop' ? event.lands : event.at)
const byTime = Order.mapInput(Order.Number, eventTime)
export const dropsOf = (timeline: Timeline): ReadonlyArray<Drop> =>
  Arr.filter(timeline.events, (event): event is Drop => event._tag === 'Drop')
export const kicksOf = (timeline: Timeline): ReadonlyArray<Kick> =>
  Arr.filter(timeline.events, (event): event is Kick => event._tag === 'Kick')

// A kick from one teammate, its spill drawn from a seed so it replays.
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
  return {
    _tag: 'Kick',
    from,
    at,
    share,
    side: people[from]!.x < BUCKET.x ? 1 : -1,
    beads: Arr.map(
      Arr.range(0, count - 1),
      (i): Bead => ({
        delay: SPILL_START + (SPILL_FOR * 0.75 * i) / count + between(0, 0.05),
        flight: between(0.24, 0.4),
        // The first out go furthest.
        reach: between(0.05, 0.2) + 0.35 * (1 - i / count) * between(0.5, 1),
        lift: between(0, 0.08),
        radius: between(1.5, 2.6),
      }),
    ),
  }
}

export const buildTimeline = (seed: number): Timeline => {
  const next = random(seed)
  const between = (lo: number, hi: number) => lo + (hi - lo) * next()

  // A loose row across the top: evenly spaced, nudged a little.
  const people = Arr.map(
    Arr.range(0, PEOPLE - 1),
    (i): Person => ({
      x: -1.12 + (2.24 * i) / (PEOPLE - 1) + between(-0.06, 0.06),
      y: -0.64 + between(-0.07, 0.07),
    }),
  )
  // Whoever kicks sits just off the middle, so the flash reads as theirs
  // and the bucket goes over away from them, toward the open side.
  const kicker = next() < 0.5 ? 1 : 3

  // The gaps between drops before the kick, uneven, scaled so the last one
  // lands on time.
  const gaps = Arr.map(Arr.range(1, BEFORE - 1), () => between(0.7, 1.3))
  const total = Arr.reduce(gaps, 0, (sum, gap) => sum + gap)
  const span = LAST_BEFORE - FALL - FIRST
  const starts = Arr.scan(gaps, FIRST, (at, gap) => at + (gap / total) * span)

  // Nobody gives twice in a row, so the drops come from all over the team.
  const pick = (from: ReadonlyArray<number>, last: number) => {
    const choices = Arr.filter(from, i => i !== last)
    return choices[Math.floor(next() * choices.length)]!
  }
  const everyone = Arr.range(0, PEOPLE - 1)
  const others = Arr.filter(everyone, i => i !== kicker)
  let last = -1
  const before = Arr.map(starts, (start): Drop => {
    last = pick(everyone, last)
    return { _tag: 'Drop', from: last, start, lands: start + FALL, across: between(-0.6, 0.6) }
  })
  // After the kick, only the others give, and slowly.
  const after = Arr.map(AFTER_LANDS, (at): Drop => {
    last = pick(others, last)
    const lands = at + between(-0.15, 0.15)
    return { _tag: 'Drop', from: last, start: lands - FALL, lands, across: between(-0.5, 0.5) }
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

// The run with more kicks in it, at these times, each spilling this share
// of the water that's there. Whoever gave last before each one is who
// kicks, and the most a run holds is MAX_KICKS.
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

// How much of a drop's water has joined the rest.
const joinedOf = (drop: Drop, time: number) => smooth((time - drop.lands) / JOIN)
// How far through its spill a kick is.
const spillOf = (kick: Kick, time: number) => smooth((time - kick.at - SPILL_START) / SPILL_FOR)

// How far over a kick has the bucket, from 0 standing to 1 at the top of
// its lurch: over fast, then rocking back on its edge, smaller each time,
// until it's still.
const lurchOf = (kick: Kick, time: number): number => {
  const since = time - kick.at - HIT
  if (since <= 0) return 0
  if (since < LURCH_FOR) return easeOut(since / LURCH_FOR)
  const s = since - LURCH_FOR
  return Math.exp(-2.6 * s) * Math.abs(Math.cos((Math.PI * s) / ROCK_FOR)) * (1 - smooth((s - 1.3) / 0.4))
}

// How far a kick of this share pushes the bucket over, in radians.
const lurchAngle = (share: number) => LURCH * Math.min(1, 0.45 + share)

// How much water is in the bucket, in drops: every drop that's landed,
// less what each kick spilled of whatever was there when it went over.
export const fillAt = (timeline: Timeline, time: number): number =>
  Arr.reduce(timeline.events, 0, (water, event) => {
    if (eventTime(event) > time) return water
    return event._tag === 'Drop'
      ? water + joinedOf(event, time)
      : water * (1 - event.share * spillOf(event, time))
  })

// The most it's held, up to now: it peaks the moment before a kick.
export const peakAt = (timeline: Timeline, time: number): number =>
  Arr.reduce(
    Arr.filter(kicksOf(timeline), kick => kick.at <= time),
    fillAt(timeline, time),
    (most, kick) => Math.max(most, fillAt(timeline, kick.at)),
  )

// Where the water's surface sits at its middle, in the bucket's own frame,
// for this much water.
export const levelOf = (water: number): number => INNER_BASE - water * RISE

// What's on screen at one moment, in world units.
export interface FramePerson {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly grown: number
  // Brightens as they let a drop go.
  readonly giving: number
  // Their last kick's heat, from 1 as it happens to what stays, or 0.
  readonly heat: number
}

export interface FrameDrop {
  readonly x: number
  readonly y: number
  // Where it was a moment ago, for a short streak.
  readonly tail: readonly [number, number]
}

// A drop's ripple on the surface: where across it landed, in the bucket's
// own frame, and how long ago.
export interface Ripple {
  readonly x: number
  readonly age: number
}

// The water, in the bucket's own frame: its level at the middle, the tilt
// of its surface (how far it rises per unit to the right), and the ripples
// on it.
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
  // Still flying, rather than lying on the floor.
  readonly flying: boolean
}

// A spill's puddle on the floor, and how fresh it is.
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

// The kick itself: a short strike from whoever kicked to the bucket's wall.
export interface FrameStrike {
  readonly from: readonly [number, number]
  readonly to: readonly [number, number]
  // How far along it's reached, and how much is left of it.
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
  // The bucket's pose: how far over it is, and which way.
  readonly angle: number
  readonly side: 1 | -1
  readonly grown: number
  // The most it's held, in drops. How full it is now is `water.amount`.
  readonly peak: number
}

// Turn a point in the bucket's own frame (x across, y down, base on the
// floor) to the world, for a pose: turned this far about the foot of its
// wall on that side.
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

// The inside half-width of the bucket at a height in its own frame.
export const halfAt = (y: number): number => {
  const t = (BUCKET.base - y) / (BUCKET.base - BUCKET.rim)
  return BUCKET.baseHalf + (BUCKET.rimHalf - BUCKET.baseHalf) * t - BUCKET.wall
}

// The surface at x across, in the bucket's own frame: the tilted level,
// plus every ripple's ring moving out from where its drop landed, fading
// as it goes.
export const surfaceAt = (water: Water, x: number): number => {
  const ripple = Arr.reduce(water.ripples, 0, (sum, { x: x0, age }) => {
    const front = 0.06 + 0.32 * age
    const d = Math.abs(x - x0) - front
    const fade = Math.exp(-2.4 * age) * (1 - smooth((age - RIPPLE_FOR + 0.5) / 0.5))
    // A dip where it lands, then a ring of small waves moving out.
    const dip = 0.018 * Math.exp(-((x - x0) ** 2) / 0.002) * Math.exp(-12 * age)
    return sum + dip + 0.011 * fade * Math.cos(d * 40) * Math.exp(-(d * d) / 0.006)
  })
  return water.level - water.slope * x + ripple
}

// The bucket's pose: whichever kick has it furthest over.
const poseAt = (timeline: Timeline, time: number): { readonly angle: number; readonly side: 1 | -1 } =>
  Arr.reduce(kicksOf(timeline), { angle: 0, side: 1 as 1 | -1 }, (pose, kick) => {
    const angle = lurchAngle(kick.share) * lurchOf(kick, time)
    return angle > pose.angle ? { angle, side: kick.side } : pose
  })

// How the water tilts in the bucket: level in the world while the bucket's
// over, plus a slosh after each kick, and the faintest one after each drop.
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

// Where a drop falls from its teammate to the surface: across toward the
// bucket, and faster as it goes, like something falling.
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
      return t <= 0 || t >= 1 ? most : Math.max(most, Math.sin(Math.PI * t))
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
    // Aim at the surface as it will be once this drop's in.
    const at = levelOf(fill + 0.5)
    const [x, y] = dropPoint(timeline, drop, at, u)
    return [{ x, y, tail: dropPoint(timeline, drop, at, Math.max(0, u - 0.12)) }]
  })

  const ripples = Arr.flatMap(drops, (drop): ReadonlyArray<Ripple> => {
    const age = time - drop.lands
    return age < 0 || age > RIPPLE_FOR ? [] : [{ x: drop.across * halfAt(level), age }]
  })

  const beads = Arr.flatMap(kicks, (kick): ReadonlyArray<FrameBead> => {
    const full = lurchAngle(kick.share)
    // The lip on the low side, where the water goes over.
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

  // The puddle runs out from the foot of the bucket, past where the beads
  // land, and dulls a little as it settles.
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
    return progress < 1 ? [{ x: from.x, y: from.y, progress, share: kick.share }] : []
  })

  // The strike lands on the wall facing whoever kicked, high up.
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

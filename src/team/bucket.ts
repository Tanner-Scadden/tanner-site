// NOTE: the team figure in the blog post, as data. "Trust is built in drops
// and lost in buckets." A seed lays out one whole run up front, and
// `frameAt` reads any moment of it without simulating anything.
//
// The run tells it in three beats:
//   1. Five teammates in a loose row. Now and then one of them lets fall a
//      small gold drop, a small helpful moment, into one shared bucket
//      below. Each drop adds one thin course to the bucket, so you can
//      watch it fill a sliver at a time.
//   2. One teammate flares red. The flash knocks the bucket onto its side,
//      and everything in it spills out in one splash, in about half a
//      second. It lies there a moment, then rights itself.
//   3. Drops start again, slowly and sparsely. It ends with only a little
//      in it, beside the spill and below the mark of how full it once was.
//
// The run is a list of events, drops and flares, and what's in the bucket
// at any moment is a pure fold over that list. The flare at the heart of
// the run is one entry in it, so more flares at any time (a reader's bad
// interaction, say) slot in with `withFlares` and the fill, the spill and
// the bucket's pose all follow.

import { Array as Arr, Number as Num, Option, Order } from 'effect'

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

// Each drop adds a course this tall.
export const COURSE = 0.036
// How many drops land before the flare, and after it. The last of the
// drops after it is still falling when the run ends.
export const BEFORE = 14
export const AFTER = 4
// The most flares a run can hold, the one it starts with included.
export const MAX_FLARES = 6
// How many beads a full spill throws out.
export const SPRAY = 28

// When the first drop leaves, and when the last one before the flare lands.
const FIRST = 0.7
const LAST_BEFORE = 7.4
// How long a drop takes to fall.
export const FALL = 0.75
// How long a course takes to spread once its drop lands.
export const SPREAD = 0.25
// How long teammates and the bucket take to appear.
export const POP = 0.6

// The run's own flare.
export const FLARE = 7.9
// After a flare, in seconds from it: the flash reaches the bucket and it
// goes over, empties while it's over, lies there a moment, then slowly
// rights itself.
export const TIP_START = 0.12
export const TIP_FOR = 0.3
export const SPILL_START = 0.18
export const SPILL_FOR = 0.42
export const RIGHT_START = 1.1
export const RIGHT_FOR = 1.1
// How far over a full spill knocks it: onto its side, its wall flat on the
// floor.
export const TIP_ANGLE = Math.PI / 2 - Math.atan2(BUCKET.rimHalf - BUCKET.baseHalf, BUCKET.base - BUCKET.rim)
// How long the red flash takes to fade.
export const FLASH_FOR = 0.7
// The drops after it land at about these times.
const AFTER_LANDS = [10.9, 11.9, 12.8, 13.9] as const
// The run ends a little after the third of them lands.
const SETTLED = 0.65

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
  // Where across the bucket it lands, from -1 to 1 of the inside.
  readonly across: number
}

// A bead of a spill: where it leaves the mouth, from -1 to 1 along it,
// how long after the spill starts, how long it flies, and how far past the
// mouth it ends up on the floor.
export interface Bead {
  readonly along: number
  readonly delay: number
  readonly flight: number
  readonly reach: number
  readonly radius: number
}

// Someone flares. The bucket tips away from them and loses `share` of
// whatever's in it.
export interface Flare {
  readonly _tag: 'Flare'
  readonly from: number
  readonly at: number
  readonly share: number
  // Which way it tips: 1 to the right, -1 to the left.
  readonly side: 1 | -1
  readonly beads: ReadonlyArray<Bead>
}

export type Event = Drop | Flare

export interface Timeline {
  readonly seed: number
  readonly people: ReadonlyArray<Person>
  // In time order: drops by when they land, flares by when they happen.
  readonly events: ReadonlyArray<Event>
  // Whoever flares in the run itself.
  readonly flarer: number
  readonly end: number
}

// Mulberry32: a small seeded generator, so a run replays from its seed.
const random = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp01 = (t: number): number => Num.clamp(t, { minimum: 0, maximum: 1 })
// Smoothstep, so ramps start and end gently.
export const smooth = (t: number): number => {
  const c = clamp01(t)
  return c * c * (3 - 2 * c)
}
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3

const eventTime = (event: Event) => (event._tag === 'Drop' ? event.lands : event.at)
const byTime = Order.mapInput(Order.Number, eventTime)
export const dropsOf = (timeline: Timeline): ReadonlyArray<Drop> =>
  Arr.filter(timeline.events, (event): event is Drop => event._tag === 'Drop')
export const flaresOf = (timeline: Timeline): ReadonlyArray<Flare> =>
  Arr.filter(timeline.events, (event): event is Flare => event._tag === 'Flare')

// A flare from one teammate, its beads drawn from a seed so it replays.
export const makeFlare = (
  people: ReadonlyArray<Person>,
  from: number,
  at: number,
  share: number,
  seed: number,
): Flare => {
  const next = random(seed)
  const between = (lo: number, hi: number) => lo + (hi - lo) * next()
  const count = Math.max(4, Math.round(SPRAY * share))
  return {
    _tag: 'Flare',
    from,
    at,
    share,
    side: people[from]!.x < BUCKET.x ? 1 : -1,
    beads: Arr.map(
      Arr.range(0, count - 1),
      (i): Bead => ({
        along: between(-0.8, 0.8),
        delay: SPILL_START + (SPILL_FOR * 0.7 * i) / count + between(0, 0.04),
        flight: between(0.22, 0.36),
        // Further out for the later, slower beads.
        reach: between(0, 0.28) + (0.1 * i) / count,
        radius: between(1.6, 2.8),
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
  // Whoever flares sits just off the middle, so the flash reads as theirs
  // and the bucket tips away from them, toward the open side.
  const flarer = next() < 0.5 ? 1 : 3

  // The gaps between drops before the flare, uneven, scaled so the last one
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
  const others = Arr.filter(everyone, i => i !== flarer)
  let last = -1
  const before = Arr.map(starts, (start): Drop => {
    last = pick(everyone, last)
    return { _tag: 'Drop', from: last, start, lands: start + FALL, across: between(-0.55, 0.55) }
  })
  // After the flare, only the others give, and slowly.
  const after = Arr.map(AFTER_LANDS, (at): Drop => {
    last = pick(others, last)
    const lands = at + between(-0.15, 0.15)
    return { _tag: 'Drop', from: last, start: lands - FALL, lands, across: between(-0.5, 0.5) }
  })

  const flare = makeFlare(people, flarer, FLARE, 1, seed * 31 + 7)
  return {
    seed,
    people,
    events: Arr.sort([...before, ...after, flare], byTime),
    flarer,
    end: after[AFTER - 2]!.lands + SETTLED,
  }
}

// The run with more flares in it, at these times, each tipping out this
// share of what's there. Whoever gave last before each one is who flares,
// and the most a run holds is MAX_FLARES.
export const withFlares = (timeline: Timeline, times: ReadonlyArray<number>, share = 0.5): Timeline => {
  const room = MAX_FLARES - flaresOf(timeline).length
  const added = Arr.map(Arr.take(times, Math.max(0, room)), (at, i) => {
    const giver = Option.match(
      Arr.findLast(dropsOf(timeline), drop => drop.start <= at),
      { onNone: () => timeline.flarer, onSome: drop => drop.from },
    )
    return makeFlare(timeline.people, giver, at, share, timeline.seed * 977 + i * 131 + Math.round(at * 1000))
  })
  return { ...timeline, events: Arr.sort([...timeline.events, ...added], byTime) }
}

// How much of a course has spread, once its drop lands.
const spreadOf = (drop: Drop, time: number) => clamp01((time - drop.lands) / SPREAD)
// How far through its spill a flare is.
export const spillOf = (flare: Flare, time: number) => smooth((time - flare.at - SPILL_START) / SPILL_FOR)
// How far over a flare has the bucket, from 0 standing to 1 as far as it
// goes.
export const tipOf = (flare: Flare, time: number): number => {
  const since = time - flare.at
  if (since < TIP_START) return 0
  if (since < RIGHT_START) return easeOut((since - TIP_START) / TIP_FOR)
  return 1 - smooth((since - RIGHT_START) / RIGHT_FOR)
}

// A course in the bucket: whose drop it was, and how much of it is there.
export interface Course {
  readonly drop: Drop
  readonly amount: number
}

// What's in the bucket at a moment, as a stack of courses from the base
// up: every drop that's landed, less what each flare tipped out of the top
// of whatever was there when it went over.
export const coursesAt = (timeline: Timeline, time: number): ReadonlyArray<Course> =>
  Arr.reduce(timeline.events, [] as ReadonlyArray<Course>, (stack, event) => {
    if (eventTime(event) > time) return stack
    if (event._tag === 'Drop') return [...stack, { drop: event, amount: spreadOf(event, time) }]
    const held = Arr.reduce(stack, 0, (sum, course) => sum + course.amount)
    let lose = held * event.share * spillOf(event, time)
    return Arr.filter(
      Arr.map(Arr.reverse(stack), course => {
        const taken = Math.min(course.amount, lose)
        lose -= taken
        return { ...course, amount: course.amount - taken }
      }),
      course => course.amount > 1e-6,
    ).reverse()
  })

// How full the bucket is, in courses.
export const fillAt = (timeline: Timeline, time: number): number =>
  Arr.reduce(coursesAt(timeline, time), 0, (sum, course) => sum + course.amount)

// The most it's held, up to now: it peaks the moment before a flare.
export const peakAt = (timeline: Timeline, time: number): number =>
  Arr.reduce(
    Arr.filter(flaresOf(timeline), flare => flare.at <= time),
    fillAt(timeline, time),
    (most, flare) => Math.max(most, fillAt(timeline, flare.at)),
  )

// What's on screen at one moment, in world units.
export interface FramePerson {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly grown: number
  // Brightens as they let a drop go.
  readonly giving: number
  // Their last flare's heat, from 1 as it happens to what stays, or 0.
  readonly heat: number
}

export interface FrameDrop {
  readonly x: number
  readonly y: number
  // Where it was a moment ago, for a short streak.
  readonly tail: readonly [number, number]
}

// A course of the fill, counted up from the base in the bucket's own
// frame. The top one can be part spilled or still spreading.
export interface FrameCourse {
  readonly from: number
  readonly level: number
  readonly amount: number
  // 1 as it lands, fading to nothing over a second.
  readonly fresh: number
}

export interface FrameBead {
  readonly x: number
  readonly y: number
  readonly radius: number
  // Still flying, rather than lying on the floor.
  readonly flying: boolean
}

// A spill's puddle on the floor, from the mouth outward.
export interface FramePuddle {
  readonly from: number
  readonly to: number
}

export interface FrameFlash {
  readonly x: number
  readonly y: number
  readonly progress: number
  readonly share: number
}

export interface Frame {
  readonly people: ReadonlyArray<FramePerson>
  readonly drops: ReadonlyArray<FrameDrop>
  readonly courses: ReadonlyArray<FrameCourse>
  readonly beads: ReadonlyArray<FrameBead>
  readonly puddles: ReadonlyArray<FramePuddle>
  readonly flashes: ReadonlyArray<FrameFlash>
  // The bucket's pose: how far over it is, and which way.
  readonly angle: number
  readonly side: 1 | -1
  readonly grown: number
  // How full it is, and the most it held, in courses.
  readonly fill: number
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

// The bucket's pose: whichever flare has it furthest over, tipped as far
// as that flare's share.
const poseAt = (timeline: Timeline, time: number): { readonly angle: number; readonly side: 1 | -1 } =>
  Arr.reduce(flaresOf(timeline), { angle: 0, side: 1 as 1 | -1 }, (pose, flare) => {
    const angle = TIP_ANGLE * Math.min(1, 0.35 + flare.share) * tipOf(flare, time)
    return angle > pose.angle ? { angle, side: flare.side } : pose
  })

// Where a drop falls from its teammate to the fill: across toward the
// bucket, and faster as it goes, like something falling.
const dropPoint = (timeline: Timeline, drop: Drop, fill: number, u: number): readonly [number, number] => {
  const person = timeline.people[drop.from]!
  const surface = BUCKET.base - fill * COURSE
  const x = BUCKET.x + drop.across * halfAt(surface)
  const top = person.y + 0.05
  return [person.x + (x - person.x) * smooth(u), top + (surface - top) * u * u]
}

export const frameAt = (timeline: Timeline, time: number): Frame => {
  const { angle, side } = poseAt(timeline, time)
  const stack = coursesAt(timeline, time)
  const fill = Arr.reduce(stack, 0, (sum, course) => sum + course.amount)
  const drops = dropsOf(timeline)
  const flares = Arr.filter(flaresOf(timeline), flare => flare.at <= time)

  const people = Arr.map(timeline.people, (person, id): FramePerson => {
    const giving = Arr.reduce(drops, 0, (most, drop) => {
      if (drop.from !== id) return most
      const t = (time - drop.start + 0.25) / 0.6
      return t <= 0 || t >= 1 ? most : Math.max(most, Math.sin(Math.PI * t))
    })
    const heat = Option.match(
      Arr.findLast(flares, flare => flare.from === id),
      { onNone: () => 0, onSome: flare => 0.75 + 0.25 * Math.exp(-(time - flare.at) * 3) },
    )
    return { id, x: person.x, y: person.y, grown: smooth((time - id * 0.06) / POP), giving, heat }
  })

  const falling = Arr.flatMap(drops, (drop): ReadonlyArray<FrameDrop> => {
    if (time < drop.start || time >= drop.lands) return []
    const u = (time - drop.start) / FALL
    const [x, y] = dropPoint(timeline, drop, fill, u)
    return [{ x, y, tail: dropPoint(timeline, drop, fill, Math.max(0, u - 0.12)) }]
  })

  const courses = Arr.map(
    stack,
    ({ drop, amount }, level): FrameCourse => ({
      from: drop.from,
      level,
      amount,
      fresh: 1 - clamp01((time - drop.lands) / 1),
    }),
  )

  const beads = Arr.flatMap(flares, (flare): ReadonlyArray<FrameBead> => {
    const pose = posed(TIP_ANGLE * Math.min(1, 0.35 + flare.share), flare.side)
    const over = pose([BUCKET.x, BUCKET.rim])
    return Arr.flatMap(flare.beads, (bead): ReadonlyArray<FrameBead> => {
      const start = flare.at + bead.delay
      if (time < start) return []
      const u = clamp01((time - start) / bead.flight)
      // From the mouth where it was as the bead left, out to the floor.
      const lean = TIP_ANGLE * Math.min(1, 0.35 + flare.share) * tipOf(flare, start)
      const [mx, my] = posed(lean, flare.side)([BUCKET.x + bead.along * BUCKET.rimHalf, BUCKET.rim])
      const lx = over[0] + flare.side * (0.06 + bead.reach * flare.share)
      const x = mx + (lx - mx) * u
      const y = my + (FLOOR - my) * u * u - 0.1 * Math.sin(Math.PI * u) * (1 - u)
      return [{ x, y, radius: bead.radius, flying: u < 1 }]
    })
  })

  const puddles = Arr.map(flares, (flare): FramePuddle => {
    const over = posed(TIP_ANGLE * Math.min(1, 0.35 + flare.share), flare.side)([BUCKET.x, BUCKET.rim])
    const spread = smooth((time - flare.at - SPILL_START) / (SPILL_FOR + 0.3))
    const reach = (0.06 + 0.42 * flare.share) * spread
    return { from: over[0] - flare.side * 0.08 * spread, to: over[0] + flare.side * reach }
  })

  const flashes = Arr.flatMap(flares, (flare): ReadonlyArray<FrameFlash> => {
    const progress = (time - flare.at) / FLASH_FOR
    const from = timeline.people[flare.from]!
    return progress < 1 ? [{ x: from.x, y: from.y, progress, share: flare.share }] : []
  })

  return {
    people,
    drops: falling,
    courses,
    beads,
    puddles,
    flashes,
    angle,
    side,
    grown: smooth(time / POP),
    fill,
    peak: peakAt(timeline, time),
  }
}

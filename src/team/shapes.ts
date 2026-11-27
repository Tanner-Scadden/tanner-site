// NOTE: a frame of the team as lines and dots in CSS px, coloured like the
// rest of the sheet. Both renderers draw exactly this.
//
// Each teammate is a dot that brightens on their beat and sends out a small
// ring. The links between them are the trust: faint at first, thickening
// and turning gold as drops land, each drop a brief brightening along the
// link. Once the team is in step, a ring in the middle beats with them.
//
// The flare is the post's red: a flash ring from whoever flared, and a red
// cast on the links and people it reaches. Whoever flared keeps a little of
// it, and a ring, so the end frame still says who. Every link leaves a
// faint ghost at the most it ever was, so the end frame shows what was
// built as well as what's left.
//
// Along the bottom, the team's trust so far: a slow climb, a cliff, and a
// short way back.
//
// Pointing at a teammate picks them out: their links stay bright, a ring
// goes round them, and the rest dims.

import { Array as Arr, Option } from 'effect'

import type { Dot, Line, Point, Rgba, Shapes } from '../blog/animation/scene.ts'
import {
  BOUNDS,
  END,
  FLARE,
  type Frame,
  type FrameLink,
  type FramePerson,
  MAX_LINKS,
  MAX_PEOPLE,
  TRACE_STEP,
  WAVE_SPEED,
  smooth,
} from './rhythm.ts'

type Rgb = readonly [number, number, number]

// The sheet's line colour, its gold, a warm white, and the post's red.
const LINE: Rgb = [0.86, 0.92, 1]
const GOLD: Rgb = [1, 0.82, 0.4]
const WARM: Rgb = [1, 0.94, 0.8]
const ALARM: Rgb = [1, 0.42, 0.38]

// Every link and its ghost, the trace's segments and its baseline.
export const MAX_LINES = MAX_LINKS * 2 + Math.ceil(END / TRACE_STEP) + 4
// Everyone and their rings, plus the shared beat, the flash, the ring
// round whoever flared, the trace's head and flare mark, and the picked
// ring.
export const MAX_DOTS = MAX_PEOPLE * 2 + 8

// Where the trace sits, in world units: across most of the width, below
// the team.
const TRACE = { left: -1.25, right: 1.25, top: 0.5, bottom: 0.8 } as const

const rgba = (rgb: Rgb, alpha: number): Rgba => [rgb[0], rgb[1], rgb[2], alpha]
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
const easeOut = (t: number) => 1 - (1 - t) ** 3

// Scale and centre the world box into a canvas this big.
export const projection = (width: number, height: number) => {
  const scale = Math.min(width / (BOUNDS.x * 2 + 0.2), height / (BOUNDS.y * 2 + 0.2))
  return {
    scale,
    px: ([x, y]: Point): Point => [width / 2 + x * scale, height / 2 + y * scale],
  }
}

// Where a moment of the trace sits, in world units.
export const tracePoint = ([time, trust]: readonly [number, number]): Point => [
  TRACE.left + (TRACE.right - TRACE.left) * (time / END),
  TRACE.bottom - (TRACE.bottom - TRACE.top) * trust,
]

// How close, in px, the pointer has to be to pick someone out.
const REACH = 18
// How much of itself the rest keeps while someone's picked.
const DIMMED = 0.3

const pickedBy = (frame: Frame, px: (point: Point) => Point, pointer: Option.Option<Point>): Option.Option<number> =>
  Option.flatMap(pointer, ([x, y]) => {
    let best = Option.none<number>()
    let nearest = REACH * REACH
    for (const person of frame.people) {
      if (person.grown < 0.5) continue
      const [dx, dy] = px([person.x, person.y])
      const distance = (dx - x) ** 2 + (dy - y) ** 2
      if (distance < nearest) {
        nearest = distance
        best = Option.some(person.id)
      }
    }
    return best
  })

const radiusOf = (person: FramePerson) => 4.5 + 2.5 * person.beat

const colourOf = (person: FramePerson): Rgb =>
  mix(mix(WARM, GOLD, person.bond), ALARM, Math.max(person.heat, person.scar))

export const shapesOf = (
  frame: Frame,
  width: number,
  height: number,
  pointer: Option.Option<Point> = Option.none(),
): Shapes => {
  const { scale, px } = projection(width, height)
  const picked = pickedBy(frame, px, pointer)
  const touches = (link: FrameLink) =>
    Option.match(picked, { onNone: () => true, onSome: id => link.a === id || link.b === id })
  const near = (id: number) =>
    Option.match(picked, {
      onNone: () => true,
      onSome: p => p === id || Arr.some(frame.links, link => touches(link) && (link.a === id || link.b === id)),
    })
  const faded = ([r, g, b, a]: Rgba, keep: boolean): Rgba => [r, g, b, keep ? a : a * DIMMED]
  const grownOf = (link: FrameLink) => Math.min(frame.people[link.a]!.grown, frame.people[link.b]!.grown)

  // What each link was at its strongest, left behind once it's lost.
  const ghosts = Arr.map(frame.links, (link): Line => {
    const lost = smooth((link.peak - link.weight) / 0.25)
    return {
      from: px(link.from),
      to: px(link.to),
      width: 2 + 5 * link.peak,
      color: faded(rgba(mix(GOLD, LINE, 0.35), 0.16 * lost), touches(link)),
    }
  })

  const links = Arr.map(frame.links, (link): Line => {
    const { weight, drop, heat } = link
    const beat = (frame.people[link.a]!.beat + frame.people[link.b]!.beat) / 2
    const lit = Option.isSome(picked) && touches(link)
    const alpha = Math.min(1, (0.1 + 0.62 * weight + 0.22 * drop + 0.12 * weight * beat) * (1 - heat) + 0.85 * heat)
    return {
      from: px(link.from),
      to: px(link.to),
      width: 0.7 + 3 * weight + 0.6 * drop + (lit ? 1 : 0),
      color: faded(
        rgba(mix(mix(LINE, GOLD, Math.min(1, weight * 1.4)), ALARM, heat), alpha * grownOf(link)),
        touches(link),
      ),
    }
  })

  // The trace: gold as trust builds, red where it's lost, and back to gold,
  // dimmer, as it slowly comes back.
  const points = Arr.map(frame.trace, sample => ({ time: sample[0], at: px(tracePoint(sample)) }))
  const trace = Arr.flatMap(
    Arr.zip(points, Arr.drop(points, 1)),
    ([from, to]): ReadonlyArray<Line> => {
      const losing = from.time >= FLARE && from.time < FLARE + 1.4
      const after = from.time >= FLARE + 1.4
      return [
        {
          from: from.at,
          to: to.at,
          width: 1.5,
          color: faded(losing ? rgba(ALARM, 0.9) : rgba(GOLD, after ? 0.6 : 0.8), Option.isNone(picked)),
        },
      ]
    },
  )
  const baseline: Line = {
    from: px([TRACE.left, TRACE.bottom]),
    to: px([TRACE.right, TRACE.bottom]),
    width: 1,
    color: rgba(LINE, 0.14),
  }

  // Each teammate's ring on their beat, gold and brighter the more bonded
  // they are.
  const rings = Arr.flatMap(frame.people, (person): ReadonlyArray<Dot> => {
    if (person.cycle >= 0.5) return []
    const c = person.cycle / 0.5
    const [x, y] = px([person.x, person.y])
    return [
      {
        x,
        y,
        radius: 7 + 18 * easeOut(c),
        glow: 0,
        ring: 1.2,
        color: faded(
          rgba(colourOf(person), (0.12 + 0.4 * person.bond) * (1 - c) * person.grown),
          Option.isNone(picked),
        ),
      },
    ]
  })

  const shared = Option.flatMap(frame.shared, ({ x, y, cycle, strength }): Option.Option<Dot> => {
    if (cycle >= 0.6) return Option.none()
    const c = cycle / 0.6
    const [cx, cy] = px([x, y])
    return Option.some({
      x: cx,
      y: cy,
      radius: 6 + scale * 0.32 * easeOut(c),
      glow: 0,
      ring: 1.5,
      color: faded(rgba(GOLD, 0.4 * strength * (1 - c)), Option.isNone(picked)),
    })
  })

  const flash = Option.map(frame.flash, ({ x, y, progress }): Dot => {
    const [fx, fy] = px([x, y])
    return {
      x: fx,
      y: fy,
      radius: 8 + scale * WAVE_SPEED * 1.4 * progress,
      glow: 0,
      ring: 2.5,
      color: rgba(ALARM, 0.85 * (1 - progress) ** 1.5),
    }
  })

  const people = Arr.map(frame.people, (person): Dot => {
    const [x, y] = px([person.x, person.y])
    const glow = (4 + 10 * person.beat) * (0.35 + 0.65 * person.bond) + 18 * person.heat
    return {
      x,
      y,
      radius: radiusOf(person) * person.grown,
      glow: glow * person.grown,
      ring: 0,
      color: faded(rgba(colourOf(person), 0.95), near(person.id)),
    }
  })

  // A ring round whoever flared, so the end still says who.
  const marked = Arr.flatMap(frame.people, (person): ReadonlyArray<Dot> => {
    if (!person.flarer || person.scar <= 0) return []
    const [x, y] = px([person.x, person.y])
    return [{ x, y, radius: 11, glow: 0, ring: 1.5, color: faded(rgba(ALARM, 1.3 * person.scar), near(person.id)) }]
  })

  const head = Option.map(Arr.last(points), ({ at }): Dot => ({
    x: at[0],
    y: at[1],
    radius: 2.5,
    glow: 6,
    ring: 0,
    color: faded(rgba(GOLD, 0.9), Option.isNone(picked)),
  }))
  const flared = Option.map(frame.flared, (sample): Dot => {
    const [x, y] = px(tracePoint(sample))
    return { x, y, radius: 3, glow: 6, ring: 0, color: faded(rgba(ALARM, 1), Option.isNone(picked)) }
  })

  const halo = Option.flatMap(picked, id =>
    Option.map(
      Arr.get(frame.people, id),
      (person): Dot => {
        const [x, y] = px([person.x, person.y])
        return { x, y, radius: radiusOf(person) + (person.flarer ? 10 : 6), glow: 0, ring: 1.5, color: rgba(WARM, 0.9) }
      },
    ),
  )

  return {
    lines: [...ghosts, ...links, baseline, ...trace],
    dots: [
      ...Option.toArray(shared),
      ...rings,
      ...Option.toArray(flash),
      ...people,
      ...marked,
      ...Option.toArray(flared),
      ...Option.toArray(head),
      ...Option.toArray(halo),
    ],
  }
}

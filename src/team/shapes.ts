// NOTE: a frame of the team and their bucket as lines and dots in CSS px,
// coloured like the rest of the sheet. Both renderers draw exactly this.
//
// The bucket is drawn like a part on a technical drawing: thin outline, a
// lip at the rim and its near edge, a dashed centreline, and the floor it stands
// on, hatched underneath. What's in it is a stack of gold courses, one per
// drop, the newest bright as it lands. Once something's been lost, a dashed
// high-water line and a small level mark stay at the most it ever held.
//
// The teammates are a row of dots, linked only to their neighbours. A drop
// is a gold bead with a short streak. A flare is the post's red: a flash
// ring from whoever flared, a ring that stays round them, and the spill,
// red beads and a puddle on the floor where the bucket went over.
//
// Pointing at a teammate picks them out: a ring goes round them, and their
// courses in the bucket stay bright while the rest dims.

import { Array as Arr, Option } from 'effect'

import type { Dot, Line, Point, Rgba, Shapes } from '../blog/animation/scene.ts'
import {
  AFTER,
  BEFORE,
  BOUNDS,
  BUCKET,
  COURSE,
  FLOOR,
  type Frame,
  MAX_FLARES,
  PEOPLE,
  SPRAY,
  halfAt,
  posed,
} from './bucket.ts'

type Rgb = readonly [number, number, number]

// The sheet's line colour, its gold, a warm white, and the post's red.
const LINE: Rgb = [0.86, 0.92, 1]
const GOLD: Rgb = [1, 0.82, 0.4]
const WARM: Rgb = [1, 0.94, 0.8]
const ALARM: Rgb = [1, 0.42, 0.38]

// The floor runs this far either side, hatched this often underneath.
const FLOOR_HALF = 1.5
const HATCHES = 16
const RIM_ARC = 12
const CENTRELINE = 7
const HIGH_WATER = 9
const MAX_COURSES = BEFORE + AFTER

// The floor and its hatching, the bucket's outline, lip, near rim and
// centreline, the high-water mark, every course, a streak per drop, the
// neighbour links, and a puddle per flare.
export const MAX_LINES =
  1 + HATCHES + 6 + RIM_ARC + CENTRELINE + HIGH_WATER + 3 + MAX_COURSES + MAX_COURSES + (PEOPLE - 1) + MAX_FLARES
// Everyone, a giving ring and a flare ring each, every flash, every drop,
// every bead, and the picked ring.
export const MAX_DOTS = PEOPLE * 3 + MAX_FLARES + MAX_COURSES + MAX_FLARES * SPRAY + 1

const rgba = (rgb: Rgb, alpha: number): Rgba => [rgb[0], rgb[1], rgb[2], Math.min(1, Math.max(0, alpha))]
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

// A dashed line, as this many dashes.
const dashed = (from: Point, to: Point, dashes: number, fill: number): ReadonlyArray<readonly [Point, Point]> =>
  Arr.map(Arr.range(0, dashes - 1), i => {
    const a = i / dashes
    const b = (i + fill) / dashes
    return [
      [from[0] + (to[0] - from[0]) * a, from[1] + (to[1] - from[1]) * a],
      [from[0] + (to[0] - from[0]) * b, from[1] + (to[1] - from[1]) * b],
    ] as const
  })

export const shapesOf = (
  frame: Frame,
  width: number,
  height: number,
  pointer: Option.Option<Point> = Option.none(),
): Shapes => {
  const { scale, px } = projection(width, height)
  const picked = pickedBy(frame, px, pointer)
  const mine = (id: number) => Option.match(picked, { onNone: () => true, onSome: p => p === id })
  const faded = ([r, g, b, a]: Rgba, keep: boolean): Rgba => [r, g, b, keep ? a : a * DIMMED]
  const unpicked = Option.isNone(picked)
  const g = frame.grown
  // The bucket's own frame, posed and then onto the canvas.
  const pose = posed(frame.angle, frame.side)
  const at = (point: Point): Point => px(pose(point))
  const line = (from: Point, to: Point, width: number, color: Rgba): Line => ({ from, to, width, color })

  // The floor, hatched underneath like a section.
  const floor = line(px([-FLOOR_HALF, FLOOR]), px([FLOOR_HALF, FLOOR]), 1, rgba(LINE, 0.32 * g))
  const hatches = Arr.map(Arr.range(0, HATCHES - 1), i => {
    const x = -FLOOR_HALF + 0.04 + ((FLOOR_HALF * 2 - 0.12) * i) / (HATCHES - 1)
    return line(px([x + 0.07, FLOOR + 0.005]), px([x, FLOOR + 0.07]), 1, rgba(LINE, 0.13 * g))
  })

  // The bucket: walls, base, and a doubled lip at the rim. Tinted red
  // while it's over.
  const over = Math.min(1, frame.angle / 0.6)
  const ink = mix(LINE, mix(LINE, ALARM, 0.55), over)
  const outline = rgba(ink, 0.85 * g)
  const { base, rim, baseHalf, rimHalf } = BUCKET
  const lip = rim + 0.03
  const walls = [
    line(at([-baseHalf, base]), at([-rimHalf, rim]), 1.6, outline),
    line(at([baseHalf, base]), at([rimHalf, rim]), 1.6, outline),
    line(at([-baseHalf, base]), at([baseHalf, base]), 1.6, outline),
    line(at([-rimHalf - 0.02, rim]), at([rimHalf + 0.02, rim]), 1.6, outline),
    line(at([-rimHalf - 0.02, rim]), at([-rimHalf + 0.004, lip]), 1, rgba(ink, 0.5 * g)),
    line(at([rimHalf + 0.02, rim]), at([rimHalf - 0.004, lip]), 1, rgba(ink, 0.5 * g)),
  ]
  // The near edge of the rim, seen from a little above.
  const arc = Arr.map(Arr.range(0, RIM_ARC), i => {
    const t = Math.PI * (i / RIM_ARC)
    return at([-rimHalf * Math.cos(t), rim + 0.09 * Math.sin(t)])
  })
  const nearRim = Arr.map(Arr.zip(arc, Arr.drop(arc, 1)), ([a, b]) => line(a, b, 1, rgba(ink, 0.3 * g)))
  // A dashed centreline, past the rim and the base, like a drawing.
  const centreline = Arr.map(dashed([0, base + 0.05], [0, rim - 0.1], CENTRELINE, 0.55), ([a, b]) =>
    line(at(a), at(b), 1, rgba(LINE, 0.12 * g)),
  )

  // The fill: a course for each drop, bright as it lands.
  const levelOf = (level: number) => base - BUCKET.wall * 0.6 - (level + 0.5) * COURSE
  const courses = Arr.map(frame.courses, course => {
    const y = levelOf(course.level)
    const half = halfAt(y) * Math.min(1, course.amount)
    const colour = mix(GOLD, WARM, course.fresh * 0.7)
    return line(
      at([-half, y]),
      at([half, y]),
      COURSE * scale * 0.58,
      faded(rgba(colour, (0.78 + 0.22 * course.fresh) * Math.min(1, course.amount * 2)), mine(course.from)),
    )
  })

  // The high-water mark, once some of it's been lost: dashed across at the
  // most it held, and a small level triangle on the wall.
  const lost = Math.min(1, Math.max(0, (frame.peak - frame.fill - 0.5) / 2)) * (1 - over)
  const peakY = levelOf(frame.peak - 0.5)
  const peakHalf = halfAt(peakY) + BUCKET.wall
  const highWater =
    lost > 0
    ? [
        ...Arr.map(dashed([-peakHalf, peakY], [peakHalf, peakY], HIGH_WATER, 0.5), ([a, b]) =>
          line(at(a), at(b), 1, rgba(GOLD, 0.45 * lost)),
        ),
        ...(() => {
          const tip: Point = [peakHalf + 0.07, peakY]
          const l: Point = [peakHalf + 0.03, peakY - 0.06]
          const r: Point = [peakHalf + 0.11, peakY - 0.06]
          const c = rgba(GOLD, 0.55 * lost)
          return [line(at(l), at(r), 1, c), line(at(r), at(tip), 1, c), line(at(tip), at(l), 1, c)]
        })(),
      ]
    : []

  const streaks = Arr.map(frame.drops, drop =>
    line(px(drop.tail), px([drop.x, drop.y]), 1.5, rgba(GOLD, 0.45)),
  )

  // Neighbours only, faint: a row, not a web.
  const links = Arr.map(Arr.zip(frame.people, Arr.drop(frame.people, 1)), ([a, b]) =>
    line(px([a.x, a.y]), px([b.x, b.y]), 1, faded(rgba(LINE, 0.14 * Math.min(a.grown, b.grown)), unpicked)),
  )

  const puddles = Arr.map(frame.puddles, puddle =>
    line(px([puddle.from, FLOOR - 0.008]), px([puddle.to, FLOOR - 0.008]), 3, rgba(ALARM, 0.75)),
  )

  const flashes = Arr.map(frame.flashes, (flash): Dot => {
    const [x, y] = px([flash.x, flash.y])
    return {
      x,
      y,
      radius: 8 + scale * (0.2 + 0.15 * flash.share) * easeOut(flash.progress),
      glow: 0,
      ring: 2.5,
      color: rgba(ALARM, 0.9 * (1 - flash.progress) ** 1.5),
    }
  })

  const colourOf = (giving: number, heat: number): Rgb => mix(mix(WARM, GOLD, 0.5 + 0.5 * giving), ALARM, heat)
  const people = Arr.map(frame.people, (person): Dot => {
    const [x, y] = px([person.x, person.y])
    return {
      x,
      y,
      radius: (5 + 1.5 * person.giving) * person.grown,
      glow: (5 + 9 * person.giving + 14 * person.heat) * person.grown,
      ring: 0,
      color: faded(rgba(colourOf(person.giving, person.heat), 0.95), mine(person.id)),
    }
  })
  // A small ring as someone lets a drop go, and one that stays round
  // whoever flared.
  const giving = Arr.flatMap(frame.people, (person): ReadonlyArray<Dot> => {
    if (person.giving <= 0.02) return []
    const [x, y] = px([person.x, person.y])
    return [{ x, y, radius: 9, glow: 0, ring: 1.2, color: faded(rgba(GOLD, 0.5 * person.giving), mine(person.id)) }]
  })
  const marked = Arr.flatMap(frame.people, (person): ReadonlyArray<Dot> => {
    if (person.heat <= 0) return []
    const [x, y] = px([person.x, person.y])
    return [{ x, y, radius: 11, glow: 0, ring: 1.5, color: faded(rgba(ALARM, person.heat), mine(person.id)) }]
  })

  const drops = Arr.map(frame.drops, (drop): Dot => {
    const [x, y] = px([drop.x, drop.y])
    return { x, y, radius: 3, glow: 8, ring: 0, color: rgba(GOLD, 1) }
  })
  const beads = Arr.map(frame.beads, (bead): Dot => {
    const [x, y] = px([bead.x, bead.y])
    return {
      x,
      y: bead.flying ? y : y - bead.radius,
      radius: bead.radius,
      glow: bead.flying ? 5 : 0,
      ring: 0,
      color: rgba(ALARM, bead.flying ? 0.95 : 0.8),
    }
  })

  const halo = Option.flatMap(picked, id =>
    Option.map(
      Arr.get(frame.people, id),
      (person): Dot => {
        const [x, y] = px([person.x, person.y])
        return { x, y, radius: person.heat > 0 ? 16 : 11, glow: 0, ring: 1.5, color: rgba(WARM, 0.9) }
      },
    ),
  )

  return {
    lines: [
      floor,
      ...hatches,
      ...links,
      ...centreline,
      ...nearRim,
      ...courses,
      ...highWater,
      ...walls,
      ...puddles,
      ...streaks,
    ],
    dots: [...flashes, ...giving, ...people, ...marked, ...beads, ...drops, ...Option.toArray(halo)],
  }
}

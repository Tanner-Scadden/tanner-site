import { Array as Arr, Option } from 'effect'

import { GOLD, LINE, type Projection, RED, type Rgb, WARM, mix, rgba } from '../../animation/kit.ts'
import type { Dot, Line, Point, Rgba, Shapes } from '../../animation/scene.ts'
import {
  BOUNDS,
  BUCKET,
  FLOOR,
  type Frame,
  INNER_BASE,
  MAX_KICKS,
  PEOPLE,
  RIPPLE_FOR,
  SPRAY,
  easeOut,
  halfAt,
  levelOf,
  posed,
  surfaceAt,
} from './bucket.ts'

// The floor runs this far either side, hatched this often underneath.
const FLOOR_HALF = 1.5
const HATCHES = 16
const RIM_ARC = 12
const CENTRELINE = 7
const HIGH_WATER = 9
// The water's surface is drawn in this many pieces, and its body hatched
// no closer than this, in world units, so the line count has a ceiling.
const SURFACE = 28
const BODY_STEP = 0.02
const BODY = Math.ceil((INNER_BASE - BUCKET.rim) / BODY_STEP) + 12
// The most drops in the air or rippling at once.
const MAX_DROPS = 8

// The floor and its hatching, the bucket's outline, lip, near rim and
// centreline, the high-water mark, the water's body and surface, a streak
// per drop, the neighbour links, and a puddle per kick.
export const MAX_LINES =
  1 + HATCHES + 6 + RIM_ARC + CENTRELINE + HIGH_WATER + 3 + BODY + SURFACE + MAX_DROPS + (PEOPLE - 1) + MAX_KICKS * 2
// Everyone, a giving ring and a kick ring each, every flash and strike
// ring, every drop and its splash rings, every bead, and the picked ring.
export const MAX_DOTS = PEOPLE * 3 + MAX_KICKS * 2 + MAX_DROPS * 3 + MAX_KICKS * SPRAY + 1

// Scale and centre the world box into a canvas this big.
export const projection: Projection = (width, height) => {
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
  const over = Math.min(1, frame.angle / 0.25)
  const ink = mix(LINE, mix(LINE, RED, 0.55), over)
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

  // The water. Nothing above the rim, and nothing at all once it's gone.
  const { water } = frame
  const top = rim + 0.01
  const surfaceY = (x: number) => Math.min(INNER_BASE, Math.max(top, surfaceAt(water, x)))
  const wet = water.amount > 0.05
  // The body: hatching parallel to the surface, from just under it down
  // to the floor of the bucket, each line cut by the walls and the floor.
  // The inside half-width is P - Q y, so a line y = c - m x meets the right
  // wall at x = (P - Q c) / (1 - Q m) and the left at (Q c - P) / (1 + Q m).
  const step = Math.max(BODY_STEP, 3.6 / scale)
  const Q = (BUCKET.rimHalf - BUCKET.baseHalf) / (BUCKET.base - BUCKET.rim)
  const P = halfAt(0) - 0.004
  const m = water.slope
  const body = wet
    ? Arr.flatMap(Arr.range(0, BODY - 1), (i): ReadonlyArray<Line> => {
        const c = water.level + step * (i + 0.7)
        let lo = (Q * c - P) / (1 + Q * m)
        let hi = (P - Q * c) / (1 - Q * m)
        // Above the floor of the bucket: c - m x <= INNER_BASE.
        if (m > 1e-9) lo = Math.max(lo, (c - INNER_BASE) / m)
        else if (m < -1e-9) hi = Math.min(hi, (c - INNER_BASE) / m)
        else if (c > INNER_BASE) return []
        // And below the rim, where the surface is held to it.
        if (m > 1e-9) hi = Math.min(hi, (c - top) / m)
        else if (m < -1e-9) lo = Math.max(lo, (c - top) / m)
        if (hi - lo < 0.012) return []
        // Fainter with depth, so the surface reads first.
        const depth = Math.min(1, (step * i) / 0.3)
        return [line(at([lo, c - m * lo]), at([hi, c - m * hi]), 1, rgba(GOLD, (0.5 - 0.22 * depth) * g))]
      })
    : []
  const edge = halfAt(levelOf(water.amount)) - 0.004
  // Kept inside the walls where the surface tilts toward the narrower
  // part of the bucket.
  const points = Arr.map(Arr.range(0, SURFACE), i => {
    const x = -edge + (2 * edge * i) / SURFACE
    const y = surfaceY(x)
    const inside = halfAt(y) - 0.004
    return at([Math.max(-inside, Math.min(inside, x)), y])
  })
  const surface = wet
    ? Arr.map(Arr.zip(points, Arr.drop(points, 1)), ([a, b]) => line(a, b, 1.8, rgba(mix(GOLD, WARM, 0.35), 0.95 * g)))
    : []

  // The high-water mark, once some of it's been lost: dashed across at the
  // most it held, and a small level triangle on the wall.
  const lost = Math.min(1, Math.max(0, (frame.peak - frame.water.amount - 0.5) / 2)) * (1 - over)
  const peakY = levelOf(frame.peak)
  const peakHalf = halfAt(peakY) + BUCKET.wall
  const highWater =
    lost > 0
      ? [
          ...Arr.map(dashed([-peakHalf, peakY], [peakHalf, peakY], HIGH_WATER, 0.5), ([a, b]) =>
            line(at(a), at(b), 1, rgba(GOLD, 0.5 * lost)),
          ),
          ...(() => {
            const tip: Point = [peakHalf + 0.07, peakY]
            const l: Point = [peakHalf + 0.03, peakY - 0.06]
            const r: Point = [peakHalf + 0.11, peakY - 0.06]
            const c = rgba(GOLD, 0.6 * lost)
            return [line(at(l), at(r), 1, c), line(at(r), at(tip), 1, c), line(at(tip), at(l), 1, c)]
          })(),
        ]
      : []

  const streaks = Arr.map(frame.drops, drop => line(px(drop.tail), px([drop.x, drop.y]), 1.5, rgba(GOLD, 0.45)))

  // A small ring where each drop hits, and a second, later and wider.
  const splashes = Arr.flatMap(water.ripples, (ripple): ReadonlyArray<Dot> => {
    const [x, y] = at([ripple.x, surfaceY(ripple.x)])
    return Arr.flatMap([0, 0.14], (delay): ReadonlyArray<Dot> => {
      const t = (ripple.age - delay) / 0.7
      if (t <= 0 || t >= 1 || ripple.age > RIPPLE_FOR) return []
      return [{ x, y, radius: 2 + 11 * easeOut(t), glow: 0, ring: 1, color: rgba(WARM, 0.55 * (1 - t) ** 2) }]
    })
  })

  // Neighbours only, faint: a row, not a web.
  const links = Arr.map(Arr.zip(frame.people, Arr.drop(frame.people, 1)), ([a, b]) =>
    line(px([a.x, a.y]), px([b.x, b.y]), 1, faded(rgba(LINE, 0.14 * Math.min(a.grown, b.grown)), unpicked)),
  )

  // The spill: a puddle on the floor, bright while it's fresh, with a
  // thinner sheen along its top.
  const puddles = Arr.flatMap(frame.puddles, (puddle): ReadonlyArray<Line> => {
    if (Math.abs(puddle.to - puddle.from) < 0.005) return []
    return [
      line(px([puddle.from, FLOOR - 0.008]), px([puddle.to, FLOOR - 0.008]), 3, rgba(RED, 0.55 + 0.3 * puddle.fresh)),
      line(
        px([puddle.from + (puddle.to - puddle.from) * 0.15, FLOOR - 0.022]),
        px([puddle.from + (puddle.to - puddle.from) * 0.7, FLOOR - 0.022]),
        1,
        rgba(RED, 0.25 + 0.35 * puddle.fresh),
      ),
    ]
  })

  // The kick: a red strike from whoever kicked to the wall, and a ring
  // where it lands.
  const strikes = Arr.flatMap(frame.strikes, (strike): ReadonlyArray<Line> => {
    if (strike.strength <= 0) return []
    const to: Point = [
      strike.from[0] + (strike.to[0] - strike.from[0]) * strike.reach,
      strike.from[1] + (strike.to[1] - strike.from[1]) * strike.reach,
    ]
    return [line(px(strike.from), px(to), 2, rgba(RED, 0.8 * strike.strength))]
  })
  const impacts = Arr.flatMap(frame.strikes, (strike): ReadonlyArray<Dot> => {
    if (strike.reach < 1 || strike.strength <= 0) return []
    const [x, y] = px(strike.to)
    return [{ x, y, radius: 4 + 14 * (1 - strike.strength), glow: 0, ring: 2, color: rgba(RED, strike.strength) }]
  })

  const flashes = Arr.map(frame.flashes, (flash): Dot => {
    const [x, y] = px([flash.x, flash.y])
    return {
      x,
      y,
      radius: 8 + scale * (0.2 + 0.15 * flash.share) * easeOut(flash.progress),
      glow: 0,
      ring: 2.5,
      color: rgba(RED, 0.9 * (1 - flash.progress) ** 1.5),
    }
  })

  const colourOf = (giving: number, heat: number): Rgb => mix(mix(WARM, GOLD, 0.5 + 0.5 * giving), RED, heat)
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
  // whoever kicked.
  const giving = Arr.flatMap(frame.people, (person): ReadonlyArray<Dot> => {
    if (person.giving <= 0.02) return []
    const [x, y] = px([person.x, person.y])
    return [{ x, y, radius: 9, glow: 0, ring: 1.2, color: faded(rgba(GOLD, 0.5 * person.giving), mine(person.id)) }]
  })
  const marked = Arr.flatMap(frame.people, (person): ReadonlyArray<Dot> => {
    if (person.heat <= 0) return []
    const [x, y] = px([person.x, person.y])
    return [{ x, y, radius: 11, glow: 0, ring: 1.5, color: faded(rgba(RED, person.heat), mine(person.id)) }]
  })

  const drops = Arr.map(frame.drops, (drop): Dot => {
    const [x, y] = px([drop.x, drop.y])
    return { x, y, radius: 3, glow: 8, ring: 0, color: rgba(GOLD, 1) }
  })
  const beads = Arr.map(frame.beads, (bead): Dot => {
    const [x, y] = px([bead.x, bead.y])
    return {
      x,
      y: bead.flying ? y : y - bead.radius * 0.6,
      radius: bead.flying ? bead.radius : bead.radius * 0.8,
      glow: bead.flying ? 5 : 0,
      ring: 0,
      color: rgba(RED, bead.flying ? 0.95 : 0.6),
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
      ...body,
      ...nearRim,
      ...surface,
      ...highWater,
      ...walls,
      ...puddles,
      ...streaks,
      ...strikes,
    ],
    dots: [
      ...flashes,
      ...giving,
      ...people,
      ...marked,
      ...splashes,
      ...impacts,
      ...beads,
      ...drops,
      ...Option.toArray(halo),
    ],
  }
}

// NOTE: a frame of the network as lines and dots in CSS px, coloured like
// the rest of the sheet. Both renderers draw exactly this, so the WebGPU
// and 2D versions look the same.
//
// Gold is you and the people you've helped. The people one link past them
// are a warm white, and light up when you help the person they came with.
// Everyone further out is the sheet's faint line colour.
//
// When you jump, the network dims so the calls stand out. A call is a gold
// spark that leaves a gold trail behind it, and whoever made it keeps a
// gold ring, so the finished frame still shows who called and how the call
// found you.
//
// Pointing at someone picks them out: their links and the people on the
// other end stay bright, a ring goes round them, and the rest dims.

import { Array as Arr, Option } from 'effect'

import type { Dot, Line, Point, Rgba, Shapes } from '../blog/animation/scene.ts'
import { BOUNDS, type Frame, type FrameDot, type FrameEdge, MAX_CALLS, MAX_EDGES, MAX_NODES } from './graph.ts'

type Rgb = readonly [number, number, number]

// The sheet's line colour, its gold, and a warm white.
const LINE: Rgb = [0.86, 0.92, 1]
const GOLD: Rgb = [1, 0.82, 0.4]
const WARM: Rgb = [1, 0.94, 0.8]

// The most a frame draws: every link plus a trail per link a call crosses,
// and everyone, plus rings, callers' rings, sparks and the picked ring.
export const MAX_LINES = MAX_EDGES + MAX_CALLS * 6
export const MAX_DOTS = MAX_NODES + MAX_CALLS * 4 + 16

// How much of itself the network keeps once you've jumped.
const QUIET = 0.45
const HELPED_QUIET = 0.75

const rgba = (rgb: Rgb, alpha: number): Rgba => [rgb[0], rgb[1], rgb[2], alpha]
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

const edgeStyle = (edge: FrameEdge): { readonly width: number; readonly color: Rgba } => {
  switch (edge.kind) {
    case 'yours':
      return { width: 1.5, color: rgba(GOLD, 0.55 + 0.35 * edge.lit) }
    case 'circle':
      return {
        width: 1 + edge.lit,
        color: rgba(mix(WARM, GOLD, edge.lit), 0.32 + 0.5 * edge.lit),
      }
    case 'remote':
      return { width: 1, color: rgba(LINE, 0.22 + 0.4 * edge.lit) }
  }
}

const dotStyle = (dot: FrameDot): { readonly radius: number; readonly glow: number; readonly color: Rgba } => {
  if (dot.caller && dot.kind !== 'you') return { radius: 4.5, glow: 10, color: rgba(GOLD, 1) }
  if (dot.relayed) return { radius: 4.2, glow: 6, color: rgba(GOLD, 0.95) }
  switch (dot.kind) {
    case 'you':
      return { radius: 7, glow: 14, color: rgba(GOLD, 1) }
    case 'met':
      return { radius: 4.5, glow: 10 * dot.lit, color: rgba(GOLD, 0.95) }
    case 'circle':
      return {
        radius: 3.2 + dot.lit,
        glow: 8 * dot.lit,
        color: rgba(mix(WARM, GOLD, dot.lit), 0.85),
      }
    case 'stranger':
      return { radius: 3, glow: 0, color: rgba(mix(LINE, WARM, dot.lit), 0.55 + 0.3 * dot.lit) }
  }
}

// Scale and centre the world box into a canvas this big.
export const projection = (width: number, height: number) => {
  const scale = Math.min(width / (BOUNDS.x * 2 + 0.2), height / (BOUNDS.y * 2 + 0.2))
  return ([x, y]: Point): Point => [width / 2 + x * scale, height / 2 + y * scale]
}

// How close, in px, the pointer has to be to pick someone out.
const REACH = 16
// How much of itself the rest of the network keeps while someone's picked.
const DIMMED = 0.3

// The person nearest the pointer, if anyone's close enough.
const pickedBy = (frame: Frame, px: (point: Point) => Point, pointer: Option.Option<Point>): Option.Option<number> =>
  Option.flatMap(pointer, ([x, y]) => {
    let best = Option.none<number>()
    let nearest = REACH * REACH
    for (const dot of frame.dots) {
      if (dot.grown < 0.5) continue
      const [dx, dy] = px([dot.x, dot.y])
      const distance = (dx - x) ** 2 + (dy - y) ** 2
      if (distance < nearest) {
        nearest = distance
        best = Option.some(dot.id)
      }
    }
    return best
  })

export const shapesOf = (
  frame: Frame,
  width: number,
  height: number,
  pointer: Option.Option<Point> = Option.none(),
): Shapes => {
  const px = projection(width, height)
  const picked = pickedBy(frame, px, pointer)
  const near = Option.match(picked, {
    onNone: () => new Set<number>(),
    onSome: id =>
      new Set<number>([
        id,
        ...Arr.flatMap(frame.edges, edge => (edge.a === id ? [edge.b] : edge.b === id ? [edge.a] : [])),
      ]),
  })
  const touches = (edge: { readonly a: number; readonly b: number }) =>
    Option.match(picked, {
      onNone: () => true,
      onSome: id => edge.a === id || edge.b === id,
    })
  const shown = (id: number) => Option.isNone(picked) || near.has(id)
  const faded = ([r, g, b, a]: Rgba, keep: boolean): Rgba => [r, g, b, keep ? a : a * DIMMED]
  // Once you've jumped, everything but you and the calls steps back.
  // The people you helped step back less: they're the net.
  const hushOf = (keep: number) => 1 - (1 - keep) * frame.quiet
  const hushed = ([r, g, b, a]: Rgba, keep: number): Rgba => [r, g, b, a * hushOf(keep)]

  const links = Arr.map(frame.edges, (edge): Line => {
    const style = edgeStyle(edge)
    const lit = Option.isSome(picked) && touches(edge)
    return {
      from: px(edge.from),
      to: px(edge.to),
      width: lit ? style.width + 1 : style.width,
      color: lit
        ? [style.color[0], style.color[1], style.color[2], Math.max(style.color[3], 0.85)]
        : faded(hushed(style.color, edge.kind === 'yours' ? HELPED_QUIET : QUIET), touches(edge)),
    }
  })

  const trails = Arr.map(
    frame.trails,
    (trail): Line => ({
      from: px(trail.from),
      to: px(trail.to),
      width: 2.5,
      // Pointing at whoever called keeps their whole call lit.
      color: faded(
        rgba(GOLD, 0.95),
        touches(trail) || Option.exists(picked, id => id === trail.caller),
      ),
    }),
  )

  const rings = Arr.map(frame.rings, (ring): Dot => {
    const [x, y] = px([ring.x, ring.y])
    const t = 1 - (1 - ring.progress) ** 3
    return {
      x,
      y,
      radius: ring.big ? 10 + 110 * t : 6 + 30 * t,
      glow: 0,
      ring: ring.big ? 2 : 1.5,
      color: faded(rgba(GOLD, (ring.big ? 0.6 : 0.75) * (1 - ring.progress)), Option.isNone(picked)),
    }
  })

  const people = Arr.map(frame.dots, (dot): Dot => {
    const style = dotStyle(dot)
    const [x, y] = px([dot.x, dot.y])
    // You glow a little brighter with every call that reaches you.
    const glow = dot.kind === 'you' ? style.glow + 4 * frame.answered : style.glow
    const stays = dot.kind === 'you' || dot.caller || dot.relayed
    return {
      x,
      y,
      radius: style.radius * dot.grown,
      glow: glow * dot.grown,
      ring: 0,
      color: faded(
        stays ? style.color : hushed(style.color, dot.kind === 'met' ? HELPED_QUIET : QUIET),
        shown(dot.id),
      ),
    }
  })

  // A ring round everyone who called, so the end still says who did.
  const callers = Arr.flatMap(frame.dots, (dot): ReadonlyArray<Dot> => {
    if (!dot.caller || dot.kind === 'you') return []
    const [x, y] = px([dot.x, dot.y])
    return [{ x, y, radius: 9, glow: 0, ring: 1.5, color: faded(rgba(GOLD, 0.85), shown(dot.id)) }]
  })

  const halo = Option.flatMap(picked, id =>
    Option.map(
      Arr.findFirst(frame.dots, dot => dot.id === id),
      (dot): Dot => {
        const [x, y] = px([dot.x, dot.y])
        return {
          x,
          y,
          radius: dotStyle(dot).radius + (dot.caller ? 9 : 5),
          glow: 0,
          ring: 1.5,
          color: rgba(WARM, 0.9),
        }
      },
    ),
  )

  const sparks = Arr.map(frame.sparks, (spark): Dot => {
    const [x, y] = px(spark)
    return { x, y, radius: 3.5, glow: 14, ring: 0, color: rgba(GOLD, 1) }
  })

  return {
    lines: [...links, ...trails],
    dots: [...rings, ...people, ...callers, ...Option.toArray(halo), ...sparks],
  }
}

// NOTE: a frame of the network as lines and dots in CSS px, coloured like
// the rest of the sheet. Both renderers draw exactly this, so the WebGPU
// and 2D versions look the same.
//
// Gold is you and the people you've reached. The networks of the people
// you've reached are a warm white, and light up when you reach them. Red is
// hurt, and everyone else is the sheet's faint line colour.
//
// Pointing at someone picks them out: their links and the people on the
// other end stay bright, a ring goes round them, and the rest dims.

import { Array as Arr, Number as Num, Option } from 'effect'

import type { Dot, Line, Point, Rgba, Shapes } from '../blog/animation/scene.ts'
import { BOUNDS, type Frame, type FrameDot, type FrameEdge } from './graph.ts'

type Rgb = readonly [number, number, number]

// The sheet's line colour, its gold, a warm white and a soft red.
const LINE: Rgb = [0.86, 0.92, 1]
const GOLD: Rgb = [1, 0.82, 0.4]
const WARM: Rgb = [1, 0.94, 0.8]
const RED: Rgb = [1, 0.42, 0.38]

const rgba = (rgb: Rgb, alpha: number): Rgba => [rgb[0], rgb[1], rgb[2], alpha]
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
const clamp01 = (t: number): number => Num.clamp(t, { minimum: 0, maximum: 1 })

// Someone you've hurt flashes red, then fades to grey over a few seconds.
const hurtColor = (hurtFor: number): Rgba => {
  const t = clamp01(hurtFor / 3)
  return rgba(mix(RED, LINE, t), 0.95 - 0.5 * t)
}

const edgeStyle = (edge: FrameEdge): { readonly width: number; readonly color: Rgba } => {
  if (edge.walking) return { width: 2.5, color: rgba(edge.hurt ? RED : GOLD, 1) }
  if (edge.apart > 0) return { width: 1.5, color: rgba(RED, 0.85 * (1 - edge.apart)) }
  switch (edge.kind) {
    case 'yours':
      return { width: 1.5, color: rgba(GOLD, 0.55 + 0.35 * edge.lit) }
    case 'circle':
      return { width: 1 + edge.lit, color: rgba(mix(WARM, GOLD, edge.lit), 0.32 + 0.5 * edge.lit) }
    case 'remote':
      return { width: 1, color: rgba(LINE, 0.2) }
  }
}

const dotStyle = (dot: FrameDot): { readonly radius: number; readonly glow: number; readonly color: Rgba } => {
  switch (dot.kind) {
    case 'you':
      return { radius: 7, glow: 14, color: rgba(GOLD, 1) }
    case 'met':
      return { radius: 4.5, glow: 10 * dot.lit, color: rgba(GOLD, 0.95) }
    case 'hurt':
      return { radius: 4, glow: 8 * clamp01(1 - dot.hurtFor), color: hurtColor(dot.hurtFor) }
    case 'circle':
      return { radius: 3.2 + dot.lit, glow: 8 * dot.lit, color: rgba(mix(WARM, GOLD, dot.lit), 0.85) }
    case 'stranger':
      return { radius: 3, glow: 0, color: rgba(LINE, 0.55) }
  }
}

// Scale and centre the world box into a canvas this big.
export const projection = (width: number, height: number) => {
  const scale = Math.min(width / (BOUNDS.x * 2 + 0.2), height / (BOUNDS.y * 2 + 0.2))
  return ([x, y]: Point): Point => [
    width / 2 + x * scale,
    height / 2 + y * scale,
  ]
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
  const touches = (edge: FrameEdge) =>
    Option.match(picked, { onNone: () => true, onSome: id => edge.a === id || edge.b === id })
  const shown = (id: number) => Option.isNone(picked) || near.has(id)
  const faded = ([r, g, b, a]: Rgba, keep: boolean): Rgba => [r, g, b, keep ? a : a * DIMMED]

  const lines = Arr.flatMap(frame.edges, (edge): ReadonlyArray<Line> => {
    const style = edgeStyle(edge)
    const from = px(edge.from)
    const to = px(edge.to)
    const lit = Option.isSome(picked) && touches(edge)
    const line = (a: Point, b: Point): Line => ({
      from: a,
      to: b,
      width: lit ? style.width + 1 : style.width,
      color: lit ? [style.color[0], style.color[1], style.color[2], Math.max(style.color[3], 0.85)] : faded(style.color, touches(edge)),
    })
    if (edge.apart <= 0) return [line(from, to)]
    // A snapping link pulls back from the middle toward both ends.
    const keep = 0.5 * (1 - edge.apart)
    const toward = (a: Point, b: Point): Point => [
      a[0] + (b[0] - a[0]) * keep,
      a[1] + (b[1] - a[1]) * keep,
    ]
    return [line(from, toward(from, to)), line(to, toward(to, from))]
  })

  const rings = Arr.map(frame.rings, (ring): Dot => {
    const [x, y] = px([ring.x, ring.y])
    const t = 1 - (1 - ring.progress) ** 3
    return {
      x,
      y,
      radius: 6 + 38 * t,
      glow: 0,
      ring: 1.5,
      color: faded(rgba(ring.hurt ? RED : GOLD, 0.75 * (1 - ring.progress)), Option.isNone(picked)),
    }
  })

  const people = Arr.map(frame.dots, (dot): Dot => {
    const style = dotStyle(dot)
    const [x, y] = px([dot.x, dot.y])
    return {
      x,
      y,
      radius: style.radius * dot.grown,
      glow: style.glow * dot.grown,
      ring: 0,
      color: faded(style.color, shown(dot.id)),
    }
  })

  const halo = Option.flatMap(picked, id =>
    Option.map(
      Arr.findFirst(frame.dots, dot => dot.id === id),
      (dot): Dot => {
        const [x, y] = px([dot.x, dot.y])
        return { x, y, radius: dotStyle(dot).radius + 5, glow: 0, ring: 1.5, color: rgba(WARM, 0.9) }
      },
    ),
  )

  const [wx, wy] = px(frame.walker)
  const walker: Dot = {
    x: wx,
    y: wy,
    radius: 4,
    glow: 18,
    ring: 0,
    color: rgba(frame.walkerHurt ? RED : GOLD, 1),
  }
  return { lines, dots: [...rings, ...people, ...Option.toArray(halo), walker] }
}

import { Array as Arr, Boolean as Bool, Option } from 'effect'

import { GOLD, LINE, type Projection, RED, WARM, mix, rgba } from '../../animation/kit.ts'
import type { Dot, Line, Point, Rgba, Marks } from '../../animation/scene.ts'
import {
  BOUNDS,
  type DotKind,
  type EdgeKind,
  type Frame,
  type FrameDot,
  type FrameEdge,
  type FrameRing,
  MAX_EDGES,
  MAX_NODES,
  MAX_TEARS,
} from './graph.ts'

export const MAX_LINES = MAX_EDGES + MAX_TEARS * 3
export const MAX_DOTS = MAX_NODES + 16 + MAX_TEARS * 3

const CUT = 0.28
const cutKeep = (cut: number) => 1 - (1 - CUT) * cut
const kept = ([r, g, b, a]: Rgba, cut: number): Rgba => [r, g, b, a * cutKeep(cut)]

interface EdgeStyle {
  readonly width: number
  readonly color: Rgba
}

const edgeStyles = {
  yours: lit => ({ width: 1.5, color: rgba(GOLD, 0.55 + 0.35 * lit) }),
  circle: lit => ({
    width: 1 + lit,
    color: rgba(mix(WARM, GOLD, lit), 0.32 + 0.5 * lit),
  }),
  remote: lit => ({ width: 1, color: rgba(LINE, 0.22 + 0.4 * lit) }),
} satisfies { readonly [K in EdgeKind]: (lit: number) => EdgeStyle }

const edgeStyle = (edge: FrameEdge): EdgeStyle => edgeStyles[edge.kind](edge.lit)

interface DotStyle {
  readonly radius: number
  readonly glow: number
  readonly color: Rgba
}

const dotStyles = {
  you: () => ({ radius: 7, glow: 14, color: rgba(GOLD, 1) }),
  met: lit => ({ radius: 4.5, glow: 10 * lit, color: rgba(GOLD, 0.95) }),
  circle: lit => ({
    radius: 3.2 + lit,
    glow: 8 * lit,
    color: rgba(mix(WARM, GOLD, lit), 0.85),
  }),
  stranger: lit => ({ radius: 3, glow: 0, color: rgba(mix(LINE, WARM, lit), 0.55 + 0.3 * lit) }),
} satisfies { readonly [K in DotKind]: (lit: number) => DotStyle }

const dotStyle = (dot: FrameDot): DotStyle => dotStyles[dot.kind](dot.lit)

export const projection: Projection = (width, height) => {
  const scale = Math.min(width / (BOUNDS.x * 2 + 0.2), height / (BOUNDS.y * 2 + 0.2))
  return {
    scale,
    px: ([x, y]: Point): Point => [width / 2 + x * scale, height / 2 + y * scale],
  }
}

const REACH = 16
const DIMMED = 0.3

const otherEnd = (edge: FrameEdge, id: number): ReadonlyArray<number> => {
  if (edge.a === id) return [edge.b]
  if (edge.b === id) return [edge.a]
  return []
}

const faded = ([r, g, b, a]: Rgba, keep: boolean): Rgba => [
  r,
  g,
  b,
  Bool.match(keep, { onTrue: () => a, onFalse: () => a * DIMMED }),
]

const linkStyle = (style: EdgeStyle, lit: boolean, touched: boolean): EdgeStyle => {
  if (lit) {
    return {
      width: style.width + 1,
      color: [style.color[0], style.color[1], style.color[2], Math.max(style.color[3], 0.85)],
    }
  }
  return { width: style.width, color: faded(style.color, touched) }
}

const ringColor = (ring: FrameRing, picked: boolean): Rgba => {
  if (ring.alarm === true) return rgba(RED, 0.8 * (1 - ring.progress))
  return faded(rgba(GOLD, 0.75 * (1 - ring.progress)), !picked)
}

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

export const marksOf = (
  frame: Frame,
  width: number,
  height: number,
  pointer: Option.Option<Point> = Option.none(),
): Marks => {
  const { px } = projection(width, height)
  const picked = pickedBy(frame, px, pointer)
  const near = Option.match(picked, {
    onNone: () => new Set<number>(),
    onSome: id =>
      new Set<number>([
        id,
        ...Arr.flatMap(frame.edges, edge => otherEnd(edge, id)),
      ]),
  })
  const touches = (edge: { readonly a: number; readonly b: number }) =>
    Option.match(picked, {
      onNone: () => true,
      onSome: id => edge.a === id || edge.b === id,
    })
  const shown = (id: number) => Option.isNone(picked) || near.has(id)

  const links = Arr.map(frame.edges, (edge): Line => {
    const style = linkStyle(edgeStyle(edge), Option.isSome(picked) && touches(edge), touches(edge))
    return {
      from: px(edge.from),
      to: px(edge.to),
      width: style.width,
      color: kept(style.color, edge.cut),
    }
  })

  const rings = Arr.map(frame.rings, (ring): Dot => {
    const [x, y] = px([ring.x, ring.y])
    const t = 1 - (1 - ring.progress) ** 3
    return {
      x,
      y,
      radius: 6 + 30 * t,
      glow: 0,
      ring: 1.5,
      color: ringColor(ring, Option.isSome(picked)),
    }
  })

  const people = Arr.map(frame.dots, (dot): Dot => {
    const style = dotStyle(dot)
    const [x, y] = px([dot.x, dot.y])
    return {
      x,
      y,
      radius: style.radius * dot.grown,
      glow: style.glow * dot.grown * (1 - dot.cut),
      ring: 0,
      color: kept(
        faded(style.color, shown(dot.id)),
        dot.cut,
      ),
    }
  })

  const halo = Option.flatMap(picked, id =>
    Option.map(
      Arr.findFirst(frame.dots, dot => dot.id === id),
      (dot): Dot => {
        const [x, y] = px([dot.x, dot.y])
        return {
          x,
          y,
          radius: dotStyle(dot).radius + 5,
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

  const ripples = Arr.map(
    frame.ripples,
    (ripple): Line => ({ from: px(ripple.from), to: px(ripple.to), width: 2.5, color: rgba(RED, 0.9) }),
  )
  const heads = Arr.map(frame.ripples, (ripple): Dot => {
    const [x, y] = px(ripple.to)
    return { x, y, radius: 3.5, glow: 14, ring: 0, color: rgba(RED, 1) }
  })
  const snaps = Arr.flatMap(frame.snaps, (snap): ReadonlyArray<Line> => {
    const back = 1 - (1 - snap.progress) ** 2
    const end = (from: readonly [number, number]): Line => ({
      from: px(from),
      to: px([snap.mid[0] + (from[0] - snap.mid[0]) * back, snap.mid[1] + (from[1] - snap.mid[1]) * back]),
      width: 2,
      color: rgba(RED, 0.9 * (1 - snap.progress)),
    })
    return [end(snap.you), end(snap.them)]
  })

  return {
    lines: [...links, ...ripples, ...snaps],
    dots: [...rings, ...people, ...Option.toArray(halo), ...sparks, ...heads],
  }
}

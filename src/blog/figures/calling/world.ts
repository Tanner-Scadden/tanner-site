import { Array as Arr } from 'effect'

import { type Projection, clamp01, smooth } from '../../animation/kit.ts'
import type { Line, Point, Rgba } from '../../animation/scene.ts'

export const BOX = { x: 1.6, y: 0.9 } as const

export const projection: Projection = (width, height) => {
  const scale = Math.min(width / (BOX.x * 2), height / (BOX.y * 2))
  return {
    scale,
    px: ([x, y]: Point): Point => [width / 2 + x * scale, height / 2 + y * scale],
  }
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const lerpPoint = (a: Point, b: Point, t: number): Point => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]

export const within = (time: number, start: number, length: number): number => clamp01((time - start) / length)
export const eased = (time: number, start: number, length: number): number => smooth(within(time, start, length))

const lengthOf = (points: ReadonlyArray<Point>): number =>
  Arr.reduce(Arr.zip(points, Arr.drop(points, 1)), 0, (sum, [a, b]) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]))

export const prefix = (points: ReadonlyArray<Point>, progress: number): ReadonlyArray<Point> => {
  const total = lengthOf(points)
  let left = clamp01(progress) * total
  const out: Array<Point> = []
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!
    if (i === 0) {
      out.push(point)
      continue
    }
    const from = points[i - 1]!
    const step = Math.hypot(point[0] - from[0], point[1] - from[1])
    if (left >= step) {
      out.push(point)
      left -= step
      continue
    }
    if (step > 0 && left > 0) out.push(lerpPoint(from, point, left / step))
    break
  }
  return out
}

export const segments = (
  points: ReadonlyArray<Point>,
  px: (point: Point) => Point,
  width: number,
  color: Rgba,
): ReadonlyArray<Line> =>
  Arr.map(Arr.zip(points, Arr.drop(points, 1)), ([a, b]): Line => ({ from: px(a), to: px(b), width, color }))

export const curve = (from: Point, control: Point, to: Point, steps: number): ReadonlyArray<Point> =>
  Arr.makeBy(steps + 1, i => {
    const t = i / steps
    const a = lerpPoint(from, control, t)
    const b = lerpPoint(control, to, t)
    return lerpPoint(a, b, t)
  })

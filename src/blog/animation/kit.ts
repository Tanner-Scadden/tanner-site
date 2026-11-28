import { clamp01 } from '../../gpu/math.ts'
import type { Point, Rgba } from './scene.ts'

export { clamp01, random } from '../../gpu/math.ts'

export const smooth = (t: number): number => {
  const c = clamp01(t)
  return c * c * (3 - 2 * c)
}

export type Rgb = readonly [number, number, number]

export const LINE: Rgb = [0.86, 0.92, 1]
export const GOLD: Rgb = [1, 0.82, 0.4]
export const WARM: Rgb = [1, 0.94, 0.8]
export const RED: Rgb = [1, 0.42, 0.38]

export const rgba = (rgb: Rgb, alpha: number): Rgba => [rgb[0], rgb[1], rgb[2], clamp01(alpha)]
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

export type Projection = (
  width: number,
  height: number,
) => { readonly scale: number; readonly px: (point: Point) => Point }

const AIM_SIZE = { width: 1600, height: 900 } as const
export const worldOfAim =
  (projection: Projection) =>
  ([u, v]: Point): Point => {
    const { scale, px } = projection(AIM_SIZE.width, AIM_SIZE.height)
    const [ox, oy] = px([0, 0])
    return [(u * AIM_SIZE.width - ox) / scale, (v * AIM_SIZE.height - oy) / scale]
  }

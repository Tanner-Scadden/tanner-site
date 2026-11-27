// NOTE: the small helpers every figure reaches for: a seeded generator,
// clamping and easing, the sheet's colours, and turning an aim on the
// canvas back into the world.

import { Number as Num } from 'effect'

import type { Point, Rgba } from './scene.ts'

// Mulberry32: a small seeded generator, so a run replays from its seed.
export const random = (seed: number) => {
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

export type Rgb = readonly [number, number, number]

// The sheet's line colour, its gold, a warm white, and the post's red,
// #ff6b61.
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

// How a figure puts its world on a canvas this big: px per world unit, and
// where a world point lands, in CSS px.
export type Projection = (
  width: number,
  height: number,
) => { readonly scale: number; readonly px: (point: Point) => Point }

// Where an aim lands in the world. An aim is a fraction of the canvas,
// which is always 16:9, so any 16:9 size of it will do.
const AIM_SIZE = { width: 1600, height: 900 } as const
export const worldOfAim =
  (projection: Projection) =>
  ([u, v]: Point): Point => {
    const { scale, px } = projection(AIM_SIZE.width, AIM_SIZE.height)
    const [ox, oy] = px([0, 0])
    return [(u * AIM_SIZE.width - ox) / scale, (v * AIM_SIZE.height - oy) / scale]
  }

// NOTE: how the floor plan stands up in 3D, as plain data in and plain data
// out, so the camera is testable without a GPU.
//
// Plan space is the floor: CSS px from the canvas's corner, with z rising
// out of the floor toward the viewer. Once the walls are drafted the plan
// tips back into perspective and the walls rise. After that it leans toward
// the pointer. The same matrix goes to the GPU and to the CSS room labels, so
// the links sit exactly on the floor they name and stay clickable.
//
// Matrices are row-major 4x4 arrays that multiply column vectors, like CSS
// transforms read left to right.

import { Array as Arr } from 'effect'
import { dual } from 'effect/Function'

import { DRAFT_MS, type Drafting, type Point, type Rect } from './house.ts'

export type Mat = ReadonlyArray<number>

export interface Point3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

// Where the pointer leans the house, from -1 to 1 on each axis.
export interface Tilt {
  readonly x: number
  readonly y: number
}

export const LEVEL: Tilt = { x: 0, y: 0 }

export const LIFT_MS = 1600
const DEG = Math.PI / 180
// The resting view: tipped back, and turned a little.
const PITCH = 36 * DEG
const YAW = -8 * DEG
// How far the pointer leans it.
const TILT_PITCH = 7 * DEG
const TILT_YAW = 3 * DEG
const TILT_ROLL = 9 * DEG
const TILT_PER_S = 5
const SNAP = 0.001
// The risen house fits in its own footprint, give or take this much.
const FIT_MARGIN = 10
// How tall the walls stand at the peak of their rise, past full height.
const OVERSHOOT = 1.12

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))
const clamp01 = (x: number): number => clamp(x, 0, 1)

const easeOut = (t: number): number => 1 - (1 - t) ** 3
// Rises past 1 a little, then settles back, like a wall going up on a spring.
const easeOutBack = (t: number): number => {
  const c1 = 1.4
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

// 0 while the plan is still being drafted, 1 once it's fully up. With
// motion reduced it's simply up.
export const liftOf = ({ since, still }: Drafting): number =>
  still ? 1 : clamp01((since - DRAFT_MS) / LIFT_MS)

export const wallHeight = (house: Rect): number => clamp(house.w * 0.085, 14, 42)

const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

// ---------------------------------------------------------------------------
// Matrices
// ---------------------------------------------------------------------------

const mul = (a: Mat, b: Mat): Mat =>
  Arr.makeBy(16, i => {
    const r = Math.floor(i / 4)
    const c = i % 4
    let sum = 0
    for (let k = 0; k < 4; k++) sum += a[r * 4 + k]! * b[k * 4 + c]!
    return sum
  })

const chain = (...ms: ReadonlyArray<Mat>): Mat => Arr.reduceRight(ms, IDENTITY, (acc, m) => mul(m, acc))

const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

const translate = (x: number, y: number): Mat => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, 0, 0, 0, 0, 1]
const scaleXY = (s: number): Mat => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
// The same rotations as CSS rotateX, rotateY and rotateZ, with y down.
const rotateX = (a: number): Mat => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]
}
const rotateY = (a: number): Mat => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]
}
const rotateZ = (a: number): Mat => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}
// CSS perspective(d): a point d px toward the viewer is at the eye.
const perspective = (d: number): Mat => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1 / d, 1]

const apply = (m: Mat, { x, y, z }: Point3): readonly [number, number, number, number] => [
  m[0]! * x + m[1]! * y + m[2]! * z + m[3]!,
  m[4]! * x + m[5]! * y + m[6]! * z + m[7]!,
  m[8]! * x + m[9]! * y + m[10]! * z + m[11]!,
  m[12]! * x + m[13]! * y + m[14]! * z + m[15]!,
]

// Column-major, the order both WGSL and CSS matrix3d read.
export const columns = (m: Mat): ReadonlyArray<number> =>
  Arr.makeBy(16, i => m[(i % 4) * 4 + Math.floor(i / 4)]!)

// ---------------------------------------------------------------------------
// The pose
// ---------------------------------------------------------------------------

export interface Pose {
  readonly pitch: number
  readonly yaw: number
  readonly roll: number
  readonly height: number
}

// How far the house has risen, and which way the pointer leans it.
export interface Stance {
  readonly tilt: Tilt
  readonly lift: number
}

export const poseOf: {
  (stance: Stance): (house: Rect) => Pose
  (house: Rect, stance: Stance): Pose
} = dual(2, (house: Rect, { tilt, lift }: Stance): Pose => {
  const e = easeOut(lift)
  return {
    pitch: e * (PITCH + tilt.y * TILT_PITCH),
    yaw: e * (YAW + tilt.x * TILT_YAW),
    roll: e * -tilt.x * TILT_ROLL,
    height: wallHeight(house) * (lift <= 0 ? 0 : lift >= 1 ? 1 : easeOutBack(lift)),
  }
})

const eyeDistance = (house: Rect): number => 2.6 * Math.max(house.w, house.h, 60)

// Turns the house in place around its middle. What comes out is relative to
// the middle, before perspective.
const turn = (house: Rect, pose: Pose): Mat => {
  const c = centre(house)
  return chain(rotateY(pose.roll), rotateX(pose.pitch), rotateZ(pose.yaw), translate(-c.x, -c.y))
}

// Where a turned point lands, relative to the middle, before the fit.
const turned = (house: Rect, pose: Pose, p: Point3): Point => {
  const [x, y, , w] = apply(mul(perspective(eyeDistance(house)), turn(house, pose)), p)
  return { x: x / w, y: y / w }
}

const corners = (house: Rect, height: number): ReadonlyArray<Point3> =>
  Arr.flatMap([0, height], z =>
    Arr.flatMap([house.x, house.x + house.w], x =>
      Arr.map([house.y, house.y + house.h], y => ({ x, y, z })),
    ),
  )

// How the risen house is scaled and moved to fit its own footprint, so it
// never spills off the canvas whichever way the pointer leans it.
export interface Fit {
  readonly scale: number
  readonly shift: Point
}

export const fitFor = (house: Rect): Fit => {
  const tall = corners(house, wallHeight(house) * OVERSHOOT)
  const level = Arr.map(tall, p => turned(house, poseOf(house, { tilt: LEVEL, lift: 1 }), p))
  const xs = Arr.map(level, p => p.x)
  const ys = Arr.map(level, p => p.y)
  const shift = {
    x: -(Math.min(...xs) + Math.max(...xs)) / 2,
    y: -(Math.min(...ys) + Math.max(...ys)) / 2,
  }
  const half = { x: house.w / 2 + FIT_MARGIN, y: house.h / 2 + FIT_MARGIN }
  const leans: ReadonlyArray<Tilt> = [LEVEL, { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }]
  const scale = Arr.reduce(leans, 1, (s, tilt) =>
    Arr.reduce(tall, s, (s2, p) => {
      const q = turned(house, poseOf(house, { tilt, lift: 1 }), p)
      const dx = Math.abs(q.x + shift.x)
      const dy = Math.abs(q.y + shift.y)
      return Math.min(s2, dx > 0 ? half.x / dx : 1, dy > 0 ? half.y / dy : 1)
    }),
  )
  return { scale, shift }
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export interface View {
  // Plan space to canvas px, through homogeneous w. Row 2 is plain z, as CSS
  // wants it.
  readonly m: Mat
  // The same, but row 2 gives the GPU a depth from 0 (near) to 1 (far).
  readonly gpu: Mat
  // Canvas px per plan px at w = 1.
  readonly scale: number
  readonly height: number
}

export interface Framing extends Stance {
  readonly fit: Fit
}

export const viewOf: {
  (framing: Framing): (house: Rect) => View
  (house: Rect, framing: Framing): View
} = dual(2, (house: Rect, { tilt, lift, fit }: Framing): View => {
  const pose = poseOf(house, { tilt, lift })
  const e = easeOut(lift)
  const scale = 1 + (fit.scale - 1) * e
  const c = centre(house)
  const n = turn(house, pose)
  const m = chain(
    translate(c.x, c.y),
    scaleXY(scale),
    translate(fit.shift.x * e, fit.shift.y * e),
    perspective(eyeDistance(house)),
    n,
  )
  // Every point of the house is within `range` of its middle, so depth stays
  // between 0 and 1. It's closer than the eye, so depth keeps its order.
  const range = Math.max(house.w, house.h) + 2 * wallHeight(house) + 1
  const k = -1 / (2 * range)
  const depth = [n[8]! * k, n[9]! * k, n[10]! * k, 0.5 + n[11]! * k]
  const gpu = [...m.slice(0, 8), ...depth, ...m.slice(12)]
  return { m, gpu, scale, height: pose.height }
})

export interface Projected {
  readonly x: number
  readonly y: number
  // 0 (near) to 1 (far), as the GPU sees it.
  readonly depth: number
  // Canvas px per plan px here.
  readonly scale: number
}

export const project: {
  (p: Point3): (view: View) => Projected
  (view: View, p: Point3): Projected
} = dual(2, (view: View, p: Point3): Projected => {
  const [x, y, , w] = apply(view.m, p)
  const [, , z] = apply(view.gpu, p)
  return { x: x / w, y: y / w, depth: z / w, scale: view.scale / w }
})

// The spot on the floor under a canvas point, or null when the floor isn't
// under it.
export const unproject: {
  (at: Point): (view: View) => Point | null
  (view: View, at: Point): Point | null
} = dual(2, (view: View, { x, y }: Point): Point | null => {
  const m = view.m
  // On the floor (z = 0) the view is a plain 2D homography.
  const [a, b, c, d, e, f, g, h, i] = [m[0]!, m[1]!, m[3]!, m[4]!, m[5]!, m[7]!, m[12]!, m[13]!, m[15]!]
  const A = e * i - f * h
  const B = c * h - b * i
  const C = b * f - c * e
  const D = f * g - d * i
  const E = a * i - c * g
  const F = c * d - a * f
  const G = d * h - e * g
  const H = b * g - a * h
  const I = a * e - b * d
  const w = G * x + H * y + I
  if (Math.abs(w) < 1e-9) return null
  const px = (A * x + B * y + C) / w
  const py = (D * x + E * y + F) / w
  const [, , , back] = apply(m, { x: px, y: py, z: 0 })
  return back > 0 ? { x: px, y: py } : null
})

// The view as a CSS transform for an element whose corner sits at `origin`
// on the canvas, with transform-origin at its own corner. Fixed digits, since
// CSS can't always read exponents, and plenty of them, since the perspective
// term is tiny.
export const cssTransform: {
  (origin: Point): (view: View) => string
  (view: View, origin: Point): string
} = dual(2, (view: View, origin: Point): string => {
  const m = chain(translate(-origin.x, -origin.y), view.m, translate(origin.x, origin.y))
  return `matrix3d(${Arr.join(Arr.map(columns(m), v => v.toFixed(10)), ',')})`
})

// ---------------------------------------------------------------------------
// Leaning toward the pointer
// ---------------------------------------------------------------------------

// Where the pointer wants the house to lean: toward it, harder near the edge.
export const tiltToward: {
  (house: Rect): (pointer: Point | null) => Tilt
  (pointer: Point | null, house: Rect): Tilt
} = dual(2, (pointer: Point | null, house: Rect): Tilt => {
  if (pointer === null || house.w <= 0 || house.h <= 0) return LEVEL
  const c = centre(house)
  return {
    x: clamp((pointer.x - c.x) / (house.w / 2), -1, 1),
    y: clamp((pointer.y - c.y) / (house.h / 2), -1, 1),
  }
})

export interface Follow {
  readonly to: Tilt
  readonly dt: number
}

// Eases toward `to` at the same speed at any frame rate, landing on it once
// it's close.
export const followTilt: {
  (follow: Follow): (from: Tilt) => Tilt
  (from: Tilt, follow: Follow): Tilt
} = dual(2, (from: Tilt, { to, dt }: Follow): Tilt => {
  const t = 1 - Math.exp(-TILT_PER_S * dt)
  const x = from.x + (to.x - from.x) * t
  const y = from.y + (to.y - from.y) * t
  return Math.abs(x - to.x) < SNAP && Math.abs(y - to.y) < SNAP ? to : { x, y }
})

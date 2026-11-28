import { Array as Arr } from 'effect'

import { clamp01, random, smooth } from '../../animation/kit.ts'

type Point = readonly [number, number]


export interface RootPiece {
  readonly from: Point
  readonly to: Point
  readonly start: number
  readonly length: number
  readonly width: number
  readonly order: number
}

export interface RootSystem {
  readonly pieces: ReadonlyArray<RootPiece>
  readonly reach: number
}

export const ROOT_PIECES = 128
const ORDERS = 3

export interface RootSpec {
  readonly x: number
  readonly ground: number
  readonly scale: number
  readonly trunk: number
  readonly floor: number
  readonly side: number
}

interface Sprout {
  readonly at: Point
  readonly heading: number
  readonly length: number
  readonly width: number
  readonly start: number
  readonly order: number
  readonly pull: number
}

const DOWN = Math.PI / 2

type PrimaryKind = 'tap' | 'lateral' | 'oblique'

interface PrimaryLook {
  readonly length: (next: () => number) => number
  readonly width: number
  readonly pull: (next: () => number) => number
}

const PRIMARY = {
  tap: { length: next => 0.5 + next() * 0.08, width: 0.5, pull: () => 0.22 },
  lateral: { length: next => 0.46 + next() * 0.22, width: 0.4, pull: next => 0.025 + next() * 0.03 },
  oblique: { length: next => 0.3 + next() * 0.16, width: 0.36, pull: next => 0.08 + next() * 0.06 },
} satisfies { readonly [K in PrimaryKind]: PrimaryLook }

const primaryKindOf = (deep: boolean, lateral: boolean): PrimaryKind => {
  if (deep) return 'tap'
  if (lateral) return 'lateral'
  return 'oblique'
}

const signOf = (next: () => number): number => {
  if (next() < 0.5) return -1
  return 1
}

const primariesOf = (next: () => number, spec: RootSpec): ReadonlyArray<Sprout> => {
  const scale = spec.scale ** 0.75
  const count = 5 + Math.floor(next() * 3)
  const tap = next() < 0.65
  const fan = { from: 0.1, to: Math.PI - 0.1 }
  const slot = (fan.to - fan.from) / count
  return Arr.makeBy(count, (k): Sprout => {
    const angle = fan.from + slot * (k + 0.2 + next() * 0.6)
    const lateral = Math.sin(angle) < 0.55
    const deep = Math.abs(angle - DOWN) < slot * 0.6
    const look = PRIMARY[primaryKindOf(deep && tap, lateral)]
    const length = scale * look.length(next)
    return {
      at: [spec.x, spec.ground],
      heading: angle,
      length,
      width: spec.trunk * look.width * (0.85 + next() * 0.3),
      start: 0,
      order: 0,
      pull: look.pull(next),
    }
  })
}

interface Fork {
  readonly at: number
  readonly side: number
}

const forkCountOf = (order: number, next: () => number): number => {
  if (order === 0) return 2 + Math.floor(next() * 2)
  if (order === 1) return 1 + Math.floor(next() * 2)
  if (next() < 0.5) return 1
  return 0
}

const forksOf = (root: Sprout, next: () => number): ReadonlyArray<Fork> => {
  const forks: Array<Fork> = []
  if (root.order >= ORDERS) return forks
  const n = forkCountOf(root.order, next)
  let side = signOf(next)
  for (let k = 0; k < n; k++) {
    forks.push({ at: 0.18 + (0.7 * (k + next())) / n, side })
    side = -side
  }
  return forks
}

const liftedOff = (heading: number): number => {
  if (Math.cos(heading) > 0) return heading + 0.25
  return heading - 0.25
}

const alongFloor = (heading: number): number => {
  if (Math.cos(heading) >= 0) return 0.1
  return Math.PI - 0.1
}

const steer = (heading: number, y: number, spec: RootSpec): number => {
  if (y < spec.ground + 0.02 && Math.sin(heading) < 0.25) return liftedOff(heading)
  return heading
}

const growRoot = (
  next: () => number,
  spec: RootSpec,
  root: Sprout,
  pieces: Array<RootPiece>,
  queue: Array<Sprout>,
): void => {
  const steps = Math.max(2, Math.round([6, 3, 2, 2][root.order]! * (0.8 + next() * 0.4)))
  const step = root.length / steps
  let [x, y] = root.at
  let heading = root.heading
  let turn = (next() - 0.5) * 0.3
  const forks = forksOf(root, next)
  for (let k = 0; k < steps; k++) {
    if (pieces.length >= ROOT_PIECES) break
    turn = turn * 0.55 + (next() - 0.5) * 0.55
    heading += turn + (DOWN - heading) * root.pull
    heading = steer(heading, y, spec)
    const nx = x + Math.cos(heading) * step
    let ny = y + Math.sin(heading) * step
    if (ny > spec.floor) {
      ny = spec.floor
      heading = alongFloor(heading)
    }
    if (Math.abs(nx) > spec.side) break
    ny = Math.max(ny, spec.ground + 0.004)
    const length = Math.hypot(nx - x, ny - y)
    const start = root.start + step * k
    const width = root.width * (1 - 0.72 * (k / steps))
    pieces.push({ from: [x, y], to: [nx, ny], start, length, width, order: root.order })
    for (const fork of forks) {
      if (fork.at < k / steps || fork.at >= (k + 1) / steps) continue
      queue.push({
        at: [nx, ny],
        heading: heading + fork.side * (0.45 + next() * 0.65),
        length: root.length * (1 - fork.at) * (0.55 + next() * 0.35),
        width: width * 0.62,
        start: start + length,
        order: root.order + 1,
        pull: root.pull * 0.6 + 0.03,
      })
    }
    x = nx
    y = ny
  }
}

export const rootSystemOf = (next: () => number, spec: RootSpec): RootSystem => {
  const pieces: Array<RootPiece> = []
  const queue: Array<Sprout> = [...primariesOf(next, spec)]
  for (let q = 0; q < queue.length && pieces.length < ROOT_PIECES; q++) {
    growRoot(next, spec, queue[q]!, pieces, queue)
  }
  const reach = Arr.reduce(pieces, 0, (m, p) => Math.max(m, p.start + p.length))
  return { pieces, reach }
}

export const ROOT_GROW = 5
const easeOut = (u: number): number => 1 - (1 - clamp01(u)) ** 3
export const rootFrontOf = (system: RootSystem, age: number): number => {
  if (age <= 0) return 0
  return system.reach * easeOut(age / ROOT_GROW)
}

const maturityOf = (age: number): number => 0.3 + 0.7 * easeOut(age / ROOT_GROW)

export interface DrawnRoot {
  readonly from: Point
  readonly to: Point
  readonly width: number
}

export const drawRoots = (system: RootSystem, age: number, scale: number): ReadonlyArray<DrawnRoot> => {
  const front = rootFrontOf(system, age)
  if (front <= 0) return []
  const mature = maturityOf(age)
  const out: Array<DrawnRoot> = []
  for (const piece of system.pieces) {
    const drawn = front - piece.start
    if (drawn <= 0) continue
    const f = Math.min(1, drawn / piece.length)
    const to: Point = [
      piece.from[0] + (piece.to[0] - piece.from[0]) * f,
      piece.from[1] + (piece.to[1] - piece.from[1]) * f,
    ]
    const tip = 0.35 + 0.65 * smooth(drawn / (0.12 * scale))
    out.push({ from: piece.from, to, width: piece.width * mature * tip })
  }
  return out
}


const MEET = { min: 0.12, spread: 0.1 } as const
const OVERLAP = 0.09
const TWIST = 0.017
const APPROACH_STEPS = 12
const TWIST_STEPS = 16
const ROOTLETS = 2
const ROOTLET_STEPS = 2
export const REACH_LINES = APPROACH_STEPS + TWIST_STEPS + ROOTLETS * ROOTLET_STEPS
const REACH_RATE = 0.11
export const REACH_MAX = 2.2
export const reachRateOf = (distance: number): number => Math.max(REACH_RATE, distance / REACH_MAX)
export const OVERLAP_MAX = OVERLAP / REACH_RATE
export const BOND = 2.5

const bridgeOf = (next: () => number, n: number): ReadonlyArray<number> => {
  let slope = 0
  let y = 0
  const walk = [0]
  for (let k = 1; k <= n; k++) {
    slope = slope * 0.6 + (next() - 0.5)
    y += slope
    walk.push(y)
  }
  const end = walk[n]!
  return Arr.map(walk, (v, k) => v - (end * k) / n)
}

export interface Reach {
  readonly x: number
  readonly ground: number
  readonly dir: number
  readonly distance: number
  readonly twist: number
  readonly seed: number
  readonly length: number
  readonly held: number
}

export interface DrawnReach extends DrawnRoot {
  readonly bond: number
}

export const reachLengthOf = (distance: number): number => distance + OVERLAP

export const bondOf = (held: number): number => {
  if (held <= 0) return 0
  return smooth(held / BOND)
}

const strandOf = (twist: number): number => {
  if (twist > 0) return 0
  return 1
}

export const drawReach = (reach: Reach): ReadonlyArray<DrawnReach> => {
  if (reach.length <= 0) return []
  const { x, ground, dir, distance: half } = reach
  const shared = random(reach.seed)
  const meet = MEET.min + shared() * MEET.spread
  const wraps = 1.2 + shared() * 0.8
  const offset = shared() * Math.PI * 2
  const tilt = (shared() - 0.5) * 0.5
  const bow = (shared() - 0.5) * 0.04
  const axisAt = (along: number) => {
    const w = (along - half) * dir
    return tilt * w + bow * (1 - (w / OVERLAP) ** 2)
  }
  const next = random(reach.seed * 2 + strandOf(reach.twist))
  const approach = Math.max(half - OVERLAP, half * 0.4)
  const wander = bridgeOf(next, APPROACH_STEPS)
  const amp = 0.022 * Math.min(1.5, half / 0.18) * (0.7 + next() * 0.6)
  const dive = 0.025 + next() * 0.04
  const sag = (0.2 + next() * 0.5) * meet
  const approachAt = (k: number): Point => {
    const u = k / APPROACH_STEPS
    const along = approach * u
    const depth =
      meet * (1 - Math.exp(-along / dive)) +
      sag * Math.sin(Math.PI * u) ** 2 +
      wander[k]! * amp * Math.sin(Math.PI * u) +
      axisAt(approach) * u ** 2
    return [along, depth]
  }
  const twistAt = (k: number): Point => {
    const e = (k / TWIST_STEPS) * (half + OVERLAP - approach)
    const along = approach + e
    const fromMeet = along - half
    const span = half + OVERLAP - approach
    const envelope = Math.max(0, Math.sin((Math.PI * e) / span)) ** 0.7 * smooth(reach.held / 1.5)
    const phase = offset + (fromMeet * dir * Math.PI * wraps) / OVERLAP
    return [along, meet + axisAt(along) + reach.twist * TWIST * envelope * Math.sin(phase)]
  }
  const path = [...Arr.makeBy(APPROACH_STEPS + 1, approachAt), ...Arr.makeBy(TWIST_STEPS, k => twistAt(k + 1))]
  const world = ([along, depth]: Point): Point => [x + dir * along, ground + depth]

  const goldAt = (along: number) => {
    if (reach.held <= 0) return 0
    const away = Math.abs(half - along)
    const reachBack = 0.05 + (Math.max(half * 0.75, OVERLAP) - 0.05) * smooth(reach.held / BOND)
    return (
      bondOf(reach.held) *
      smooth((reachBack - away) / Math.min(0.08, reachBack)) *
      (1 - 0.45 * Math.min(1, away / Math.max(half, OVERLAP)))
    )
  }
  const width = 0.0062
  const taper = (along: number) => width * (1 - 0.45 * Math.min(1, along / (half + OVERLAP)))

  const out: Array<DrawnReach> = []
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k]!
    const b = path[k + 1]!
    if (reach.length <= a[0]) break
    const f = Math.min(1, (reach.length - a[0]) / (b[0] - a[0]))
    const end: Point = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
    const gold = goldAt(a[0])
    out.push({ from: world(a), to: world(end), width: taper(a[0]) * (1 + 0.9 * gold), bond: gold })
  }

  for (let r = 0; r < ROOTLETS; r++) {
    const k = 2 + Math.floor(next() * (APPROACH_STEPS - 5))
    const side = signOf(next)
    const angle = DOWN + side * (0.5 + next() * 0.6) * dir
    const length = 0.03 + next() * 0.03
    const bend = (next() - 0.5) * 0.8
    const [along, depth] = approachAt(k)
    const grown = clamp01((reach.length - along) / 0.08)
    if (grown <= 0) continue
    let p: Point = [along, depth]
    for (let s = 0; s < ROOTLET_STEPS; s++) {
      const heading = angle + bend * s
      const step = (length / ROOTLET_STEPS) * grown
      const q: Point = [p[0] + Math.cos(heading) * step * dir, p[1] + Math.sin(heading) * step]
      out.push({ from: world(p), to: world(q), width: taper(along) * 0.5 * (1 - 0.3 * s), bond: 0 })
      p = q
    }
  }
  return out
}

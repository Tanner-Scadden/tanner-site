// NOTE: what grows under the grove. Two kinds of root:
//
// - A tree's own root system, grown once up front when the tree is made,
//   like its crown. A taproot or a few deep sinkers go down, and wide
//   laterals run out under the ground. Every root wanders as it goes and
//   forks into finer roots, which fork again. A growth front then travels
//   out along all of it at once, from the trunk, for the rest of the run,
//   and the roots thicken near the trunk as they age.
// - A reaching root, from a tree toward its nearest older neighbour, and
//   one from that neighbour reaching back. They wander toward each other,
//   meet, and twist around each other. Then gold spreads back along both
//   from the knot toward the trunks, and the tie thickens and brightens the
//   longer it holds.
//
// Nothing here knows about the rest of the grove. `grove.ts` says where the
// ground is and which trees reach for which.

import { Array as Arr } from 'effect'

import { clamp01, random, smooth } from '../../animation/kit.ts'

type Point = readonly [number, number]

// ---------------------------------------------------------------------------
// A tree's own roots
// ---------------------------------------------------------------------------

// One straight piece of a root, in world units.
export interface RootPiece {
  readonly from: Point
  readonly to: Point
  // How far along the root from the trunk `from` is, so the growth front
  // reaches it once the pieces before it are done.
  readonly start: number
  readonly length: number
  // Its width when it's had all its time, already tapered toward the tip.
  readonly width: number
  // 0 for a root off the trunk, 1 for a fork off that, and so on.
  readonly order: number
}

export interface RootSystem {
  readonly pieces: ReadonlyArray<RootPiece>
  // How far the furthest tip is from the trunk, along the roots.
  readonly reach: number
}

// The most pieces one tree's own roots can have, for the GPU buffers.
export const ROOT_PIECES = 128
// The finest a root forks to.
const ORDERS = 3

export interface RootSpec {
  readonly x: number
  readonly ground: number
  readonly scale: number
  // The trunk's width, so the roots stay finer than it.
  readonly trunk: number
  // How deep and how far out they're allowed to go.
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
  // How hard it turns toward straight down as it goes.
  readonly pull: number
}

const DOWN = Math.PI / 2

// A tree's roots, grown from `next`. The primaries take slots across the
// whole downward fan, so no two trees' roots point the same few ways, and
// the near-level ones run longest, the way laterals do.
export const rootSystemOf = (next: () => number, spec: RootSpec): RootSystem => {
  // Small trees put proportionally more into their roots than big ones.
  const scale = spec.scale ** 0.75
  const count = 5 + Math.floor(next() * 3)
  // Most trees drop one taproot, some a couple of sinkers instead.
  const tap = next() < 0.65
  const fan = { from: 0.1, to: Math.PI - 0.1 }
  const slot = (fan.to - fan.from) / count
  const primaries = Arr.makeBy(count, (k): Sprout => {
    const angle = fan.from + slot * (k + 0.2 + next() * 0.6)
    // 0 near level, 1 straight down.
    const steep = Math.sin(angle)
    const lateral = steep < 0.55
    const deep = Math.abs(angle - DOWN) < slot * 0.6
    const length =
      scale *
      (deep && tap ? 0.5 + next() * 0.08 : lateral ? 0.46 + next() * 0.22 : 0.3 + next() * 0.16)
    return {
      at: [spec.x, spec.ground],
      heading: angle,
      length,
      width: spec.trunk * (deep && tap ? 0.5 : lateral ? 0.4 : 0.36) * (0.85 + next() * 0.3),
      start: 0,
      order: 0,
      pull: deep && tap ? 0.22 : lateral ? 0.025 + next() * 0.03 : 0.08 + next() * 0.06,
    }
  })

  const pieces: Array<RootPiece> = []
  // Grown breadth first, so if the budget runs out it's the finest forks
  // that go without.
  const queue: Array<Sprout> = [...primaries]
  for (let q = 0; q < queue.length && pieces.length < ROOT_PIECES; q++) {
    const root = queue[q]!
    const steps = Math.max(2, Math.round([6, 3, 2, 2][root.order]! * (0.8 + next() * 0.4)))
    const step = root.length / steps
    let [x, y] = root.at
    let heading = root.heading
    // The turn carries over from step to step, so it bends in arcs that
    // drift and change their mind, not in a zigzag or a regular wave.
    let turn = (next() - 0.5) * 0.3
    const forks: Array<{ at: number; side: number }> = []
    if (root.order < ORDERS) {
      const n =
        root.order === 0
          ? 2 + Math.floor(next() * 2)
          : root.order === 1
            ? 1 + Math.floor(next() * 2)
            : next() < 0.5
              ? 1
              : 0
      let side = next() < 0.5 ? -1 : 1
      for (let k = 0; k < n; k++) {
        forks.push({ at: 0.18 + (0.7 * (k + next())) / n, side })
        side = -side
      }
    }
    for (let k = 0; k < steps; k++) {
      if (pieces.length >= ROOT_PIECES) break
      turn = turn * 0.55 + (next() - 0.5) * 0.55
      heading += turn + (DOWN - heading) * root.pull
      // Near the surface, roots dive rather than break through.
      if (y < spec.ground + 0.02 && Math.sin(heading) < 0.25) heading += Math.cos(heading) > 0 ? 0.25 : -0.25
      let nx = x + Math.cos(heading) * step
      let ny = y + Math.sin(heading) * step
      // At the bottom of the sheet they run level.
      if (ny > spec.floor) {
        ny = spec.floor
        heading = Math.cos(heading) >= 0 ? 0.1 : Math.PI - 0.1
      }
      if (Math.abs(nx) > spec.side) break
      ny = Math.max(ny, spec.ground + 0.004)
      const length = Math.hypot(nx - x, ny - y)
      const start = root.start + step * k
      const width = root.width * (1 - 0.72 * (k / steps))
      pieces.push({ from: [x, y], to: [nx, ny], start, length, width, order: root.order })
      for (const fork of forks) {
        const from = k / steps
        const to = (k + 1) / steps
        if (fork.at < from || fork.at >= to) continue
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
  const reach = Arr.reduce(pieces, 0, (m, p) => Math.max(m, p.start + p.length))
  return { pieces, reach }
}

// How far out along its roots a tree's growth front is, `age` seconds after
// it sprouts: quick at first, then slowing, but never quite stopping, so
// the roots keep going right to the end. A seed's root comes before its
// shoot, so they start as soon as it sprouts.
const ROOT_TIME = 5.5
export const rootFrontOf = (system: RootSystem, age: number): number =>
  age <= 0 ? 0 : system.reach * (1 - Math.exp(-age / ROOT_TIME))

// How thick roots are, `age` seconds in: thin at first, filling out as the
// tree gets established.
const maturityOf = (age: number): number => 0.3 + 0.7 * (1 - Math.exp(-Math.max(0, age) / 6))

export interface DrawnRoot {
  readonly from: Point
  readonly to: Point
  readonly width: number
}

// A tree's own roots `age` seconds after it sprouts: only what the front
// has reached, the newest part finest, the old wood near the trunk thicker.
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
    // The last stretch behind the front is still a fine new tip.
    const tip = 0.35 + 0.65 * smooth(drawn / (0.12 * scale))
    out.push({ from: piece.from, to, width: piece.width * mature * tip })
  }
  return out
}

// ---------------------------------------------------------------------------
// Reaching roots
// ---------------------------------------------------------------------------

// How far down the two roots of a pair meet, how far past the meeting each
// runs on, twisting around the other, and how they grow.
const MEET = { min: 0.12, spread: 0.1 } as const
const OVERLAP = 0.09
const TWIST = 0.017
const APPROACH_STEPS = 12
const TWIST_STEPS = 16
const ROOTLETS = 2
// Each rootlet off a reaching root is drawn in this many pieces.
const ROOTLET_STEPS = 2
export const REACH_LINES = APPROACH_STEPS + TWIST_STEPS + ROOTLETS * ROOTLET_STEPS
export const REACH_RATE = 0.11
// How long a new tie takes to show, and how fast the gold spreads back
// along both roots toward the trunks once they've met.
const BOND = 2.5
const GOLD_SPREAD = 0.05

// A pair's roots wander from their own seed, so they wander the same way
// every frame without being stored.
// A smooth wander that starts and ends at 0: a random walk of turns, with
// its drift taken out so it lands where it should (a Brownian bridge).
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
  // The tree the root belongs to, and where its trunk is.
  readonly x: number
  readonly ground: number
  // The way to the meeting point, ±1, and how far it is.
  readonly dir: number
  readonly distance: number
  // +1 for the one that reached, -1 for the one reaching back, so the two
  // twist around each other rather than lie on top of each other.
  readonly twist: number
  // The pair's seed, the same for both roots, so they agree on where to
  // meet but wander their own ways there.
  readonly seed: number
  // How far it's grown, and how long ago the two met (negative if not yet).
  readonly length: number
  readonly held: number
}

export interface DrawnReach extends DrawnRoot {
  // 0 to 1, how much of the tie's gold it carries.
  readonly bond: number
}

// How far a reaching root runs: it dives, wanders to the meeting point,
// then runs on past it, twisting around its partner.
export const reachLengthOf = (distance: number): number => distance + OVERLAP

// How strong a tie is that's held this long: it shows over BOND seconds,
// then keeps strengthening, more slowly, for as long as it holds.
export const bondOf = (held: number): number =>
  held <= 0 ? 0 : clamp01(0.75 * smooth(held / BOND) + 0.25 * (1 - Math.exp(-held / 8)))

export const drawReach = (reach: Reach): ReadonlyArray<DrawnReach> => {
  if (reach.length <= 0) return []
  const { x, ground, dir, distance: half } = reach
  // How deep this pair meets, shared by both. Drawn from the pair's seed,
  // so its roots wander the same way every frame without being stored.
  const shared = random(reach.seed)
  const meet = MEET.min + shared() * MEET.spread
  // How many times they wrap around each other, and where they start.
  const wraps = 1.2 + shared() * 0.8
  const offset = shared() * Math.PI * 2
  // The knot isn't level: it slopes and bows a little, the same for both.
  const tilt = (shared() - 0.5) * 0.5
  const bow = (shared() - 0.5) * 0.04
  const axisAt = (along: number) => {
    const w = (along - half) * dir
    return tilt * w + bow * (1 - (w / OVERLAP) ** 2)
  }
  const next = random(reach.seed * 2 + (reach.twist > 0 ? 0 : 1))
  const approach = Math.max(half - OVERLAP, half * 0.4)
  const wander = bridgeOf(next, APPROACH_STEPS)
  // Short gaps wander less, so close neighbours don't loop wildly.
  const amp = 0.022 * Math.min(1.5, half / 0.18) * (0.7 + next() * 0.6)
  const dive = 0.025 + next() * 0.04
  // Each dips below the meeting depth on the way, then comes back up to it.
  const sag = (0.2 + next() * 0.5) * meet
  // Where along the axis toward the neighbour, from the trunk, and how far
  // below the ground.
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
  // Past the end of the approach, the two roots share a line and twist
  // around it. Their offsets are opposite at every point, so they cross.
  const twistAt = (k: number): Point => {
    const e = (k / TWIST_STEPS) * (half + OVERLAP - approach)
    const along = approach + e
    const fromMeet = along - half
    const span = half + OVERLAP - approach
    // They only start to wrap around each other once they've met.
    const envelope = Math.max(0, Math.sin((Math.PI * e) / span)) ** 0.7 * smooth(reach.held / 1.5)
    // Measured from the meeting point along the ground, the same for both
    // roots of the pair, so with opposite `twist` they cross each other.
    const phase = offset + (fromMeet * dir * Math.PI * wraps) / OVERLAP
    return [along, meet + axisAt(along) + reach.twist * TWIST * envelope * Math.sin(phase)]
  }
  const path = [...Arr.makeBy(APPROACH_STEPS + 1, approachAt), ...Arr.makeBy(TWIST_STEPS, k => twistAt(k + 1))]
  const world = ([along, depth]: Point): Point => [x + dir * along, ground + depth]

  const goldAt = (along: number) => {
    if (reach.held <= 0) return 0
    // Gold starts at the knot and spreads back toward the trunk, but never
    // all the way: it's the tie that's gold, not the trees.
    const away = Math.abs(half - along)
    const reachBack = Math.min(0.05 + reach.held * GOLD_SPREAD, Math.max(half * 0.75, OVERLAP))
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
    // Grown by distance along the axis, so both roots of a pair get to the
    // meeting point together.
    if (reach.length <= a[0]) break
    const f = Math.min(1, (reach.length - a[0]) / (b[0] - a[0]))
    const end: Point = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
    const gold = goldAt(a[0])
    out.push({ from: world(a), to: world(end), width: taper(a[0]) * (1 + 0.9 * gold), bond: gold })
  }

  // A couple of fine rootlets off the approach, once it's grown past them.
  for (let r = 0; r < ROOTLETS; r++) {
    const k = 2 + Math.floor(next() * (APPROACH_STEPS - 5))
    const side = next() < 0.5 ? -1 : 1
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

import { Array as Arr, Number as Num, Option, Order } from 'effect'

import { clamp01, random } from '../../animation/kit.ts'
import {
  BOND,
  OVERLAP_MAX,
  REACH_MAX,
  ROOT_GROW,
  type RootSystem,
  drawReach,
  drawRoots,
  reachLengthOf,
  reachRateOf,
  rootSystemOf,
} from './roots.ts'

// The world is a box this wide and tall around the middle of the canvas,
// in world units, with y pointing down like the canvas.
export const BOUNDS = { x: 1.6, y: 0.9 } as const
// Where the ground is: high enough that what grows under it gets a fair
// share of the sheet.
export const GROUND = 0.27
// How deep a root can go, and how far out.
const FLOOR = BOUNDS.y - 0.04
const SIDE = BOUNDS.x - 0.02
// Nothing a tree draws goes past this, so its crown stays on the sheet.
const MARGIN = { x: 1.54, top: -0.84 } as const

// The most there can be of each, for the GPU buffers.
export const GROVE = 8
export const LATE = 4
// The most seeds a reader can plant in a run.
export const MAX_PLANTS = 6
export const MAX_TREES = 1 + GROVE + LATE + MAX_PLANTS
export const MAX_SEGMENTS = 96
export const HATCH_GAP = 0.07
export const HATCHES = Math.floor((BOUNDS.x * 2) / HATCH_GAP) + 1

// The ground draws out from the middle over this long.
const GROUND_DRAW = 1
// The first seed: when it starts to fall, and how long it takes.
const FIRST_FALL = 0.2
const FIRST_FLIGHT = 2.2
// How long a seed rests on the ground before it sprouts.
const REST = 0.3
// How long the first tree takes to grow.
const FIRST_GROW = 3.5
// The first tree's seeds: the first release, the gap between them, and
// how long they're in the air.
const FIRST_RELEASE = 6.5
const RELEASE_GAP = 0.25
const FLIGHT = { min: 1.6, spread: 0.4 } as const
const GROVE_GROW = { min: 2.8, spread: 0.4 } as const
// The grove's own seeds, filling the gaps it leaves.
const LATE_RELEASES = [12.2, 12.5, 12.9, 13.2] as const
const LATE_FLIGHTS = [1.4, 1.5, 1.7, 1.8] as const
const SAPLING_GROW = 3.2
// How long a leaf takes to open, a blossom to brighten before its seed
// lets go, and a landing ring to spread.
const LEAF_OPEN = 0.4
const BLOSSOM = 0.8
const RING = 1.2
// A planted seed: how long it drifts down, and how long its tree takes to
// grow.
const PLANT_FLIGHT = 1.8
const PLANT_GROW = 3

type Point = readonly [number, number]

const easeInOut = (t: number): number => (1 - Math.cos(Math.PI * clamp01(t))) / 2
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

export interface Segment {
  // The branch it grows from, or -1 for the trunk.
  readonly parent: number
  readonly depth: number
  // Its direction at rest, in radians, -π/2 being straight up.
  readonly angle: number
  readonly length: number
  readonly width: number
  // How far along the tree from the root its base is, so the growth front
  // reaches it once the branches below are done.
  readonly start: number
}

export interface Leaf {
  readonly segment: number
  readonly size: number
  // When the growth front reaches it.
  readonly born: number
}

export interface Tree {
  // Where it stands on the ground.
  readonly x: number
  readonly scale: number
  readonly levels: number
  readonly segments: ReadonlyArray<Segment>
  readonly roots: RootSystem
  readonly leaves: ReadonlyArray<Leaf>
  // How far the furthest tip is from the root.
  readonly reach: number
  // When it starts to grow, and for how long.
  readonly sprout: number
  readonly grow: number
  readonly phase: number
}

// A seed in the air: from where it lets go to where it lands, rising a
// little first, swaying as it falls.
export interface Flight {
  readonly from: Point
  readonly lift: Point
  readonly to: Point
  readonly release: number
  readonly duration: number
  readonly sway: number
  readonly swings: number
  // The tree it lets go from and the leaf it was, or -1 for the first.
  readonly tree: number
  readonly leaf: number
}

export interface Timeline {
  // One per seed, in the same order: seed k grows into tree k. It ends
  // once every tree, root and tie has finished growing.
  readonly trees: ReadonlyArray<Tree>
  readonly flights: ReadonlyArray<Flight>
  readonly end: number
}

// How the growth front moves along a tree that's had this much of its
// time: slow to start, steady, then settling.
const growthOf = (u: number): number => {
  const t = clamp01(u)
  return 0.35 * (1 - (1 - t) ** 2) + 0.65 * easeInOut(t)
}

// When the growth front is this far along: the inverse of `growthOf`, by
// bisection.
const timeAtGrowth = (g: number): number => {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (growthOf(mid) < g) lo = mid
    else hi = mid
  }
  return hi
}

// A tree's shape at unit scale: a trunk that opens into two or three
// limbs, then each branch forks in two, one side a little longer than the
// other, both turning a little toward the light. The forks open wider
// higher up, so the crown spreads into a broad, open canopy.
const shapeOf = (next: () => number, levels: number, lean: number) => {
  const segments: Array<Segment> = [
    {
      parent: -1,
      depth: 0,
      angle: -Math.PI / 2 + lean,
      length: 0.26 + next() * 0.05,
      width: 0.024,
      start: 0,
    },
  ]
  const toLight = (angle: number) => angle + (-Math.PI / 2 - angle) * 0.1
  for (let i = 0; i < segments.length; i++) {
    const p = segments[i]!
    if (p.depth >= levels - 1) continue
    const tilt = (next() - 0.5) * 0.25
    const open = 0.3 + 0.06 * p.depth + next() * 0.15
    const long = next() < 0.5 ? -1 : 1
    const children: Array<{ angle: number; length: number; width: number }> =
      p.depth === 0
        ? Arr.map(next() < 0.5 ? [-0.62, 0.62] : [-0.72, 0.04, 0.72], spread => ({
            angle: p.angle + spread + (next() - 0.5) * 0.2,
            length: spread === 0.04 ? 0.82 : 0.74 + next() * 0.1,
            width: 0.68,
          }))
        : [
            { angle: p.angle + tilt + long * open, length: 0.76 + next() * 0.08, width: 0.72 },
            { angle: p.angle + tilt - long * open, length: 0.64 + next() * 0.1, width: 0.64 },
          ]
    for (const child of children) {
      if (segments.length >= MAX_SEGMENTS) break
      segments.push({
        parent: i,
        depth: p.depth + 1,
        angle: toLight(child.angle),
        length: p.length * child.length,
        width: p.width * child.width,
        start: p.start + p.length,
      })
    }
  }
  return { segments }
}

// Where every tip of a tree is at rest, from its root.
const restTips = (segments: ReadonlyArray<Segment>): ReadonlyArray<Point> => {
  const tips: Array<Point> = []
  for (const segment of segments) {
    const [x, y] = segment.parent < 0 ? [0, 0] : tips[segment.parent]!
    tips.push([x + Math.cos(segment.angle) * segment.length, y + Math.sin(segment.angle) * segment.length])
  }
  return tips
}

interface TreeSpec {
  readonly x: number
  readonly scale: number
  readonly levels: number
  readonly sprout: number
  readonly grow: number
}

// Grows a tree's shape and fits it on the sheet: it moves in from the
// edges, and shrinks if it'd be too tall.
const makeTree = (next: () => number, spec: TreeSpec): Tree => {
  const { segments: unit } = shapeOf(next, spec.levels, (next() - 0.5) * 0.14)
  const tips = restTips(unit)
  const left = Arr.reduce(tips, 0, (m, [x]) => Math.min(m, x)) - 0.06
  const right = Arr.reduce(tips, 0, (m, [x]) => Math.max(m, x)) + 0.06
  const top = Arr.reduce(tips, 0, (m, [, y]) => Math.min(m, y)) - 0.05
  const scale = Math.min(spec.scale, (GROUND - MARGIN.top) / -top, (MARGIN.x * 2) / (right - left))
  const x = Num.clamp(spec.x, { minimum: -MARGIN.x - left * scale, maximum: MARGIN.x - right * scale })
  const scaled = (segment: Segment): Segment => ({
    ...segment,
    length: segment.length * scale,
    width: segment.width * scale,
    start: segment.start * scale,
  })
  const segments = Arr.map(unit, scaled)
  // Its roots are grown after the crown, from the same seed, so a tree
  // planted anywhere gets a root system of its own.
  const roots = rootSystemOf(next, {
    x,
    ground: GROUND,
    scale,
    trunk: segments[0]!.width,
    floor: FLOOR,
    side: SIDE,
  })
  const reach = Arr.reduce(segments, 0, (m, s) => Math.max(m, s.start + s.length))
  // Leaves open at the tips of the outermost twigs.
  const leaves = Arr.flatMap(segments, (segment, i): ReadonlyArray<Leaf> => {
    if (segment.depth < spec.levels - 1) return []
    const dist = (segment.start + segment.length) / reach
    return [{ segment: i, size: 0.75 + next() * 0.5, born: spec.sprout + spec.grow * timeAtGrowth(dist) }]
  })
  return {
    x,
    scale,
    levels: spec.levels,
    segments,
    roots,
    leaves,
    reach,
    sprout: spec.sprout,
    grow: spec.grow,
    phase: next() * Math.PI * 2,
  }
}

// How far a tree's branches lean in the wind at `time`, at the tips.
const SWAY = 0.03
const swayOf = (tree: Tree, time: number): number =>
  SWAY * Math.sin((time * Math.PI * 2) / 7 + tree.phase) +
  SWAY * 0.4 * Math.sin((time * Math.PI * 2) / 3.1 + tree.phase * 2)

export interface Pose {
  // How far the growth front has got, 0 to 1.
  readonly grown: number
  // Each branch's base, its tip in full, and how much of it is drawn.
  readonly bases: ReadonlyArray<Point>
  readonly tips: ReadonlyArray<Point>
  readonly drawn: ReadonlyArray<number>
}

// A tree at `time`: where each branch is, and how much of it has grown.
export const poseOf = (tree: Tree, time: number): Pose => {
  const grown = growthOf((time - tree.sprout) / tree.grow)
  const front = tree.reach * grown
  // Sway grows in with the tree, so a sprout barely moves.
  const sway = swayOf(tree, time) * grown
  const bases: Array<Point> = []
  const tips: Array<Point> = []
  const drawn: Array<number> = []
  for (const segment of tree.segments) {
    const base: Point = segment.parent < 0 ? [tree.x, GROUND] : tips[segment.parent]!
    const angle = segment.angle + (sway * segment.depth) / Math.max(1, tree.levels - 1)
    bases.push(base)
    tips.push([base[0] + Math.cos(angle) * segment.length, base[1] + Math.sin(angle) * segment.length])
    drawn.push(Num.clamp(front - segment.start, { minimum: 0, maximum: segment.length }))
  }
  return { grown, bases, tips, drawn }
}

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------

// Where a seed is, `u` of the way through its flight: along a gentle curve
// that rises first, eased so it lets go and lands softly, swaying side to
// side on the way.
export const flightAt = (flight: Flight, u: number): Point => {
  const t = easeInOut(u)
  const a = (1 - t) ** 2
  const b = 2 * (1 - t) * t
  const c = t * t
  const x = a * flight.from[0] + b * flight.lift[0] + c * flight.to[0]
  const y = a * flight.from[1] + b * flight.lift[1] + c * flight.to[1]
  const swing = flight.sway * Math.sin(Math.PI * 2 * flight.swings * clamp01(u)) * Math.sin(Math.PI * clamp01(u))
  return [x + swing, y]
}

export const landingOf = (flight: Flight): number => flight.release + flight.duration

// Where the grove's trees stand, either side of the first, nearest first.
const GROVE_SPOTS = [-0.48, 0.5, -0.86, 0.88, -1.17, 1.2, -1.42, 1.44] as const
// The gaps between them, where the late seeds go.
const LATE_SPOTS = [-0.68, 0.7, -1.02, 1.04, -1.3, 1.32, -0.3, 0.3] as const

// A leaf of `tree` on the side facing `x`, as high up as it can find, that
// hasn't let a seed go yet.
const leafToward = (next: () => number, tree: Tree, x: number, used: Set<string>, key: number) => {
  const tips = restTips(tree.segments)
  const side = Math.sign(x - tree.x) || 1
  const free = Arr.filter(tree.leaves, (_, i) => !used.has(`${key}:${i}`))
  const facing = Arr.filter(free, leaf => Math.sign(tips[leaf.segment]![0]) === side)
  const pool = facing.length > 0 ? facing : free
  // Of three tries, the highest.
  const tries = Arr.makeBy(3, () => pool[Math.floor(next() * pool.length)]!)
  const best = Arr.reduce(tries, tries[0]!, (a, b) => (tips[b.segment]![1] < tips[a.segment]![1] ? b : a))
  const index = tree.leaves.indexOf(best)
  used.add(`${key}:${index}`)
  return index
}

const flightFrom = (
  next: () => number,
  trees: ReadonlyArray<Tree>,
  source: number,
  leaf: number,
  to: Point,
  release: number,
  duration: number,
): Flight => {
  const tree = trees[source]!
  const pose = poseOf(tree, release)
  const from = pose.tips[tree.leaves[leaf]!.segment]!
  const lift: Point = [
    lerp(from[0], to[0], 0.45 + next() * 0.15),
    Math.max(MARGIN.top, Math.min(from[1], to[1]) - 0.18 - next() * 0.14),
  ]
  return {
    from,
    lift,
    to,
    release,
    duration,
    sway: 0.03 + next() * 0.03,
    swings: 1 + next(),
    tree: source,
    leaf,
  }
}

export const buildTimeline = (seed: number): Timeline => {
  const next = random(seed)
  const jitter = (amount: number) => (next() - 0.5) * 2 * amount

  // Beat 1: the first seed drifts down to the middle of the ground.
  const firstAt = FIRST_FALL + FIRST_FLIGHT
  const first = makeTree(next, { x: jitter(0.05), scale: 1.15, levels: 6, sprout: firstAt + REST, grow: FIRST_GROW })
  const firstFrom: Point = [first.x - 0.3 - next() * 0.15, -0.72]
  const flights: Array<Flight> = [
    {
      from: firstFrom,
      lift: [first.x + 0.2, -0.2],
      to: [first.x, GROUND],
      release: FIRST_FALL,
      duration: FIRST_FLIGHT,
      sway: 0.08,
      swings: 1.5,
      tree: -1,
      leaf: -1,
    },
  ]
  const trees: Array<Tree> = [first]
  const used = new Set<string>()

  // Beat 3: the first tree lets its seeds go, alternating sides so the
  // grove spreads both ways. Beat 4: each grows where it lands.
  for (let k = 0; k < GROVE; k++) {
    const release = FIRST_RELEASE + k * RELEASE_GAP
    const duration = FLIGHT.min + next() * FLIGHT.spread
    const spot = GROVE_SPOTS[k]! + jitter(0.05)
    const near = Math.abs(spot) < 0.7
    const tree = makeTree(next, {
      x: spot,
      scale: near ? 0.5 + next() * 0.12 : 0.6 + next() * 0.18,
      levels: 5,
      sprout: release + duration + REST,
      grow: GROVE_GROW.min + next() * GROVE_GROW.spread,
    })
    const leaf = leafToward(next, first, tree.x, used, 0)
    flights.push(flightFrom(next, trees, 0, leaf, [tree.x, GROUND], release, duration))
    trees.push(tree)
  }

  // The grove's first trees send seeds of their own into the gaps.
  const gaps = Arr.map(
    Arr.sort(
      Arr.map(LATE_SPOTS, spot => ({ spot, at: next() })),
      Order.mapInput(Order.Number, ({ at }: { readonly at: number }) => at),
    ),
    ({ spot }) => spot,
  )
  for (let k = 0; k < LATE; k++) {
    const release = LATE_RELEASES[k]!
    const duration = LATE_FLIGHTS[k]!
    const spot = gaps[k]! + jitter(0.03)
    // From whichever grown tree of the grove stands nearest. The first of
    // the grove has always finished by the first late release.
    const grown = (t: number) => trees[t]!.sprout + trees[t]!.grow <= release
    const source = Arr.reduce(Arr.range(1, GROVE), 1, (best, i) =>
      grown(i) && Math.abs(trees[i]!.x - spot) < Math.abs(trees[best]!.x - spot) ? i : best,
    )
    const tree = makeTree(next, {
      x: spot,
      scale: 0.34 + next() * 0.08,
      levels: 4,
      sprout: release + duration + REST,
      grow: SAPLING_GROW,
    })
    const leaf = leafToward(next, trees[source]!, tree.x, used, source)
    flights.push(flightFrom(next, trees, source, leaf, [tree.x, GROUND], release, duration))
    trees.push(tree)
  }

  return { trees, flights, end: settledAt(trees, flights) }
}

// ---------------------------------------------------------------------------
// Seeds a reader plants
// ---------------------------------------------------------------------------

// Where the next seed goes if the reader didn't aim: the middle of the
// widest gap between the trees whose seeds are down or on their way. The
// edges of the sheet count as trees a little way past them, so a gap at
// the edge is planted toward its middle, not against the margin.
const EDGE = MARGIN.x * 1.25
const widestGap = (trees: ReadonlyArray<Tree>, flights: ReadonlyArray<Flight>, time: number): number => {
  const standing = Arr.filter(trees, (_, k) => k === 0 || flights[k]!.release <= time)
  const xs = Arr.sort([-EDGE, EDGE, ...Arr.map(standing, tree => tree.x)], Order.Number)
  const gaps = Arr.zip(xs, Arr.drop(xs, 1))
  const [a, b] = Arr.reduce(gaps, gaps[0]!, (best, gap) => (gap[1] - gap[0] > best[1] - best[0] ? gap : best))
  return (a + b) / 2
}

// The run with a seed planted at each interaction, in the order they
// happened, at the aimed x or else the widest gap. Each drifts down from
// the top and grows a young tree, which joins the grove like the rest.
export const plantedIn = (
  timeline: Timeline,
  interactions: ReadonlyArray<{ readonly time: number; readonly aim: Option.Option<number> }>,
): Timeline => {
  const trees = [...timeline.trees]
  const flights = [...timeline.flights]
  for (const [k, { time, aim }] of Arr.take(interactions, MAX_PLANTS).entries()) {
    const next = random((0x2545f491 ^ Math.round(time * 1000)) + k * 7919)
    const x = Option.getOrElse(aim, () => widestGap(trees, flights, time))
    const sprout = time + PLANT_FLIGHT + REST
    const tree = makeTree(next, { x, scale: 0.4 + next() * 0.1, levels: 5, sprout, grow: PLANT_GROW })
    const from: Point = [tree.x + (next() - 0.5) * 0.3, MARGIN.top + 0.08]
    flights.push({
      from,
      lift: [lerp(from[0], tree.x, 0.6), lerp(from[1], GROUND, 0.4)],
      to: [tree.x, GROUND],
      release: time,
      duration: PLANT_FLIGHT,
      sway: 0.05,
      swings: 1.2,
      tree: -1,
      leaf: -1,
    })
    trees.push(tree)
  }
  return { ...timeline, trees, flights }
}

// ---------------------------------------------------------------------------
// One moment of a run
// ---------------------------------------------------------------------------

export interface FrameBranch {
  readonly tree: number
  readonly from: Point
  readonly to: Point
  readonly width: number
  readonly root: boolean
  // 0 to 1 as two trees' roots knot together where they meet.
  readonly bond: number
}

export interface FrameLeaf {
  readonly tree: number
  readonly x: number
  readonly y: number
  // Its radius in world units, growing as it opens.
  readonly size: number
  // 0 to 1 as it brightens before letting its seed go.
  readonly blossom: number
}

export interface FrameSeed {
  readonly x: number
  readonly y: number
  // A short wisp behind it, the way it's come from.
  readonly tail: Point
  readonly size: number
  readonly alpha: number
  readonly flying: boolean
}

export interface FrameRing {
  readonly x: number
  readonly y: number
  readonly progress: number
}

export interface FrameTree {
  readonly id: number
  readonly x: number
  readonly grown: number
  // Its crown's box as drawn so far.
  readonly left: number
  readonly right: number
  readonly top: number
}

export interface Frame {
  // How far across the ground has drawn, 0 to 1.
  readonly ground: number
  readonly trees: ReadonlyArray<FrameTree>
  readonly branches: ReadonlyArray<FrameBranch>
  readonly leaves: ReadonlyArray<FrameLeaf>
  readonly seeds: ReadonlyArray<FrameSeed>
  readonly rings: ReadonlyArray<FrameRing>
}

const SEED_SIZE = 0.016
const TAIL = 0.05
const SEED_FADE = 0.6

// Each tree reaches a root toward its nearest older neighbour from a third
// of the way through its growth, and the neighbour reaches back. Where they
// meet they knot together, and the tie strengthens for as long as it holds.
const REACH_FROM = 0.35
const reachingFrom = (tree: Tree) => tree.sprout + tree.grow * REACH_FROM
// Trees closer than this meet off to one side.
const MEET_GAP = 0.2

// The tree it reaches its roots toward: the nearest that came up before it.
const neighbourOf = (trees: ReadonlyArray<Tree>, id: number): number => {
  const tree = trees[id]!
  let best = -1
  for (const [j, other] of trees.entries()) {
    if (other.sprout >= tree.sprout) continue
    if (best < 0 || Math.abs(other.x - tree.x) < Math.abs(trees[best]!.x - tree.x)) best = j
  }
  return best
}

// Where two trees' roots meet: halfway between, or off to the side, toward
// the middle of the sheet, if they stand so close there's no room between
// them.
const meetingOf = (tree: Tree, them: Tree): number => {
  const middle = (tree.x + them.x) / 2
  return Math.abs(them.x - tree.x) < MEET_GAP ? middle - (Math.sign(middle) || 1) * MEET_GAP * 0.6 : middle
}

// How far a tree's root toward the meeting point has grown at `time`, and
// when it gets there.
const reachAt = (tree: Tree, meetX: number, time: number) => {
  const distance = Math.abs(meetX - tree.x)
  const rate = reachRateOf(distance)
  const raw = Num.clamp((time - reachingFrom(tree)) * rate, { minimum: 0, maximum: reachLengthOf(distance) })
  const arrives = reachingFrom(tree) + distance / rate
  return { x: tree.x, dir: Math.sign(meetX - tree.x) || 1, distance, raw, arrives }
}

// When the last of a run has finished: every seed down and its landing
// ring gone, every tree, leaf and root grown, and every tie knotted.
const settledAt = (trees: ReadonlyArray<Tree>, flights: ReadonlyArray<Flight>): number => {
  const landed = Arr.map(flights, flight => landingOf(flight) + RING)
  const grown = Arr.map(trees, tree =>
    Math.max(
      tree.sprout + tree.grow,
      tree.sprout + ROOT_GROW,
      ...Arr.map(tree.leaves, leaf => leaf.born + LEAF_OPEN),
    ),
  )
  const tied = Arr.map(trees, (tree, id) => {
    const other = neighbourOf(trees, id)
    if (other < 0) return 0
    const meetX = meetingOf(tree, trees[other]!)
    const met = Math.max(reachAt(tree, meetX, 0).arrives, reachAt(trees[other]!, meetX, 0).arrives)
    return met + Math.max(BOND, OVERLAP_MAX)
  })
  return Math.max(...landed, ...grown, ...tied)
}

// Seconds until a planting has played out, however far its tree reaches.
export const PLANT_SETTLE =
  PLANT_FLIGHT + REST + Math.max(PLANT_GROW, ROOT_GROW, PLANT_GROW * REACH_FROM + REACH_MAX + Math.max(BOND, OVERLAP_MAX))

export const frameAt = (timeline: Timeline, time: number): Frame => {
  const { trees, flights } = timeline

  const trunks: Array<FrameTree> = []
  const branches: Array<FrameBranch> = []
  const leaves: Array<FrameLeaf> = []
  // Which leaves are about to let a seed go, and when.
  const blossoms = new Map<string, number>()
  for (const flight of flights) {
    if (flight.tree >= 0) blossoms.set(`${flight.tree}:${flight.leaf}`, flight.release)
  }

  for (const [id, tree] of trees.entries()) {
    if (time < tree.sprout) continue
    const pose = poseOf(tree, time)
    let left = tree.x
    let right = tree.x
    let top = GROUND
    for (const [i, segment] of tree.segments.entries()) {
      const drawn = pose.drawn[i]!
      if (drawn <= 0) continue
      const base = pose.bases[i]!
      const tip = pose.tips[i]!
      const f = drawn / segment.length
      const to: Point = [lerp(base[0], tip[0], f), lerp(base[1], tip[1], f)]
      // Branches thicken as the tree grows.
      branches.push({
        tree: id,
        from: base,
        to,
        width: segment.width * (0.3 + 0.7 * pose.grown),
        root: false,
        bond: 0,
      })
      left = Math.min(left, to[0])
      right = Math.max(right, to[0])
      top = Math.min(top, to[1])
    }
    for (const root of drawRoots(tree.roots, time - tree.sprout, tree.scale)) {
      branches.push({ tree: id, ...root, root: true, bond: 0 })
    }
    for (const [i, leaf] of tree.leaves.entries()) {
      const open = easeInOut((time - leaf.born) / LEAF_OPEN)
      if (open <= 0) continue
      const [x, y] = pose.tips[leaf.segment]!
      const release = blossoms.get(`${id}:${i}`)
      const blossom =
        release === undefined
          ? 0
          : time < release
            ? easeInOut((time - (release - BLOSSOM)) / BLOSSOM)
            : 1 - easeInOut((time - release) / BLOSSOM)
      leaves.push({ tree: id, x, y, size: 0.0095 * leaf.size * Math.sqrt(tree.scale) * open, blossom })
    }
    trunks.push({ id, x: tree.x, grown: pose.grown, left, right, top })
  }

  // Under the ground, each tree reaches toward its nearest older neighbour,
  // and that neighbour reaches back. They meet halfway and knot together:
  // the longer they've stood side by side, the stronger the tie.
  for (const [id, tree] of trees.entries()) {
    if (time < tree.sprout) continue
    const other = neighbourOf(trees, id)
    if (other < 0) continue
    const them = trees[other]!
    const meetX = meetingOf(tree, them)
    const reachOf = (t: Tree) => reachAt(t, meetX, time)
    const mine = reachOf(tree)
    const theirs = reachOf(them)
    // Neither runs on past the meeting point until the other's got there,
    // and the tie holds from when they meet.
    const together = Math.max(0, Math.min(mine.raw - mine.distance, theirs.raw - theirs.distance))
    const held = time - Math.max(mine.arrives, theirs.arrives)
    const pair = { ground: GROUND, held, seed: id * 7919 + other }
    const draw = (r: typeof mine, twist: number) =>
      drawReach({ ...pair, ...r, twist, length: Math.min(r.raw, r.distance) + together })
    const reaching = draw(mine, 1)
    const back = draw(theirs, -1)
    for (const root of reaching) branches.push({ tree: id, ...root, root: true })
    for (const root of back) branches.push({ tree: other, ...root, root: true })
  }

  const seeds: Array<FrameSeed> = []
  const rings: Array<FrameRing> = []
  for (const [k, flight] of flights.entries()) {
    const since = time - flight.release
    if (since < 0) continue
    const u = since / flight.duration
    const tree = trees[k]!
    // The first seed fades in at the top; the rest are already there, as
    // the blossoms they leave.
    const alpha = flight.tree < 0 ? easeInOut(since / SEED_FADE) : 1
    if (u < 1) {
      const [x, y] = flightAt(flight, u)
      const [bx, by] = flightAt(flight, Math.max(0, u - 0.02))
      const d = Math.max(Math.hypot(x - bx, y - by), 1e-6)
      // The wisp is longest mid-flight and folds away as it lands.
      const tail = TAIL * Math.min(1, u * 6, (1 - u) * 6)
      seeds.push({
        x,
        y,
        tail: [x - ((x - bx) / d) * tail, y - ((y - by) / d) * tail],
        size: SEED_SIZE,
        alpha,
        flying: true,
      })
    } else {
      // On the ground until the sprout takes it in.
      const left = 1 - clamp01((time - tree.sprout) / (tree.grow * 0.2))
      if (left > 0) {
        const [x, y] = flight.to
        seeds.push({ x, y, tail: [x, y], size: SEED_SIZE * (0.4 + 0.6 * left), alpha: left, flying: false })
      }
      const landed = time - landingOf(flight)
      if (landed < RING) rings.push({ x: flight.to[0], y: flight.to[1], progress: landed / RING })
    }
  }

  return {
    ground: easeInOut(time / GROUND_DRAW),
    trees: trunks,
    branches,
    leaves,
    seeds,
    rings,
  }
}

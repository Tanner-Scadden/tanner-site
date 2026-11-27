// NOTE: the network diagram in the blog post, as data. A seed grows one
// whole run up front.
//
// The run tells the post's story in two beats:
//   1. You start alone in the middle and help people, one at a time. Each
//      one brings a few of their own people with them.
//   2. Those networks keep growing without you: friends bring in friends,
//      friends of friends meet, and neighbouring networks join up. The more
//      people there are, the faster it grows.
//
// The layout is settled once for the finished network, so everyone appears
// where they'll end up. While the run plays, a light force simulation lets
// the network breathe around those spots without shoving anyone across the
// canvas. It's kept as keyframes, so a slider can scrub to any moment and
// `frameAt` reads it without simulating anything.
//
// A reader can add a bad interaction (see `tearsOf`): a red ripple goes out
// from you along your link to someone you helped, and the link tears.
// Their branch, everyone who came in through them, dims and pulls away a
// little.

import { Array as Arr, Number as Num, Option } from 'effect'

import { FADE, HOLD } from '../../animation/controls.ts'
import { clamp01, random } from '../../animation/kit.ts'

export interface GraphNode {
  // When they appear, once the link that brings them in reaches them.
  readonly born: number
  // Who they joined through.
  readonly parent: number
  // The person you helped whose network they belong to. You're -1.
  readonly circle: number
}

export interface GraphEdge {
  readonly a: number
  readonly b: number
  // When it starts drawing, from `a` toward `b`.
  readonly born: number
  // Made by you, rather than by the network on its own.
  readonly yours: boolean
}

// You help someone new: a link reaches out from you to them.
export interface Help {
  readonly person: number
  readonly start: number
}

export interface Timeline {
  readonly nodes: ReadonlyArray<GraphNode>
  readonly edges: ReadonlyArray<GraphEdge>
  readonly helps: ReadonlyArray<Help>
  // When the last thing has happened.
  readonly end: number
  // Where everyone is every KEY seconds, as x, y pairs in node order.
  readonly layout: ReadonlyArray<Float32Array>
}

// The graph lives in a box this wide and tall around you, in world units.
export const BOUNDS = { x: 1.6, y: 0.9 } as const
export const MAX_NODES = 72
export const MAX_EDGES = 150

// How long a link takes to draw, and a person to appear once it reaches
// them.
const GROW = 0.5
const POP = 0.35
// When you help the first person, and how long until the next.
const FIRST_HELP = 0.8
const HELP_GAP = 1.3
// How long a circle stays lit after you help the person at its middle.
const PULSE = 1.8
// The network grows on its own from GROWTH_START until GROWTH_END.
const GROWTH_START = 2.4
const GROWTH_END = 17.8
const GROWTH_TICK = 0.25
// Joins per second for each person already there, so it compounds.
const GROWTH_RATE = 0.09
// A beat after the last link finishes drawing, so the run doesn't stop the
// instant it's done.
const TAIL = 0.8
// Layout keyframes, and simulation steps per keyframe.
const KEY = 1 / 20
const STEPS = 2

const keyOf = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)

// How many links each person is from you, over these links, by
// breadth-first search. -1 is out of reach.
export const distancesFrom = (count: number, links: ReadonlyArray<GraphEdge>) => {
  const around: Array<Array<number>> = Arr.makeBy(count, () => [])
  for (const { a, b } of links) {
    around[a]!.push(b)
    around[b]!.push(a)
  }
  const distance = new Int32Array(count).fill(-1)
  distance[0] = 0
  const queue = [0]
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!
    for (const j of around[i]!) {
      if (distance[j] !== -1) continue
      distance[j] = distance[i]! + 1
      queue.push(j)
    }
  }
  return { distance }
}

// ---------------------------------------------------------------------------
// What happens, and when
// ---------------------------------------------------------------------------

const buildEvents = (seed: number) => {
  const next = random(seed)
  const chance = (p: number) => next() < p
  const pick = <A>(items: ReadonlyArray<A>): Option.Option<A> => Arr.get(items, Math.floor(next() * items.length))

  const nodes: Array<GraphNode> = [{ born: -1, parent: 0, circle: -1 }]
  const edges: Array<GraphEdge> = []
  const helps: Array<Help> = []
  const pairs = new Set<string>()

  const present = (i: number, at: number) => nodes[i]!.born <= at
  const neighbours = (i: number, at: number): ReadonlyArray<number> =>
    Arr.flatMap(edges, edge => (edge.born > at ? [] : edge.a === i ? [edge.b] : edge.b === i ? [edge.a] : []))
  // Friends of friends who haven't met yet. Never you: you're not in this
  // part.
  const reachable = (i: number, at: number): ReadonlyArray<number> => {
    const known = new Set(neighbours(i, at))
    return Arr.dedupe(
      Arr.flatMap(Arr.fromIterable(known), k =>
        Arr.filter(neighbours(k, at), j => j !== i && j !== 0 && !known.has(j) && !pairs.has(keyOf(i, j))),
      ),
    )
  }

  const link = (a: number, b: number, born: number, yours: boolean): boolean => {
    if (a === b || pairs.has(keyOf(a, b)) || edges.length >= MAX_EDGES) return false
    if (!present(a, born) || !present(b, born)) return false
    pairs.add(keyOf(a, b))
    edges.push({ a, b, born, yours })
    return true
  }

  // Someone new joins through `from`, in `circle`, or a circle of their own
  // when that's -1. The link starts at `at`, and they appear as it reaches
  // them.
  const meet = (from: number, at: number, yours: boolean, circle: number): Option.Option<number> => {
    if (nodes.length >= MAX_NODES || edges.length >= MAX_EDGES || !present(from, at)) return Option.none()
    const i = nodes.length
    nodes.push({ born: at + GROW * 0.9, parent: from, circle: circle === -1 ? i : circle })
    pairs.add(keyOf(from, i))
    edges.push({ a: from, b: i, born: at, yours })
    return Option.some(i)
  }

  // Beat 1: you help people, and each brings a few of their own.
  const helpCount = 6 + Math.floor(next() * 2)
  for (let k = 0; k < helpCount; k++) {
    const start = FIRST_HELP + k * HELP_GAP
    Option.map(meet(0, start, true, -1), person => {
      helps.push({ person, start })
      const crowd = 2 + Math.floor(next() * 2)
      for (let j = 0; j < crowd; j++) meet(person, nodes[person]!.born + 0.2 + j * 0.22, false, person)
    })
  }
  const spokes = Arr.map(helps, help => help.person)

  // Beat 2: meanwhile, without you. Each tick, everyone there has a small
  // chance of bringing someone in, so the more people there are, the
  // faster it grows.
  for (let at = GROWTH_START; at < GROWTH_END; at += GROWTH_TICK) {
    const people = Arr.filter(Arr.range(1, nodes.length - 1), i => present(i, at))
    const joins = people.length * GROWTH_RATE * GROWTH_TICK
    const count = Math.floor(joins) + (chance(joins - Math.floor(joins)) ? 1 : 0)
    for (let e = 0; e < count; e++) {
      const when = at + next() * GROWTH_TICK
      // Of two people, whoever knows fewer, so nobody becomes a hub.
      const host = Option.flatMap(pick(people), a =>
        Option.map(pick(people), b => (neighbours(a, when).length <= neighbours(b, when).length ? a : b)),
      )
      Option.map(host, p => {
        const circle = nodes[p]!.circle
        meet(p, when, false, circle)
        // Sometimes friends of friends meet, or the network reaches across
        // to the one beside it.
        const roll = next()
        if (roll < 0.4) Option.map(pick(reachable(p, when)), q => link(p, q, when + 0.2, false))
        else if (roll < 0.6) {
          const side = Arr.findFirstIndex(spokes, s => s === circle)
          const step = chance(0.5) ? 1 : spokes.length - 1
          const beside = Option.flatMap(side, k => Arr.get(spokes, (k + step) % spokes.length))
          const across = Option.flatMap(beside, other =>
            pick(Arr.filter(people, j => nodes[j]!.circle === other && j !== other && present(j, when))),
          )
          Option.map(across, q => link(p, q, when + 0.2, false))
        }
      })
    }
  }

  const lastGrown = Arr.reduce(edges, 0, (latest, edge) => Math.max(latest, edge.born + GROW))
  const end = Math.max(lastGrown, GROWTH_END) + TAIL
  return { nodes, edges, helps, end }
}

// ---------------------------------------------------------------------------
// Where everyone is
// ---------------------------------------------------------------------------

// People push each other apart, links pull them together at a length that
// depends on whose link it is, and everyone is drawn gently toward you in
// the middle, harder up and down, so the network fills the wide canvas.
// Soft walls keep them on it.
const REPEL = 0.0004
const SPRING = 0.06
const YOUR_LENGTH = 0.42
const THEIR_LENGTH = 0.2
const GRAVITY = { x: 0.006, y: 0.02 } as const
const WALL = 0.08
const DAMP = 0.72
// Settling the finished network: steps, and the top speed as it cools.
const SETTLE_STEPS = 600
const SETTLE_SPEED = 0.05
// While it plays: how hard everyone is held to their settled spot, and how
// fast anyone may move, in world units per step.
const ANCHOR = 0.05
const MAX_SPEED = 0.004
// How much of the settling forces still act while it plays, so people
// shift a little as their neighbours arrive.
const LIVE = 0.35

const WX = BOUNDS.x - 0.12
const WY = BOUNDS.y - 0.1

interface Forces {
  readonly x: Float64Array
  readonly y: Float64Array
  readonly fx: Float64Array
  readonly fy: Float64Array
}

const repel = ({ x, y, fx, fy }: Forces, active: ReadonlyArray<number>, scale: number) => {
  for (let p = 0; p < active.length; p++) {
    const i = active[p]!
    for (let q = p + 1; q < active.length; q++) {
      const j = active[q]!
      const dx = x[i]! - x[j]!
      const dy = y[i]! - y[j]!
      const d2 = Math.max(dx * dx + dy * dy, 0.004)
      const d = Math.sqrt(d2)
      const f = (REPEL * scale) / d2
      fx[i]! += (dx / d) * f
      fy[i]! += (dy / d) * f
      fx[j]! -= (dx / d) * f
      fy[j]! -= (dy / d) * f
    }
  }
}

const pull = ({ x, y, fx, fy }: Forces, links: ReadonlyArray<GraphEdge>, strength: (edge: GraphEdge) => number) => {
  for (const edge of links) {
    const { a, b } = edge
    const dx = x[b]! - x[a]!
    const dy = y[b]! - y[a]!
    const d = Math.max(Math.hypot(dx, dy), 0.001)
    const f = SPRING * strength(edge) * (d - (edge.yours ? YOUR_LENGTH : THEIR_LENGTH))
    fx[a]! += (dx / d) * f
    fy[a]! += (dy / d) * f
    fx[b]! -= (dx / d) * f
    fy[b]! -= (dy / d) * f
  }
}

// Moves everyone but you by their force, damped and capped.
const move = (
  forces: Forces,
  v: { vx: Float64Array; vy: Float64Array },
  active: ReadonlyArray<number>,
  cap: number,
) => {
  const { x, y, fx, fy } = forces
  const { vx, vy } = v
  for (const i of active) {
    if (i === 0) continue
    if (Math.abs(x[i]!) > WX) fx[i]! -= Math.sign(x[i]!) * (Math.abs(x[i]!) - WX) * WALL
    if (Math.abs(y[i]!) > WY) fy[i]! -= Math.sign(y[i]!) * (Math.abs(y[i]!) - WY) * WALL
    vx[i] = (vx[i]! + fx[i]!) * DAMP
    vy[i] = (vy[i]! + fy[i]!) * DAMP
    const speed = Math.hypot(vx[i]!, vy[i]!)
    if (speed > cap) {
      vx[i] = (vx[i]! / speed) * cap
      vy[i] = (vy[i]! / speed) * cap
    }
    x[i] = Num.clamp(x[i]! + vx[i]!, {
      minimum: -BOUNDS.x + 0.02,
      maximum: BOUNDS.x - 0.02,
    })
    y[i] = Num.clamp(y[i]! + vy[i]!, {
      minimum: -BOUNDS.y + 0.02,
      maximum: BOUNDS.y - 0.02,
    })
  }
}

// Where everyone ends up once the whole network is there. The people you
// helped start evenly round you, everyone else just outside whoever brought
// them in, then it all settles as it cools. Starting round you keeps each
// network on its own side.
const settle = (seed: number, nodes: ReadonlyArray<GraphNode>, edges: ReadonlyArray<GraphEdge>) => {
  const next = random(seed ^ 0x9e3779b9)
  const n = nodes.length
  const forces = {
    x: new Float64Array(n),
    y: new Float64Array(n),
    fx: new Float64Array(n),
    fy: new Float64Array(n),
  }
  const v = { vx: new Float64Array(n), vy: new Float64Array(n) }
  const spokes = Arr.filter(Arr.range(1, n - 1), i => nodes[i]!.parent === 0)
  const turn = next() * Math.PI * 2
  for (let i = 1; i < n; i++) {
    const parent = nodes[i]!.parent
    const angle = Option.match(
      Arr.findFirstIndex(spokes, s => s === i),
      {
        onSome: k => turn + (k / spokes.length) * Math.PI * 2,
        onNone: () => Math.atan2(forces.y[parent]!, forces.x[parent]!) + (next() - 0.5) * 1.6,
      },
    )
    const length = parent === 0 ? YOUR_LENGTH : THEIR_LENGTH
    forces.x[i] = Num.clamp(forces.x[parent]! + Math.cos(angle) * length * 1.6, { minimum: -WX, maximum: WX })
    forces.y[i] = Num.clamp(forces.y[parent]! + Math.sin(angle) * length, { minimum: -WY, maximum: WY })
  }
  const everyone = Arr.range(0, n - 1)
  for (let step = 0; step < SETTLE_STEPS; step++) {
    forces.fx.fill(0)
    forces.fy.fill(0)
    repel(forces, everyone, 1)
    pull(forces, edges, () => 1)
    for (let i = 1; i < n; i++) {
      forces.fx[i]! -= forces.x[i]! * GRAVITY.x
      forces.fy[i]! -= forces.y[i]! * GRAVITY.y
    }
    const cooled = SETTLE_SPEED * (1 - step / SETTLE_STEPS) + 0.001
    move(forces, v, everyone, cooled)
  }
  return { x: forces.x, y: forces.y }
}

const simulate = (
  seed: number,
  nodes: ReadonlyArray<GraphNode>,
  edges: ReadonlyArray<GraphEdge>,
  until: number,
): ReadonlyArray<Float32Array> => {
  const home = settle(seed, nodes, edges)
  const n = nodes.length
  const forces = {
    x: new Float64Array(home.x),
    y: new Float64Array(home.y),
    fx: new Float64Array(n),
    fy: new Float64Array(n),
  }
  const v = { vx: new Float64Array(n), vy: new Float64Array(n) }
  const keys: Array<Float32Array> = []

  for (let k = 0; k * KEY <= until + KEY; k++) {
    const t = k * KEY
    // Nobody moves before they're there, so they appear on their spot.
    const active = Arr.filter(Arr.range(0, n - 1), i => nodes[i]!.born <= t)
    const links = Arr.filter(edges, edge => edge.born <= t)
    for (let step = 0; step < STEPS; step++) {
      forces.fx.fill(0)
      forces.fy.fill(0)
      repel(forces, active, LIVE)
      pull(forces, links, edge => LIVE * clamp01((t - edge.born) / GROW))
      for (const i of active) {
        forces.fx[i]! += (home.x[i]! - forces.x[i]!) * ANCHOR
        forces.fy[i]! += (home.y[i]! - forces.y[i]!) * ANCHOR
      }
      move(forces, v, active, MAX_SPEED)
    }
    const key = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      key[i * 2] = forces.x[i]!
      key[i * 2 + 1] = forces.y[i]!
    }
    keys.push(key)
  }
  return keys
}

export const buildTimeline = (seed: number): Timeline => {
  const { nodes, edges, helps, end } = buildEvents(seed)
  const layout = simulate(seed, nodes, edges, end + HOLD + FADE)
  return { nodes, edges, helps, end, layout }
}

// Where person `i` is at `time`, between the two nearest keyframes.
export const positionAt = (timeline: Timeline, i: number, time: number): readonly [number, number] => {
  const { layout } = timeline
  const k = Num.clamp(time / KEY, { minimum: 0, maximum: layout.length - 1 })
  const k0 = Math.floor(k)
  const k1 = Math.min(k0 + 1, layout.length - 1)
  const f = k - k0
  const a = layout[k0]!
  const b = layout[k1]!
  return [a[i * 2]! + (b[i * 2]! - a[i * 2]!) * f, a[i * 2 + 1]! + (b[i * 2 + 1]! - a[i * 2 + 1]!) * f]
}

// ---------------------------------------------------------------------------
// One moment of a run
// ---------------------------------------------------------------------------

// You, the people you've helped, the people one link past them, and
// everyone further out.
export type DotKind = 'you' | 'met' | 'circle' | 'stranger'
// Links that touch you, links that touch someone you helped, and the rest.
export type EdgeKind = 'yours' | 'circle' | 'remote'

export interface FrameEdge {
  // The two people it joins.
  readonly a: number
  readonly b: number
  readonly from: readonly [number, number]
  readonly to: readonly [number, number]
  readonly kind: EdgeKind
  // 0 to 1 while its circle is lit up.
  readonly lit: number
  // 0 to 1 as a bad interaction dims it.
  readonly cut: number
}

export interface FrameDot {
  readonly id: number
  readonly x: number
  readonly y: number
  // 0 to 1 as the person appears.
  readonly grown: number
  readonly kind: DotKind
  readonly lit: number
  // 0 to 1 as a bad interaction dims their branch.
  readonly cut: number
}

// A ring that spreads out from someone when you help them.
export interface FrameRing {
  readonly x: number
  readonly y: number
  readonly progress: number
  // Red, from a bad interaction.
  readonly alarm?: boolean
}

// Your link to someone, just torn: each end springs back toward its own
// side from the middle.
export interface FrameSnap {
  readonly you: readonly [number, number]
  readonly them: readonly [number, number]
  readonly mid: readonly [number, number]
  readonly progress: number
}

export interface Frame {
  readonly edges: ReadonlyArray<FrameEdge>
  readonly dots: ReadonlyArray<FrameDot>
  readonly rings: ReadonlyArray<FrameRing>
  // Bright points travelling a link: your help going out.
  readonly sparks: ReadonlyArray<readonly [number, number]>
  // Bad interactions on their way out along your link, from you to where
  // they've got to.
  readonly ripples: ReadonlyArray<{ readonly from: readonly [number, number]; readonly to: readonly [number, number] }>
  readonly snaps: ReadonlyArray<FrameSnap>
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const lerp = (a: readonly [number, number], b: readonly [number, number], t: number): readonly [number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]

const xy = ([x, y]: readonly [number, number]) => ({ x, y })

// ---------------------------------------------------------------------------
// Bad interactions
// ---------------------------------------------------------------------------

// A bad interaction with someone you helped: the ripple leaves you at
// `start` and tears your link to them when it gets there. -1 is a bad
// interaction with nobody left to lose, which only ripples out from you.
export interface Tear {
  readonly person: number
  readonly start: number
  // Their branch: everyone in their circle.
  readonly branch: ReadonlyArray<number>
  // Which way their branch pulls away, a unit vector away from you.
  readonly away: readonly [number, number]
}

// The ripple's trip along your link, how long the torn ends take to
// spring back, and how long the branch takes to dim and pull away, and how
// far it goes.
export const RIPPLE = 0.7
const SNAP = 0.9
const DRIFT = 1.4
const PULL = 0.1
// Seconds until a tear has played out.
export const TEAR_SETTLE = RIPPLE + DRIFT
// The most bad interactions a run takes: one per person you could help,
// and one more with nobody left.
export const MAX_TEARS = 8

export const tornAt = (tear: Tear): number => tear.start + RIPPLE

// What each interaction does, in the order they happened. An interaction
// aimed near someone you helped who's still with you tears their link;
// otherwise it's the biggest branch you still have. `aim` is in world
// units.
export const tearsOf = (
  timeline: Timeline,
  interactions: ReadonlyArray<{ readonly time: number; readonly aim: Option.Option<readonly [number, number]> }>,
): ReadonlyArray<Tear> => {
  const { nodes, helps } = timeline
  const tears: Array<Tear> = []
  for (const { time, aim } of interactions) {
    const torn = new Set(Arr.map(tears, tear => tear.person))
    const left = Arr.filter(helps, help => nodes[help.person]!.born <= time && !torn.has(help.person))
    const sizeOf = (person: number) =>
      Arr.filter(nodes, (node, i) => i !== person && node.circle === person && node.born <= time).length
    const aimed = Option.flatMap(aim, ([x, y]) => {
      let best = Option.none<number>()
      let nearest = AIM_REACH ** 2
      for (const { person } of left) {
        const [px, py] = positionAt(timeline, person, time)
        const d = (px - x) ** 2 + (py - y) ** 2
        if (d < nearest) {
          nearest = d
          best = Option.some(person)
        }
      }
      return best
    })
    const biggest = Arr.reduce(left, Option.none<number>(), (best, { person }) =>
      Option.match(best, {
        onNone: () => Option.some(person),
        onSome: b => Option.some(sizeOf(person) > sizeOf(b) ? person : b),
      }),
    )
    const person = Option.getOrElse(Option.orElse(aimed, () => biggest), () => -1)
    const branch = Arr.filter(Arr.range(1, nodes.length - 1), i => person >= 0 && nodes[i]!.circle === person)
    const [ax, ay] = person >= 0 ? positionAt(timeline, person, time) : [1, 0]
    const d = Math.max(Math.hypot(ax, ay), 1e-6)
    tears.push({ person, start: time, branch, away: [ax / d, ay / d] })
  }
  return tears
}

// How close, in world units, an aimed interaction has to be to someone.
const AIM_REACH = 0.25

// How long a ring takes to spread.
const RING = 1.2

export const frameAt = (timeline: Timeline, time: number, tears: ReadonlyArray<Tear> = []): Frame => {
  const { nodes, edges, helps } = timeline

  // The bad interactions so far: how far each branch has dimmed and pulled
  // away, and which of your links have torn.
  const started = Arr.filter(tears, tear => tear.start <= time)
  const cut = new Map<number, number>()
  const pulls = new Map<number, readonly [number, number]>()
  const torn = new Set<number>()
  for (const tear of started) {
    if (tear.person < 0) continue
    const drift = ease(clamp01((time - tornAt(tear)) / DRIFT))
    if (time >= tornAt(tear)) torn.add(tear.person)
    for (const i of tear.branch) {
      cut.set(i, Math.max(cut.get(i) ?? 0, drift))
      const [px, py] = pulls.get(i) ?? [0, 0]
      pulls.set(i, [px + tear.away[0] * PULL * drift, py + tear.away[1] * PULL * drift])
    }
  }
  const cutOf = (i: number) => cut.get(i) ?? 0
  const at = (i: number): readonly [number, number] => {
    const [x, y] = positionAt(timeline, i, time)
    const [px, py] = pulls.get(i) ?? [0, 0]
    return [
      Num.clamp(x + px, { minimum: -BOUNDS.x + 0.02, maximum: BOUNDS.x - 0.02 }),
      Num.clamp(y + py, { minimum: -BOUNDS.y + 0.02, maximum: BOUNDS.y - 0.02 }),
    ]
  }

  // How far everyone is from you over the links started so far, so nobody
  // changes colour just as they appear.
  const { distance } = distancesFrom(
    nodes.length,
    Arr.filter(edges, edge => edge.born <= time),
  )

  const rings: Array<FrameRing> = []
  const sparks: Array<readonly [number, number]> = []
  const pulse = new Map<number, number>()
  for (const help of helps) {
    const grown = (time - help.start) / GROW
    if (grown > 0 && grown < 1) sparks.push(lerp(at(0), at(help.person), ease(grown)))
    const since = time - nodes[help.person]!.born
    if (since >= 0 && since < PULSE) {
      if (since < RING) rings.push({ ...xy(at(help.person)), progress: since / RING })
      pulse.set(help.person, 1 - since / PULSE)
    }
  }
  const litOf = (i: number) => Math.max(pulse.get(nodes[i]!.circle) ?? 0, pulse.get(i) ?? 0)

  const known = (i: number) => distance[i]! >= 0
  const kindOf = (i: number): DotKind => {
    const d = distance[i]!
    return d === 0 ? 'you' : d === 1 ? 'met' : d === 2 ? 'circle' : 'stranger'
  }

  // The ripples on their way out, and the torn links springing back.
  const ripples: Array<{ readonly from: readonly [number, number]; readonly to: readonly [number, number] }> = []
  const snaps: Array<FrameSnap> = []
  for (const tear of started) {
    const since = time - tear.start
    if (tear.person < 0) {
      if (since < RING) rings.push({ ...xy(at(0)), progress: since / RING, alarm: true })
      continue
    }
    if (since < RIPPLE) ripples.push({ from: at(0), to: lerp(at(0), at(tear.person), ease(since / RIPPLE)) })
    const sinceTorn = time - tornAt(tear)
    if (sinceTorn < 0) continue
    const mid = lerp(at(0), at(tear.person), 0.5)
    if (sinceTorn < SNAP) snaps.push({ you: at(0), them: at(tear.person), mid, progress: sinceTorn / SNAP })
    if (sinceTorn < RING) rings.push({ ...xy(mid), progress: sinceTorn / RING, alarm: true })
  }

  const tornLink = (edge: GraphEdge) =>
    (edge.a === 0 && torn.has(edge.b)) || (edge.b === 0 && torn.has(edge.a))

  return {
    edges: Arr.flatMap(edges, (edge): ReadonlyArray<FrameEdge> => {
      const grown = ease(clamp01((time - edge.born) / GROW))
      if (grown <= 0 || tornLink(edge)) return []
      const from = at(edge.a)
      const near = Math.min(
        known(edge.a) ? distance[edge.a]! : 99,
        known(edge.b) ? distance[edge.b]! : 99,
      )
      return [
        {
          a: edge.a,
          b: edge.b,
          from,
          to: lerp(from, at(edge.b), grown),
          kind: near === 0 ? 'yours' : near === 1 ? 'circle' : 'remote',
          lit: Math.max(litOf(edge.a), litOf(edge.b)),
          cut: Math.max(cutOf(edge.a), cutOf(edge.b)),
        },
      ]
    }),
    dots: Arr.flatMap(nodes, (node, i): ReadonlyArray<FrameDot> => {
      const grown = ease(clamp01((time - node.born) / POP))
      if (grown <= 0) return []
      const [x, y] = at(i)
      return [
        {
          id: i,
          x,
          y,
          grown,
          kind: i === 0 ? 'you' : kindOf(i),
          lit: litOf(i),
          cut: cutOf(i),
        },
      ]
    }),
    rings,
    sparks,
    ripples,
    snaps,
  }
}

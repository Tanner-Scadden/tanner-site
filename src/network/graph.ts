// NOTE: the network diagram in the blog post, as data. A seed grows one
// whole run up front.
//
// You start alone in the middle and hop from person to person. Everyone you
// help brings their own people with them, and those people keep meeting
// each other and bringing in friends, whether you're there or not.
//
// The layout is settled once for the finished network, so everyone appears
// where they'll end up. While the run plays, a light force simulation lets
// the network breathe around those spots without shoving anyone across the
// canvas. It's kept as keyframes, so a slider can scrub to any moment and
// `frameAt` reads it without simulating anything.

import { Array as Arr, Number as Num, Option } from 'effect'

import { FADE, HOLD } from '../blog/animation/controls.ts'

export interface GraphNode {
  readonly born: number
  // Who they joined through.
  readonly parent: number
  // The person you reached whose own network they belong to. You're -1.
  readonly circle: number
}

export interface GraphEdge {
  readonly a: number
  readonly b: number
  readonly born: number
  // Made by you, rather than by the network on its own.
  readonly yours: boolean
}

// You walk from one person to the next, starting at `start`.
export interface Hop {
  readonly from: number
  readonly to: number
  readonly start: number
}

export interface Timeline {
  readonly nodes: ReadonlyArray<GraphNode>
  readonly edges: ReadonlyArray<GraphEdge>
  readonly hops: ReadonlyArray<Hop>
  // When the last thing has happened.
  readonly end: number
  // Where everyone is every KEY seconds, as x, y pairs in node order.
  readonly layout: ReadonlyArray<Float32Array>
}

// The graph lives in a box this wide and tall around you, in world units.
export const BOUNDS = { x: 1.6, y: 0.9 } as const
export const MAX_NODES = 64
export const MAX_EDGES = 200
const HOPS = 22
// The seconds one hop takes, and how much of it is walking.
export const HOP = 1.1
const WALK = 0.7
// How long a link takes to draw, and a person to appear.
export const GROW = 0.6
const POP = 0.35
// How long a circle stays lit after you reach the person at its middle.
export const PULSE = 1.8
// Layout keyframes, and simulation steps per keyframe.
const KEY = 1 / 20
const STEPS = 2

// Mulberry32: a small seeded generator, so a run replays from its seed.
const random = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const keyOf = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)

// When the walker reaches the person at the end of a hop.
export const arrivalOf = (hop: Hop): number => hop.start + HOP * WALK

// ---------------------------------------------------------------------------
// What happens, and when
// ---------------------------------------------------------------------------

const buildEvents = (seed: number) => {
  const next = random(seed)
  const chance = (p: number) => next() < p
  const pick = <A>(items: ReadonlyArray<A>): Option.Option<A> => Arr.get(items, Math.floor(next() * items.length))

  const nodes: Array<GraphNode> = [{ born: -1, parent: 0, circle: -1 }]
  const edges: Array<GraphEdge> = []
  const hops: Array<Hop> = []
  const pairs = new Set<string>()
  // Everyone you've reached.
  const reached = new Set<number>()

  const present = (i: number, at: number) => nodes[i]!.born <= at
  const neighbours = (i: number, at: number): ReadonlyArray<number> =>
    Arr.flatMap(edges, edge => (edge.born > at ? [] : edge.a === i ? [edge.b] : edge.b === i ? [edge.a] : []))
  // Friends of friends you've never been linked to.
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
  // when that's -1.
  const meet = (from: number, born: number, yours: boolean, circle: number): Option.Option<number> => {
    if (nodes.length >= MAX_NODES || edges.length >= MAX_EDGES || !present(from, born)) return Option.none()
    const i = nodes.length
    nodes.push({ born, parent: from, circle: circle === -1 ? i : circle })
    link(from, i, born, yours)
    return Option.some(i)
  }

  let at = 0
  let time = 0.4
  for (let step = 0; step < HOPS; step++) {
    const roll = next()
    const fresh = step < 4 || roll < 0.4 ? meet(at, time, true, -1) : Option.none()
    const to = Option.getOrElse(fresh, () => {
      const introduced = roll < 0.72 ? pick(reachable(at, time)) : Option.none()
      return Option.match(introduced, {
        onSome: i => {
          link(at, i, time, true)
          return i
        },
        onNone: () => {
          const known = neighbours(at, time)
          const back = at !== 0 && roll < 0.85 && Arr.contains(known, 0)
          return back ? 0 : Option.getOrElse(pick(known), () => at)
        },
      })
    })
    const hop = { from: at, to, start: time }
    hops.push(hop)
    if (to !== 0) reached.add(to)
    // Help someone new, and their people show up with them.
    if (Option.isSome(fresh)) {
      const arrived = arrivalOf(hop)
      const crowd = 1 + Math.floor(next() * 3)
      for (let j = 0; j < crowd; j++) meet(to, arrived + 0.1 + j * 0.15, false, to)
    }
    at = to

    // Meanwhile, without you.
    const quiet = 2 + Math.floor(next() * 2)
    for (let i = 0; i < quiet; i++) {
      const when = time + next() * HOP
      const others = Arr.filter(Arr.range(1, Math.max(1, nodes.length - 1)), j => j < nodes.length && present(j, when))
      Option.map(pick(others), p => {
        const circle = nodes[p]!.circle
        // People keep meeting people: a friend, a pair of friends, or a
        // friend of a friend.
        const roll = next()
        // Someone you've helped stays in touch.
        if (reached.has(p) && chance(0.25)) link(0, p, when, true)
        else if (roll < 0.4) meet(p, when, false, circle)
        else if (roll < 0.6) {
          const first = meet(p, when, false, circle)
          const second = meet(p, when + 0.12, false, circle)
          if (Option.isSome(first) && Option.isSome(second)) {
            link(first.value, second.value, when + 0.3, false)
          }
        } else Option.map(pick(reachable(p, when)), q => link(p, q, when, false))
      })
    }

    time += HOP
  }

  const end = Arr.reduce(edges, time, (latest, edge) => Math.max(latest, edge.born + GROW))
  return { nodes, edges, hops, end }
}

// ---------------------------------------------------------------------------
// Where everyone is
// ---------------------------------------------------------------------------

// People push each other apart, links pull them together at a length that
// depends on whose link it is, and everyone is drawn gently toward you in
// the middle. Soft walls keep them on the canvas.
const REPEL = 0.00035
const SPRING = 0.06
const YOUR_LENGTH = 0.4
const THEIR_LENGTH = 0.2
const GRAVITY = 0.012
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

// Where everyone ends up once the whole network is there. Each person
// starts beside whoever brought them in, then it all settles as it cools.
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
  for (let i = 1; i < n; i++) {
    const parent = nodes[i]!.parent
    const angle = next() * Math.PI * 2
    forces.x[i] = Num.clamp(forces.x[parent]! + Math.cos(angle) * THEIR_LENGTH, { minimum: -WX, maximum: WX })
    forces.y[i] = Num.clamp(forces.y[parent]! + Math.sin(angle) * THEIR_LENGTH, { minimum: -WY, maximum: WY })
  }
  const everyone = Arr.range(0, n - 1)
  for (let step = 0; step < SETTLE_STEPS; step++) {
    forces.fx.fill(0)
    forces.fy.fill(0)
    repel(forces, everyone, 1)
    pull(forces, edges, () => 1)
    for (let i = 1; i < n; i++) {
      forces.fx[i]! -= forces.x[i]! * GRAVITY
      forces.fy[i]! -= forces.y[i]! * GRAVITY
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
      pull(forces, links, edge => LIVE * Num.clamp((t - edge.born) / GROW, { minimum: 0, maximum: 1 }))
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
  const { nodes, edges, hops, end } = buildEvents(seed)
  const layout = simulate(seed, nodes, edges, end + HOLD + FADE)
  return { nodes, edges, hops, end, layout }
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

// You, the people you've reached, the people in the networks of the people
// you've reached, and everyone else.
export type DotKind = 'you' | 'met' | 'circle' | 'stranger'
export type EdgeKind = 'yours' | 'circle' | 'remote'

export interface FrameEdge {
  // The two people it joins.
  readonly a: number
  readonly b: number
  readonly from: readonly [number, number]
  readonly to: readonly [number, number]
  readonly kind: EdgeKind
  // Lit while you're walking it.
  readonly walking: boolean
  // 0 to 1 while its circle is lit up.
  readonly lit: number
}

export interface FrameDot {
  readonly id: number
  readonly x: number
  readonly y: number
  // 0 to 1 as the person appears.
  readonly grown: number
  readonly kind: DotKind
  readonly lit: number
}

// A ring that spreads out from someone the moment you reach them.
export interface FrameRing {
  readonly x: number
  readonly y: number
  readonly progress: number
}

export interface Frame {
  readonly edges: ReadonlyArray<FrameEdge>
  readonly dots: ReadonlyArray<FrameDot>
  readonly rings: ReadonlyArray<FrameRing>
  readonly walker: readonly [number, number]
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const clamp01 = (t: number): number => Num.clamp(t, { minimum: 0, maximum: 1 })

export const frameAt = (timeline: Timeline, time: number): Frame => {
  const { nodes, edges, hops } = timeline
  const at = (i: number) => positionAt(timeline, i, time)

  // Who you've reached by now, and whose circle is lit.
  const met = new Set<number>([0])
  const pulse = new Map<number, number>()
  const rings: Array<FrameRing> = []
  for (const hop of hops) {
    const arrived = arrivalOf(hop)
    if (arrived > time || hop.from === hop.to) continue
    met.add(hop.to)
    const progress = (time - arrived) / PULSE
    if (progress < 1 && hop.to !== 0) {
      const [x, y] = at(hop.to)
      rings.push({ x, y, progress })
      pulse.set(hop.to, Math.max(pulse.get(hop.to) ?? 0, 1 - progress))
    }
  }
  const known = (i: number) => met.has(i) || met.has(nodes[i]!.circle)
  const litOf = (i: number) => Math.max(pulse.get(nodes[i]!.circle) ?? 0, pulse.get(i) ?? 0)

  const hop = Arr.findLast(hops, h => h.start <= time)
  const walked = Option.match(hop, {
    onNone: () => 1,
    onSome: h => clamp01((time - h.start) / (HOP * WALK)),
  })
  const walker = Option.match(hop, {
    onNone: (): readonly [number, number] => at(0),
    onSome: (h): readonly [number, number] => {
      const [fx, fy] = at(h.from)
      const [tx, ty] = at(h.to)
      const t = ease(walked)
      return [fx + (tx - fx) * t, fy + (ty - fy) * t]
    },
  })

  return {
    edges: Arr.flatMap(edges, (edge): ReadonlyArray<FrameEdge> => {
      const grown = ease(clamp01((time - edge.born) / GROW))
      if (grown <= 0) return []
      const [ax, ay] = at(edge.a)
      const [bx, by] = at(edge.b)
      const walking = Option.match(hop, {
        onNone: () => false,
        onSome: h => walked < 1 && ((h.from === edge.a && h.to === edge.b) || (h.from === edge.b && h.to === edge.a)),
      })
      return [
        {
          a: edge.a,
          b: edge.b,
          from: [ax, ay],
          to: [ax + (bx - ax) * grown, ay + (by - ay) * grown],
          kind: edge.yours ? 'yours' : known(edge.a) || known(edge.b) ? 'circle' : 'remote',
          walking,
          lit: Math.max(litOf(edge.a), litOf(edge.b)),
        },
      ]
    }),
    dots: Arr.flatMap(nodes, (node, i): ReadonlyArray<FrameDot> => {
      const grown = ease(clamp01((time - node.born) / POP))
      if (grown <= 0) return []
      const [x, y] = at(i)
      const kind: DotKind = i === 0 ? 'you' : met.has(i) ? 'met' : known(i) ? 'circle' : 'stranger'
      return [{ id: i, x, y, grown, kind, lit: litOf(i) }]
    }),
    rings,
    walker,
  }
}

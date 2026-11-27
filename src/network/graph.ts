// NOTE: the network diagram in the blog post, as data. A seed and a mode
// grow one whole run up front.
//
// You start alone in the middle and hop from person to person. In a good
// run, everyone you help brings their own people with them, and those
// people keep meeting each other and bringing in friends, whether you're
// there or not. In a bad run, the first part goes the same way, then you
// start hurting the people you know: the links you walk snap, the damage
// spreads to the people they met through you, and the pieces that are no
// longer tied to you drift away.
//
// The layout is a force simulation (people push apart, links pull together,
// what's still tied to you is drawn toward the middle) run once over the
// whole run and kept as keyframes, so a slider can scrub to any moment and
// `frameAt` reads it without simulating anything.

import { Array as Arr, Number as Num, Option } from 'effect'

import { FADE, HOLD } from '../blog/animation/controls.ts'

export type Mode = 'good' | 'bad'

export interface GraphNode {
  readonly born: number
  // When they leave the network for good, or Infinity.
  readonly left: number
  // Who they joined through, so they first appear beside them.
  readonly parent: number
  // The person you reached whose own network they belong to. You're -1.
  readonly circle: number
}

export interface GraphEdge {
  readonly a: number
  readonly b: number
  readonly born: number
  // When it snaps, or Infinity.
  readonly cut: number
  // Made by you, rather than by the network on its own.
  readonly yours: boolean
}

// You walk from one person to the next, starting at `start`. A hurtful hop
// goes there and comes back, and the link snaps when you arrive.
export interface Hop {
  readonly from: number
  readonly to: number
  readonly start: number
  readonly hurt: boolean
}

export interface Timeline {
  readonly mode: Mode
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
// In a bad run, the hop where you start hurting people.
export const TURN = 9
// The seconds one hop takes, and how much of it is walking.
export const HOP = 1.1
const WALK = 0.7
// How long a link takes to draw, a person to appear, and a link to snap.
export const GROW = 0.6
const POP = 0.35
export const CUT = 0.9
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

type Mutable<A> = { -readonly [K in keyof A]: A[K] }

const keyOf = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)

// When the walker reaches the person at the end of a hop.
export const arrivalOf = (hop: Hop): number => hop.start + HOP * WALK * (hop.hurt ? 0.5 : 1)

// ---------------------------------------------------------------------------
// What happens, and when
// ---------------------------------------------------------------------------

const buildEvents = (seed: number, mode: Mode) => {
  const next = random(seed)
  const chance = (p: number) => next() < p
  const pick = <A>(items: ReadonlyArray<A>): Option.Option<A> =>
    Arr.get(items, Math.floor(next() * items.length))

  const nodes: Array<Mutable<GraphNode>> = [{ born: -1, left: Infinity, parent: 0, circle: -1 }]
  const edges: Array<Mutable<GraphEdge>> = []
  const hops: Array<Hop> = []
  const pairs = new Map<string, Mutable<GraphEdge>>()
  const hurt = new Set<number>()
  // Everyone you've reached and not hurt.
  const reached = new Set<number>()

  const live = (edge: GraphEdge, at: number) => edge.born <= at && edge.cut > at
  const present = (i: number, at: number) => nodes[i]!.born <= at && nodes[i]!.left > at
  const neighbours = (i: number, at: number): ReadonlyArray<number> =>
    Arr.flatMap(edges, edge =>
      !live(edge, at) ? [] : edge.a === i ? [edge.b] : edge.b === i ? [edge.a] : [],
    )
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
    const edge = { a, b, born, cut: Infinity, yours }
    pairs.set(keyOf(a, b), edge)
    edges.push(edge)
    return true
  }

  const cut = (a: number, b: number, at: number) => {
    const edge = pairs.get(keyOf(a, b))
    if (edge !== undefined && live(edge, at)) edge.cut = Math.max(at, edge.born + GROW)
  }

  // Someone new joins through `from`, in `circle`, or a circle of their own
  // when that's -1.
  const meet = (from: number, born: number, yours: boolean, circle: number): Option.Option<number> => {
    if (nodes.length >= MAX_NODES || edges.length >= MAX_EDGES || !present(from, born)) return Option.none()
    const i = nodes.length
    nodes.push({ born, left: Infinity, parent: from, circle: circle === -1 ? i : circle })
    link(from, i, born, yours)
    return Option.some(i)
  }

  let at = 0
  let time = 0.4
  for (let step = 0; step < HOPS; step++) {
    const turned = mode === 'bad' && step >= TURN

    if (turned) {
      // You go after the people you know, and the people you meet don't stay.
      const target = chance(0.25) ? Option.none() : pick(neighbours(at, time))
      const to = Option.getOrElse(target, () => Option.getOrElse(meet(at, time, true, -1), () => at))
      const hop = { from: at, to, start: time, hurt: to !== at }
      hops.push(hop)
      if (hop.hurt) {
        const hit = arrivalOf(hop)
        hurt.add(to)
        reached.delete(to)
        cut(at, to, hit)
        // It spreads: the people they'd met start dropping off too.
        for (const other of neighbours(to, hit)) {
          if (other !== at && chance(0.55)) cut(to, other, hit + 0.4 + next() * 1.6)
        }
      }
    } else {
      // In a bad run, you're home when it turns.
      const home = mode === 'bad' && step === TURN - 1 && at !== 0
      if (home) link(at, 0, time, true)
      const roll = next()
      const fresh = !home && (step < 4 || roll < 0.4) ? meet(at, time, true, -1) : Option.none()
      const to = home
        ? 0
        : Option.getOrElse(fresh, () => {
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
      const hop = { from: at, to, start: time, hurt: false }
      hops.push(hop)
      if (to !== 0) reached.add(to)
      // Help someone new, and their people show up with them.
      if (Option.isSome(fresh)) {
        const arrived = arrivalOf(hop)
        const crowd = 1 + Math.floor(next() * 3)
        for (let j = 0; j < crowd; j++) meet(to, arrived + 0.1 + j * 0.15, false, to)
      }
      at = to
    }

    // Meanwhile, without you.
    const quiet = 2 + Math.floor(next() * 2)
    for (let i = 0; i < quiet; i++) {
      const when = time + next() * HOP
      const others = Arr.filter(Arr.range(1, Math.max(1, nodes.length - 1)), j => j < nodes.length && present(j, when))
      Option.map(pick(others), p => {
        const circle = nodes[p]!.circle
        if (!turned || chance(0.3)) {
          // People keep meeting people: a friend, a pair of friends, or a
          // friend of a friend.
          const roll = next()
          // Someone you've helped stays in touch.
          if (!turned && reached.has(p) && chance(0.25)) link(0, p, when, true)
          else if (roll < 0.4) meet(p, when, false, circle)
          else if (roll < 0.6) {
            const first = meet(p, when, false, circle)
            const second = meet(p, when + 0.12, false, circle)
            if (Option.isSome(first) && Option.isSome(second)) {
              link(first.value, second.value, when + 0.3, false)
            }
          } else Option.map(pick(reachable(p, when)), q => link(p, q, when, false))
        } else {
          // Around the people you hurt, things come apart, and people with
          // no one left go.
          const near = Arr.filter(
            edges,
            edge =>
              live(edge, when) &&
              edge.a !== 0 &&
              edge.b !== 0 &&
              (hurt.has(edge.a) || hurt.has(edge.b) || hurt.has(nodes[edge.a]!.circle)),
          )
          if (chance(0.65)) Option.map(pick(near), edge => cut(edge.a, edge.b, when))
          else {
            const alone = Arr.filter(others, j => neighbours(j, when).length === 0)
            Option.map(pick(alone), j => (nodes[j]!.left = when + 0.6))
          }
        }
      })
    }

    time += HOP
  }

  const latest = (values: ReadonlyArray<number>) =>
    Arr.reduce(values, 0, (most, value) => (Number.isFinite(value) ? Math.max(most, value) : most))
  const end = Math.max(
    time,
    latest(Arr.map(edges, edge => edge.born + GROW)),
    latest(Arr.map(edges, edge => edge.cut + CUT)),
    latest(Arr.map(nodes, node => node.left + POP)),
  )
  return { nodes, edges, hops, end }
}

// ---------------------------------------------------------------------------
// Where everyone is
// ---------------------------------------------------------------------------

// People push each other apart, links pull them together at a length that
// depends on whose link it is, and anyone still tied to you is drawn toward
// the middle. Anyone who isn't drifts out toward the edges.
const REPEL = 0.00035
const SPRING = 0.06
const YOUR_LENGTH = 0.4
const THEIR_LENGTH = 0.2
const GRAVITY = 0.012
const DRIFT = 0.0025
const WALL = 0.08
const DAMP = 0.72
const MAX_SPEED = 0.025

const simulate = (
  seed: number,
  nodes: ReadonlyArray<GraphNode>,
  edges: ReadonlyArray<GraphEdge>,
  until: number,
): ReadonlyArray<Float32Array> => {
  const next = random(seed ^ 0x9e3779b9)
  const n = nodes.length
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  const vx = new Float64Array(n)
  const vy = new Float64Array(n)
  const placed = new Uint8Array(n)
  placed[0] = 1
  const keys: Array<Float32Array> = []
  const wx = BOUNDS.x - 0.12
  const wy = BOUNDS.y - 0.1

  for (let k = 0; k * KEY <= until + KEY; k++) {
    const t = k * KEY
    // Newcomers appear right beside whoever brought them in. Until then,
    // they wait on top of them.
    for (let i = 1; i < n; i++) {
      const node = nodes[i]!
      if (placed[i] === 0) {
        const angle = next() * Math.PI * 2
        x[i] = Num.clamp(x[node.parent]! + Math.cos(angle) * 0.04, { minimum: -wx, maximum: wx })
        y[i] = Num.clamp(y[node.parent]! + Math.sin(angle) * 0.04, { minimum: -wy, maximum: wy })
        if (node.born <= t) placed[i] = 1
      }
    }

    const active = Arr.filter(Arr.range(0, n - 1), i => placed[i] === 1 && nodes[i]!.left + POP > t)
    const links = Arr.filter(edges, edge => edge.born <= t && edge.cut > t)

    // Who's still tied to you.
    const tied = new Uint8Array(n)
    tied[0] = 1
    for (let grew = true; grew; ) {
      grew = false
      for (const edge of links) {
        if (tied[edge.a] !== tied[edge.b]) {
          tied[edge.a] = 1
          tied[edge.b] = 1
          grew = true
        }
      }
    }

    for (let step = 0; step < STEPS; step++) {
      const fx = new Float64Array(n)
      const fy = new Float64Array(n)
      for (let p = 0; p < active.length; p++) {
        const i = active[p]!
        for (let q = p + 1; q < active.length; q++) {
          const j = active[q]!
          const dx = x[i]! - x[j]!
          const dy = y[i]! - y[j]!
          const d2 = Math.max(dx * dx + dy * dy, 0.004)
          const d = Math.sqrt(d2)
          const f = REPEL / d2
          fx[i]! += (dx / d) * f
          fy[i]! += (dy / d) * f
          fx[j]! -= (dx / d) * f
          fy[j]! -= (dy / d) * f
        }
      }
      for (const edge of links) {
        const { a, b } = edge
        const dx = x[b]! - x[a]!
        const dy = y[b]! - y[a]!
        const d = Math.max(Math.hypot(dx, dy), 0.001)
        const grown = Num.clamp((t - edge.born) / GROW, { minimum: 0, maximum: 1 })
        const f = SPRING * grown * (d - (edge.yours ? YOUR_LENGTH : THEIR_LENGTH))
        fx[a]! += (dx / d) * f
        fy[a]! += (dy / d) * f
        fx[b]! -= (dx / d) * f
        fy[b]! -= (dy / d) * f
      }
      for (const i of active) {
        if (i === 0) continue
        const d = Math.max(Math.hypot(x[i]!, y[i]!), 0.001)
        if (tied[i] === 1) {
          fx[i]! -= x[i]! * GRAVITY
          fy[i]! -= y[i]! * GRAVITY
        } else {
          fx[i]! += (x[i]! / d) * DRIFT
          fy[i]! += (y[i]! / d) * DRIFT
        }
        if (Math.abs(x[i]!) > wx) fx[i]! -= Math.sign(x[i]!) * (Math.abs(x[i]!) - wx) * WALL
        if (Math.abs(y[i]!) > wy) fy[i]! -= Math.sign(y[i]!) * (Math.abs(y[i]!) - wy) * WALL
        vx[i] = (vx[i]! + fx[i]!) * DAMP
        vy[i] = (vy[i]! + fy[i]!) * DAMP
        const speed = Math.hypot(vx[i]!, vy[i]!)
        if (speed > MAX_SPEED) {
          vx[i] = (vx[i]! / speed) * MAX_SPEED
          vy[i] = (vy[i]! / speed) * MAX_SPEED
        }
        x[i] = Num.clamp(x[i]! + vx[i]!, { minimum: -BOUNDS.x + 0.02, maximum: BOUNDS.x - 0.02 })
        y[i] = Num.clamp(y[i]! + vy[i]!, { minimum: -BOUNDS.y + 0.02, maximum: BOUNDS.y - 0.02 })
      }
    }

    const key = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      key[i * 2] = x[i]!
      key[i * 2 + 1] = y[i]!
    }
    keys.push(key)
  }
  return keys
}

export const buildTimeline = (seed: number, mode: Mode = 'good'): Timeline => {
  const { nodes, edges, hops, end } = buildEvents(seed, mode)
  const layout = simulate(seed, nodes, edges, end + HOLD + FADE)
  return { mode, nodes, edges, hops, end, layout }
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

// You, the people you've reached, the people you've hurt, the people in the
// networks of the people you've reached, and everyone else.
export type DotKind = 'you' | 'met' | 'hurt' | 'circle' | 'stranger'
export type EdgeKind = 'yours' | 'circle' | 'remote'

export interface FrameEdge {
  // The two people it joins.
  readonly a: number
  readonly b: number
  readonly from: readonly [number, number]
  readonly to: readonly [number, number]
  readonly kind: EdgeKind
  // Lit while you're walking it, and `hurt` when that walk is a hurtful one.
  readonly walking: boolean
  readonly hurt: boolean
  // 0 to 1 while its circle is lit up.
  readonly lit: number
  // 0 while whole, then up to 1 as it comes apart.
  readonly apart: number
}

export interface FrameDot {
  readonly id: number
  readonly x: number
  readonly y: number
  // 0 to 1 as the person appears, and back to 0 as they leave.
  readonly grown: number
  readonly kind: DotKind
  readonly lit: number
  // Seconds since you hurt them.
  readonly hurtFor: number
}

// A ring that spreads out from someone the moment you reach them.
export interface FrameRing {
  readonly x: number
  readonly y: number
  readonly progress: number
  readonly hurt: boolean
}

export interface Frame {
  readonly edges: ReadonlyArray<FrameEdge>
  readonly dots: ReadonlyArray<FrameDot>
  readonly rings: ReadonlyArray<FrameRing>
  readonly walker: readonly [number, number]
  readonly walkerHurt: boolean
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const clamp01 = (t: number): number => Num.clamp(t, { minimum: 0, maximum: 1 })

export const frameAt = (timeline: Timeline, time: number): Frame => {
  const { nodes, edges, hops } = timeline
  const at = (i: number) => positionAt(timeline, i, time)

  // Who you've reached by now, who you've hurt, and whose circle is lit.
  const met = new Set<number>([0])
  const hurtAt = new Map<number, number>()
  const pulse = new Map<number, number>()
  const rings: Array<FrameRing> = []
  for (const hop of hops) {
    const arrived = arrivalOf(hop)
    if (arrived > time || hop.from === hop.to) continue
    if (hop.hurt) hurtAt.set(hop.to, arrived)
    else met.add(hop.to)
    const progress = (time - arrived) / PULSE
    if (progress < 1 && hop.to !== 0) {
      const [x, y] = at(hop.to)
      rings.push({ x, y, progress, hurt: hop.hurt })
      if (!hop.hurt) pulse.set(hop.to, Math.max(pulse.get(hop.to) ?? 0, 1 - progress))
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
      // A hurtful hop goes there and back.
      const t = h.hurt ? ease(walked < 0.5 ? walked * 2 : 2 - walked * 2) : ease(walked)
      return [fx + (tx - fx) * t, fy + (ty - fy) * t]
    },
  })
  const walkerHurt = Option.match(hop, { onNone: () => false, onSome: h => h.hurt && walked < 1 })

  return {
    edges: Arr.flatMap(edges, (edge): ReadonlyArray<FrameEdge> => {
      const grown = ease(clamp01((time - edge.born) / GROW))
      const apart = clamp01((time - edge.cut) / CUT)
      if (grown <= 0 || apart >= 1) return []
      const [ax, ay] = at(edge.a)
      const [bx, by] = at(edge.b)
      const walking = Option.match(hop, {
        onNone: () => false,
        onSome: h =>
          walked < 1 &&
          time < edge.cut &&
          ((h.from === edge.a && h.to === edge.b) || (h.from === edge.b && h.to === edge.a)),
      })
      return [
        {
          a: edge.a,
          b: edge.b,
          from: [ax, ay],
          to: [ax + (bx - ax) * grown, ay + (by - ay) * grown],
          kind: edge.yours ? 'yours' : known(edge.a) || known(edge.b) ? 'circle' : 'remote',
          walking,
          hurt: walking && walkerHurt,
          lit: Math.max(litOf(edge.a), litOf(edge.b)),
          apart,
        },
      ]
    }),
    dots: Arr.flatMap(nodes, (node, i): ReadonlyArray<FrameDot> => {
      const grown = ease(clamp01((time - node.born) / POP)) * (1 - ease(clamp01((time - node.left) / POP)))
      if (grown <= 0) return []
      const [x, y] = at(i)
      const hurtSince = hurtAt.get(i)
      const kind: DotKind =
        i === 0
          ? 'you'
          : hurtSince !== undefined
            ? 'hurt'
            : met.has(i)
              ? 'met'
              : known(i)
                ? 'circle'
                : 'stranger'
      return [{ id: i, x, y, grown, kind, lit: litOf(i), hurtFor: hurtSince === undefined ? 0 : time - hurtSince }]
    }),
    rings,
    walker,
    walkerHurt,
  }
}

// How many people are still tied to you at `time`, you included.
export const tiedAt = (timeline: Timeline, time: number): number => {
  const tied = new Set<number>([0])
  for (let grew = true; grew; ) {
    grew = false
    for (const edge of timeline.edges) {
      if (edge.born > time || edge.cut <= time) continue
      if (tied.has(edge.a) !== tied.has(edge.b)) {
        tied.add(edge.a)
        tied.add(edge.b)
        grew = true
      }
    }
  }
  return tied.size
}

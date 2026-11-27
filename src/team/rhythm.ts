// NOTE: the team figure in the blog post, as data. A seed plays one whole
// run up front.
//
// The run tells the section's story in three beats:
//   1. A handful of teammates, each pulsing to their own beat. Over a long
//      build (the season, the months) they pull each other into step, the
//      links between them thicken, and they end up pulsing as one.
//   2. One of them flares. A harsh flash goes out from them, and as it
//      reaches each teammate it knocks them off the beat, so the rhythm
//      that took the whole build shatters in about a second.
//   3. A slow, partial recovery. The others find their way back toward
//      each other, but not all the way, and they route around whoever
//      flared: their links stay thin, and they drift a little apart.
//
// Each teammate is a coupled oscillator (Kuramoto's model): they speed up
// or slow down toward the people they're linked to, harder the stronger
// the link. Links strengthen while the two ends are in step. It's all
// integrated once and kept as keyframes, so a slider can scrub to any
// moment and `frameAt` reads it without simulating anything.

import { Array as Arr, Number as Num, Option, Order } from 'effect'

import { FADE, HOLD } from '../blog/animation/controls.ts'

// The figure lives in a box this wide and tall, in world units.
export const BOUNDS = { x: 1.6, y: 0.9 } as const
export const MIN_PEOPLE = 6
export const MAX_PEOPLE = 7
export const MAX_LINKS = (MAX_PEOPLE * (MAX_PEOPLE - 1)) / 2

// When the flare happens, and when the run is over.
export const FLARE = 14.6
export const END = 25
// How fast the flash spreads, in world units a second.
export const WAVE_SPEED = 1.6
// How long a teammate takes to appear at the start.
const POP = 0.6

// The shared beat's natural speed, about one pulse every 1.3 seconds, and
// how far each teammate's own beat is off it.
const BEAT = (Math.PI * 2) / 1.3
const SPREAD = 0.12
// How hard teammates pull each other into step, at its most.
const COUPLING = 4
// Seconds the coupling takes to build to full: the months.
const BUILD = 7
// After the flare: the coupling left, and how much comes back by the end.
const SHAKEN = 0.2
const REGAINED = 1.8
// Trust is built in drops: every beat two teammates land together adds a
// little to the link between them, more the closer in step they were.
// The drop soaks in over DROP_IN seconds, so the link swells rather than
// jumps.
const DROP = 0.14
const DROP_IN = 0.3
// After the flare the drops are smaller, and links to whoever flared get
// smaller still, since people start working around them.
const MEND_DROP = 0.06
const MEND_DROP_FLARER = 0.006
// And lost in buckets: once the flash reaches both ends, the link drains
// to this, this fast.
const DRAIN_RATE = 7
const DRAINED = 0.04
const DRAIN_FOR = 0.6
// How much of their pull whoever flared still has on everyone after.
const AVOIDED = 0.2
// Whoever flared runs this much faster than their own beat after.
const RATTLED = 0.16
// How long a knock off the beat takes to land, so it isn't a jump.
const KICK_FOR = 0.35
// Where the team sits, and how far round them it spreads.
export const CENTRE = { x: 0, y: -0.18 } as const
const RX = 0.92
const RY = 0.55
// How much closer the team draws as it bonds, how far whoever flared
// drifts out after, and how slowly both change.
const DRAW_IN = 0.1
const DRIFT_OUT = 0.16
const SETTLE = 1.6

const STEP = 1 / 120
const KEY = 1 / 30

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

const clamp01 = (t: number): number => Num.clamp(t, { minimum: 0, maximum: 1 })
// Smoothstep, so ramps start and end gently.
export const smooth = (t: number): number => {
  const c = clamp01(t)
  return c * c * (3 - 2 * c)
}

export interface Link {
  readonly a: number
  readonly b: number
}

export interface Timeline {
  readonly count: number
  readonly links: ReadonlyArray<Link>
  // Who flares.
  readonly flarer: number
  // When the flash reaches each teammate. Whoever flared is FLARE.
  readonly hits: ReadonlyArray<number>
  readonly end: number
  // Every KEY seconds: everyone's x, y, phase, then every link's strength,
  // the most it's ever been and the drop still soaking in, then how in
  // step the team is and its trust: the mean strength of every link.
  readonly keys: ReadonlyArray<Float32Array>
}

const linksOf = (count: number): ReadonlyArray<Link> =>
  Arr.flatMap(Arr.range(0, count - 2), a => Arr.map(Arr.range(a + 1, count - 1), b => ({ a, b })))

// How in step these phases are: 1 in unison, near 0 all over the place.
export const syncOf = (phases: ArrayLike<number>, count: number): number => {
  let c = 0
  let s = 0
  for (let i = 0; i < count; i++) {
    c += Math.cos(phases[i]!)
    s += Math.sin(phases[i]!)
  }
  return Math.hypot(c, s) / count
}

const keyWidth = (count: number, links: number) => count * 3 + links * 3 + 2

export const buildTimeline = (seed: number): Timeline => {
  const next = random(seed)
  const count = MIN_PEOPLE + Math.floor(next() * (MAX_PEOPLE - MIN_PEOPLE + 1))
  const links = linksOf(count)
  const flarer = Math.floor(next() * count)

  // Everyone's own beat, spread evenly round the shared one and shuffled,
  // so every run needs the build to lock.
  const speeds = Arr.map(
    Arr.sort(
      Arr.map(Arr.range(0, count - 1), k => ({ k, at: next() })),
      Order.mapInput(Order.Number, ({ at }: { readonly at: number }) => at),
    ),
    ({ k }) => BEAT * (1 + SPREAD * ((k / (count - 1)) * 2 - 1)),
  )
  // They start spread round the beat, so nobody's in step yet.
  const phase = Float64Array.from(Arr.range(0, count - 1), k => (k / count) * Math.PI * 2 * 2.3 + next() * 0.6)

  const turn = -Math.PI / 2 + (next() - 0.5) * 0.5
  const angles = Arr.map(Arr.range(0, count - 1), k => turn + (k / count) * Math.PI * 2 + (next() - 0.5) * 0.22)
  const home = Arr.map(angles, angle => [Math.cos(angle) * RX, Math.sin(angle) * RY] as const)
  const flarerHome = home[flarer]!
  const hits = Arr.map(home, ([x, y], i) =>
    i === flarer ? FLARE : FLARE + Math.hypot(x - flarerHome[0], y - flarerHome[1]) / WAVE_SPEED,
  )
  // Where each teammate is knocked to: spread round the circle, so the
  // beat really breaks.
  const others = Arr.filter(Arr.range(0, count - 1), i => i !== flarer)
  const kicks = new Float64Array(count)
  for (const [k, i] of others.entries()) kicks[i] = Math.PI * (0.55 + (k % 2) * 0.6) * (k % 3 === 0 ? -1 : 1) + next() * 0.4

  const weight = new Float64Array(links.length).fill(0.04)
  const peak = new Float64Array(weight)
  const pending = new Float64Array(links.length)
  const beat = new Uint8Array(count)
  let drawn = 0
  let drift = 0

  const width = keyWidth(count, links.length)
  const keys: Array<Float32Array> = []
  const until = END + HOLD + FADE + KEY
  const stepsPerKey = Math.round(KEY / STEP)
  const dphase = new Float64Array(count)

  const record = () => {
    const key = new Float32Array(width)
    const squeeze = 1 - DRAW_IN * drawn
    for (let i = 0; i < count; i++) {
      const [hx, hy] = home[i]!
      const out = i === flarer ? 1 + drift : 1
      key[i * 3] = CENTRE.x + hx * squeeze * out
      key[i * 3 + 1] = CENTRE.y + hy * squeeze * out
      key[i * 3 + 2] = phase[i]!
    }
    const base = count * 3
    for (let e = 0; e < links.length; e++) {
      key[base + e * 3] = weight[e]!
      key[base + e * 3 + 1] = peak[e]!
      key[base + e * 3 + 2] = pending[e]!
    }
    key[width - 2] = syncOf(phase, count)
    key[width - 1] = Arr.reduce(Arr.fromIterable(weight), 0, (sum, w) => sum + w) / links.length
    keys.push(key)
  }

  record()
  for (let k = 1; k * KEY <= until; k++) {
    for (let s = 0; s < stepsPerKey; s++) {
      const t = ((k - 1) * stepsPerKey + s) * STEP
      const broken = t >= FLARE
      const coupling = broken
        ? COUPLING * (SHAKEN + REGAINED * smooth((t - FLARE - 1.2) / 6))
        : COUPLING * smooth((t - 0.6) / BUILD)

      for (let i = 0; i < count; i++) {
        const own = i === flarer && broken ? speeds[i]! * (1 + RATTLED) : speeds[i]!
        // The knock off the beat lands over KICK_FOR once the flash arrives.
        const since = t - hits[i]!
        dphase[i] = own + (since >= 0 && since < KICK_FOR && i !== flarer ? kicks[i]! / KICK_FOR : 0)
      }
      for (const [e, { a, b }] of links.entries()) {
        const avoided = broken && (a === flarer || b === flarer) ? AVOIDED : 1
        const pull = (coupling * (0.25 + 0.75 * weight[e]!) * avoided) / count
        const d = Math.sin(phase[b]! - phase[a]!)
        dphase[a]! += pull * d
        dphase[b]! -= pull * d
      }
      for (let i = 0; i < count; i++) {
        const before = Math.floor(phase[i]! / (Math.PI * 2))
        phase[i]! += dphase[i]! * STEP
        beat[i] = Math.floor(phase[i]! / (Math.PI * 2)) !== before ? 1 : 0
      }

      for (const [e, { a, b }] of links.entries()) {
        const theirs = a === flarer || b === flarer
        const reached = Math.max(hits[a]!, hits[b]!)
        if (t >= reached && t < reached + DRAIN_FOR) {
          // The bucket: everything goes at once, drops still soaking in too.
          pending[e] = 0
          weight[e]! += (DRAINED - weight[e]!) * Math.min(1, DRAIN_RATE * STEP)
        } else if (beat[a] === 1 || beat[b] === 1) {
          // A drop, when one of them lands a beat and the other's with them.
          const inStep = Math.max(0, Math.cos(phase[b]! - phase[a]!)) ** 6
          const drop = t < reached ? DROP : theirs ? MEND_DROP_FLARER : MEND_DROP
          pending[e]! += drop * inStep * (1 - weight[e]! - pending[e]!)
        }
        const soak = pending[e]! * Math.min(1, STEP / DROP_IN)
        pending[e]! -= soak
        weight[e]! += soak
        peak[e] = Math.max(peak[e]!, weight[e]!)
      }

      const mean = Arr.reduce(Arr.fromIterable(weight), 0, (sum, w) => sum + w) / links.length
      drawn += (mean - drawn) * (STEP / SETTLE)
      const away = smooth((t - FLARE - 0.6) / 5) * DRIFT_OUT
      drift += (away - drift) * (STEP / SETTLE)
    }
    record()
  }

  return { count, links, flarer, hits, end: END, keys }
}

// One keyframe slot at `time`, between the two nearest keyframes.
const read = (timeline: Timeline, slot: number, time: number): number => {
  const { keys } = timeline
  const k = Num.clamp(time / KEY, { minimum: 0, maximum: keys.length - 1 })
  const k0 = Math.floor(k)
  const k1 = Math.min(k0 + 1, keys.length - 1)
  const f = k - k0
  const a = keys[k0]![slot]!
  return a + (keys[k1]![slot]! - a) * f
}

export const positionAt = (timeline: Timeline, i: number, time: number): readonly [number, number] => [
  read(timeline, i * 3, time),
  read(timeline, i * 3 + 1, time),
]
export const phaseAt = (timeline: Timeline, i: number, time: number): number => read(timeline, i * 3 + 2, time)
export const weightAt = (timeline: Timeline, e: number, time: number): number =>
  read(timeline, timeline.count * 3 + e * 3, time)
export const peakAt = (timeline: Timeline, e: number, time: number): number =>
  read(timeline, timeline.count * 3 + e * 3 + 1, time)
// What's left of the last drop still soaking into a link.
export const dropAt = (timeline: Timeline, e: number, time: number): number =>
  read(timeline, timeline.count * 3 + e * 3 + 2, time)
export const syncAt = (timeline: Timeline, time: number): number =>
  read(timeline, keyWidth(timeline.count, timeline.links.length) - 2, time)
export const trustAt = (timeline: Timeline, time: number): number =>
  read(timeline, keyWidth(timeline.count, timeline.links.length) - 1, time)

// ---------------------------------------------------------------------------
// One moment of a run
// ---------------------------------------------------------------------------

export interface FramePerson {
  readonly id: number
  readonly x: number
  readonly y: number
  // 0 to 1 as they appear.
  readonly grown: number
  // 0 to 1, peaking on their beat.
  readonly beat: number
  // How far through their beat they are, 0 to 1.
  readonly cycle: number
  // How bonded they are: the mean strength of their links.
  readonly bond: number
  // 0 to 1 while the flash is on them.
  readonly heat: number
  // Who flared. They keep a little of the colour after.
  readonly flarer: boolean
  readonly scar: number
}

export interface FrameLink {
  readonly a: number
  readonly b: number
  readonly from: readonly [number, number]
  readonly to: readonly [number, number]
  readonly weight: number
  // The most it's ever been, so what was lost still shows.
  readonly peak: number
  // 0 to 1 while a drop is soaking in.
  readonly drop: number
  readonly heat: number
}

export interface Frame {
  readonly people: ReadonlyArray<FramePerson>
  readonly links: ReadonlyArray<FrameLink>
  // How in step the whole team is, 0 to 1.
  readonly sync: number
  // The team's shared beat, in the middle, once there is one.
  readonly shared: Option.Option<{ readonly x: number; readonly y: number; readonly cycle: number; readonly strength: number }>
  // The flash going out from whoever flared, 0 to 1.
  readonly flash: Option.Option<{ readonly x: number; readonly y: number; readonly progress: number }>
  // The team's trust from the start to now, as time and trust pairs, and
  // where the flare was on it, once it's happened.
  readonly trace: ReadonlyArray<readonly [number, number]>
  readonly flared: Option.Option<readonly [number, number]>
}

// How the beat looks across a cycle: a sharp peak on the beat.
const beatOf = (phase: number) => Math.exp((Math.cos(phase) - 1) * 3.2)
const cycleOf = (phase: number) => {
  const turn = phase / (Math.PI * 2)
  return turn - Math.floor(turn)
}

// How long the flash on someone lasts, and the flash takes to spread.
const HEAT = 1.1
export const FLASH = 1.4
// What whoever flared keeps of the colour.
const SCAR = 0.5
// How often the trace samples.
export const TRACE_STEP = 0.25

const heatOf = (since: number) => (since < 0 ? 0 : Math.exp(-since / HEAT) * (since < 0.08 ? since / 0.08 : 1))

export const frameAt = (timeline: Timeline, time: number): Frame => {
  const { count, links, flarer, hits, end } = timeline
  const t = Num.clamp(time, { minimum: 0, maximum: Infinity })
  const at = (i: number) => positionAt(timeline, i, t)
  const weights = Arr.map(links, (_, e) => weightAt(timeline, e, t))
  const heats = Arr.map(Arr.range(0, count - 1), i => (i === flarer ? heatOf(t - FLARE) : heatOf(t - hits[i]!) * 0.6))

  const people = Arr.map(Arr.range(0, count - 1), (i): FramePerson => {
    const [x, y] = at(i)
    const phase = phaseAt(timeline, i, t)
    const theirs = Arr.filter(Arr.range(0, links.length - 1), e => links[e]!.a === i || links[e]!.b === i)
    const bond = Arr.reduce(theirs, 0, (sum, e) => sum + weights[e]!) / Math.max(1, theirs.length)
    return {
      id: i,
      x,
      y,
      grown: smooth((t - i * 0.12) / POP),
      beat: beatOf(phase),
      cycle: cycleOf(phase),
      bond,
      heat: heats[i]!,
      flarer: i === flarer,
      scar: i === flarer ? SCAR * smooth((t - FLARE) / 0.6) : 0,
    }
  })

  const sync = syncAt(timeline, t)
  // The team's mean phase, for the shared beat in the middle.
  let c = 0
  let s = 0
  for (let i = 0; i < count; i++) {
    c += Math.cos(phaseAt(timeline, i, t))
    s += Math.sin(phaseAt(timeline, i, t))
  }
  const strength = smooth((sync - 0.75) / 0.2)
  const middle = Arr.reduce(people, [0, 0] as const, ([x, y], p): readonly [number, number] => [
    x + p.x / count,
    y + p.y / count,
  ])

  const flashed = (t - FLARE) / FLASH
  const shown = Math.min(t, end)
  const samples = Arr.map(Arr.range(0, Math.floor(shown / TRACE_STEP)), k => k * TRACE_STEP)
  const trace = Arr.map(
    shown > samples[samples.length - 1]! ? [...samples, shown] : samples,
    (when): readonly [number, number] => [when, trustAt(timeline, when)],
  )

  return {
    people,
    links: Arr.map(links, ({ a, b }, e): FrameLink => ({
      a,
      b,
      from: at(a),
      to: at(b),
      weight: weights[e]!,
      peak: peakAt(timeline, e, t),
      drop: clamp01(dropAt(timeline, e, t) / (DROP * 0.6)),
      heat: Math.max(heats[a]!, heats[b]!) * (a === flarer || b === flarer ? 1 : 0.7),
    })),
    sync,
    shared:
      strength > 0
        ? Option.some({ x: middle[0], y: middle[1], cycle: cycleOf(Math.atan2(s, c)), strength })
        : Option.none(),
    flash:
      flashed >= 0 && flashed < 1
        ? Option.some({ x: people[flarer]!.x, y: people[flarer]!.y, progress: flashed })
        : Option.none(),
    trace,
    flared: t >= FLARE ? Option.some([FLARE, trustAt(timeline, FLARE)] as const) : Option.none(),
  }
}

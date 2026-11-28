import { Array as Arr, Option, Order } from 'effect'

import { GOLD, LINE, RED, WARM, mix, random, rgba } from '../../animation/kit.ts'
import type { Dot, Interaction, Line, Point, Shapes } from '../../animation/scene.ts'
import { curve, eased, lerpPoint, prefix, projection, segments, within } from './world.ts'

// An old operator's switchboard, drawn as a plan: a panel of jacks, each
// with its lamp, and a shelf of cords below. Over the years the cords go up
// one by one, each one someone who knows your work. Then a lamp you've
// never wired starts to blink. The call comes in, a cord goes up to answer
// it, and the whole board lights.
//
// Readers can put up cords of their own by clicking a jack, or grab a cord
// by its jack and yank it out. Yanking one is a bad interaction: its lamp
// flashes red as it goes dark, and the cord falls back to the shelf.

const COLS = 12
const ROWS = 3
const JACKS = COLS * ROWS
const PANEL = { left: -1.32, right: 1.32, top: -0.78, bottom: 0.04 } as const
const SHELF = 0.34
const PLUGS = 14

export const SETTLE = 1.2
export const MAX_PRESSES = 12

export const jackAt = (jack: number): Point => {
  const col = jack % COLS
  const row = Math.floor(jack / COLS)
  return [PANEL.left + 0.14 + (col * (PANEL.right - PANEL.left - 0.28)) / (COLS - 1), -0.56 + row * 0.24]
}
const lampOf = ([x, y]: Point): Point => [x, y - 0.085]
const plugAt = (plug: number): Point => [-1.36 + (plug * 2.72) / (PLUGS - 1), SHELF]

// A cord from a plug on the shelf up to wherever its end is, sagging
// between them.
const cordTo = (plug: number, end: Point): ReadonlyArray<Point> => {
  const from = plugAt(plug)
  const control: Point = [(from[0] + end[0]) / 2, Math.max(from[1], end[1]) + 0.32]
  return curve(from, control, end, 14)
}

interface Cord {
  readonly start: number
  readonly plug: number
  readonly jack: number
  // When a reader yanked it out, and where they let go of it.
  readonly pulled: Option.Option<{ readonly time: number; readonly to: Point }>
}

const DRAWN = 1.2
const RISE = 0.9
const YANK = 0.6
const RING = 10.8
const ANSWER = 12.6
const END = 15

// How close, in world units, a press has to be to a jack to grab its cord.
const REACH = 0.16

export interface Switchboard {
  readonly end: number
  // Every cord that goes up on its own, the call's last.
  readonly cords: ReadonlyArray<Cord>
  // The lamp that rings.
  readonly calling: number
}

export const buildSwitchboard = (seed: number): Switchboard => {
  const next = random(seed * 104729 + 7)
  // Every jack once, in an order of the seed's: 11 shares no factor with 36.
  const jacks = Arr.makeBy(JACKS, i => (i * 11 + seed * 5) % JACKS)
  const cords = Arr.makeBy(6, (i): Cord => ({
    start: 1.8 + i * 1.45 + next() * 0.4,
    plug: (i * 5 + seed) % PLUGS,
    jack: jacks[i]!,
    pulled: Option.none(),
  }))
  const used = new Set(Arr.map(cords, cord => cord.plug))
  const plug = Option.getOrElse(
    Arr.findFirst(Arr.makeBy(PLUGS, i => i), p => !used.has(p) && p > PLUGS / 2),
    () => PLUGS - 1,
  )
  const calling = jacks[7]!
  return {
    end: END,
    cords: [...cords, { start: ANSWER, plug, jack: calling, pulled: Option.none() }],
    calling,
  }
}

const settled = (cord: Cord, time: number): boolean => cord.start + RISE <= time
const distance = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1])

// The board's cords once the reader's interactions are in, in the order
// they happened. A click puts a cord up to the nearest free jack from the
// nearest free plug. A drag that starts on a cord's jack yanks it out. A
// cord that hasn't gone up yet, the call's included, keeps its jack and
// plug, so it can still go up.
export const withReader = (
  board: Switchboard,
  interactions: ReadonlyArray<Interaction>,
  worldOfAim: (aim: Point) => Point,
): ReadonlyArray<Cord> =>
  Arr.reduce(Arr.take(interactions, MAX_PRESSES), board.cords, (cords, interaction) => {
    const holding = (cord: Cord) => Option.isNone(cord.pulled)
    const at = Option.map(interaction.aim, worldOfAim)
    if (interaction.to !== undefined) {
      const grabbed = Option.flatMap(at, point =>
        Arr.findFirst(
          Arr.sort(
            Arr.filter(cords, cord => settled(cord, interaction.time) && holding(cord)),
            Order.mapInput(Order.Number, (cord: Cord) => distance(jackAt(cord.jack), point)),
          ),
          cord => distance(jackAt(cord.jack), point) < REACH,
        ),
      )
      const to = worldOfAim(interaction.to)
      return Option.match(grabbed, {
        onNone: () => cords,
        onSome: cord =>
          Arr.map(cords, c => (c === cord ? { ...c, pulled: Option.some({ time: interaction.time, to }) } : c)),
      })
    }
    const taken = Arr.filter(cords, holding)
    const jacks = new Set(Arr.map(taken, cord => cord.jack))
    const plugs = new Set(Arr.map(taken, cord => cord.plug))
    const free = Arr.filter(Arr.makeBy(JACKS, i => i), jack => !jacks.has(jack))
    const plug = Arr.findFirst(Arr.makeBy(PLUGS, i => i), p => !plugs.has(p))
    if (!Arr.isArrayNonEmpty(free) || Option.isNone(plug)) return cords
    const jack = Option.match(at, {
      onNone: () => free[0],
      onSome: point =>
        Arr.reduce(free, free[0], (best, jack) =>
          distance(jackAt(jack), point) < distance(jackAt(best), point) ? jack : best,
        ),
    })
    return [...cords, { start: interaction.time, plug: plug.value, jack, pulled: Option.none() }]
  })

export const switchboardShapes = (
  board: Switchboard,
  cords: ReadonlyArray<Cord>,
  time: number,
  width: number,
  height: number,
  held: Option.Option<Point>,
): Shapes => {
  const { px, scale } = projection(width, height)
  const worldOf = ([x, y]: Point): Point => [(x - width / 2) / scale, (y - height / 2) / scale]
  const drawn = eased(time, 0, DRAWN)
  const glowUp = eased(time, ANSWER + RISE, 0.8)

  // The cord the reader is holding by its jack, if any: its end follows
  // the pointer until they let go.
  const pointer = Option.map(held, worldOf)
  const gripped = Option.flatMap(pointer, point =>
    Arr.findFirst(
      cords,
      cord => settled(cord, time) && !Option.isSome(cord.pulled) && distance(jackAt(cord.jack), point) < REACH,
    ),
  )

  const frame: ReadonlyArray<Point> = [
    [PANEL.left, PANEL.top],
    [PANEL.right, PANEL.top],
    [PANEL.right, PANEL.bottom],
    [PANEL.left, PANEL.bottom],
    [PANEL.left, PANEL.top],
  ]
  const plan: Array<Line> = [
    ...segments(prefix(frame, drawn), px, 1.5, rgba(LINE, 0.5)),
    ...segments(prefix([[-1.5, SHELF], [1.5, SHELF]], drawn), px, 1.5, rgba(LINE, 0.5)),
    ...segments(prefix([[-1.5, SHELF + 0.1], [1.5, SHELF + 0.1]], drawn), px, 1, rgba(LINE, 0.25)),
  ]

  const lines: Array<Line> = []
  const heads: Array<Dot> = []
  const head = (point: Point, color = GOLD) => {
    const [x, y] = px(point)
    heads.push({ x, y, radius: 3, glow: 10, ring: 0, color: rgba(color, 1) })
  }

  for (const cord of cords) {
    if (cord.start > time) continue
    const bright = cord.jack === board.calling && cord.start === ANSWER ? 1 : glowUp
    const color = rgba(mix(WARM, GOLD, bright), 0.55 + 0.4 * bright)
    const width = 1.5 + bright
    const pull = Option.filter(cord.pulled, p => p.time <= time)
    if (Option.isSome(pull)) {
      // Out of its jack, it springs from where they let go back to its plug.
      const t = within(time, pull.value.time, YANK)
      if (t >= 1) continue
      const end = lerpPoint(pull.value.to, plugAt(cord.plug), t * t)
      lines.push(...segments(cordTo(cord.plug, end), px, width, rgba(mix(WARM, GOLD, bright), 0.7 * (1 - t))))
      head(end, WARM)
      continue
    }
    if (Option.isSome(gripped) && gripped.value === cord && Option.isSome(pointer)) {
      lines.push(...segments(cordTo(cord.plug, pointer.value), px, width + 0.5, color))
      head(pointer.value)
      continue
    }
    const t = eased(time, cord.start, RISE)
    const path = prefix(cordTo(cord.plug, jackAt(cord.jack)), t)
    lines.push(...segments(path, px, width, color))
    if (t < 1) head(path[path.length - 1]!)
  }

  // How lit each lamp is: a flash as its cord lands, then a steady glow,
  // and dark again once it's yanked. The call's lamp blinks while it
  // rings, until it's answered.
  const lampState = (jack: number): { readonly lit: number; readonly red: number } => {
    const cord = Arr.findLast(cords, c => c.jack === jack && c.start <= time)
    const ringing = jack === board.calling && time >= RING
    const answered = Option.isSome(cord) && settled(cord.value, time)
    if (Option.isNone(cord) || !answered) {
      return { lit: ringing ? (Math.sin((time - RING) * Math.PI * 5) > 0 ? 1 : 0.15) : 0, red: 0 }
    }
    return Option.match(Option.filter(cord.value.pulled, p => p.time <= time), {
      onSome: pull => {
        const t = within(time, pull.time, 0.7)
        return { lit: 1 - t, red: 1 - t }
      },
      onNone: () => {
        const flash = 1 - within(time, cord.value.start + RISE, 0.8)
        return { lit: Math.max(0.5 + 0.5 * glowUp, flash), red: 0 }
      },
    })
  }

  const rings: Array<Dot> = []
  const callLamp = px(lampOf(jackAt(board.calling)))
  const call = Arr.findFirst(cords, cord => cord.jack === board.calling && cord.start === ANSWER)
  const answeredAt = Option.match(call, { onNone: () => ANSWER + RISE, onSome: c => c.start + RISE })
  if (time >= RING && time < answeredAt) {
    for (const lag of [0, 0.6, 1.2]) {
      if (time < RING + lag) continue
      const p = ((time - RING - lag) % 1.8) / 1.8
      rings.push({ x: callLamp[0], y: callLamp[1], radius: 4 + 22 * p, glow: 0, ring: 1.5, color: rgba(GOLD, 0.8 * (1 - p)) })
    }
  }
  for (const lag of [0, 0.25]) {
    const p = within(time, answeredAt + lag, 1.4)
    if (time >= answeredAt + lag && p < 1) {
      rings.push({ x: callLamp[0], y: callLamp[1], radius: 6 + 40 * p, glow: 0, ring: 2, color: rgba(GOLD, 1 - p) })
    }
  }

  const panel: Array<Dot> = Arr.flatMap(Arr.makeBy(JACKS, i => i), (jack): ReadonlyArray<Dot> => {
    const [jx, jy] = px(jackAt(jack))
    const [lx, ly] = px(lampOf(jackAt(jack)))
    const { lit, red } = lampState(jack)
    const hue = red > 0 ? mix(GOLD, RED, red) : mix(LINE, GOLD, lit)
    return [
      { x: jx, y: jy, radius: 4.2, glow: 0, ring: 1.3, color: rgba(LINE, 0.5 * drawn) },
      { x: lx, y: ly, radius: 2.4 + lit, glow: 10 * lit, ring: 0, color: rgba(hue, (0.18 + 0.8 * lit) * drawn) },
    ]
  })
  const plugs: Array<Dot> = Arr.map(Arr.makeBy(PLUGS, i => i), (plug): Dot => {
    const [x, y] = px(plugAt(plug))
    const up = Arr.some(
      cords,
      cord =>
        cord.plug === plug &&
        cord.start <= time &&
        !Option.exists(cord.pulled, pull => pull.time + YANK <= time),
    )
    return { x, y, radius: 3, glow: 0, ring: up ? 1.2 : 0, color: rgba(up ? GOLD : LINE, 0.6 * drawn) }
  })

  return { lines: [...plan, ...lines], dots: [...panel, ...plugs, ...rings, ...heads] }
}

// The most a frame draws: every cord the board and the reader can put up,
// each in 14 pieces, and the rings and cord ends.
export const SWITCHBOARD_LINES = 6 + (7 + MAX_PRESSES) * 14
export const SWITCHBOARD_DOTS = JACKS * 2 + PLUGS + 5 + 7 + MAX_PRESSES

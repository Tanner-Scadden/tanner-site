import { Array as Arr, Option, Order } from 'effect'

import { GOLD, LINE, RED, type Rgb, WARM, mix, random, rgba } from '../../animation/kit.ts'
import type { Dot, Interaction, Line, Point, Shapes } from '../../animation/scene.ts'
import { curve, eased, lerpPoint, prefix, projection, segments, within } from './world.ts'

// An old operator's switchboard, drawn as a plan: a panel of jacks, each
// with its lamp, and a shelf of cords below. Over the years the cords go up
// one by one, each one someone who knows your work. Then a lamp you've
// never wired starts to blink. The call comes in, a cord goes up to answer
// it, and the whole board lights.
//
// Readers can grab a cord by its end and pull it out. Its lamp flashes red
// as it goes dark, the end follows the pointer, and when they let go it
// falls to the floor. Letting go over a free jack plugs it in there
// instead, and a cord on the floor can be picked up and plugged back in.

const COLS = 12
const ROWS = 3
const JACKS = COLS * ROWS
const PANEL = { left: -1.32, right: 1.32, top: -0.78, bottom: 0.04 } as const
const SHELF = 0.34
const FLOOR = 0.78
const PLUGS = 14
const CORDS = 7

export const SETTLE = 1.2
export const MAX_PRESSES = 40

export const jackAt = (jack: number): Point => {
  const col = jack % COLS
  const row = Math.floor(jack / COLS)
  return [PANEL.left + 0.14 + (col * (PANEL.right - PANEL.left - 0.28)) / (COLS - 1), -0.56 + row * 0.24]
}
export const lampOf = ([x, y]: Point): Point => [x, y - 0.085]
const plugAt = (plug: number): Point => [-1.36 + (plug * 2.72) / (PLUGS - 1), SHELF]

// Where a cord's end can be: on the board, above the floor.
const inReach = ([x, y]: Point): Point => [Math.min(1.5, Math.max(-1.5, x)), Math.min(FLOOR, Math.max(-0.85, y))]

// A cord from a plug on the shelf to wherever its end is, sagging between
// them, though never through the floor.
const cordTo = (plug: number, end: Point): ReadonlyArray<Point> => {
  const from = plugAt(plug)
  const control: Point = [(from[0] + end[0]) / 2, Math.min(FLOOR, Math.max(from[1], end[1]) + 0.32)]
  return curve(from, control, end, 14)
}

// What a reader did with a cord: let go of it over a free jack, which it
// snaps into, or anywhere else, where it falls.
type Move =
  | { readonly _tag: 'Plugged'; readonly time: number; readonly from: Point; readonly jack: number }
  | { readonly _tag: 'Dropped'; readonly time: number; readonly from: Point }

interface Cord {
  readonly start: number
  readonly plug: number
  // The jack it goes up to on its own.
  readonly jack: number
  // In the order the reader made them.
  readonly moves: ReadonlyArray<Move>
}

const DRAWN = 1.2
const RISE = 0.9
const SNAP = 0.12
const GRAVITY = 7
const BOUNCE = 0.22
const RING = 10.8
const ANSWER = 12.6
const END = 15

// How close, in world units, a press has to be to a cord's end to grab it,
// and a release to a jack to plug into it.
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
  const cords = Arr.makeBy(CORDS - 1, (i): Cord => ({
    start: 1.8 + i * 1.45 + next() * 0.4,
    plug: (i * 5 + seed) % PLUGS,
    jack: jacks[i]!,
    moves: [],
  }))
  const used = new Set(Arr.map(cords, cord => cord.plug))
  const plug = Option.getOrElse(
    Arr.findFirst(
      Arr.makeBy(PLUGS, i => i),
      p => !used.has(p) && p > PLUGS / 2,
    ),
    () => PLUGS - 1,
  )
  const calling = jacks[7]!
  return { end: END, cords: [...cords, { start: ANSWER, plug, jack: calling, moves: [] }], calling }
}

const distance = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1])
const risen = (cord: Cord, time: number): boolean => cord.start + RISE <= time
const lastMove = (cord: Cord, time: number): Option.Option<Move> => Arr.findLast(cord.moves, move => move.time <= time)

// Where an end let go of at `from` is `after` seconds later: falling, a
// small bounce, then lying on the floor.
const fallen = (from: Point, after: number): Point => {
  const drop = FLOOR - from[1]
  const land = Math.sqrt((2 * drop) / GRAVITY)
  if (after < land) return [from[0], from[1] + 0.5 * GRAVITY * after * after]
  const p = within(after, land, BOUNCE)
  return [from[0], FLOOR - Math.min(1, drop) * 0.2 * p * (1 - p)]
}

// Where a risen cord's end is, and the jack it's in or on its way into.
const endOf = (cord: Cord, time: number): { readonly at: Point; readonly jack: Option.Option<number> } =>
  Option.match(lastMove(cord, time), {
    onNone: () => ({ at: jackAt(cord.jack), jack: Option.some(cord.jack) }),
    onSome: move =>
      move._tag === 'Plugged'
        ? { at: lerpPoint(move.from, jackAt(move.jack), eased(time, move.time, SNAP)), jack: Option.some(move.jack) }
        : { at: fallen(move.from, time - move.time), jack: Option.none() },
  })

// The jack a cord is in, or will be: one that hasn't gone up yet keeps its
// own, so it can still go up.
const claim = (cord: Cord, time: number): Option.Option<number> =>
  risen(cord, time) ? endOf(cord, time).jack : Option.some(cord.jack)

// The cord whose end is nearest `point`, if it's close enough to grab.
const grabbed = (cords: ReadonlyArray<Cord>, point: Point, time: number): Option.Option<Cord> =>
  Arr.findFirst(
    Arr.sort(
      Arr.filter(cords, cord => risen(cord, time)),
      Order.mapInput(Order.Number, (cord: Cord) => distance(endOf(cord, time).at, point)),
    ),
    cord => distance(endOf(cord, time).at, point) < REACH,
  )

// The board's cords once the reader's drags are in, in the order they
// happened. A drag from a cord's end carries it to wherever it was let go.
export const withReader = (
  board: Switchboard,
  interactions: ReadonlyArray<Interaction>,
  worldOfAim: (aim: Point) => Point,
): ReadonlyArray<Cord> =>
  Arr.reduce(Arr.take(interactions, MAX_PRESSES), board.cords, (cords, { time, aim, to }) => {
    if (to === undefined || Option.isNone(aim)) return cords
    return Option.match(grabbed(cords, worldOfAim(aim.value), time), {
      onNone: () => cords,
      onSome: cord => {
        const from = inReach(worldOfAim(to))
        const taken = new Set(Arr.flatMap(cords, c => (c === cord ? [] : Option.toArray(claim(c, time)))))
        const jack = Arr.findFirst(
          Arr.sort(
            Arr.filter(
              Arr.makeBy(JACKS, i => i),
              j => !taken.has(j),
            ),
            Order.mapInput(Order.Number, (j: number) => distance(jackAt(j), from)),
          ),
          j => distance(jackAt(j), from) < REACH,
        )
        const move: Move = Option.match(jack, {
          onNone: () => ({ _tag: 'Dropped', time, from }),
          onSome: j => ({ _tag: 'Plugged', time, from, jack: j }),
        })
        return Arr.map(cords, c => (c === cord ? { ...c, moves: [...c.moves, move] } : c))
      },
    })
  })

// Each spell a cord spends in a jack: from when it lands to when it's
// pulled out, if it has been.
interface Stint {
  readonly cord: Cord
  readonly jack: number
  readonly from: number
  readonly until: number
}

const stintsOf = (cord: Cord): ReadonlyArray<Stint> => {
  const leaves = (i: number) => cord.moves[i]?.time ?? Infinity
  const first: Stint = { cord, jack: cord.jack, from: cord.start + RISE, until: leaves(0) }
  return [
    first,
    ...Arr.flatMap(cord.moves, (move, i): ReadonlyArray<Stint> =>
      move._tag === 'Plugged' ? [{ cord, jack: move.jack, from: move.time + SNAP, until: leaves(i + 1) }] : [],
    ),
  ]
}

export const switchboardShapes = (
  board: Switchboard,
  cords: ReadonlyArray<Cord>,
  time: number,
  width: number,
  height: number,
  pointer: Option.Option<Point>,
  held: Option.Option<Point>,
): Shapes => {
  const { px, scale } = projection(width, height)
  const worldOf = ([x, y]: Point): Point => [(x - width / 2) / scale, (y - height / 2) / scale]
  const drawn = eased(time, 0, DRAWN)
  const glowUp = eased(time, ANSWER + RISE, 0.8)

  // The cord the reader is holding, if any: its end follows the pointer
  // until they let go.
  const gripped = Option.flatMap(held, at => grabbed(cords, worldOf(at), time))
  const hand = inReach(
    worldOf(
      Option.getOrElse(
        Option.orElse(pointer, () => held),
        () => [0, 0] as Point,
      ),
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
    ...segments(
      prefix(
        [
          [-1.5, SHELF],
          [1.5, SHELF],
        ],
        drawn,
      ),
      px,
      1.5,
      rgba(LINE, 0.5),
    ),
    ...segments(
      prefix(
        [
          [-1.5, SHELF + 0.1],
          [1.5, SHELF + 0.1],
        ],
        drawn,
      ),
      px,
      1,
      rgba(LINE, 0.25),
    ),
    ...segments(
      prefix(
        [
          [-1.55, FLOOR + 0.012],
          [1.55, FLOOR + 0.012],
        ],
        drawn,
      ),
      px,
      1,
      rgba(LINE, 0.18),
    ),
  ]

  const lines: Array<Line> = []
  const heads: Array<Dot> = []
  const head = (point: Point, color: Rgb) => {
    const [x, y] = px(point)
    heads.push({ x, y, radius: 3, glow: 10, ring: 0, color: rgba(color, 1) })
  }

  for (const cord of cords) {
    if (cord.start > time) continue
    const bright = cord.jack === board.calling && cord.start === ANSWER ? 1 : glowUp
    const color = rgba(mix(WARM, GOLD, bright), 0.55 + 0.4 * bright)
    const width = 1.5 + bright
    if (Option.contains(gripped, cord)) {
      lines.push(...segments(cordTo(cord.plug, hand), px, width + 0.5, color))
      head(hand, GOLD)
      continue
    }
    if (!risen(cord, time)) {
      const path = prefix(cordTo(cord.plug, jackAt(cord.jack)), eased(time, cord.start, RISE))
      lines.push(...segments(path, px, width, color))
      head(path[path.length - 1]!, GOLD)
      continue
    }
    const end = endOf(cord, time)
    lines.push(...segments(cordTo(cord.plug, end.at), px, width, color))
    if (Option.isNone(end.jack) || Option.exists(lastMove(cord, time), move => move.time + SNAP > time)) {
      head(end.at, WARM)
    }
  }

  // How lit each lamp is: a flash as a cord lands in it, then a steady
  // glow. Pulled out, or held by the reader, it flashes red and goes dark.
  // The call's lamp blinks while it rings, until it's answered.
  const stints = Arr.flatMap(cords, stintsOf)
  const answeredAt = ANSWER + RISE
  const lampState = (jack: number): { readonly lit: number; readonly red: number } => {
    const mine = Arr.filter(stints, stint => stint.jack === jack && stint.from <= time)
    const now = Arr.findFirst(mine, stint => stint.until > time)
    if (Option.isSome(now)) {
      if (Option.contains(gripped, now.value.cord)) return { lit: 0.6, red: 1 }
      const flash = 1 - within(time, now.value.from, 0.8)
      return { lit: Math.max(0.5 + 0.5 * glowUp, flash), red: 0 }
    }
    const left = Arr.reduce(mine, -Infinity, (latest, stint) => Math.max(latest, stint.until))
    if (left > -Infinity) {
      const t = within(time, left, 0.7)
      return { lit: 1 - t, red: 1 - t }
    }
    const ringing = jack === board.calling && time >= RING && time < answeredAt
    return { lit: ringing ? (Math.sin((time - RING) * Math.PI * 5) > 0 ? 1 : 0.15) : 0, red: 0 }
  }

  const rings: Array<Dot> = []
  const callLamp = px(lampOf(jackAt(board.calling)))
  if (time >= RING && time < answeredAt) {
    for (const lag of [0, 0.6, 1.2]) {
      if (time < RING + lag) continue
      const p = ((time - RING - lag) % 1.8) / 1.8
      rings.push({
        x: callLamp[0],
        y: callLamp[1],
        radius: 4 + 22 * p,
        glow: 0,
        ring: 1.5,
        color: rgba(GOLD, 0.8 * (1 - p)),
      })
    }
  }
  for (const lag of [0, 0.25]) {
    const p = within(time, answeredAt + lag, 1.4)
    if (time >= answeredAt + lag && p < 1) {
      rings.push({ x: callLamp[0], y: callLamp[1], radius: 6 + 40 * p, glow: 0, ring: 2, color: rgba(GOLD, 1 - p) })
    }
  }

  const panel: Array<Dot> = Arr.flatMap(
    Arr.makeBy(JACKS, i => i),
    (jack): ReadonlyArray<Dot> => {
      const [jx, jy] = px(jackAt(jack))
      const [lx, ly] = px(lampOf(jackAt(jack)))
      const { lit, red } = lampState(jack)
      const hue = red > 0 ? mix(GOLD, RED, red) : mix(LINE, GOLD, lit)
      return [
        { x: jx, y: jy, radius: 4.2, glow: 0, ring: 1.3, color: rgba(LINE, 0.5 * drawn) },
        { x: lx, y: ly, radius: 2.4 + lit, glow: 10 * lit, ring: 0, color: rgba(hue, (0.18 + 0.8 * lit) * drawn) },
      ]
    },
  )
  const plugs: Array<Dot> = Arr.map(
    Arr.makeBy(PLUGS, i => i),
    (plug): Dot => {
      const [x, y] = px(plugAt(plug))
      const up = Arr.some(cords, cord => cord.plug === plug && cord.start <= time)
      return { x, y, radius: 3, glow: 0, ring: up ? 1.2 : 0, color: rgba(up ? GOLD : LINE, 0.6 * drawn) }
    },
  )

  return { lines: [...plan, ...lines], dots: [...panel, ...plugs, ...rings, ...heads] }
}

// The most a frame draws: the plan, every cord in 14 pieces, and the
// lamps, plugs, rings and cord ends.
export const SWITCHBOARD_LINES = 7 + CORDS * 14
export const SWITCHBOARD_DOTS = JACKS * 2 + PLUGS + 5 + CORDS

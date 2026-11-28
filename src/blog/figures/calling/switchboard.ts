import { Array as Arr, Boolean as Bool, Option, Order, Schema } from 'effect'

import { GOLD, LINE, RED, type Rgb, WARM, mix, random, rgba } from '../../animation/kit.ts'
import type { Dot, Interaction, Line, Point, Marks } from '../../animation/scene.ts'
import { curve, eased, lerpPoint, prefix, projection, segments, within } from './world.ts'


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

const inReach = ([x, y]: Point): Point => [Math.min(1.5, Math.max(-1.5, x)), Math.min(FLOOR, Math.max(-0.85, y))]

const cordTo = (plug: number, end: Point): ReadonlyArray<Point> => {
  const from = plugAt(plug)
  const control: Point = [(from[0] + end[0]) / 2, Math.min(FLOOR, Math.max(from[1], end[1]) + 0.32)]
  return curve(from, control, end, 14)
}

const At = Schema.Tuple([Schema.Finite, Schema.Finite])

const Move = Schema.TaggedUnion({
  Plugged: { time: Schema.Finite, from: At, jack: Schema.Finite },
  Dropped: { time: Schema.Finite, from: At },
})
type Move = typeof Move.Type

interface Cord {
  readonly start: number
  readonly plug: number
  readonly jack: number
  readonly moves: ReadonlyArray<Move>
}

const DRAWN = 1.2
const RISE = 0.9
const SNAP = 0.12
const GRAVITY = 7
const BOUNCE = 0.22
const RING = 10.8
const ANSWER = 12.6
const END = 15.4

const REACH = 0.16

export interface Switchboard {
  readonly end: number
  readonly cords: ReadonlyArray<Cord>
  readonly calling: number
}

export const buildSwitchboard = (seed: number): Switchboard => {
  const next = random(seed * 104729 + 7)
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

const fallen = (from: Point, after: number): Point => {
  const drop = FLOOR - from[1]
  const land = Math.sqrt((2 * drop) / GRAVITY)
  if (after < land) return [from[0], from[1] + 0.5 * GRAVITY * after * after]
  const p = within(after, land, BOUNCE)
  return [from[0], FLOOR - Math.min(1, drop) * 0.2 * p * (1 - p)]
}

const endOf = (cord: Cord, time: number): { readonly at: Point; readonly jack: Option.Option<number> } =>
  Option.match(lastMove(cord, time), {
    onNone: () => ({ at: jackAt(cord.jack), jack: Option.some(cord.jack) }),
    onSome: Move.match({
      Plugged: move => ({
        at: lerpPoint(move.from, jackAt(move.jack), eased(time, move.time, SNAP)),
        jack: Option.some(move.jack),
      }),
      Dropped: move => ({ at: fallen(move.from, time - move.time), jack: Option.none<number>() }),
    }),
  })

const claim = (cord: Cord, time: number): Option.Option<number> => {
  if (risen(cord, time)) return endOf(cord, time).jack
  return Option.some(cord.jack)
}

const freeJackNear = (taken: ReadonlySet<number>, from: Point): Option.Option<number> =>
  Arr.findFirst(
    Arr.sort(
      Arr.filter(
        Arr.makeBy(JACKS, i => i),
        j => !taken.has(j),
      ),
      Order.mapInput(Order.Number, (j: number) => distance(jackAt(j), from)),
    ),
    j => distance(jackAt(j), from) < REACH,
  )

const moveCord = (cords: ReadonlyArray<Cord>, cord: Cord, time: number, from: Point): ReadonlyArray<Cord> => {
  const taken = new Set(
    Arr.flatMap(cords, c => {
      if (c === cord) return []
      return Option.toArray(claim(c, time))
    }),
  )
  const move = Option.match(freeJackNear(taken, from), {
    onNone: (): Move => Move.cases.Dropped.make({ time, from }),
    onSome: (j): Move => Move.cases.Plugged.make({ time, from, jack: j }),
  })
  return Arr.map(cords, c => {
    if (c === cord) return { ...c, moves: [...c.moves, move] }
    return c
  })
}

const grabbed = (cords: ReadonlyArray<Cord>, point: Point, time: number): Option.Option<Cord> =>
  Arr.findFirst(
    Arr.sort(
      Arr.filter(cords, cord => risen(cord, time)),
      Order.mapInput(Order.Number, (cord: Cord) => distance(endOf(cord, time).at, point)),
    ),
    cord => distance(endOf(cord, time).at, point) < REACH,
  )

export const withReader = (
  board: Switchboard,
  interactions: ReadonlyArray<Interaction>,
  worldOfAim: (aim: Point) => Point,
): ReadonlyArray<Cord> =>
  Arr.reduce(Arr.take(interactions, MAX_PRESSES), board.cords, (cords, { time, aim, to }) => {
    const drag = Option.all([aim, Option.fromNullishOr(to)])
    if (Option.isNone(drag)) return cords
    const [grip, drop] = drag.value
    return Option.match(grabbed(cords, worldOfAim(grip), time), {
      onNone: () => cords,
      onSome: cord => moveCord(cords, cord, time, inReach(worldOfAim(drop))),
    })
  })

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
      Move.match(move, {
        Plugged: plugged => [{ cord, jack: plugged.jack, from: plugged.time + SNAP, until: leaves(i + 1) }],
        Dropped: () => [],
      }),
    ),
  ]
}

interface Lamp {
  readonly lit: number
  readonly red: number
}

interface View {
  readonly board: Switchboard
  readonly cords: ReadonlyArray<Cord>
  readonly time: number
  readonly px: (point: Point) => Point
  readonly drawn: number
  readonly glowUp: number
  readonly gripped: Option.Option<Cord>
  readonly hand: Point
}

const ANSWERED = ANSWER + RISE

const planLines = ({ px, drawn }: View): ReadonlyArray<Line> => {
  const frame: ReadonlyArray<Point> = [
    [PANEL.left, PANEL.top],
    [PANEL.right, PANEL.top],
    [PANEL.right, PANEL.bottom],
    [PANEL.left, PANEL.bottom],
    [PANEL.left, PANEL.top],
  ]
  return [
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
}

const brightnessOf = (view: View, cord: Cord): number => {
  if (cord.jack === view.board.calling && cord.start === ANSWER) return 1
  return view.glowUp
}

const cordMarks = (view: View): Marks => {
  const { cords, time, px, gripped, hand } = view
  const lines: Array<Line> = []
  const heads: Array<Dot> = []
  const head = (point: Point, color: Rgb) => {
    const [x, y] = px(point)
    heads.push({ x, y, radius: 3, glow: 10, ring: 0, color: rgba(color, 1) })
  }

  for (const cord of cords) {
    if (cord.start > time) continue
    const bright = brightnessOf(view, cord)
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
  return { lines, dots: heads }
}

const ringingLamp = (view: View, jack: number): number => {
  const { board, time } = view
  if (jack !== board.calling || time < RING || time >= ANSWERED) return 0
  if (Math.sin((time - RING) * Math.PI * 5) > 0) return 1
  return 0.15
}

const lampStateOf =
  (view: View, stints: ReadonlyArray<Stint>) =>
  (jack: number): Lamp => {
    const { time, gripped, glowUp } = view
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
    return { lit: ringingLamp(view, jack), red: 0 }
  }

const callRings = ({ board, time, px }: View): ReadonlyArray<Dot> => {
  const rings: Array<Dot> = []
  const callLamp = px(lampOf(jackAt(board.calling)))
  if (time >= RING && time < ANSWERED) {
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
    const p = within(time, ANSWERED + lag, 1.4)
    if (time >= ANSWERED + lag && p < 1) {
      rings.push({ x: callLamp[0], y: callLamp[1], radius: 6 + 40 * p, glow: 0, ring: 2, color: rgba(GOLD, 1 - p) })
    }
  }
  return rings
}

const lampHue = ({ lit, red }: Lamp): Rgb => {
  if (red > 0) return mix(GOLD, RED, red)
  return mix(LINE, GOLD, lit)
}

const panelDots = (view: View): ReadonlyArray<Dot> => {
  const { px, drawn } = view
  const lampState = lampStateOf(view, Arr.flatMap(view.cords, stintsOf))
  return Arr.flatMap(
    Arr.makeBy(JACKS, i => i),
    (jack): ReadonlyArray<Dot> => {
      const [jx, jy] = px(jackAt(jack))
      const [lx, ly] = px(lampOf(jackAt(jack)))
      const lamp = lampState(jack)
      const { lit } = lamp
      return [
        { x: jx, y: jy, radius: 4.2, glow: 0, ring: 1.3, color: rgba(LINE, 0.5 * drawn) },
        { x: lx, y: ly, radius: 2.4 + lit, glow: 10 * lit, ring: 0, color: rgba(lampHue(lamp), (0.18 + 0.8 * lit) * drawn) },
      ]
    },
  )
}

const plugDots = ({ cords, time, px, drawn }: View): ReadonlyArray<Dot> =>
  Arr.map(
    Arr.makeBy(PLUGS, i => i),
    (plug): Dot => {
      const [x, y] = px(plugAt(plug))
      const up = Arr.some(cords, cord => cord.plug === plug && cord.start <= time)
      return Bool.match(up, {
        onTrue: () => ({ x, y, radius: 3, glow: 0, ring: 1.2, color: rgba(GOLD, 0.6 * drawn) }),
        onFalse: () => ({ x, y, radius: 3, glow: 0, ring: 0, color: rgba(LINE, 0.6 * drawn) }),
      })
    },
  )

const ORIGIN: Point = [0, 0]

export const switchboardMarks = (
  board: Switchboard,
  cords: ReadonlyArray<Cord>,
  time: number,
  width: number,
  height: number,
  pointer: Option.Option<Point>,
  held: Option.Option<Point>,
): Marks => {
  const { px, scale } = projection(width, height)
  const worldOf = ([x, y]: Point): Point => [(x - width / 2) / scale, (y - height / 2) / scale]
  const view: View = {
    board,
    cords,
    time,
    px,
    drawn: eased(time, 0, DRAWN),
    glowUp: eased(time, ANSWER + RISE, 0.8),
    gripped: Option.flatMap(held, at => grabbed(cords, worldOf(at), time)),
    hand: inReach(
      worldOf(
        Option.getOrElse(
          Option.orElse(pointer, () => held),
          () => ORIGIN,
        ),
      ),
    ),
  }
  const moving = cordMarks(view)
  return {
    lines: [...planLines(view), ...moving.lines],
    dots: [...panelDots(view), ...plugDots(view), ...callRings(view), ...moving.dots],
  }
}

export const SWITCHBOARD_LINES = 7 + CORDS * 14
export const SWITCHBOARD_DOTS = JACKS * 2 + PLUGS + 5 + CORDS

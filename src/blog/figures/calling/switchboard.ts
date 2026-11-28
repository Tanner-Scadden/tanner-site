import { Array as Arr, Option } from 'effect'

import { GOLD, LINE, WARM, mix, random, rgba } from '../../animation/kit.ts'
import type { Dot, Interaction, Line, Point, Shapes } from '../../animation/scene.ts'
import { curve, eased, prefix, projection, segments, within } from './world.ts'

// An old operator's switchboard, drawn as a plan: a panel of jacks, each
// with its lamp, and a shelf of cords below. Over the years the cords go up
// one by one, each one someone who knows your work. Then a lamp you've
// never wired starts to blink. The call comes in, a cord goes up to answer
// it, and the whole board lights.

const COLS = 12
const ROWS = 3
const PANEL = { left: -1.32, right: 1.32, top: -0.78, bottom: 0.04 } as const
const SHELF = 0.34
const PLUGS = 14

export const SETTLE = 1.2
export const MAX_PRESSES = 6

const jackAt = (jack: number): Point => {
  const col = jack % COLS
  const row = Math.floor(jack / COLS)
  return [PANEL.left + 0.14 + (col * (PANEL.right - PANEL.left - 0.28)) / (COLS - 1), -0.56 + row * 0.24]
}
const lampOf = ([x, y]: Point): Point => [x, y - 0.085]
const plugAt = (plug: number): Point => [-1.36 + (plug * 2.72) / (PLUGS - 1), SHELF]

// A cord from a plug on the shelf up to its jack, sagging between them.
const cordOf = (plug: number, jack: number): ReadonlyArray<Point> => {
  const from = plugAt(plug)
  const to = jackAt(jack)
  const control: Point = [(from[0] + to[0]) / 2, Math.max(from[1], to[1]) + 0.32]
  return curve(from, control, to, 14)
}

interface Cord {
  readonly start: number
  readonly plug: number
  readonly jack: number
}

const DRAWN = 1.2
const RISE = 0.9
const RING = 10.8
const ANSWER = 12.6
const END = 15.5

export interface Switchboard {
  readonly end: number
  readonly cords: ReadonlyArray<Cord>
  // The lamp that rings, and the cord that answers it.
  readonly call: Cord
}

export const buildSwitchboard = (seed: number): Switchboard => {
  const next = random(seed * 104729 + 7)
  // Every jack once, in an order of the seed's: 11 shares no factor with 36.
  const jacks = Arr.makeBy(COLS * ROWS, i => (i * 11 + seed * 5) % (COLS * ROWS))
  const plugs = Arr.makeBy(PLUGS, i => i)
  const cords = Arr.makeBy(6, (i): Cord => ({
    start: 1.8 + i * 1.45 + next() * 0.4,
    plug: plugs[(i * 5 + seed) % PLUGS]!,
    jack: jacks[i]!,
  }))
  const used = new Set(Arr.map(cords, cord => cord.plug))
  const plug = Option.getOrElse(Arr.findFirst(plugs, p => !used.has(p) && p > PLUGS / 2), () => PLUGS - 1)
  return { end: END, cords, call: { start: ANSWER, plug, jack: jacks[7]! } }
}

// Cords the reader puts up: into the jack they click, or the next free one,
// from the next free plug.
const pressed = (board: Switchboard, interactions: ReadonlyArray<Interaction>, worldOfAim: (aim: Point) => Point) => {
  const takenJacks = new Set([...Arr.map(board.cords, cord => cord.jack), board.call.jack])
  const takenPlugs = new Set([...Arr.map(board.cords, cord => cord.plug), board.call.plug])
  const out: Array<Cord> = []
  for (const interaction of Arr.take(interactions, MAX_PRESSES)) {
    const free = Arr.filter(Arr.makeBy(COLS * ROWS, i => i), jack => !takenJacks.has(jack))
    const plug = Arr.findFirst(Arr.makeBy(PLUGS, i => i), p => !takenPlugs.has(p))
    if (free.length === 0 || Option.isNone(plug)) break
    const jack = Option.match(interaction.aim, {
      onNone: () => free[0]!,
      onSome: aim => {
        const [x, y] = worldOfAim(aim)
        return Arr.reduce(free, free[0]!, (best, jack) => {
          const [bx, by] = jackAt(best)
          const [jx, jy] = jackAt(jack)
          return (jx - x) ** 2 + (jy - y) ** 2 < (bx - x) ** 2 + (by - y) ** 2 ? jack : best
        })
      },
    })
    takenJacks.add(jack)
    takenPlugs.add(plug.value)
    out.push({ start: interaction.time, plug: plug.value, jack })
  }
  return out
}

export const switchboardShapes = (
  board: Switchboard,
  time: number,
  width: number,
  height: number,
  interactions: ReadonlyArray<Interaction>,
  worldOfAim: (aim: Point) => Point,
): Shapes => {
  const { px } = projection(width, height)
  const drawn = eased(time, 0, DRAWN)
  const glowUp = eased(time, ANSWER + RISE, 0.8)

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

  const cords = [...board.cords, ...pressed(board, interactions, worldOfAim)]
  const live = Arr.filter(cords, cord => cord.start <= time)
  const lines: Array<Line> = []
  const heads: Array<Dot> = []

  const cordShapes = (cord: Cord, bright: number) => {
    const t = eased(time, cord.start, RISE)
    const path = prefix(cordOf(cord.plug, cord.jack), t)
    lines.push(...segments(path, px, 1.5 + bright, rgba(mix(WARM, GOLD, bright), 0.55 + 0.4 * bright)))
    if (t < 1) {
      const [x, y] = px(path[path.length - 1]!)
      heads.push({ x, y, radius: 3, glow: 10, ring: 0, color: rgba(GOLD, 1) })
    }
  }
  for (const cord of live) cordShapes(cord, glowUp)
  if (time >= board.call.start) cordShapes(board.call, 1)

  // How lit each lamp is: a flash as its cord lands, then a steady glow.
  const lampLit = (jack: number): number => {
    const cord = Arr.findFirst(live, c => c.jack === jack)
    return Option.match(cord, {
      onNone: () => 0,
      onSome: c => {
        const landed = c.start + RISE
        const flash = 1 - within(time, landed, 0.8)
        return time < landed ? 0 : Math.max(0.5 + 0.5 * glowUp, flash)
      },
    })
  }
  // The call's lamp blinks while it rings, then holds bright once answered.
  const callLit = (): number => {
    if (time < RING) return 0
    if (time < ANSWER + RISE) return Math.sin((time - RING) * Math.PI * 5) > 0 ? 1 : 0.15
    return 1
  }

  const rings: Array<Dot> = []
  const callLamp = px(lampOf(jackAt(board.call.jack)))
  if (time >= RING && time < ANSWER + RISE) {
    for (const lag of [0, 0.6, 1.2]) {
      const p = ((time - RING - lag) % 1.8) / 1.8
      if (time >= RING + lag) rings.push({ x: callLamp[0], y: callLamp[1], radius: 4 + 22 * p, glow: 0, ring: 1.5, color: rgba(GOLD, 0.8 * (1 - p)) })
    }
  }
  const answered = ANSWER + RISE
  for (const lag of [0, 0.25]) {
    const p = within(time, answered + lag, 1.4)
    if (time >= answered + lag && p < 1) rings.push({ x: callLamp[0], y: callLamp[1], radius: 6 + 40 * p, glow: 0, ring: 2, color: rgba(GOLD, 1 - p) })
  }

  const panel: Array<Dot> = Arr.flatMap(Arr.makeBy(COLS * ROWS, i => i), (jack): ReadonlyArray<Dot> => {
    const [jx, jy] = px(jackAt(jack))
    const [lx, ly] = px(lampOf(jackAt(jack)))
    const lit = jack === board.call.jack ? callLit() : lampLit(jack)
    return [
      { x: jx, y: jy, radius: 4.2, glow: 0, ring: 1.3, color: rgba(LINE, 0.5 * drawn) },
      { x: lx, y: ly, radius: 2.4 + lit, glow: 10 * lit, ring: 0, color: rgba(mix(LINE, GOLD, lit), (0.18 + 0.8 * lit) * drawn) },
    ]
  })
  const plugs: Array<Dot> = Arr.map(Arr.makeBy(PLUGS, i => i), (plug): Dot => {
    const [x, y] = px(plugAt(plug))
    const up = Arr.some([...live, ...(time >= board.call.start ? [board.call] : [])], cord => cord.plug === plug)
    return { x, y, radius: 3, glow: 0, ring: up ? 1.2 : 0, color: rgba(up ? GOLD : LINE, 0.6 * drawn) }
  })

  return { lines: [...plan, ...lines], dots: [...panel, ...plugs, ...rings, ...heads] }
}

// The most a frame draws: every cord up, the reader's too, and the rings.
export const SWITCHBOARD_LINES = 4 + 2 + (6 + 1 + MAX_PRESSES) * 14
export const SWITCHBOARD_DOTS = COLS * ROWS * 2 + PLUGS + 5 + 6 + 1 + MAX_PRESSES

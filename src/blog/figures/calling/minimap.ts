import { Array as Arr, Option } from 'effect'

import { GOLD, LINE, WARM, mix, random, rgba } from '../../animation/kit.ts'
import type { Dot, Interaction, Line, Point, Shapes } from '../../animation/scene.ts'
import { curve, eased, lerpPoint, prefix, projection, segments, within } from './world.ts'

// A MOBA minimap, drawn like a plan and tipped on its corner: your base at
// the bottom, theirs at the top, three lanes and a river between. You're
// the gold dot in the bottom lane. For years you ping to help the people
// around you. Then, from the far side of the map, someone you helped pings
// back, and the call comes all the way to you.

// The map's own square, from -1 to 1 with up as +v, laid on the sheet as a
// diamond.
const toWorld = ([u, v]: Point): Point => [(u - v) * 0.78, -(u + v) * 0.43]

const M = 0.82
const HOME: Point = [-M, -M]
const AWAY: Point = [M, M]
const LANES: ReadonlyArray<ReadonlyArray<Point>> = [
  [HOME, [-M, M], AWAY],
  [HOME, AWAY],
  [HOME, [M, -M], AWAY],
]
const BORDER: ReadonlyArray<Point> = [
  [-1, -1],
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
]
const along = (lane: ReadonlyArray<Point>, t: number): Point => {
  const path = prefix(lane, t)
  return path[path.length - 1]!
}
// The river crosses from the top lane's corner to the bottom lane's,
// winding a little, as two banks.
const RIVER_STEPS = 22
const bank = (offset: number): ReadonlyArray<Point> =>
  Arr.makeBy(RIVER_STEPS + 1, i => {
    const s = -0.95 + (1.9 * i) / RIVER_STEPS
    const wind = 0.05 * Math.sin(s * 5.5) + offset
    return [s + wind, -s + wind]
  })
const RIVER = [bank(-0.05), bank(0.05)]
const TOWERS: ReadonlyArray<Point> = Arr.flatMap(LANES, lane =>
  Arr.map([0.16, 0.32, 0.68, 0.84], t => along(lane, t)),
)
const CAMPS: ReadonlyArray<Point> = [
  [-0.42, 0.12],
  [0.12, -0.42],
  [0.42, -0.12],
  [-0.12, 0.42],
  [-0.5, -0.2],
  [-0.2, -0.5],
]

// Where each of you plays: you in the bottom lane, your support beside you,
// and the rest of the team around the map.
const YOU: Point = along(LANES[2]!, 0.4)
const TEAM: ReadonlyArray<Point> = [
  along(LANES[0]!, 0.46),
  along(LANES[1]!, 0.36),
  [-0.42, -0.02],
  along(LANES[2]!, 0.36),
]
// Who calls in the end: the top laner, the farthest from you.
const CALLER = 0

const DRAWN = 1.6
const MET = 2.4
const CALL = 11.4
const TRAVEL = 1.3
const END = 15

interface Help {
  readonly start: number
  readonly who: number
}
interface Chatter {
  readonly start: number
  readonly who: number
}

export const SETTLE = 1.6

export interface Minimap {
  readonly end: number
  readonly helps: ReadonlyArray<Help>
  readonly chatter: ReadonlyArray<Chatter>
}

// Everyone gets helped at least once, the caller first, spread over the
// years before the call.
export const buildMinimap = (seed: number): Minimap => {
  const next = random(seed * 7919 + 13)
  const rest = next() < 0.5 ? [1, 3, 2] : [3, 2, 1]
  const helps = Arr.map([CALLER, ...rest], (who, i): Help => ({ start: 3 + i * 1.9 + next() * 0.5, who }))
  const chatter = Arr.makeBy(5, (i): Chatter => ({ start: 2.8 + i * 1.6 + next() * 0.8, who: Math.floor(next() * 4) }))
  return { end: END, helps, chatter }
}

const HELP_TRAVEL = 0.7
const PING = 1.1

const wobble = (time: number, i: number): Point => [
  0.018 * Math.sin(time * 0.9 + i * 1.7),
  0.018 * Math.cos(time * 0.7 + i * 2.3),
]
const at = (home: Point, time: number, i: number): Point => {
  const [dx, dy] = wobble(time, i)
  return [home[0] + dx, home[1] + dy]
}

// A ping: a ring that opens and fades.
const ping = (centre: Point, progress: number, size: number, alpha: number, color = GOLD): Dot => ({
  x: centre[0],
  y: centre[1],
  radius: 3 + size * (1 - (1 - progress) ** 3),
  glow: 0,
  ring: 1.5,
  color: rgba(color, alpha * (1 - progress)),
})

export const minimapShapes = (
  map: Minimap,
  time: number,
  width: number,
  height: number,
  interactions: ReadonlyArray<Interaction>,
  worldOfAim: (aim: Point) => Point,
): Shapes => {
  const { px } = projection(width, height)
  const pxOf = (p: Point) => px(toWorld(p))
  const drawn = eased(time, 0, DRAWN)
  const met = eased(time, DRAWN * 0.6, MET - DRAWN * 0.6)

  const plan: Array<Line> = [
    ...segments(Arr.map(prefix(BORDER, drawn), toWorld), px, 1, rgba(LINE, 0.35)),
    ...Arr.flatMap(LANES, lane => segments(Arr.map(prefix(lane, drawn), toWorld), px, 2, rgba(LINE, 0.55))),
    ...Arr.flatMap(RIVER, side => segments(Arr.map(prefix(side, drawn), toWorld), px, 1, rgba(LINE, 0.22))),
  ]

  const furniture: Array<Dot> = [
    ...Arr.map(TOWERS, (p): Dot => {
      const [x, y] = pxOf(p)
      return { x, y, radius: 3.2, glow: 0, ring: 1.2, color: rgba(LINE, 0.45 * drawn) }
    }),
    ...Arr.map(CAMPS, (p): Dot => {
      const [x, y] = pxOf(p)
      return { x, y, radius: 2, glow: 0, ring: 0, color: rgba(LINE, 0.25 * drawn) }
    }),
    ...Arr.flatMap([HOME, AWAY], (p): ReadonlyArray<Dot> => {
      const [x, y] = pxOf(p)
      return [
        { x, y, radius: 9, glow: 0, ring: 1.5, color: rgba(LINE, 0.5 * drawn) },
        { x, y, radius: 3, glow: 0, ring: 0, color: rgba(LINE, 0.5 * drawn) },
      ]
    }),
  ]

  const you = pxOf(at(YOU, time, 9))
  const team = Arr.map(TEAM, (home, i) => pxOf(at(home, time, i)))

  // How warm each teammate is: they light when your help reaches them, and
  // the caller lights all the way when they call.
  const warmth = Arr.map(TEAM, (_, who) =>
    Arr.reduce(
      Arr.filter(map.helps, help => help.who === who),
      0,
      (most, help) => Math.max(most, 0.6 * eased(time, help.start + HELP_TRAVEL, 0.5)),
    ),
  )

  const threads: Array<Line> = []
  const rings: Array<Dot> = []
  const sparks: Array<Dot> = []

  for (const help of map.helps) {
    const t = within(time, help.start, HELP_TRAVEL)
    if (time < help.start) continue
    const target = team[help.who]!
    if (time < help.start + PING) rings.push(ping(you, within(time, help.start, PING), 18, 0.85))
    if (t < 1) {
      const head = lerpPoint(you, target, t)
      threads.push({ from: you, to: head, width: 1.5, color: rgba(GOLD, 0.7) })
      sparks.push({ x: head[0], y: head[1], radius: 2.5, glow: 10, ring: 0, color: rgba(GOLD, 1) })
    } else {
      const fade = 1 - within(time, help.start + HELP_TRAVEL, 0.9)
      if (fade > 0) threads.push({ from: you, to: target, width: 1, color: rgba(GOLD, 0.45 * fade) })
    }
  }

  for (const chat of map.chatter) {
    if (time < chat.start || time > chat.start + PING) continue
    rings.push(ping(team[chat.who]!, within(time, chat.start, PING), 12, 0.6, LINE))
  }

  // The call: a big ping from the far side, then it travels the map to you.
  const caller = team[CALLER]!
  if (time >= CALL) {
    for (const lag of [0, 0.25]) {
      const p = within(time, CALL + lag, 1.4)
      if (p < 1 && time >= CALL + lag) rings.push(ping(caller, p, 30, 1))
    }
    const route = curve(caller, pxMid(caller, you), you, 16)
    const t = within(time, CALL + 0.3, TRAVEL)
    const path = prefix(route, t)
    threads.push(...segmentsPx(path, 2, rgba(GOLD, 0.85)))
    if (t < 1) {
      const head = path[path.length - 1]!
      sparks.push({ x: head[0], y: head[1], radius: 3.5, glow: 16, ring: 0, color: rgba(GOLD, 1) })
    }
    const arrived = CALL + 0.3 + TRAVEL
    for (const lag of [0, 0.2, 0.4]) {
      const p = within(time, arrived + lag, 1.5)
      if (time >= arrived + lag && p < 1) rings.push(ping(you, p, 44, 1))
    }
  }
  const called = eased(time, CALL, 0.6)
  const answered = eased(time, CALL + 0.3 + TRAVEL, 0.5)

  // Pings the reader drops on the map: a heads-up, wherever they click.
  for (const [i, interaction] of interactions.entries()) {
    if (interaction.time > time) continue
    const p = within(time, interaction.time, SETTLE)
    if (p >= 1) continue
    const centre = Option.match(interaction.aim, {
      onNone: () => team[i % team.length]!,
      onSome: aim => px(worldOfAim(aim)),
    })
    rings.push(ping(centre, p, 22, 0.9, WARM), ping(centre, within(time, interaction.time + 0.2, SETTLE - 0.2), 12, 0.9, WARM))
    sparks.push({ x: centre[0], y: centre[1], radius: 2.5, glow: 8, ring: 0, color: rgba(WARM, 1 - p) })
  }

  const people: Array<Dot> = [
    ...Arr.map(team, ([x, y], who): Dot => {
      const lit = who === CALLER ? Math.max(warmth[who]!, called) : warmth[who]!
      return {
        x,
        y,
        radius: (3.4 + 1.2 * lit) * met,
        glow: 9 * lit * met,
        ring: 0,
        color: rgba(mix(LINE, GOLD, lit), 0.85 * met),
      }
    }),
    { x: you[0], y: you[1], radius: (5 + 2 * answered) * met, glow: (12 + 14 * answered) * met, ring: 0, color: rgba(GOLD, met) },
  ]

  return { lines: [...plan, ...threads], dots: [...furniture, ...rings, ...people, ...sparks] }
}

// The call bows toward the river as it crosses the map, rather than
// cutting straight through.
const pxMid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) + Math.abs(a[1] - b[1]) * 0.15]
const segmentsPx = (points: ReadonlyArray<Point>, width: number, color: Line['color']): ReadonlyArray<Line> =>
  segments(points, p => p, width, color)

// The most a frame draws, with room for every ping the reader drops.
export const MINIMAP_LINES = 120
export const MINIMAP_DOTS = 120

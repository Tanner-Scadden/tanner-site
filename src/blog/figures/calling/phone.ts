import { Array as Arr, Boolean as Bool, Option } from 'effect'

import { GOLD, LINE, RED, type Rgb, WARM, clamp01, mix, random, rgba, worldOfAim } from '../../animation/kit.ts'
import type { Dot, Interaction, Line, Marks, Point } from '../../animation/scene.ts'
import { HANDSET_DOTS, HUNG_UP, type GlyphDot, PICKED_UP } from './handsets.ts'
import { eased, projection, segments, within } from './world.ts'

const ROWS = 11
export const MAX_PRESSES = 16
export const DECLINES_TO_FIND_EGG = 3

const PHONE = { width: 0.78, height: 1.66, corner: 0.12 } as const
const SCREEN_INSET = 0.028
const SCREEN = {
  left: -PHONE.width / 2 + SCREEN_INSET,
  right: PHONE.width / 2 - SCREEN_INSET,
  top: -PHONE.height / 2 + SCREEN_INSET,
  bottom: PHONE.height / 2 - SCREEN_INSET,
} as const

const rowAt = (row: number): Point => [SCREEN.left + 0.08, SCREEN.top + 0.17 + row * 0.11]
export const ACCEPT: Point = [0.2, 0.5]
export const DECLINE: Point = [-0.2, 0.5]
const BUTTON_REACH = 0.13
const CALLER: Point = [0, -0.36]

const PX_PER_UNIT_IN_SKETCH = 228

const DRAWN_IN = 0.6
const FIRST_CONTACT_AT = 0.6
const FIRST_CONTACT_GAP = 1
const GAP_SHRINKS_BY = 0.84
const GLOW_BEFORE_RING = 1.6
const RINGS_FOR = 2.8
const TALKS_FOR = 2.1
const LIST_BACK_AFTER_TALK = 0.2
const ROW_LIT_STAGGER = 0.08
const CALLS_BACK_AFTER = 0.5
const GLOW_BEFORE_CALL_BACK = 0.9

export const SETTLE = GLOW_BEFORE_RING + RINGS_FOR + TALKS_FOR + LIST_BACK_AFTER_TALK + ROWS * ROW_LIT_STAGGER + 0.6

export interface Call {
  readonly caller: number
  readonly glowsFrom: number
  readonly ring: number
  readonly ends: number
  readonly declined: boolean
}

export interface Phone {
  readonly end: number
  readonly contactAddedAt: ReadonlyArray<number>
  readonly call: Call
  readonly nextCallers: ReadonlyArray<number>
}

const callAt = (caller: number, glowsFrom: number, glowFor = GLOW_BEFORE_RING): Call => ({
  caller,
  glowsFrom,
  ring: glowsFrom + glowFor,
  ends: glowsFrom + glowFor + RINGS_FOR,
  declined: false,
})

const listBackAt = (call: Call): number => call.ends + TALKS_FOR + LIST_BACK_AFTER_TALK

const settledAt = (call: Call): number => listBackAt(call) + ROWS * ROW_LIT_STAGGER + 0.5

const OLDEST_CONTACTS = 3

export const buildPhone = (seed: number): Phone => {
  const next = random(seed * 7919 + 3)
  const contactAddedAt = Arr.makeBy(
    ROWS,
    i => FIRST_CONTACT_AT + (FIRST_CONTACT_GAP * (1 - GAP_SHRINKS_BY ** i)) / (1 - GAP_SHRINKS_BY),
  )
  const caller = Math.floor(next() * OLDEST_CONTACTS)
  const call = callAt(caller, contactAddedAt[ROWS - 1]! + 1.1)
  const nextCallers = Arr.filter(
    Arr.makeBy(ROWS, i => (i * 4 + seed) % ROWS),
    row => row !== caller,
  )
  return { end: settledAt(call), contactAddedAt, call, nextCallers }
}

const worldOf = worldOfAim(projection)
const pressedNear = (aim: Option.Option<Point>, button: Point): boolean =>
  Option.exists(aim, at => {
    const [x, y] = worldOf(at)
    return Math.hypot(x - button[0], y - button[1]) < BUTTON_REACH
  })

const pressWhileRinging = (
  calls: ReadonlyArray<Call>,
  last: Call,
  time: number,
  aim: Option.Option<Point>,
): ReadonlyArray<Call> => {
  const earlier = calls.slice(0, -1)
  if (pressedNear(aim, ACCEPT)) return [...earlier, { ...last, ends: time }]
  if (!pressedNear(aim, DECLINE)) return calls
  return [
    ...earlier,
    { ...last, ends: time, declined: true },
    callAt(last.caller, time + CALLS_BACK_AFTER, GLOW_BEFORE_CALL_BACK),
  ]
}

export const withReader = (phone: Phone, interactions: ReadonlyArray<Interaction>): ReadonlyArray<Call> => {
  const onItsOwn: ReadonlyArray<Call> = [phone.call]
  return Arr.reduce(Arr.take(interactions, MAX_PRESSES), onItsOwn, (calls, { time, aim }) => {
    const last = calls[calls.length - 1]!
    if (time >= last.ring && time < last.ends) return pressWhileRinging(calls, last, time, aim)
    if (time < listBackAt(last)) return calls
    const answered = Arr.filter(calls, call => !call.declined).length
    const caller = phone.nextCallers[(answered - 1) % phone.nextCallers.length]!
    return [...calls, callAt(caller, time)]
  })
}

export const foundEgg = (calls: ReadonlyArray<Call>): boolean =>
  Arr.filter(calls, call => call.declined).length >= DECLINES_TO_FIND_EGG

const callOnScreen = (calls: ReadonlyArray<Call>, time: number): Option.Option<Call> =>
  Arr.findLast(calls, call => call.glowsFrom <= time)

const firstTaken = (calls: ReadonlyArray<Call>): Call =>
  Option.getOrElse(
    Arr.findFirst(calls, call => !call.declined),
    () => calls[calls.length - 1]!,
  )

const turn =
  (angle: number) =>
  ([x, y]: Point): Point => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)]

const roundedRect = (width: number, height: number, r: number): ReadonlyArray<Point> => {
  const [hw, hh] = [width / 2, height / 2]
  const corner = (cx: number, cy: number, from: number): ReadonlyArray<Point> =>
    Arr.makeBy(7, i => {
      const a = from + (i / 6) * (Math.PI / 2)
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
    })
  const path = [
    ...corner(hw - r, -hh + r, -Math.PI / 2),
    ...corner(hw - r, hh - r, 0),
    ...corner(-hw + r, hh - r, Math.PI / 2),
    ...corner(-hw + r, -hh + r, Math.PI),
  ]
  return [...path, path[0]!]
}

const arc = (center: Point, radius: number, from: number, to: number, steps: number): ReadonlyArray<Point> =>
  Arr.makeBy(steps + 1, i => {
    const a = from + ((to - from) * i) / steps
    return [center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)]
  })

const GREEN: Rgb = [0.61, 0.89, 0.69]
const PAPER: Rgb = [0.06, 0.23, 0.47]
const PILL = mix(PAPER, LINE, 0.35)

const onlyIf = (condition: boolean, value: number): number =>
  Bool.match(condition, { onTrue: () => value, onFalse: () => 0 })

interface Pen {
  readonly time: number
  readonly drawn: number
  readonly px: (point: Point) => Point
  readonly u: number
  readonly dot: (point: Point, radius: number, color: Rgb, alpha: number, glow?: number, ring?: number) => Dot
  readonly line: (points: ReadonlyArray<Point>, width: number, color: Rgb, alpha: number) => ReadonlyArray<Line>
}

const burstAt = (call: Option.Option<Call>, buzzing: boolean, time: number): number =>
  Option.match(call, {
    onNone: () => 0,
    onSome: c => onlyIf(buzzing, Math.sin(Math.PI * clamp01(((time - c.glowsFrom) % 1.4) / 0.8))),
  })

const penFor = (time: number, width: number, height: number, tilt: number): Pen => {
  const { px, scale } = projection(width, height)
  const u = scale / PX_PER_UNIT_IN_SKETCH
  const tilted = turn(tilt)
  const at = (point: Point): Point => px(tilted(point))
  return {
    time,
    drawn: eased(time, 0, DRAWN_IN),
    px,
    u,
    dot: (point, radius, color, alpha, glow = 0, ring = 0) => {
      const [x, y] = at(point)
      return { x, y, radius: radius * u, glow: glow * u, ring: ring * u, color: rgba(color, alpha) }
    },
    line: (points, w, color, alpha) => segments(points, at, w * u, rgba(color, alpha)),
  }
}

const sideButton = (x: number, from: number, to: number): ReadonlyArray<Point> => [
  [x, from],
  [x, to],
]

const phoneBody = (pen: Pen, frameColor: Rgb): Marks => {
  const pillY = SCREEN.top + 0.058
  const edge = PHONE.width / 2 + 0.012
  return {
    lines: [
      ...pen.line(roundedRect(PHONE.width, PHONE.height, PHONE.corner), 1.6, frameColor, 0.9 * pen.drawn),
      ...pen.line(
        roundedRect(SCREEN.right - SCREEN.left, SCREEN.bottom - SCREEN.top, PHONE.corner - SCREEN_INSET),
        1,
        LINE,
        0.3 * pen.drawn,
      ),
      ...pen.line(
        [
          [-0.06, pillY],
          [0.06, pillY],
        ],
        10,
        PILL,
        pen.drawn,
      ),
      ...pen.line(sideButton(-edge, -0.42, -0.3), 3, LINE, 0.6 * pen.drawn),
      ...pen.line(sideButton(-edge, -0.26, -0.14), 3, LINE, 0.6 * pen.drawn),
      ...pen.line(sideButton(edge, -0.36, -0.16), 3, LINE, 0.6 * pen.drawn),
      ...pen.line(
        [
          [-0.1, SCREEN.bottom - 0.03],
          [0.1, SCREEN.bottom - 0.03],
        ],
        2.4,
        LINE,
        0.4 * pen.drawn,
      ),
    ],
    dots: [pen.dot([-0.06, pillY], 5, PILL, pen.drawn), pen.dot([0.06, pillY], 5, PILL, pen.drawn)],
  }
}

const listShownWith = (call: Option.Option<Call>, time: number): number =>
  Option.match(call, {
    onNone: () => 1,
    onSome: c =>
      Math.max(
        1 - eased(time, c.ring - 0.2, 0.4),
        Bool.match(c.declined, {
          onTrue: () => eased(time, c.ends + 0.1, 0.3),
          onFalse: () => eased(time, listBackAt(c), 0.6),
        }),
      ),
  })

const declinedRedness = (calls: ReadonlyArray<Call>, row: number, time: number): number =>
  Arr.reduce(calls, 0, (most, c) =>
    Math.max(most, onlyIf(c.declined && c.caller === row && time >= c.ends, 1 - within(time, c.ends, 1.4))),
  )

interface RowState {
  readonly row: number
  readonly shown: number
  readonly lit: number
  readonly hot: boolean
}

const callingBand = (pen: Pen, y: number, x: number, shown: number): Marks => {
  const pulse = 0.5 + 0.5 * Math.sin(pen.time * 8)
  const p = (pen.time * 1.2) % 1
  return {
    lines: pen.line(
      [
        [SCREEN.left + 0.02, y],
        [SCREEN.right - 0.02, y],
      ],
      22,
      GOLD,
      (0.08 + 0.06 * pulse) * shown,
    ),
    dots: [pen.dot([x, y], 8 + 16 * p, GOLD, (1 - p) * shown, 0, 1.3)],
  }
}

const contactRow = (pen: Pen, calls: ReadonlyArray<Call>, addedAt: number, { row, shown, lit, hot }: RowState): Marks => {
  const flash = 1 - within(pen.time, addedAt, 0.9)
  const pulse = onlyIf(hot, 0.5 + 0.5 * Math.sin(pen.time * 8))
  const bright = Math.max(flash, lit, onlyIf(hot, 1))
  const color = mix(mix(WARM, GOLD, bright), RED, declinedRedness(calls, row, pen.time))
  const [x, rowY] = rowAt(row)
  const y = rowY + (1 - shown) * 0.03
  const nameLength = 0.2 + ((row * 37) % 5) * 0.045
  const band: Marks = Bool.match(hot, {
    onTrue: () => callingBand(pen, y, x, shown),
    onFalse: () => ({ lines: [], dots: [] }),
  })
  const divider: ReadonlyArray<Line> = Bool.match(row < ROWS - 1, {
    onTrue: () =>
      pen.line(
        [
          [SCREEN.left + 0.03, rowY + 0.055],
          [SCREEN.right - 0.03, rowY + 0.055],
        ],
        1,
        LINE,
        0.08 * shown,
      ),
    onFalse: () => [],
  })
  const landing: ReadonlyArray<Dot> = Bool.match(flash > 0, {
    onTrue: () => [pen.dot([x, y], 7 + 16 * (1 - flash), GOLD, 0.6 * flash, 0, 1.3)],
    onFalse: () => [],
  })
  return {
    lines: [
      ...band.lines,
      ...pen.line(
        [
          [x + 0.06, y - 0.012],
          [x + 0.06 + nameLength, y - 0.012],
        ],
        2.4,
        mix(LINE, GOLD, bright),
        (0.5 + 0.4 * lit) * shown,
      ),
      ...pen.line(
        [
          [x + 0.06, y + 0.018],
          [x + 0.06 + nameLength * 0.55, y + 0.018],
        ],
        1.4,
        LINE,
        0.25 * shown,
      ),
      ...divider,
    ],
    dots: [
      ...band.dots,
      pen.dot([x, y], 7, color, (0.35 + 0.5 * bright) * shown, 8 * pulse, 1.3),
      pen.dot([x, y - 0.008], 2, color, 0.7 * shown),
      ...landing,
    ],
  }
}

const contactList = (pen: Pen, phone: Phone, calls: ReadonlyArray<Call>, call: Option.Option<Call>): Marks => {
  const listShown = listShownWith(call, pen.time)
  const litFrom = listBackAt(firstTaken(calls))
  const rows = Arr.flatMap(phone.contactAddedAt, (addedAt, row): ReadonlyArray<Marks> => {
    const shown = eased(pen.time, addedAt, 0.35) * listShown
    if (shown <= 0) return []
    const lit = eased(pen.time, litFrom + row * ROW_LIT_STAGGER, 0.5)
    const hot = Option.exists(call, c => c.caller === row && pen.time >= c.glowsFrom && pen.time < c.ends)
    return [contactRow(pen, calls, addedAt, { row, shown, lit, hot })]
  })
  return { lines: Arr.flatMap(rows, r => r.lines), dots: Arr.flatMap(rows, r => r.dots) }
}

const callScreenShown = (c: Call, time: number): number =>
  eased(time, c.ring - 0.1, 0.4) *
  (1 -
    Bool.match(c.declined, {
      onTrue: () => eased(time, c.ends, 0.3),
      onFalse: () => eased(time, c.ends + TALKS_FOR - 0.2, 0.4),
    }))

const glyph = (pen: Pen, button: Point, dots: ReadonlyArray<GlyphDot>, alpha: number): ReadonlyArray<Dot> =>
  Arr.map(dots, ({ at: [dx, dy], radius }) =>
    pen.dot([button[0] + dx / PX_PER_UNIT_IN_SKETCH, button[1] + dy / PX_PER_UNIT_IN_SKETCH], radius, PAPER, alpha),
  )

const callButtons = (pen: Pen, alpha: number, ringing: boolean): ReadonlyArray<Dot> => {
  const pulses = Bool.match(ringing, {
    onTrue: () =>
      Arr.map([0, 0.5], lag => {
        const p = (pen.time * 1.1 + lag) % 1
        return pen.dot(ACCEPT, 20 + 18 * p, GREEN, (1 - p) * 0.8 * alpha, 0, 1.6)
      }),
    onFalse: (): ReadonlyArray<Dot> => [],
  })
  return [
    ...pulses,
    pen.dot(DECLINE, 20, RED, 0.9 * alpha),
    pen.dot(ACCEPT, 20, GREEN, 0.95 * alpha, onlyIf(ringing, 10)),
    ...glyph(pen, ACCEPT, PICKED_UP, alpha),
    ...glyph(pen, DECLINE, HUNG_UP, alpha),
  ]
}

const VOICE_BARS = 5

const voiceBars = (pen: Pen, answering: number, shown: number): ReadonlyArray<Line> =>
  Arr.flatMap(Arr.makeBy(VOICE_BARS, i => i), bar => {
    const h = ((4 + 10 * Math.abs(Math.sin(pen.time * 6 + bar * 1.3))) * answering) / PX_PER_UNIT_IN_SKETCH
    const x = (bar - 2) * (10 / PX_PER_UNIT_IN_SKETCH)
    return pen.line(
      [
        [x, ACCEPT[1] - h],
        [x, ACCEPT[1] + h],
      ],
      3,
      GOLD,
      0.9 * answering * shown,
    )
  })

const callScreen = (pen: Pen, c: Call, ringing: boolean): Marks => {
  const shown = callScreenShown(c, pen.time)
  if (shown <= 0) return { lines: [], dots: [] }
  const answering = onlyIf(!c.declined, eased(pen.time, c.ends, 0.8))
  const pulse = Bool.match(ringing, { onTrue: () => 0.5 + 0.5 * Math.sin(pen.time * 8), onFalse: () => 1 })
  const buttons = shown * (1 - answering)
  return {
    lines: [
      ...pen.line(
        arc([CALLER[0], CALLER[1] + 0.07], 15 / PX_PER_UNIT_IN_SKETCH, Math.PI * 1.12, Math.PI * 1.88, 8),
        1.8,
        GOLD,
        0.9 * shown,
      ),
      ...pen.line(
        [
          [-0.18, -0.17],
          [0.18, -0.17],
        ],
        3,
        WARM,
        0.85 * shown,
      ),
      ...pen.line(
        [
          [-0.1, -0.11],
          [0.1, -0.11],
        ],
        1.6,
        LINE,
        0.4 * shown,
      ),
      ...Bool.match(answering > 0, { onTrue: () => voiceBars(pen, answering, shown), onFalse: () => [] }),
    ],
    dots: [
      pen.dot(CALLER, 34, GOLD, 0.9 * shown, 10 * pulse, 1.8),
      pen.dot([CALLER[0], CALLER[1] - 0.04], 8, GOLD, 0.9 * shown, 0, 1.8),
      ...Bool.match(buttons > 0, { onTrue: () => callButtons(pen, buttons, ringing), onFalse: () => [] }),
    ],
  }
}

const buzzRings = (pen: Pen): ReadonlyArray<Line> =>
  Arr.flatMap([-1, 1], side =>
    Arr.flatMap([0, 1 / 3, 2 / 3], lag => {
      const p = (pen.time * 1.4 + lag) % 1
      const centre: Point = [side * (PHONE.width / 2 + 0.06), -0.5]
      const from = Bool.match(side > 0, { onTrue: () => -0.55, onFalse: () => Math.PI - 0.55 })
      return segments(
        arc(centre, (8 + 30 * p) / PX_PER_UNIT_IN_SKETCH, from, from + 1.1, 5),
        pen.px,
        1.6 * pen.u,
        rgba(GOLD, 0.7 * (1 - p)),
      )
    }),
  )

const endingWave = (pen: Pen, { ends, declined }: Call): ReadonlyArray<Dot> => {
  const p = within(pen.time, ends, Bool.match(declined, { onTrue: () => 1, onFalse: () => 1.8 }))
  if (pen.time < ends || p >= 1) return []
  const [x, y] = pen.px([0, 0])
  const color = Bool.match(declined, {
    onTrue: () => rgba(RED, 0.6 * (1 - p)),
    onFalse: () => rgba(GOLD, 0.45 * (1 - p)),
  })
  return [{ x, y, radius: (40 + 420 * p) * pen.u, glow: 0, ring: 2 * pen.u, color }]
}

const EMPTY: Marks = { lines: [], dots: [] }

export const phoneMarks = (
  phone: Phone,
  calls: ReadonlyArray<Call>,
  time: number,
  width: number,
  height: number,
): Marks => {
  const call = callOnScreen(calls, time)
  const buzzing = Option.exists(call, c => time >= c.glowsFrom && time < c.ends)
  const ringing = Option.exists(call, c => time >= c.ring && time < c.ends)
  const tilt = 0.035 * burstAt(call, buzzing, time) * Math.sin(time * Math.PI * 12)
  const pen = penFor(time, width, height, tilt)
  const litUp = eased(time, firstTaken(calls).ends + 0.6, 1.6)
  const body = phoneBody(pen, mix(LINE, GOLD, litUp * 0.5))
  const list = contactList(pen, phone, calls, call)
  const screen = Option.match(call, { onNone: () => EMPTY, onSome: c => callScreen(pen, c, ringing) })
  const buzz = Bool.match(buzzing, { onTrue: () => buzzRings(pen), onFalse: () => [] })
  const wave = Option.match(call, { onNone: () => [], onSome: c => endingWave(pen, c) })
  return {
    lines: [...body.lines, ...list.lines, ...screen.lines, ...buzz],
    dots: [...body.dots, ...list.dots, ...screen.dots, ...wave],
  }
}

export const PHONE_LINES = 28 * 2 + 5 + ROWS * 4 + 8 + 2 + VOICE_BARS + 2 * 3 * 5
export const PHONE_DOTS = 2 + ROWS * 4 + 2 + 2 + 2 + HANDSET_DOTS + 1

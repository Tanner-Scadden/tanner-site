import { Boolean as Bool, Option } from 'effect'
import { dual } from 'effect/Function'

import { LONGEST_STEP_S } from '../../gpu/loop.ts'

export interface Settings {
  readonly flow: boolean
  readonly still: boolean
}

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Pointer extends Point {
  readonly inside: boolean
}

export interface FrameState {
  readonly last: Option.Option<number>
  readonly warp: number
  readonly flow: number
  readonly eased: Point
  readonly seed: number
  readonly simulated: boolean
  readonly still: boolean
}

export interface Frame {
  readonly state: FrameState
  readonly dt: number
  readonly drawPens: boolean
  readonly stepPens: boolean
}

export const MINOR = 24
export const MAJOR = 120
const EASE_PER_S = 3
const LENS_FOLLOW_PER_S = 14
const SNAP = 0.002
const FROZEN_DT = 0.001

export const OFFSCREEN: Point = { x: -9999, y: -9999 }
export const NO_POINTER: Pointer = { ...OFFSCREEN, inside: false }

const flag = (on: boolean): number => {
  if (on) return 1
  return 0
}

export const initialFrame = (settings: Settings): FrameState => ({
  last: Option.none(),
  warp: 0,
  flow: flag(settings.flow && settings.still),
  eased: OFFSCREEN,
  seed: 0,
  simulated: false,
  still: settings.still,
})

export interface Approach {
  readonly to: number
  readonly dt: number
}

export const approach: {
  (options: Approach): (from: number) => number
  (from: number, options: Approach): number
} = dual(2, (from: number, { to, dt }: Approach): number => {
  const next = from + (to - from) * (1 - Math.exp(-EASE_PER_S * dt))
  if (Math.abs(next - to) < SNAP) return to
  return next
})

export const extentFor = (size: number): number =>
  (Math.ceil(size / MAJOR) + 1) * MAJOR

const warpTarget = (settings: Settings, pointer: Pointer): number => flag(pointer.inside && !settings.still)

const flowTarget = (settings: Settings): number => flag(settings.flow)

const followLens = (
  eased: Point,
  pointer: Pointer,
  warp: number,
  dt: number,
): Point => {
  if (warp === 0 || eased.x === OFFSCREEN.x) return { x: pointer.x, y: pointer.y }
  const t = 1 - Math.exp(-LENS_FOLLOW_PER_S * dt)
  return {
    x: eased.x + (pointer.x - eased.x) * t,
    y: eased.y + (pointer.y - eased.y) * t,
  }
}

export interface Moment {
  readonly settings: Settings
  readonly pointer: Pointer
}

export interface Tick extends Moment {
  readonly now: number
}

export const step: {
  (tick: Tick): (state: FrameState) => Frame
  (state: FrameState, tick: Tick): Frame
} = dual(2, (state: FrameState, { settings, pointer, now }: Tick): Frame => {
  const dt = Option.match(state.last, {
    onNone: () => 0,
    onSome: last => Math.min((now - last) / 1000, LONGEST_STEP_S),
  })
  const warp = approach(state.warp, { to: warpTarget(settings, pointer), dt })
  const flow = Bool.match(settings.still, {
    onTrue: () => flowTarget(settings),
    onFalse: () => approach(state.flow, { to: flowTarget(settings), dt }),
  })
  const simulated = settings.still === state.still && state.simulated
  const drawPens = flow > 0
  const stepPens = drawPens && (!settings.still || !simulated)
  return {
    state: {
      last: Option.some(now),
      warp,
      flow,
      eased: followLens(state.eased, pointer, warp, dt),
      seed: (state.seed + 1) % 1_000_000,
      simulated: simulated || stepPens,
      still: settings.still,
    },
    dt: Bool.match(settings.still, { onTrue: () => FROZEN_DT, onFalse: () => dt }),
    drawPens,
    stepPens,
  }
})

export const settled: {
  (moment: Moment): (state: FrameState) => boolean
  (state: FrameState, moment: Moment): boolean
} = dual(2, (state: FrameState, { settings, pointer }: Moment): boolean => {
  const lensResting =
    state.warp === 0 ||
    (Math.abs(state.eased.x - pointer.x) < 0.5 &&
      Math.abs(state.eased.y - pointer.y) < 0.5)
  const pensMoving = state.flow > 0 && !settings.still
  return (
    state.warp === warpTarget(settings, pointer) &&
    state.flow === flowTarget(settings) &&
    lensResting &&
    !pensMoving
  )
})

export const wake = (state: FrameState): FrameState => ({ ...state, last: Option.none() })

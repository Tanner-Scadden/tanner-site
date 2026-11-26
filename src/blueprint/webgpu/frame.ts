// NOTE: the blueprint's frame math, as plain data in and plain data out. No
// GPU and no DOM here, so every rule about when the page moves and when it
// rests is testable on its own. The renderer only draws what `step` returns.

import { dual } from 'effect/Function'

export interface Settings {
  readonly flow: boolean
  readonly still: boolean
}

export interface Point {
  readonly x: number
  readonly y: number
}

// Where a mouse is, and whether it's over the page. Touch never warps.
export interface Pointer extends Point {
  readonly inside: boolean
}

export interface FrameState {
  // The previous frame's time in ms, or null at the start of a burst of
  // frames, so a page that rested for a while doesn't jump.
  readonly last: number | null
  // 0 to 1: how much the lens bends the grid.
  readonly warp: number
  // 0 to 1: how far the drafting pens have faded in.
  readonly flow: number
  // The lens centre, which trails the pointer a little.
  readonly eased: Point
  readonly seed: number
  // With motion reduced the pens step once, then freeze where they are.
  readonly simulated: boolean
  readonly still: boolean
}

// What one frame draws.
export interface Frame {
  readonly state: FrameState
  readonly dt: number
  readonly drawPens: boolean
  readonly stepPens: boolean
}

export const MINOR = 24
export const MAJOR = 120
const LONGEST_STEP_S = 0.05
const EASE_PER_S = 3
const LENS_FOLLOW_PER_S = 14
const SNAP = 0.002
// A frozen frame still steps a little, so the pens show as dashes.
const FROZEN_DT = 0.001

export const OFFSCREEN: Point = { x: -9999, y: -9999 }
export const NO_POINTER: Pointer = { ...OFFSCREEN, inside: false }

export const initialFrame = (settings: Settings): FrameState => ({
  last: null,
  warp: 0,
  flow: settings.flow && settings.still ? 1 : 0,
  eased: OFFSCREEN,
  seed: 0,
  simulated: false,
  still: settings.still,
})

export interface Approach {
  readonly to: number
  readonly dt: number
}

// Eases `from` toward `to` at the same speed at any frame rate, and lands
// exactly on `to` once it's close, so the page can stop drawing.
export const approach: {
  (options: Approach): (from: number) => number
  (from: number, options: Approach): number
} = dual(2, (from: number, { to, dt }: Approach): number => {
  const next = from + (to - from) * (1 - Math.exp(-EASE_PER_S * dt))
  return Math.abs(next - to) < SNAP ? to : next
})

// The wrap extent is a whole number of major cells larger than the screen,
// so a pen that wraps lands back on a grid line.
export const extentFor = (size: number): number =>
  (Math.ceil(size / MAJOR) + 1) * MAJOR

const warpTarget = (settings: Settings, pointer: Pointer): number =>
  pointer.inside && !settings.still ? 1 : 0

const flowTarget = (settings: Settings): number => (settings.flow ? 1 : 0)

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

// What the page looks like at one moment.
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
  const dt =
    state.last === null ? 0 : Math.min((now - state.last) / 1000, LONGEST_STEP_S)
  const warp = approach(state.warp, { to: warpTarget(settings, pointer), dt })
  // With motion reduced the pens snap on or off instead of fading.
  const flow = settings.still
    ? flowTarget(settings)
    : approach(state.flow, { to: flowTarget(settings), dt })
  // Switching reduced motion lets the pens take one more step.
  const simulated = settings.still === state.still && state.simulated
  const drawPens = flow > 0
  const stepPens = drawPens && (!settings.still || !simulated)
  return {
    state: {
      last: now,
      warp,
      flow,
      eased: followLens(state.eased, pointer, warp, dt),
      seed: (state.seed + 1) % 1_000_000,
      simulated: simulated || stepPens,
      still: settings.still,
    },
    dt: settings.still ? FROZEN_DT : dt,
    drawPens,
    stepPens,
  }
})

// True once nothing would change on the next frame, so the loop can sleep.
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

// A burst of frames starts fresh, so its first dt is 0, not the rest time.
export const wake = (state: FrameState): FrameState => ({ ...state, last: null })

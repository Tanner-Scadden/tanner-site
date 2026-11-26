import { assert, describe, it } from '@effect/vitest'
import { pipe } from 'effect'

import {
  NO_POINTER,
  type FrameState,
  type Pointer,
  type Settings,
  approach,
  extentFor,
  initialFrame,
  settled,
  step,
} from './frame'

const moving: Settings = { flow: false, still: false }
const pens: Settings = { flow: true, still: false }
const frozenPens: Settings = { flow: true, still: true }
const mouse: Pointer = { x: 200, y: 150, inside: true }

// Steps 60fps frames until the state settles, or gives up.
const run = (
  settings: Settings,
  pointer: Pointer,
  from: FrameState = initialFrame(settings),
) => {
  let state = from
  let frames = 0
  for (let now = 0; frames < 600; now += 16, frames++) {
    state = step(state, { settings, pointer, now }).state
    if (settled(state, { settings, pointer })) break
  }
  return { state, frames }
}

describe('blueprint frames', () => {
  it('rests on a still page with no pointer', () => {
    const state = initialFrame(moving)
    assert.isTrue(settled(state, { settings: moving, pointer: NO_POINTER }))
  })

  it('eases the lens in under the mouse, then rests', () => {
    const { state, frames } = run(moving, mouse)
    assert.strictEqual(state.warp, 1)
    assert.isTrue(settled(state, { settings: moving, pointer: mouse }))
    assert.isAbove(frames, 10)
    assert.isBelow(Math.abs(state.eased.x - mouse.x), 0.5)
  })

  it('never warps with motion reduced', () => {
    const still = { flow: false, still: true }
    const { state } = run(still, mouse)
    assert.strictEqual(state.warp, 0)
  })

  it('keeps drawing while the pens run', () => {
    const { state, frames } = run(pens, NO_POINTER)
    assert.strictEqual(state.flow, 1)
    assert.strictEqual(frames, 600)
    assert.isFalse(settled(state, { settings: pens, pointer: NO_POINTER }))
  })

  it('steps frozen pens once, then rests', () => {
    const first = step(initialFrame(frozenPens), { settings: frozenPens, pointer: NO_POINTER, now: 0 })
    assert.isTrue(first.stepPens)
    assert.isTrue(first.drawPens)
    const second = step(first.state, { settings: frozenPens, pointer: NO_POINTER, now: 16 })
    assert.isFalse(second.stepPens)
    assert.isTrue(settled(second.state, { settings: frozenPens, pointer: NO_POINTER }))
  })

  it('starts a burst with no time step, so a rest never jumps', () => {
    const frame = step(initialFrame(pens), { settings: pens, pointer: NO_POINTER, now: 90_000 })
    assert.strictEqual(frame.dt, 0)
  })

  it('eases at the same speed at any frame rate', () => {
    const at60 = pipe(0, approach({ to: 1, dt: 1 / 60 }), approach({ to: 1, dt: 1 / 60 }))
    const at30 = approach(0, { to: 1, dt: 2 / 60 })
    assert.closeTo(at60, at30, 1e-9)
  })

  it('wraps on a major grid line past the screen', () => {
    assert.strictEqual(extentFor(1000), 1200)
    assert.strictEqual(extentFor(1200), 1320)
  })
})

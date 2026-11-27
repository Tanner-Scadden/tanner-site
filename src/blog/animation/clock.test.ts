import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import { type Clock, follow, interact, opacityAt, startClock, tick } from './clock.ts'
import { type Controls, FADE, HOLD } from './controls.ts'
import type { Interaction, Scene } from './scene.ts'

// A scene with a ten second run that takes up to three interactions.
const scene: Scene = {
  variants: [
    { id: 'a', label: 'A', caption: '', tone: 'hi' },
    { id: 'b', label: 'B', caption: '', tone: 'hi' },
  ],
  run: () => ({ end: 10, shapesAt: () => ({ lines: [], dots: [] }) }),
  maxLines: 1,
  maxDots: 1,
  interact: { hint: 'Do a thing', settle: 2, max: 3 },
}

const controls: Controls = { variant: 'a', playing: true, seek: 0, seeks: 0, restarts: 0, interacts: 0 }
const timesOf = (clock: Clock) => Arr.map(clock.interactions, (interaction: Interaction) => interaction.time)
const press = (clock: Clock, now: Controls) => follow(scene, clock, { ...now, interacts: now.interacts + 1 })

describe('animation clock', () => {
  it('records an interaction at the time it happened', () => {
    const playing = tick(scene, startClock(scene, controls, false), 0.1)
    const later = Arr.reduce(Arr.range(1, 30), playing, clock => tick(scene, clock, 0.1))
    const pressed = press(later, controls)
    assert.deepStrictEqual(timesOf(pressed), [later.time])
    assert.isTrue(Option.isNone(pressed.interactions[0]!.aim))
  })

  it('keeps interactions in the order they happened, even after scrubbing back', () => {
    let clock = follow(scene, startClock(scene, controls, false), { ...controls, seek: 0.6, seeks: 1 })
    let now: Controls = { ...controls, seek: 0.6, seeks: 1 }
    clock = press(clock, now)
    now = { ...now, interacts: 1, seek: 0.2, seeks: 2 }
    clock = follow(scene, clock, now)
    clock = press(clock, now)
    assert.deepStrictEqual(timesOf(clock), [2, 6])
  })

  it('applies at the paused time, and keeps an aim', () => {
    const paused: Controls = { ...controls, playing: false, seek: 0.35, seeks: 1 }
    const clock = follow(scene, startClock(scene, controls, false), paused)
    const aimed = interact(scene, clock, Option.some([0.25, 0.5]))
    assert.deepStrictEqual(timesOf(aimed), [3.5])
    assert.deepStrictEqual(Option.getOrNull(aimed.interactions[0]!.aim), [0.25, 0.5])
  })

  it('past the end, goes in at the end and holds again', () => {
    const start = startClock(scene, controls, false)
    const held = { ...start, time: 10 + HOLD + FADE * 0.5 }
    const pressed = press(held, controls)
    assert.deepStrictEqual(timesOf(pressed), [10])
    assert.strictEqual(pressed.time, 10)
    // The hold waits until it's played out.
    const later = tick(scene, pressed, 2 + HOLD)
    assert.strictEqual(later.interactions.length, 1)
    assert.strictEqual(opacityAt(scene, later), 1)
  })

  it('under reduced motion, goes in early enough to have played out on the still frame', () => {
    const still = startClock(scene, controls, true)
    assert.isFalse(still.playing)
    assert.deepStrictEqual(timesOf(press(still, controls)), [8])
  })

  it('clears them on restart, on a new variant, and on the next seed', () => {
    const pressed = press(startClock(scene, controls, false), controls)
    const now: Controls = { ...controls, interacts: 1 }
    assert.strictEqual(pressed.interactions.length, 1)
    assert.deepStrictEqual(follow(scene, pressed, { ...now, restarts: 1, seeks: 1, seek: 0 }).interactions, [])
    assert.deepStrictEqual(follow(scene, pressed, { ...now, variant: 'b' }).interactions, [])
    assert.deepStrictEqual(tick(scene, { ...pressed, time: 10 + HOLD + FADE }, 0.1).interactions, [])
    // Anything else keeps them.
    assert.strictEqual(follow(scene, pressed, { ...now, playing: false }).interactions.length, 1)
    assert.strictEqual(tick(scene, pressed, 0.1).interactions.length, 1)
  })

  it('takes no more than the scene allows, and none without `interact`', () => {
    const clock = Arr.reduce(Arr.range(1, 5), startClock(scene, controls, false), c =>
      interact(scene, c, Option.none()),
    )
    assert.strictEqual(clock.interactions.length, 3)
    const { interact: _, ...plain } = scene
    assert.strictEqual(interact(plain, startClock(plain, controls, false), Option.none()).interactions.length, 0)
  })
})

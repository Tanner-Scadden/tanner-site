import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import type { Interaction, Shapes } from '../../animation/scene.ts'
import { callingScene } from './scene.ts'

const W = 640
const H = 360
const shapes = (variant: string, seed: number, time: number, interactions: ReadonlyArray<Interaction> = []): Shapes =>
  callingScene.run(variant, seed).shapesAt(time, W, H, Option.none(), interactions)

const MAX = callingScene.interact?.max ?? 0
const spread = Arr.makeBy(MAX, (i): Interaction => ({ time: 2 + i * 1.5, aim: Option.some([0.1 + i * 0.13, 0.3]) }))
const together = Arr.makeBy(MAX, (): Interaction => ({ time: 6, aim: Option.none() }))

describe.each(['minimap', 'switchboard'])('the %s hero', variant => {
  const run = callingScene.run(variant, 1)
  const times = Arr.makeBy(Math.ceil(run.end * 4) + 8, i => i / 4)

  it('plays the same run from the same seed', () => {
    assert.deepStrictEqual(shapes(variant, 3, 9.3), shapes(variant, 3, 9.3))
  })

  it('stays inside its canvas and its buffers, even with every press', () => {
    for (const interactions of [[], spread, together]) {
      for (const time of times) {
        const frame = shapes(variant, 1, time, interactions)
        assert.isAtMost(frame.lines.length, callingScene.maxLines)
        assert.isAtMost(frame.dots.length, callingScene.maxDots)
        for (const dot of frame.dots) {
          assert.isTrue(dot.x >= 0 && dot.x <= W && dot.y >= 0 && dot.y <= H, `${variant} dot at ${dot.x},${dot.y}`)
        }
      }
    }
  })

  it('shows a press only once it has happened', () => {
    const press: ReadonlyArray<Interaction> = [{ time: 5, aim: Option.some([0.5, 0.4]) }]
    assert.deepStrictEqual(shapes(variant, 1, 4.9, press), shapes(variant, 1, 4.9))
    const count = (frame: Shapes) => frame.lines.length + frame.dots.length
    assert.isAbove(count(shapes(variant, 1, 5.5, press)), count(shapes(variant, 1, 5.5)))
  })

  it('ends with the call answered: more gold on screen than before it', () => {
    const gold = (frame: Shapes) => Arr.filter(frame.dots, dot => dot.glow > 0 && dot.color[3] > 0.5).length
    assert.isAbove(gold(shapes(variant, 1, run.end)), gold(shapes(variant, 1, 2)))
  })
})

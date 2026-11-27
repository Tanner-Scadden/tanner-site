import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import type { Interaction, Point } from '../../animation/scene.ts'
import { buildTimeline, positionAt } from './graph.ts'
import { networkScene } from './scene.ts'
import { projection } from './shapes.ts'

const press = (time: number, aim: Option.Option<Point> = Option.none()): Interaction => ({ time, aim })
const run = networkScene.run('network', 3)
const shapesOf = (time: number, interactions: ReadonlyArray<Interaction>) =>
  run.shapesAt(time, 800, 450, Option.none(), interactions)

describe('network INTERACT', () => {
  it('takes interactions, as bad ones', () => {
    assert.isDefined(networkScene.interact)
    assert.isAbove(networkScene.interact!.max, 0)
  })

  it('shows nothing of a press before it, and tears a link after', () => {
    const presses = [press(12)]
    for (const t of [1, 6, 11.99]) assert.deepStrictEqual(shapesOf(t, presses), shapesOf(t, []))
    assert.notDeepEqual(shapesOf(13, presses), shapesOf(13, []))
  })

  it('aims a click at whoever is under it', () => {
    const timeline = buildTimeline(3)
    const target = timeline.helps[2]!.person
    const { px } = projection(1600, 900)
    const [x, y] = px(positionAt(timeline, target, 14))
    const aimed = [press(14, Option.some([x / 1600, y / 900]))]
    const settled = 14 + networkScene.interact!.settle
    // Their link is gone, so one link fewer than with no press.
    assert.strictEqual(shapesOf(settled, aimed).lines.length, shapesOf(settled, []).lines.length - 1)
    assert.notDeepEqual(shapesOf(settled, aimed), shapesOf(settled, [press(14)]))
  })

  it('plays a press out past the end', () => {
    const { end } = run
    assert.notDeepEqual(shapesOf(end + 0.4, [press(end)]), shapesOf(end + 0.4, []))
  })

  it('stays inside its buffers with every press it takes, spread out or all at once', () => {
    const { end } = run
    const max = networkScene.interact!.max
    // Paused and pressed `max` times, they all go in at the same moment.
    for (const presses of [Arr.makeBy(max, k => press(2 + k * 2)), Arr.makeBy(max, () => press(12))]) {
      for (let t = 0; t < end + networkScene.interact!.settle + 1; t += 0.1) {
        const shapes = shapesOf(t, presses)
        assert.isAtMost(shapes.lines.length, networkScene.maxLines, `at ${t}`)
        assert.isAtMost(shapes.dots.length, networkScene.maxDots, `at ${t}`)
      }
    }
  })
})

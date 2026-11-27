import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import type { Interaction, Point } from '../../animation/scene.ts'
import { forestScene } from './scene.ts'

const press = (time: number, aim: Option.Option<Point> = Option.none()): Interaction => ({ time, aim })
const run = forestScene.run('grove', 3)
const shapesOf = (time: number, interactions: ReadonlyArray<Interaction>) =>
  run.shapesAt(time, 800, 450, Option.none(), interactions)

describe('forest INTERACT', () => {
  it('takes interactions, as seeds', () => {
    assert.isDefined(forestScene.interact)
    assert.isAbove(forestScene.interact!.max, 0)
  })

  it('shows nothing of a seed before it, and grows a tree after', () => {
    const presses = [press(5)]
    for (const t of [1, 3, 4.99]) assert.deepStrictEqual(shapesOf(t, presses), shapesOf(t, []))
    const grown = 5 + forestScene.interact!.settle
    assert.isAbove(shapesOf(grown, presses).lines.length, shapesOf(grown, []).lines.length)
  })

  it('plants an aimed seed where it was clicked', () => {
    const grown = 5 + forestScene.interact!.settle
    const left = shapesOf(grown, [press(5, Option.some([0.1, 0.5]))])
    const right = shapesOf(grown, [press(5, Option.some([0.9, 0.5]))])
    assert.notDeepEqual(left, right)
  })

  it('plays a seed out past the end', () => {
    const { end } = run
    assert.notDeepEqual(shapesOf(end + 1, [press(end)]), shapesOf(end + 1, []))
  })

  it('stays inside its buffers with every seed it takes, spread out or all at once', () => {
    const { end } = run
    const max = forestScene.interact!.max
    // Paused and pressed `max` times, they all go in at the same moment.
    for (const presses of [Arr.makeBy(max, k => press(2 + k * 2)), Arr.makeBy(max, () => press(6))]) {
      for (let t = 0; t < end + forestScene.interact!.settle + 1; t += 0.1) {
        const shapes = shapesOf(t, presses)
        assert.isAtMost(shapes.lines.length, forestScene.maxLines, `at ${t}`)
        assert.isAtMost(shapes.dots.length, forestScene.maxDots, `at ${t}`)
      }
    }
  })
})

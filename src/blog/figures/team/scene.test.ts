import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import type { Interaction } from '../../animation/scene.ts'
import { buildTimeline, fillAt, withKicks } from './bucket.ts'
import { teamScene } from './scene.ts'

const press = (time: number): Interaction => ({ time, aim: Option.none() })
const run = teamScene.run('team', 3)
const shapesOf = (time: number, interactions: ReadonlyArray<Interaction>) =>
  run.shapesAt(time, 800, 450, Option.none(), interactions)

describe('team bucket INTERACT', () => {
  it('takes interactions, as kicks', () => {
    assert.isDefined(teamScene.interact)
    assert.isAbove(teamScene.interact!.max, 0)
  })

  it('shows nothing of a kick before it, and spills water after', () => {
    const presses = [press(5)]
    for (const t of [1, 3, 4.99]) assert.deepStrictEqual(shapesOf(t, presses), shapesOf(t, []))
    assert.notDeepEqual(shapesOf(6, presses), shapesOf(6, []))
    const timeline = buildTimeline(3)
    assert.isBelow(fillAt(withKicks(timeline, [5]), 7), fillAt(timeline, 7))
  })

  it('plays a kick out past the end, then holds', () => {
    const { end } = run
    const presses = [press(end)]
    assert.notDeepEqual(shapesOf(end + 0.4, presses), shapesOf(end, presses))
    const settled = end + teamScene.interact!.settle
    assert.deepStrictEqual(shapesOf(settled + 1, presses), shapesOf(settled, presses))
  })

  it('stays inside its buffers with every kick it takes, spread out or all at once', () => {
    const { end } = run
    const max = teamScene.interact!.max
    // Paused and pressed `max` times, they all go in at the same moment.
    for (const presses of [Arr.makeBy(max, k => press(2 + k * 2)), Arr.makeBy(max, () => press(6))]) {
      for (let t = 0; t < end + teamScene.interact!.settle + 1; t += 0.1) {
        const shapes = shapesOf(t, presses)
        assert.isAtMost(shapes.lines.length, teamScene.maxLines, `at ${t}`)
        assert.isAtMost(shapes.dots.length, teamScene.maxDots, `at ${t}`)
      }
    }
  })
})

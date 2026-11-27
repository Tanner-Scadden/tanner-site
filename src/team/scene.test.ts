import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import type { Interaction } from '../blog/animation/scene.ts'
import { buildTimeline, fillAt, withFlares } from './bucket.ts'
import { teamScene } from './scene.ts'

const press = (time: number): Interaction => ({ time, aim: Option.none() })
const shapesOf = (time: number, interactions: ReadonlyArray<Interaction>) =>
  teamScene.run('team', 3).shapesAt(time, 800, 450, Option.none(), interactions)

describe('team bucket INTERACT', () => {
  it('takes interactions, as flares', () => {
    assert.isDefined(teamScene.interact)
    assert.isAbove(teamScene.interact!.max, 0)
  })

  it('shows nothing of a flare before it, and tips trust out after', () => {
    const presses = [press(5)]
    for (const t of [1, 3, 4.99]) assert.deepStrictEqual(shapesOf(t, presses), shapesOf(t, []))
    assert.notDeepEqual(shapesOf(6, presses), shapesOf(6, []))
    const timeline = buildTimeline(3)
    assert.isBelow(fillAt(withFlares(timeline, [5]), 7), fillAt(timeline, 7))
  })

  it('plays a flare out past the end, then holds', () => {
    const { end } = teamScene.run('team', 3)
    const presses = [press(end)]
    assert.notDeepEqual(shapesOf(end + 0.4, presses), shapesOf(end, presses))
    const settled = end + teamScene.interact!.settle
    assert.deepStrictEqual(shapesOf(settled + 1, presses), shapesOf(settled, presses))
  })

  it('stays inside its buffers with every flare it takes', () => {
    const presses = Arr.makeBy(teamScene.interact!.max, k => press(2 + k * 2))
    for (let t = 0; t < 16; t += 0.1) {
      const shapes = shapesOf(t, presses)
      assert.isAtMost(shapes.lines.length, teamScene.maxLines)
      assert.isAtMost(shapes.dots.length, teamScene.maxDots)
    }
  })
})

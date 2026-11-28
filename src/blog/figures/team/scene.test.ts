import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import type { Interaction } from '../../animation/scene.ts'
import { buildTimeline, fillAt, withKicks } from './bucket.ts'
import { teamScene } from './scene.ts'

const press = (time: number): Interaction => ({ time, aim: Option.none() })
const run = teamScene.run('team', 3)
const marksOf = (time: number, interactions: ReadonlyArray<Interaction>) =>
  run.marksAt(time, 800, 450, Option.none(), interactions)

describe('team bucket INTERACT', () => {
  it('takes interactions, as kicks', () => {
    assert.isDefined(teamScene.interact)
    assert.isAbove(teamScene.interact.max, 0)
  })

  it('shows nothing of a kick before it, and spills water after', () => {
    const presses = [press(5)]
    for (const t of [1, 3, 4.99]) assert.deepStrictEqual(marksOf(t, presses), marksOf(t, []))
    assert.notDeepEqual(marksOf(6, presses), marksOf(6, []))
    const timeline = buildTimeline(3)
    assert.isBelow(fillAt(withKicks(timeline, [5]), 7), fillAt(timeline, 7))
  })

  it('plays a kick out past the end, then holds', () => {
    const { end } = run
    const presses = [press(end)]
    assert.notDeepEqual(marksOf(end + 0.4, presses), marksOf(end, presses))
    const settled = end + teamScene.interact!.settle
    assert.deepStrictEqual(marksOf(settled + 1, presses), marksOf(settled, presses))
  })

  it('stays inside its buffers with every kick it takes, spread out or all at once', () => {
    const { end } = run
    const max = teamScene.interact!.max
    for (const presses of [Arr.makeBy(max, k => press(2 + k * 2)), Arr.makeBy(max, () => press(6))]) {
      for (let t = 0; t < end + teamScene.interact!.settle + 1; t += 0.1) {
        const marks = marksOf(t, presses)
        assert.isAtMost(marks.lines.length, teamScene.maxLines, `at ${t}`)
        assert.isAtMost(marks.dots.length, teamScene.maxDots, `at ${t}`)
      }
    }
  })
})

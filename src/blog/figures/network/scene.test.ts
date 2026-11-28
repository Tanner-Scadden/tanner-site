import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import type { Interaction, Point } from '../../animation/scene.ts'
import { buildTimeline, positionAt } from './graph.ts'
import { networkScene } from './scene.ts'
import { projection } from './marks.ts'

const press = (time: number, aim: Option.Option<Point> = Option.none()): Interaction => ({ time, aim })
const run = networkScene.run('network', 3)
const marksOf = (time: number, interactions: ReadonlyArray<Interaction>) =>
  run.marksAt(time, 800, 450, Option.none(), interactions)

describe('network INTERACT', () => {
  it('takes interactions, as bad ones', () => {
    assert.isDefined(networkScene.interact)
    assert.isAbove(networkScene.interact.max, 0)
  })

  it('shows nothing of a press before it, and tears a link after', () => {
    const presses = [press(12)]
    for (const t of [1, 6, 11.99]) assert.deepStrictEqual(marksOf(t, presses), marksOf(t, []))
    assert.notDeepEqual(marksOf(13, presses), marksOf(13, []))
  })

  it('aims a click at whoever is under it', () => {
    const timeline = buildTimeline(3)
    const target = timeline.helps[2]!.person
    const { px } = projection(1600, 900)
    const [x, y] = px(positionAt(timeline, target, 14))
    const aimed = [press(14, Option.some([x / 1600, y / 900]))]
    const settled = 14 + networkScene.interact!.settle
    assert.strictEqual(marksOf(settled, aimed).lines.length, marksOf(settled, []).lines.length - 1)
    assert.notDeepEqual(marksOf(settled, aimed), marksOf(settled, [press(14)]))
  })

  it('plays a press out past the end', () => {
    const { end } = run
    assert.notDeepEqual(marksOf(end + 0.4, [press(end)]), marksOf(end + 0.4, []))
  })

  it('stays inside its buffers with every press it takes, spread out or all at once', () => {
    const { end } = run
    const max = networkScene.interact!.max
    for (const presses of [Arr.makeBy(max, k => press(2 + k * 2)), Arr.makeBy(max, () => press(12))]) {
      for (let t = 0; t < end + networkScene.interact!.settle + 1; t += 0.1) {
        const marks = marksOf(t, presses)
        assert.isAtMost(marks.lines.length, networkScene.maxLines, `at ${t}`)
        assert.isAtMost(marks.dots.length, networkScene.maxDots, `at ${t}`)
      }
    }
  })
})

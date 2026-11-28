import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import type { Interaction, Marks, Point } from '../../animation/scene.ts'
import { ACCEPT, DECLINE, DECLINES_TO_FIND_EGG, buildPhone } from './phone.ts'
import { callingScene } from './scene.ts'
import { projection } from './world.ts'

const W = 640
const H = 360
const frameAt = (seed: number, time: number, interactions: ReadonlyArray<Interaction> = []): Marks =>
  callingScene.run('phone', seed).marksAt(time, W, H, Option.none(), interactions)

const MAX = callingScene.interact?.max ?? 0
const phone = buildPhone(1)
const { call, end } = phone
const pressOn =
  (point: Point) =>
  (time: number): Interaction => {
    const [x, y] = projection(W, H).px(point)
    return { time, aim: Option.some([x / W, y / H]) }
  }
const accept = pressOn(ACCEPT)
const decline = pressOn(DECLINE)
const pressOffButtons = pressOn([0, 0])
const found = (interactions: ReadonlyArray<Interaction>): boolean =>
  callingScene.run('phone', 1).foundEgg?.(interactions) ?? false
const acceptShowing = (frame: Marks): boolean => {
  const [x, y] = projection(W, H).px(ACCEPT)
  return Arr.some(
    frame.dots,
    dot => dot.ring === 0 && dot.radius > 10 && dot.color[3] > 0.5 && Math.hypot(dot.x - x, dot.y - y) < 4,
  )
}
const goldDots = (frame: Marks): number =>
  Arr.filter(frame.dots, ({ color: [r, g, b, a] }) => r === 1 && g < 0.85 && b < 0.5 && a > 0.3).length

describe('the phone hero', () => {
  const times = Arr.makeBy(Math.ceil((end + callingScene.interact!.settle) * 4) + 8, i => i / 4)

  it('plays once and rests', () => {
    assert.isTrue(callingScene.once)
  })

  it('has no caption, only a description for screen readers', () => {
    const [variant] = callingScene.variants
    assert.strictEqual(variant.caption, '')
    assert.isAbove(variant.description?.length ?? 0, 0)
  })

  it('plays the same run from the same seed', () => {
    assert.deepStrictEqual(frameAt(3, 9.3), frameAt(3, 9.3))
  })

  it('stays inside its canvas and its buffers, however often the reader presses', () => {
    const declines = Arr.makeBy(MAX, i => decline(call.ring + 0.5 + i * 2.5))
    const accepts = Arr.makeBy(MAX, i => Arr.get([accept, pressOffButtons], i % 2).pipe(Option.getOrElse(() => accept))(call.ring + 0.5 + i * 3))
    for (const interactions of [[], declines, accepts]) {
      for (const time of times) {
        const frame = frameAt(1, time, interactions)
        assert.isAtMost(frame.lines.length, callingScene.maxLines)
        assert.isAtMost(frame.dots.length, callingScene.maxDots)
        for (const dot of frame.dots) {
          assert.isTrue(dot.x >= 0 && dot.x <= W && dot.y >= 0 && dot.y <= H, `dot at ${dot.x},${dot.y}`)
        }
      }
    }
  })

  it('ignores a press before the call comes', () => {
    assert.deepStrictEqual(frameAt(1, call.ring + 1, [accept(2)]), frameAt(1, call.ring + 1))
  })

  it('rings until the reader answers', () => {
    assert.isFalse(acceptShowing(frameAt(1, call.ring - 0.5)))
    assert.isTrue(acceptShowing(frameAt(1, call.ring + 1)))
    assert.isFalse(acceptShowing(frameAt(1, call.ring + 1, [accept(call.ring + 0.2)])))
  })

  it('ignores a press off the buttons while it rings', () => {
    assert.deepStrictEqual(frameAt(1, call.ring + 1, [pressOffButtons(call.ring + 0.2)]), frameAt(1, call.ring + 1))
  })

  it('answers on its own if the reader leaves it ringing', () => {
    assert.isTrue(acceptShowing(frameAt(1, call.ends - 0.1)))
    assert.isFalse(acceptShowing(frameAt(1, call.ends + 1)))
  })

  it('drops a declined call, and the same caller rings right back', () => {
    const declined = [decline(call.ring + 0.2)]
    assert.isFalse(acceptShowing(frameAt(1, call.ring + 0.8, declined)))
    assert.isTrue(acceptShowing(frameAt(1, call.ring + 2.5, declined)))
    const reds = (frame: Marks) =>
      Arr.filter(frame.dots, ({ color: [r, g, b, a] }) => r > 0.9 && g < 0.6 && b < 0.6 && a > 0.1).length
    assert.isAbove(reds(frameAt(1, call.ring + 0.5, declined)), reds(frameAt(1, call.ring + 0.5)))
  })

  it('finds the egg on the third decline, not before', () => {
    const declines = Arr.makeBy(DECLINES_TO_FIND_EGG, i => decline(call.ring + 0.2 + i * 2.4))
    assert.isTrue(found(declines))
    assert.isFalse(found(Arr.take(declines, DECLINES_TO_FIND_EGG - 1)))
    assert.isFalse(found(Arr.makeBy(DECLINES_TO_FIND_EGG, i => accept(call.ring + 0.2 + i * 2.4))))
    assert.isFalse(found(Arr.makeBy(DECLINES_TO_FIND_EGG, i => decline(1 + i))))
  })

  it('brings the next call with a press once the first is over', () => {
    assert.isFalse(acceptShowing(frameAt(1, end + 2.5)))
    assert.isTrue(acceptShowing(frameAt(1, end + 2.5, [pressOffButtons(end)])))
  })

  it('rests once the answer has rung out', () => {
    const rings = (frame: Marks) => Arr.filter(frame.dots, dot => dot.ring > 0 && dot.color[3] > 0 && dot.radius > 8)
    assert.deepStrictEqual(rings(frameAt(1, end)), [])
  })

  it('ends with every contact lit: more gold than while they come in', () => {
    assert.isAbove(goldDots(frameAt(1, end)), goldDots(frameAt(1, 3.5)))
  })
})

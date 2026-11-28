import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import type { Interaction, Point, Shapes } from '../../animation/scene.ts'
import { callingScene } from './scene.ts'
import { buildSwitchboard, jackAt } from './switchboard.ts'
import { projection } from './world.ts'

const W = 640
const H = 360
const shapes = (
  seed: number,
  time: number,
  interactions: ReadonlyArray<Interaction> = [],
  held: Option.Option<Point> = Option.none(),
): Shapes => callingScene.run('switchboard', seed).shapesAt(time, W, H, Option.none(), interactions, held)

// Where a point in the world sits on the canvas, as an aim and in px.
const pxOf = (point: Point): Point => projection(W, H).px(point)
const aimOf = (point: Point): Point => {
  const [x, y] = pxOf(point)
  return [x / W, y / H]
}

const count = (frame: Shapes) => frame.lines.length + frame.dots.length
const MAX = callingScene.interact?.max ?? 0
const board = buildSwitchboard(1)
const first = board.cords[0]!
const yank = (time: number): Interaction => ({ time, aim: Option.some(aimOf(jackAt(first.jack))), to: [0.5, 0.95] })

describe('the switchboard hero', () => {
  const end = callingScene.run('switchboard', 1).end
  const times = Arr.makeBy(Math.ceil(end * 4) + 8, i => i / 4)

  it('plays once and rests', () => {
    assert.isTrue(callingScene.once)
  })

  it('plays the same run from the same seed', () => {
    assert.deepStrictEqual(shapes(3, 9.3), shapes(3, 9.3))
  })

  it('stays inside its canvas and its buffers, even with every press', () => {
    const clicks = Arr.makeBy(MAX, (i): Interaction => ({ time: 2 + i, aim: Option.some([0.1 + i * 0.07, 0.3]) }))
    const together = Arr.makeBy(MAX, (): Interaction => ({ time: 6, aim: Option.none() }))
    const yanks = Arr.makeBy(MAX, (i): Interaction => ({
      time: 4 + i * 0.9,
      aim: Option.some(aimOf(jackAt(board.cords[i % board.cords.length]!.jack))),
      to: [0.9, 0.9],
    }))
    for (const interactions of [[], clicks, together, yanks]) {
      for (const time of times) {
        const frame = shapes(1, time, interactions)
        assert.isAtMost(frame.lines.length, callingScene.maxLines)
        assert.isAtMost(frame.dots.length, callingScene.maxDots)
        for (const dot of frame.dots) {
          assert.isTrue(dot.x >= 0 && dot.x <= W && dot.y >= 0 && dot.y <= H, `dot at ${dot.x},${dot.y}`)
        }
      }
    }
  })

  it('puts a cord up where the reader clicks, only once they have', () => {
    const press: ReadonlyArray<Interaction> = [{ time: 5, aim: Option.some([0.5, 0.4]) }]
    assert.deepStrictEqual(shapes(1, 4.9, press), shapes(1, 4.9))
    assert.isAbove(count(shapes(1, 5.5, press)), count(shapes(1, 5.5)))
  })

  it('lets the reader yank a cord out by its jack', () => {
    assert.deepStrictEqual(shapes(1, 5.9, [yank(6)]), shapes(1, 5.9))
    assert.isBelow(shapes(1, 7.5, [yank(6)]).lines.length, shapes(1, 7.5).lines.length)
  })

  it('does nothing for a drag that misses every jack', () => {
    const miss: Interaction = { time: 6, aim: Option.some([0.5, 0.97]), to: [0.1, 0.97] }
    assert.deepStrictEqual(shapes(1, 7.5, [miss]), shapes(1, 7.5))
  })

  it('picks a cord up by its jack while the reader holds it', () => {
    const held = Option.some(pxOf(jackAt(first.jack)))
    assert.isAbove(shapes(1, 6, [], held).dots.length, shapes(1, 6).dots.length)
    assert.deepStrictEqual(shapes(1, 6, [], Option.some<Point>([4, 4])), shapes(1, 6))
  })

  it('ends with the call answered: more gold on screen than before it', () => {
    const gold = (frame: Shapes) => Arr.filter(frame.dots, dot => dot.glow > 0 && dot.color[3] > 0.5).length
    assert.isAbove(gold(shapes(1, end)), gold(shapes(1, 2)))
  })
})

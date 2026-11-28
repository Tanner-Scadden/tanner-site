import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import type { Interaction, Point, Shapes } from '../../animation/scene.ts'
import { callingScene } from './scene.ts'
import { buildSwitchboard, jackAt, lampOf } from './switchboard.ts'
import { projection } from './world.ts'

const W = 640
const H = 360
const shapes = (
  seed: number,
  time: number,
  interactions: ReadonlyArray<Interaction> = [],
  held: Option.Option<Point> = Option.none(),
  pointer: Option.Option<Point> = Option.none(),
): Shapes => callingScene.run('switchboard', seed).shapesAt(time, W, H, pointer, interactions, held)

// Where a point in the world sits on the canvas, as an aim and in px.
const pxOf = (point: Point): Point => projection(W, H).px(point)
const aimOf = (point: Point): Point => {
  const [x, y] = pxOf(point)
  return [x / W, y / H]
}

const MAX = callingScene.interact?.max ?? 0
const board = buildSwitchboard(1)
const first = board.cords[0]!
const drag = (time: number, from: Point, to: Point): Interaction => ({
  time,
  aim: Option.some(aimOf(from)),
  to: aimOf(to),
})
// Every cord is up by 10.5 and the call's isn't due until 12.6, so between
// them the only cord ends on show are the reader's.
// Pull the first cord out and let it go mid-air, where it falls.
const pull = (time: number) => drag(time, jackAt(first.jack), [0.2, 0.1])
// A jack nobody's cord goes to.
const free = Arr.findFirst(
  Arr.makeBy(36, i => i),
  jack => !Arr.some(board.cords, cord => cord.jack === jack),
)
const spare = Option.getOrThrow(free)

// How lit a jack's lamp is, by the glow of its dot.
const lampGlow = (frame: Shapes, jack: number): number => {
  const [x, y] = pxOf(lampOf(jackAt(jack)))
  return Option.match(
    Arr.findFirst(frame.dots, dot => Math.abs(dot.x - x) < 0.01 && Math.abs(dot.y - y) < 0.01),
    { onNone: () => 0, onSome: dot => dot.glow },
  )
}
// The cord ends on show, away from any jack.
const loose = (frame: Shapes): ReadonlyArray<Point> =>
  Arr.map(
    Arr.filter(frame.dots, dot => dot.radius === 3 && dot.glow === 10),
    (dot): Point => [dot.x, dot.y],
  )

describe('the switchboard hero', () => {
  const end = callingScene.run('switchboard', 1).end
  const times = Arr.makeBy(Math.ceil(end * 4) + 8, i => i / 4)

  it('plays once and rests', () => {
    assert.isTrue(callingScene.once)
  })

  it('plays the same run from the same seed', () => {
    assert.deepStrictEqual(shapes(3, 9.3), shapes(3, 9.3))
  })

  it('stays inside its canvas and its buffers, whatever the reader does', () => {
    const pulls = Arr.makeBy(MAX, (i): Interaction =>
      drag(4 + i * 0.9, jackAt(board.cords[i % board.cords.length]!.jack), i % 2 === 0 ? [3, 3] : jackAt(spare)),
    )
    for (const interactions of [[], pulls]) {
      for (const time of times) {
        const frame = shapes(1, time, interactions, Option.some(pxOf(jackAt(first.jack))), Option.some([-50, 900]))
        assert.isAtMost(frame.lines.length, callingScene.maxLines)
        assert.isAtMost(frame.dots.length, callingScene.maxDots)
        for (const dot of frame.dots) {
          assert.isTrue(dot.x >= 0 && dot.x <= W && dot.y >= 0 && dot.y <= H, `dot at ${dot.x},${dot.y}`)
        }
      }
    }
  })

  it('ignores a tap: only a drag moves a cord', () => {
    const tap: Interaction = { time: 6, aim: Option.some(aimOf(jackAt(first.jack))) }
    assert.deepStrictEqual(shapes(1, 7.5, [tap]), shapes(1, 7.5))
  })

  it('drops a pulled cord to the floor, and its lamp goes dark', () => {
    assert.deepStrictEqual(shapes(1, 10.4, [pull(10.5)]), shapes(1, 10.4))
    assert.isAbove(lampGlow(shapes(1, 10.4, [pull(10.5)]), first.jack), 0)
    const after = shapes(1, 11.6, [pull(10.5)])
    assert.strictEqual(lampGlow(after, first.jack), 0)
    const ends = loose(after)
    assert.strictEqual(ends.length, 1)
    assert.isAbove(ends[0]![1], pxOf([0, 0.7])[1])
  })

  it('plugs a cord in wherever it is let go over a free jack', () => {
    const moved = shapes(1, 11.6, [drag(10.5, jackAt(first.jack), jackAt(spare))])
    assert.strictEqual(lampGlow(moved, first.jack), 0)
    assert.isAbove(lampGlow(moved, spare), 0)
    assert.strictEqual(loose(moved).length, 0)
  })

  it('lets the reader pick a cord up off the floor and plug it back in', () => {
    const lying = loose(shapes(1, 11.6, [pull(10.5)]))[0]!
    const back = shapes(1, 12.4, [
      pull(10.5),
      { time: 11.6, aim: Option.some([lying[0] / W, lying[1] / H]), to: aimOf(jackAt(spare)) },
    ])
    assert.isAbove(lampGlow(back, spare), 0)
    assert.strictEqual(loose(back).length, 0)
  })

  it('does nothing for a drag that starts away from every cord', () => {
    const miss = drag(6, [0, -0.85], [0.5, 0.5])
    assert.deepStrictEqual(shapes(1, 7.5, [miss]), shapes(1, 7.5))
  })

  it('carries a held cord with the pointer, and its lamp turns red', () => {
    const held = Option.some(pxOf(jackAt(first.jack)))
    const pointer = Option.some<Point>([W / 2, H * 0.9])
    const holding = shapes(1, 11, [], held, pointer)
    assert.deepStrictEqual(loose(holding), [[W / 2, H * 0.9]])
    assert.isAbove(lampGlow(holding, first.jack), 0)
    assert.deepStrictEqual(
      shapes(1, 11, [], Option.some<Point>([4, 4]), pointer),
      shapes(1, 11, [], Option.none(), pointer),
    )
  })

  it('rests once the answer has finished ringing out', () => {
    const rings = (frame: Shapes) => Arr.filter(frame.dots, dot => dot.ring > 0 && dot.color[3] > 0 && dot.radius > 6)
    assert.deepStrictEqual(rings(shapes(1, end)), [])
  })

  it('ends with the call answered: more gold on screen than before it', () => {
    const gold = (frame: Shapes) => Arr.filter(frame.dots, dot => dot.glow > 0 && dot.color[3] > 0.5).length
    assert.isAbove(gold(shapes(1, end)), gold(shapes(1, 2)))
  })
})

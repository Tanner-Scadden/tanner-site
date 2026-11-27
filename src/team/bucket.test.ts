import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import {
  BOUNDS,
  FLARE,
  MAX_FLARES,
  buildTimeline,
  dropsOf,
  fillAt,
  flaresOf,
  frameAt,
  peakAt,
  withFlares,
} from './bucket.ts'
import { MAX_DOTS, MAX_LINES, shapesOf } from './shapes.ts'

const SEEDS = Arr.range(1, 12)
const moments = (from: number, to: number) => Arr.map(Arr.range(0, Math.round((to - from) / 0.1)), k => from + k * 0.1)

// Every point a frame draws, in world units, should stay in the box.
const pointsOf = (frame: ReturnType<typeof frameAt>) => [
  ...Arr.map(frame.people, p => [p.x, p.y] as const),
  ...Arr.flatMap(frame.drops, d => [[d.x, d.y] as const, d.tail]),
  ...Arr.map(frame.beads, b => [b.x, b.y] as const),
  ...Arr.flatMap(frame.puddles, p => [[p.from, 0] as const, [p.to, 0] as const]),
]

describe('team bucket', () => {
  it('replays the same run from the same seed', () => {
    const a = buildTimeline(7)
    const b = buildTimeline(7)
    assert.deepStrictEqual(a, b)
    assert.deepStrictEqual(frameAt(a, 9), frameAt(b, 9))
    assert.notDeepEqual(a.events, buildTimeline(8).events)
  })

  it('runs about 12 to 14 seconds', () => {
    for (const seed of SEEDS) {
      const { end } = buildTimeline(seed)
      assert.isAtLeast(end, 12, `seed ${seed}`)
      assert.isAtMost(end, 14.5, `seed ${seed}`)
    }
  })

  it('stays inside its bounds and its buffer sizes', () => {
    for (const seed of SEEDS) {
      const timeline = withFlares(buildTimeline(seed), [3, 4.2, 6, 10.5, 12, 13])
      for (const t of moments(0, timeline.end + 1)) {
        const frame = frameAt(timeline, t)
        for (const [x, y] of pointsOf(frame)) {
          assert.isAtMost(Math.abs(x), BOUNDS.x, `seed ${seed} at ${t}`)
          assert.isAtMost(Math.abs(y), BOUNDS.y, `seed ${seed} at ${t}`)
        }
        const shapes = shapesOf(frame, 800, 450, Option.some([400, 60]))
        assert.isAtMost(shapes.lines.length, MAX_LINES, `seed ${seed} at ${t}`)
        assert.isAtMost(shapes.dots.length, MAX_DOTS, `seed ${seed} at ${t}`)
        for (const dot of shapes.dots) {
          assert.isTrue(dot.x >= 0 && dot.x <= 800 && dot.y >= 0 && dot.y <= 450, `seed ${seed} at ${t}`)
          for (const c of dot.color) assert.isTrue(c >= 0 && c <= 1, `seed ${seed} at ${t}`)
        }
        for (const line of shapes.lines) {
          for (const c of line.color) assert.isTrue(c >= 0 && c <= 1, `seed ${seed} at ${t}`)
        }
      }
    }
  })

  it('only rises before the flare, a drop at a time', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const fill = Arr.map(moments(0, FLARE), t => fillAt(timeline, t))
      const steps = Arr.map(Arr.zip(fill, Arr.drop(fill, 1)), ([a, b]) => b - a)
      assert.isTrue(Arr.every(steps, step => step >= -1e-9), `seed ${seed}`)
      // Never more than one course in a tenth of a second.
      assert.isAtMost(Math.max(...steps), 1 + 1e-9, `seed ${seed}`)
      // And it gets most of the way up.
      assert.isAtLeast(fillAt(timeline, FLARE), 12, `seed ${seed}`)
    }
  })

  it('empties within about a second of the flare', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      assert.isAbove(fillAt(timeline, FLARE + 0.1), 12, `seed ${seed}`)
      assert.isBelow(fillAt(timeline, FLARE + 0.7), 0.05, `seed ${seed}`)
      // It goes over while it spills, and stands again before the run ends.
      assert.isAbove(frameAt(timeline, FLARE + 0.6).angle, 1.4, `seed ${seed}`)
      assert.strictEqual(frameAt(timeline, timeline.end).angle, 0, `seed ${seed}`)
    }
  })

  it('ends well below its peak', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const peak = peakAt(timeline, timeline.end)
      const end = fillAt(timeline, timeline.end)
      assert.isAbove(end, 1.5, `seed ${seed}`)
      assert.isBelow(end, peak * 0.3, `seed ${seed}`)
      // The drops after the flare are few and far between, and none from
      // whoever flared.
      const after = Arr.filter(dropsOf(timeline), drop => drop.start > FLARE)
      assert.isAtMost(after.length, 4, `seed ${seed}`)
      assert.isTrue(
        Arr.every(after, drop => drop.from !== timeline.flarer),
        `seed ${seed}`,
      )
    }
  })

  it('has the whole story in its last frame', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const frame = frameAt(timeline, timeline.end)
      // A little in the bucket, and a mark of what it held.
      assert.isAtLeast(frame.courses.length, 2, `seed ${seed}`)
      assert.isAbove(frame.peak - frame.fill, 8, `seed ${seed}`)
      // The spill on the floor.
      assert.isAtLeast(frame.beads.length, 10, `seed ${seed}`)
      assert.isTrue(Arr.every(frame.beads, bead => !bead.flying), `seed ${seed}`)
      assert.isAbove(Math.abs(frame.puddles[0]!.to - frame.puddles[0]!.from), 0.3, `seed ${seed}`)
      // Whoever flared, still marked, and a drop on its way down.
      assert.isAbove(frame.people[timeline.flarer]!.heat, 0.5, `seed ${seed}`)
      assert.isAtLeast(frame.drops.length, 1, `seed ${seed}`)
      const shapes = shapesOf(frame, 800, 450)
      assert.isAbove(shapes.lines.length, 30, `seed ${seed}`)
    }
  })

  it('takes extra flares at any time', () => {
    const timeline = buildTimeline(3)
    const shaken = withFlares(timeline, [5])
    assert.strictEqual(flaresOf(shaken).length, 2)
    // A bad moment tips out some, not all, and it builds again after.
    const lost = fillAt(timeline, 5.8) - fillAt(shaken, 5.8)
    assert.approximately(lost, fillAt(timeline, 5) * 0.5, 1)
    assert.isBelow(fillAt(shaken, FLARE), fillAt(timeline, FLARE))
    // And never more than the run can draw.
    assert.strictEqual(flaresOf(withFlares(timeline, Arr.range(1, 20))).length, MAX_FLARES)
  })
})

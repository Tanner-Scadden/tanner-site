import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import {
  BOUNDS,
  FLARE,
  KICK_SETTLE,
  KICK_SHARE,
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

  it('runs about 14 to 16 seconds', () => {
    for (const seed of SEEDS) {
      const { end } = buildTimeline(seed)
      assert.isAtLeast(end, 14, `seed ${seed}`)
      assert.isAtMost(end, 16, `seed ${seed}`)
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
        for (const [w, h] of [
          [800, 450],
          [314, 177],
        ] as const) {
          const shapes = shapesOf(frame, w, h, Option.some([w / 2, h * 0.15]))
          assert.isAtMost(shapes.lines.length, MAX_LINES, `seed ${seed} at ${t}`)
          assert.isAtMost(shapes.dots.length, MAX_DOTS, `seed ${seed} at ${t}`)
          for (const dot of shapes.dots) {
            assert.isTrue(dot.x >= 0 && dot.x <= w && dot.y >= 0 && dot.y <= h, `seed ${seed} at ${t}`)
            for (const c of dot.color) assert.isTrue(c >= 0 && c <= 1, `seed ${seed} at ${t}`)
          }
          for (const line of shapes.lines) {
            for (const c of line.color) assert.isTrue(c >= 0 && c <= 1, `seed ${seed} at ${t}`)
            for (const v of [...line.from, ...line.to]) assert.isTrue(Number.isFinite(v), `seed ${seed} at ${t}`)
          }
        }
      }
    }
  }, 60_000)

  it('only rises before the kick, a drop at a time', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const fill = Arr.map(moments(0, FLARE), t => fillAt(timeline, t))
      const steps = Arr.map(Arr.zip(fill, Arr.drop(fill, 1)), ([a, b]) => b - a)
      assert.isTrue(Arr.every(steps, step => step >= -1e-9), `seed ${seed}`)
      // Never more than one drop's water in a tenth of a second.
      assert.isAtMost(Math.max(...steps), 1 + 1e-9, `seed ${seed}`)
      assert.isAtLeast(fillAt(timeline, FLARE), 12, `seed ${seed}`)
    }
  })

  it('spills about half at the kick, and rocks back upright', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const before = fillAt(timeline, FLARE)
      const after = fillAt(timeline, FLARE + 1)
      const lost = 1 - after / before
      assert.isAtLeast(lost, 0.4, `seed ${seed}`)
      assert.isAtMost(lost, 0.6, `seed ${seed}`)
      // Most of it's gone within about half a second.
      assert.isBelow(fillAt(timeline, FLARE + 0.6), before * (1 - KICK_SHARE * 0.9), `seed ${seed}`)
      // It lurches, then stands again well before the end.
      assert.isAbove(frameAt(timeline, FLARE + 0.25).angle, 0.3, `seed ${seed}`)
      assert.strictEqual(frameAt(timeline, FLARE + 2.5).angle, 0, `seed ${seed}`)
    }
  })

  it('ends upright, well under its peak, and not empty', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const peak = peakAt(timeline, timeline.end)
      const end = fillAt(timeline, timeline.end)
      assert.isAbove(end, peak * 0.35, `seed ${seed}`)
      assert.isBelow(end, peak * 0.7, `seed ${seed}`)
      assert.strictEqual(frameAt(timeline, timeline.end).angle, 0, `seed ${seed}`)
      // The drops after the kick are few and far between, and none from
      // whoever kicked.
      const after = Arr.filter(dropsOf(timeline), drop => drop.start > FLARE)
      assert.isAtMost(after.length, 3, `seed ${seed}`)
      assert.isTrue(
        Arr.every(after, drop => drop.from !== timeline.flarer),
        `seed ${seed}`,
      )
    }
  })

  it('comes to rest before the end', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const last = Math.max(...Arr.map(dropsOf(timeline), drop => drop.lands))
      // The last drop lands a good while before the end.
      assert.isAtLeast(timeline.end - last, 1.5, `seed ${seed}`)
      assert.isAtMost(timeline.end - last, 2.5, `seed ${seed}`)
      // And for its last moments, nothing moves.
      const drawn = (t: number) => {
        const { lines, dots } = shapesOf(frameAt(timeline, t), 800, 450)
        return [
          ...Arr.flatMap(lines, l => [...l.from, ...l.to, l.width, ...l.color]),
          ...Arr.flatMap(dots, d => [d.x, d.y, d.radius, d.glow, d.ring, ...d.color]),
        ]
      }
      const still = drawn(timeline.end)
      for (const t of [timeline.end - 0.35, timeline.end - 0.15]) {
        const now = drawn(t)
        assert.strictEqual(now.length, still.length, `seed ${seed} at ${t}`)
        assert.isTrue(
          Arr.every(now, (v, i) => v === still[i]),
          `seed ${seed} at ${t}`,
        )
      }
    }
  })

  it('has the whole story in its last frame', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const frame = frameAt(timeline, timeline.end)
      // Some water, still, and a mark of what it held.
      assert.isAbove(frame.water.amount, 4, `seed ${seed}`)
      assert.strictEqual(frame.water.ripples.length, 0, `seed ${seed}`)
      assert.isBelow(Math.abs(frame.water.slope), 1e-6, `seed ${seed}`)
      assert.isAbove(frame.peak - frame.fill, 4, `seed ${seed}`)
      // The spill on the floor, and nothing in the air.
      assert.isAtLeast(frame.beads.length, 10, `seed ${seed}`)
      assert.isTrue(Arr.every(frame.beads, bead => !bead.flying), `seed ${seed}`)
      assert.isAbove(Math.abs(frame.puddles[0]!.to - frame.puddles[0]!.from), 0.3, `seed ${seed}`)
      assert.strictEqual(frame.drops.length, 0, `seed ${seed}`)
      // Whoever kicked, still marked.
      assert.isAbove(frame.people[timeline.flarer]!.heat, 0.5, `seed ${seed}`)
    }
  })

  it('settles each kick within KICK_SETTLE', () => {
    for (const seed of [2, 5]) {
      const timeline = withFlares(buildTimeline(seed), [4])
      const settled = frameAt(timeline, 4 + KICK_SETTLE)
      assert.strictEqual(settled.angle, 0, `seed ${seed}`)
      // Only the drops still move the water, as they would with no kick.
      const unkicked = frameAt(buildTimeline(seed), 4 + KICK_SETTLE)
      assert.approximately(settled.water.slope, unkicked.water.slope, 1e-9, `seed ${seed}`)
      assert.isTrue(
        Arr.every(settled.beads, bead => !bead.flying),
        `seed ${seed}`,
      )
    }
  })

  it('takes extra kicks at any time', () => {
    const timeline = buildTimeline(3)
    const shaken = withFlares(timeline, [5])
    assert.strictEqual(flaresOf(shaken).length, 2)
    // A bad moment spills its share of what's there, and it builds again.
    const lost = fillAt(timeline, 6) - fillAt(shaken, 6)
    assert.approximately(lost, fillAt(timeline, 5) * 0.5, 1)
    assert.isBelow(fillAt(shaken, FLARE), fillAt(timeline, FLARE))
    assert.isAbove(frameAt(shaken, 5.25).angle, 0.2)
    const third = withFlares(timeline, [5], 0.3)
    assert.approximately(fillAt(timeline, 6) - fillAt(third, 6), fillAt(timeline, 5) * 0.3, 1)
    // And never more than the run can draw.
    assert.strictEqual(flaresOf(withFlares(timeline, Arr.range(1, 20))).length, MAX_FLARES)
  })
})

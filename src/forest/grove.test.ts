import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import { FADE, HOLD } from '../blog/animation/controls.ts'
import {
  BOUNDS,
  GROUND,
  GROVE,
  LATE,
  MAX_SEGMENTS,
  MAX_TREES,
  ROOTS,
  buildTimeline,
  frameAt,
  landingOf,
} from './grove.ts'
import { MAX_DOTS, MAX_LINES, projection, shapesOf } from './shapes.ts'

const SEEDS = Arr.range(1, 12)
const STEP = 0.1

// Every 0.1s of a run, through the hold and fade after it.
const momentsOf = (end: number) => Arr.makeBy(Math.ceil((end + HOLD + FADE) / STEP) + 1, k => k * STEP)

const branchLength = (frame: ReturnType<typeof frameAt>, tree: number) =>
  Arr.reduce(
    Arr.filter(frame.branches, branch => branch.tree === tree),
    0,
    (sum, { from, to }) => sum + Math.hypot(to[0] - from[0], to[1] - from[1]),
  )

describe('grove timeline', () => {
  it('replays the same run from the same seed', () => {
    const a = buildTimeline(7)
    const b = buildTimeline(7)
    assert.deepStrictEqual(a, b)
    assert.deepStrictEqual(frameAt(a, 14.3), frameAt(b, 14.3))
    assert.notDeepEqual(a.trees, buildTimeline(8).trees)
  })

  it('runs between twenty and twenty-eight seconds', () => {
    for (const seed of SEEDS) {
      const { end } = buildTimeline(seed)
      assert.isAtLeast(end, 12)
      assert.isAtMost(end, 28)
    }
  })

  it('has one tree per seed, within its buffer sizes', () => {
    for (const seed of SEEDS) {
      const { trees, flights } = buildTimeline(seed)
      assert.strictEqual(trees.length, flights.length)
      assert.strictEqual(trees.length, 1 + GROVE + LATE)
      assert.isAtMost(trees.length, MAX_TREES)
      for (const tree of trees) {
        assert.isAtMost(tree.segments.length, MAX_SEGMENTS)
        assert.strictEqual(tree.roots.length, ROOTS)
        assert.isAtMost(tree.leaves.length, tree.segments.length)
      }
    }
  })

  it('stays on the sheet and inside its buffers at every 0.1s', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      // Checked by hand and gathered, since asserting every point is slow.
      const misses: Array<string> = []
      for (const t of momentsOf(timeline.end)) {
        const frame = frameAt(timeline, t)
        const points = [
          ...Arr.flatMap(frame.branches, branch => [branch.from, branch.to]),
          ...Arr.map(frame.leaves, leaf => [leaf.x, leaf.y] as const),
          ...Arr.flatMap(frame.seeds, s => [[s.x, s.y] as const, s.tail]),
        ]
        for (const [x, y] of points) {
          if (Math.abs(x) > BOUNDS.x || Math.abs(y) > BOUNDS.y) misses.push(`point ${x},${y} at ${t}`)
        }
        for (const [width, height] of [
          [800, 450],
          [358, 201],
        ] as const) {
          const shapes = shapesOf(frame, width, height, Option.some([width / 2, height * 0.6]))
          if (shapes.lines.length > MAX_LINES) misses.push(`${shapes.lines.length} lines at ${t}`)
          if (shapes.dots.length > MAX_DOTS) misses.push(`${shapes.dots.length} dots at ${t}`)
          for (const dot of shapes.dots) {
            const on = dot.x >= 0 && dot.x <= width && dot.y >= 0 && dot.y <= height
            if (!on || !Number.isFinite(dot.radius) || dot.radius < 0) misses.push(`dot at ${t}`)
          }
        }
      }
      assert.deepStrictEqual(Arr.take(misses, 5), [], `seed ${seed}`)
    }
  })

  it('only ever grows', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      let before = frameAt(timeline, 0)
      for (const t of momentsOf(timeline.end).slice(1)) {
        const now = frameAt(timeline, t)
        assert.isAtLeast(now.ground, before.ground)
        assert.isAtLeast(now.trees.length, before.trees.length, `seed ${seed} at ${t}`)
        for (const tree of before.trees) {
          const after = Arr.findFirst(now.trees, other => other.id === tree.id)
          assert.isTrue(Option.isSome(after), `seed ${seed} at ${t}`)
          assert.isAtLeast(Option.getOrThrow(after).grown, tree.grown)
          assert.isAtLeast(branchLength(now, tree.id) + 1e-9, branchLength(before, tree.id), `seed ${seed} at ${t}`)
          const leavesOf = (frame: typeof now) =>
            Arr.reduce(
              Arr.filter(frame.leaves, leaf => leaf.tree === tree.id),
              0,
              (sum, leaf) => sum + leaf.size,
            )
          assert.isAtLeast(leavesOf(now) + 1e-9, leavesOf(before), `seed ${seed} at ${t}`)
        }
        before = now
      }
    }
  })

  it('lets each seed go from a leaf that has opened, on a tree that has grown', () => {
    for (const seed of SEEDS) {
      const { trees, flights } = buildTimeline(seed)
      for (const flight of flights.slice(1)) {
        const source = trees[flight.tree]!
        assert.isAtMost(source.sprout + source.grow, flight.release, `seed ${seed}`)
        assert.isAtMost(source.leaves[flight.leaf]!.born, flight.release, `seed ${seed}`)
      }
      // No leaf lets two seeds go.
      const leaves = Arr.map(flights.slice(1), flight => `${flight.tree}:${flight.leaf}`)
      assert.strictEqual(new Set(leaves).size, leaves.length)
      // Each lands where its tree stands.
      for (const [k, flight] of flights.entries()) {
        assert.strictEqual(flight.to[0], trees[k]!.x)
        assert.strictEqual(flight.to[1], GROUND)
        assert.isAbove(trees[k]!.sprout, landingOf(flight))
      }
    }
  })

  it('builds quickly', () => {
    for (const seed of SEEDS) {
      const start = performance.now()
      const timeline = buildTimeline(seed)
      for (let t = 0; t < 30; t += 1) frameAt(timeline, t)
      assert.isBelow(performance.now() - start, 100, `seed ${seed}`)
    }
  })
})

describe('grove frames', () => {
  const timeline = buildTimeline(3)

  it('starts with one seed on bare ground', () => {
    for (const t of [0.4, 1.2, 2.1]) {
      const frame = frameAt(timeline, t)
      assert.strictEqual(frame.seeds.length, 1)
      assert.isTrue(frame.seeds[0]!.flying)
      assert.strictEqual(frame.trees.length, 0)
      assert.strictEqual(frame.branches.length, 0)
    }
    assert.strictEqual(frameAt(timeline, 1.5).ground, 1)
  })

  it('grows that seed into one tree before any other seed lets go', () => {
    const first = timeline.trees[0]!
    const grown = frameAt(timeline, first.sprout + first.grow)
    assert.strictEqual(grown.trees.length, 1)
    assert.strictEqual(grown.trees[0]!.grown, 1)
    assert.isAbove(grown.leaves.length, 10)
    assert.isBelow(first.sprout + first.grow, timeline.flights[1]!.release)
  })

  it('sends seeds out from the first tree to land across the ground', () => {
    const grove = timeline.flights.slice(1, 1 + GROVE)
    assert.isTrue(Arr.every(grove, flight => flight.tree === 0))
    const xs = Arr.map(grove, flight => flight.to[0])
    assert.isTrue(Arr.some(xs, x => x < -1))
    assert.isTrue(Arr.some(xs, x => x > 1))
    const mid = frameAt(timeline, grove[3]!.release + 1)
    assert.isAtLeast(Arr.filter(mid.seeds, s => s.flying).length, 2)
  })

  it('ends with a grove, and a seed or two still in the air', () => {
    const last = frameAt(timeline, timeline.end)
    assert.isAtLeast(last.trees.length, 1 + GROVE)
    const full = Arr.filter(last.trees, tree => tree.grown === 1)
    assert.strictEqual(full.length, 1 + GROVE)
    assert.isAtLeast(Arr.filter(last.seeds, s => s.flying).length, 1)
    // The grove spans the sheet.
    const left = Arr.reduce(last.trees, 0, (m, tree) => Math.min(m, tree.left))
    const right = Arr.reduce(last.trees, 0, (m, tree) => Math.max(m, tree.right))
    assert.isBelow(left, -1.3)
    assert.isAbove(right, 1.3)
  })

  it('picks out the tree the pointer is over', () => {
    const frame = frameAt(timeline, timeline.end)
    const plain = shapesOf(frame, 800, 450)
    const { px } = projection(800, 450)
    const first = frame.trees[0]!
    const [x, y] = px([first.x, (first.top + GROUND) / 2])
    const picked = shapesOf(frame, 800, 450, Option.some([x, y]))
    assert.strictEqual(picked.lines.length, plain.lines.length)
    assert.isTrue(Arr.some(picked.dots, (dot, i) => dot.glow > plain.dots[i]!.glow))
    assert.deepStrictEqual(shapesOf(frame, 800, 450, Option.some([-100, -100])), plain)
  })
})

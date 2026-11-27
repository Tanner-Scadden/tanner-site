import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import { FADE, HOLD } from '../../animation/controls.ts'
import {
  BOUNDS,
  GROUND,
  GROVE,
  LATE,
  MAX_PLANTS,
  MAX_SEGMENTS,
  MAX_TREES,
  PLANT_SETTLE,
  buildTimeline,
  frameAt,
  landingOf,
  plantedIn,
} from './grove.ts'
import { ROOT_PIECES } from './roots.ts'
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
        assert.isAtMost(tree.roots.pieces.length, ROOT_PIECES)
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

  it('grows roots the whole way, and knots neighbours together underground', () => {
    const rootLength = (time: number) =>
      Arr.reduce(
        Arr.filter(frameAt(timeline, time).branches, branch => branch.root),
        0,
        (sum, branch) => sum + Math.hypot(branch.to[0] - branch.from[0], branch.to[1] - branch.from[1]),
      )
    let last = 0
    for (let t = 0; t <= timeline.end; t += 0.1) {
      const length = rootLength(t)
      assert.isAtLeast(length, last - 1e-9, `at ${t}`)
      last = length
    }
    // Roots are still lengthening after the first tree's crown is done.
    const first = timeline.trees[0]!
    assert.isAbove(rootLength(first.sprout + first.grow + 3), rootLength(first.sprout + first.grow))
    const end = frameAt(timeline, timeline.end).branches
    assert.isTrue(Arr.some(end, branch => branch.root && branch.bond > 0.5))
    assert.isTrue(Arr.every(end, branch => branch.bond === 0 || branch.root))
  })

  it('grows each tree a deep, wide root system, every one different', () => {
    for (const seed of SEEDS) {
      const { trees, end } = buildTimeline(seed)
      const frame = frameAt({ ...buildTimeline(seed), end }, end)
      for (const [id, tree] of trees.entries()) {
        // Only its own roots: reaching roots are drawn at a fixed depth.
        const own = Arr.filter(frame.branches, b => b.root && b.tree === id && b.bond === 0)
        if (own.length === 0) continue
        const tips = Arr.map(own, b => b.to)
        const depth = Arr.reduce(tips, 0, (m, [, y]) => Math.max(m, y - GROUND))
        const span = Arr.reduce(tips, 0, (m, [x]) => Math.max(m, x)) - Arr.reduce(tips, 0, (m, [x]) => Math.min(m, x))
        const mature = end - tree.sprout > 8
        if (mature) {
          // The deepest root goes down at least about as far as the tree's
          // crown is wide in its trunk, and the laterals spread wider.
          assert.isAbove(depth, 0.32 * tree.scale, `seed ${seed} tree ${id} depth`)
          assert.isAbove(span, 0.7 * tree.scale, `seed ${seed} tree ${id} span`)
        }
        // Their tips point all across the downward fan, not a few ways.
        const angles = Arr.map(tree.roots.pieces, p => Math.atan2(p.to[1] - GROUND, p.to[0] - tree.x))
        const spread = Math.max(...angles) - Math.min(...angles)
        assert.isAbove(spread, 1.6, `seed ${seed} tree ${id} spread`)
        // And they fork, more than once over.
        assert.isTrue(Arr.some(tree.roots.pieces, p => p.order >= 2), `seed ${seed} tree ${id} forks`)
      }
      // No two trees' roots are the same shape.
      const shapes = Arr.map(trees, tree =>
        Arr.join(
          Arr.map(tree.roots.pieces, p => `${(p.to[0] - tree.x).toFixed(4)},${p.to[1].toFixed(4)}`),
          ';',
        ),
      )
      assert.strictEqual(new Set(shapes).size, shapes.length, `seed ${seed}`)
    }
  })

  it('knots every grown tree of the grove to a neighbour in gold', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const end = frameAt(timeline, timeline.end).branches
      const bonded = new Set(Arr.map(Arr.filter(end, b => b.root && b.bond > 0.5), b => b.tree))
      // The first tree and the grove all stand long enough to have met.
      for (const id of Arr.range(0, GROVE)) assert.isTrue(bonded.has(id), `seed ${seed} tree ${id}`)
      // The tie strengthens the longer it holds.
      const strongest = (t: number) =>
        Arr.reduce(frameAt(timeline, t).branches, 0, (m, b) => Math.max(m, b.root ? b.bond : 0))
      assert.isAbove(strongest(timeline.end), strongest(timeline.end - 4))
    }
  })
})

describe('grove plantings', () => {
  const timeline = buildTimeline(3)
  const press = (time: number, aim: Option.Option<number> = Option.none()) => ({ time, aim })

  it('plants a seed that grows into another tree', () => {
    const planted = plantedIn(timeline, [press(5)])
    assert.strictEqual(planted.trees.length, timeline.trees.length + 1)
    assert.strictEqual(planted.flights.length, planted.trees.length)
    const tree = planted.trees[planted.trees.length - 1]!
    const flight = planted.flights[planted.flights.length - 1]!
    assert.strictEqual(flight.release, 5)
    assert.strictEqual(flight.to[0], tree.x)
    assert.isAbove(tree.sprout, landingOf(flight))
    // It's grown by the time it's meant to have played out.
    const id = planted.trees.length - 1
    const grown = frameAt(planted, 5 + PLANT_SETTLE)
    assert.strictEqual(Option.getOrThrow(Arr.findFirst(grown.trees, t => t.id === id)).grown, 1)
    // And it joins the grove underground: some of its roots knot.
    const later = frameAt(planted, 5 + PLANT_SETTLE + 6)
    assert.isTrue(Arr.some(later.branches, branch => branch.tree === id && branch.root && branch.bond > 0))
  })

  it('shows nothing of it before it was planted', () => {
    const planted = plantedIn(timeline, [press(8)])
    for (const t of [0.5, 4, 7.99]) assert.deepStrictEqual(frameAt(planted, t), frameAt(timeline, t))
  })

  it('plants where the reader aimed, else in the widest gap', () => {
    const aimed = plantedIn(timeline, [press(5, Option.some(-0.9))])
    assert.closeTo(aimed.trees[aimed.trees.length - 1]!.x, -0.9, 1e-9)
    // Early on, only the first tree stands, so the gap is off to one side.
    const early = plantedIn(timeline, [press(1)])
    assert.isAbove(Math.abs(early.trees[early.trees.length - 1]!.x - timeline.trees[0]!.x), 0.6)
    // Two unaimed seeds don't land on top of each other.
    const two = plantedIn(timeline, [press(1), press(1.5)])
    const [a, b] = Arr.takeRight(two.trees, 2)
    assert.isAbove(Math.abs(a!.x - b!.x), 0.5)
  })

  it('replays the same plantings the same way', () => {
    const presses = [press(2), press(6, Option.some(0.4)), press(12)]
    assert.deepStrictEqual(plantedIn(timeline, presses), plantedIn(buildTimeline(3), presses))
  })

  it('only ever grows, and stays on the sheet and in its buffers, with every seed it takes', () => {
    for (const seed of Arr.take(SEEDS, 4)) {
      const planted = plantedIn(
        buildTimeline(seed),
        Arr.makeBy(MAX_PLANTS, k => press(1 + k * 2.3)),
      )
      assert.isAtMost(planted.trees.length, MAX_TREES)
      const misses: Array<string> = []
      let before = frameAt(planted, 0)
      for (const t of momentsOf(planted.end).slice(1)) {
        const now = frameAt(planted, t)
        for (const tree of before.trees) {
          const after = Arr.findFirst(now.trees, other => other.id === tree.id)
          if (Option.isNone(after) || after.value.grown < tree.grown) misses.push(`tree ${tree.id} at ${t}`)
          if (branchLength(now, tree.id) + 1e-9 < branchLength(before, tree.id)) {
            misses.push(`branches ${tree.id} at ${t}`)
          }
        }
        const shapes = shapesOf(now, 800, 450, Option.some([400, 270]))
        if (shapes.lines.length > MAX_LINES) misses.push(`${shapes.lines.length} lines at ${t}`)
        if (shapes.dots.length > MAX_DOTS) misses.push(`${shapes.dots.length} dots at ${t}`)
        for (const dot of shapes.dots) {
          if (dot.x < 0 || dot.x > 800 || dot.y < 0 || dot.y > 450) misses.push(`dot at ${t}`)
        }
        for (const branch of now.branches) {
          for (const [x, y] of [branch.from, branch.to]) {
            if (Math.abs(x) > BOUNDS.x || Math.abs(y) > BOUNDS.y) misses.push(`point ${x},${y} at ${t}`)
          }
        }
        before = now
      }
      assert.deepStrictEqual(Arr.take(misses, 5), [], `seed ${seed}`)
    }
  })
})

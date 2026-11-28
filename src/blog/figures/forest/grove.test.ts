import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Clock, Effect, Option } from 'effect'

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
import { MAX_DOTS, MAX_LINES, projection, marksOf } from './marks.ts'

const SEEDS = Arr.range(1, 12)
const STEP = 0.1

const momentsOf = (end: number) => Arr.makeBy(Math.ceil((end + 1) / STEP) + 1, k => k * STEP)

const branchLength = (frame: ReturnType<typeof frameAt>, tree: number) =>
  Arr.reduce(
    Arr.filter(frame.branches, branch => branch.tree === tree),
    0,
    (sum, { from, to }) => sum + Math.hypot(to[0] - from[0], to[1] - from[1]),
  )

type Frame = ReturnType<typeof frameAt>
type Xy = readonly [number, number]

const offSheet = (points: ReadonlyArray<Xy>, t: number): ReadonlyArray<string> =>
  Arr.flatMap(points, ([x, y]) => {
    if (Math.abs(x) > BOUNDS.x || Math.abs(y) > BOUNDS.y) return [`point ${x},${y} at ${t}`]
    return []
  })

const overBuffers = (marks: ReturnType<typeof marksOf>, t: number): ReadonlyArray<string> => [
  ...Arr.filter([`${marks.lines.length} lines at ${t}`], () => marks.lines.length > MAX_LINES),
  ...Arr.filter([`${marks.dots.length} dots at ${t}`], () => marks.dots.length > MAX_DOTS),
]

const shrunk = (before: Frame, now: Frame, t: number): ReadonlyArray<string> =>
  Arr.flatMap(before.trees, tree => {
    const after = Arr.findFirst(now.trees, other => other.id === tree.id)
    return [
      ...Arr.filter([`tree ${tree.id} at ${t}`], () => Option.isNone(after) || after.value.grown < tree.grown),
      ...Arr.filter(
        [`branches ${tree.id} at ${t}`],
        () => branchLength(now, tree.id) + 1e-9 < branchLength(before, tree.id),
      ),
    ]
  })

const leavesOf = (frame: Frame, tree: number) =>
  Arr.reduce(
    Arr.filter(frame.leaves, leaf => leaf.tree === tree),
    0,
    (sum, leaf) => sum + leaf.size,
  )

const wilted = (before: Frame, now: Frame, t: number): ReadonlyArray<string> =>
  Arr.flatMap(before.trees, tree =>
    Arr.filter([`leaves ${tree.id} at ${t}`], () => leavesOf(now, tree.id) + 1e-9 < leavesOf(before, tree.id)),
  )

const goldOf = (frame: Frame) =>
  Arr.reduce(
    Arr.filter(frame.branches, b => b.root),
    0,
    (sum, b) => sum + b.bond,
  )

describe('grove timeline', () => {
  it('replays the same run from the same seed', () => {
    const a = buildTimeline(7)
    const b = buildTimeline(7)
    assert.deepStrictEqual(a, b)
    assert.deepStrictEqual(frameAt(a, 14.3), frameAt(b, 14.3))
    assert.notDeepEqual(a.trees, buildTimeline(8).trees)
  })

  it('runs about twenty seconds', () => {
    for (const seed of SEEDS) {
      const { end } = buildTimeline(seed)
      assert.isAtLeast(end, 18)
      assert.isAtMost(end, 24)
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

  it.each(SEEDS)('stays on the sheet and inside its buffers at every 0.1s, seed %i', seed => {
    const timeline = buildTimeline(seed)
    const misses: Array<string> = []
    for (const t of momentsOf(timeline.end)) {
      const frame = frameAt(timeline, t)
      const points: ReadonlyArray<Xy> = [
        ...Arr.flatMap(frame.branches, branch => [branch.from, branch.to]),
        ...Arr.map(frame.leaves, (leaf): Xy => [leaf.x, leaf.y]),
        ...Arr.flatMap(frame.seeds, (s): ReadonlyArray<Xy> => [[s.x, s.y], s.tail]),
      ]
      misses.push(...offSheet(points, t))
      for (const [width, height] of [
        [800, 450],
        [358, 201],
      ] as const) {
        const marks = marksOf(frame, width, height, Option.some([width / 2, height * 0.6]))
        misses.push(...overBuffers(marks, t))
        for (const dot of marks.dots) {
          const on = dot.x >= 0 && dot.x <= width && dot.y >= 0 && dot.y <= height
          if (!on || !Number.isFinite(dot.radius) || dot.radius < 0) misses.push(`dot at ${t}`)
        }
      }
    }
    assert.deepStrictEqual(Arr.take(misses, 5), [], `seed ${seed}`)
  })

  it.each(SEEDS)('only ever grows, seed %i', seed => {
    const timeline = buildTimeline(seed)
    const misses: Array<string> = []
    let before = frameAt(timeline, 0)
    for (const t of momentsOf(timeline.end).slice(1)) {
      const now = frameAt(timeline, t)
      if (now.ground < before.ground) misses.push(`ground at ${t}`)
      if (now.trees.length < before.trees.length) misses.push(`trees at ${t}`)
      misses.push(...shrunk(before, now, t), ...wilted(before, now, t))
      before = now
    }
    assert.deepStrictEqual(Arr.take(misses, 5), [], `seed ${seed}`)
  })

  it('lets each seed go from a leaf that has opened, on a tree that has grown', () => {
    for (const seed of SEEDS) {
      const { trees, flights } = buildTimeline(seed)
      for (const flight of flights.slice(1)) {
        const source = trees[flight.tree]!
        assert.isAtMost(source.sprout + source.grow, flight.release, `seed ${seed}`)
        assert.isAtMost(source.leaves[flight.leaf]!.born, flight.release, `seed ${seed}`)
      }
      const leaves = Arr.map(flights.slice(1), flight => `${flight.tree}:${flight.leaf}`)
      assert.strictEqual(new Set(leaves).size, leaves.length)
      for (const [k, flight] of flights.entries()) {
        assert.strictEqual(flight.to[0], trees[k]!.x)
        assert.strictEqual(flight.to[1], GROUND)
        assert.isAbove(trees[k]!.sprout, landingOf(flight))
      }
    }
  })

  it.live('builds quickly', () =>
    Effect.gen(function* () {
      for (const seed of SEEDS) {
        const start = yield* Clock.currentTimeNanos
        const timeline = buildTimeline(seed)
        for (let t = 0; t < 30; t += 1) frameAt(timeline, t)
        const end = yield* Clock.currentTimeNanos
        assert.isBelow(Number(end - start) / 1e6, 100, `seed ${seed}`)
      }
    }),
  )
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

  it('ends with the whole grove grown, and nothing still to come', () => {
    const last = frameAt(timeline, timeline.end)
    assert.strictEqual(last.trees.length, timeline.trees.length)
    assert.isTrue(Arr.every(last.trees, tree => tree.grown === 1))
    assert.deepStrictEqual(last.seeds, [])
    assert.deepStrictEqual(last.rings, [])
    const under = (time: number) => Arr.filter(frameAt(timeline, time).branches, branch => branch.root)
    assert.deepStrictEqual(under(timeline.end), under(timeline.end + 10))
    const left = Arr.reduce(last.trees, 0, (m, tree) => Math.min(m, tree.left))
    const right = Arr.reduce(last.trees, 0, (m, tree) => Math.max(m, tree.right))
    assert.isBelow(left, -1.3)
    assert.isAbove(right, 1.3)
  })

  it('picks out the tree the pointer is over', () => {
    const frame = frameAt(timeline, timeline.end)
    const plain = marksOf(frame, 800, 450)
    const { px } = projection(800, 450)
    const first = frame.trees[0]!
    const [x, y] = px([first.x, (first.top + GROUND) / 2])
    const picked = marksOf(frame, 800, 450, Option.some([x, y]))
    assert.strictEqual(picked.lines.length, plain.lines.length)
    assert.isTrue(Arr.some(picked.dots, (dot, i) => dot.glow > plain.dots[i]!.glow))
    assert.deepStrictEqual(marksOf(frame, 800, 450, Option.some([-100, -100])), plain)
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
        const own = Arr.filter(frame.branches, b => b.root && b.tree === id && b.bond === 0)
        if (own.length === 0) continue
        const tips = Arr.map(own, b => b.to)
        const depth = Arr.reduce(tips, 0, (m, [, y]) => Math.max(m, y - GROUND))
        const span = Arr.reduce(tips, 0, (m, [x]) => Math.max(m, x)) - Arr.reduce(tips, 0, (m, [x]) => Math.min(m, x))
        const mature = end - tree.sprout > 8
        if (mature) {
          assert.isAbove(depth, 0.32 * tree.scale, `seed ${seed} tree ${id} depth`)
          assert.isAbove(span, 0.7 * tree.scale, `seed ${seed} tree ${id} span`)
        }
        const angles = Arr.map(tree.roots.pieces, p => Math.atan2(p.to[1] - GROUND, p.to[0] - tree.x))
        const spread = Math.max(...angles) - Math.min(...angles)
        assert.isAbove(spread, 1.6, `seed ${seed} tree ${id} spread`)
        assert.isTrue(Arr.some(tree.roots.pieces, p => p.order >= 2), `seed ${seed} tree ${id} forks`)
      }
      const marks = Arr.map(trees, tree =>
        Arr.join(
          Arr.map(tree.roots.pieces, p => `${(p.to[0] - tree.x).toFixed(4)},${p.to[1].toFixed(4)}`),
          ';',
        ),
      )
      assert.strictEqual(new Set(marks).size, marks.length, `seed ${seed}`)
    }
  })

  it('knots every grown tree of the grove to a neighbour in gold', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const end = frameAt(timeline, timeline.end).branches
      const bonded = new Set(Arr.map(Arr.filter(end, b => b.root && b.bond > 0.5), b => b.tree))
      for (const id of Arr.range(0, GROVE)) assert.isTrue(bonded.has(id), `seed ${seed} tree ${id}`)
      const gold = (t: number) => goldOf(frameAt(timeline, t))
      assert.isBelow(gold(timeline.end - 2), gold(timeline.end))
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
    const id = planted.trees.length - 1
    const grown = frameAt(planted, 5 + PLANT_SETTLE)
    assert.strictEqual(Option.getOrThrow(Arr.findFirst(grown.trees, t => t.id === id)).grown, 1)
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
    const early = plantedIn(timeline, [press(1)])
    assert.isAbove(Math.abs(early.trees[early.trees.length - 1]!.x - timeline.trees[0]!.x), 0.6)
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
        misses.push(...shrunk(before, now, t))
        const marks = marksOf(now, 800, 450, Option.some([400, 270]))
        misses.push(...overBuffers(marks, t))
        for (const dot of marks.dots) {
          if (dot.x < 0 || dot.x > 800 || dot.y < 0 || dot.y > 450) misses.push(`dot at ${t}`)
        }
        misses.push(...offSheet(Arr.flatMap(now.branches, branch => [branch.from, branch.to]), t))
        before = now
      }
      assert.deepStrictEqual(Arr.take(misses, 5), [], `seed ${seed}`)
    }
  })
})

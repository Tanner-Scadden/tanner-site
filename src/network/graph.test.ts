import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import { BOUNDS, HOP, MAX_EDGES, MAX_NODES, arrivalOf, buildTimeline, frameAt, positionAt } from './graph.ts'
import { projection, shapesOf } from './shapes.ts'

const SEEDS = Arr.range(1, 12)

describe('network timeline', () => {
  it('replays the same run from the same seed', () => {
    assert.deepStrictEqual(buildTimeline(7).edges, buildTimeline(7).edges)
    assert.notDeepEqual(buildTimeline(7).edges, buildTimeline(8).edges)
  })

  it('stays inside its bounds and its buffer sizes', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      assert.isAtMost(timeline.nodes.length, MAX_NODES)
      assert.isAtMost(timeline.edges.length, MAX_EDGES)
      for (const key of timeline.layout) {
        for (let i = 0; i < key.length; i += 2) {
          assert.isAtMost(Math.abs(key[i]!), BOUNDS.x)
          assert.isAtMost(Math.abs(key[i + 1]!), BOUNDS.y)
        }
      }
    }
  })

  it('only connects people who are there, and never twice', () => {
    for (const seed of SEEDS) {
      const { nodes, edges } = buildTimeline(seed)
      const keys = new Set<string>()
      for (const edge of edges) {
        assert.notStrictEqual(edge.a, edge.b)
        assert.isAtMost(nodes[edge.a]!.born, edge.born)
        assert.isAtMost(nodes[edge.b]!.born, edge.born)
        const key = edge.a < edge.b ? `${edge.a}:${edge.b}` : `${edge.b}:${edge.a}`
        assert.isFalse(keys.has(key))
        keys.add(key)
      }
    }
  })

  it('you only ever walk a link that is whole, starting from the middle', () => {
    for (const seed of SEEDS) {
      const { edges, hops } = buildTimeline(seed)
      assert.strictEqual(hops[0]!.from, 0)
      for (const [i, hop] of hops.entries()) {
        if (hop.from === hop.to) continue
        const walkable = Arr.some(
          edges,
          edge =>
            edge.born <= hop.start &&
            ((edge.a === hop.from && edge.b === hop.to) || (edge.a === hop.to && edge.b === hop.from)),
        )
        assert.isTrue(walkable, `seed ${seed}, hop ${i}`)
      }
    }
  })

  it('grows on its own, beyond the people you meet', () => {
    for (const seed of SEEDS) {
      const { edges } = buildTimeline(seed)
      assert.isTrue(
        Arr.some(edges, edge => !edge.yours),
        `seed ${seed}`,
      )
    }
  })

  it('barely moves anyone once they are there', () => {
    // People appear on their settled spot, so nobody gets shoved across the
    // canvas as the network grows around them.
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      for (let t = 0; t < timeline.end; t += 0.05) {
        for (const [i, node] of timeline.nodes.entries()) {
          if (node.born > t) continue
          const [ax, ay] = positionAt(timeline, i, t)
          const [bx, by] = positionAt(timeline, i, t + 0.05)
          assert.isAtMost(Math.hypot(bx - ax, by - ay) / 0.05, 0.2, `seed ${seed}, person ${i} at ${t}`)
        }
      }
    }
  })

  it('keeps you in the middle while everyone else moves', () => {
    const timeline = buildTimeline(3)
    assert.deepStrictEqual(positionAt(timeline, 0, timeline.end), [0, 0])
    const [x, y] = positionAt(timeline, 1, timeline.end)
    assert.isAbove(Math.hypot(x, y), 0.1)
  })
})

describe('network frames', () => {
  const timeline = buildTimeline(3)

  it('starts with just you', () => {
    const frame = frameAt(timeline, 0)
    assert.strictEqual(frame.edges.length, 0)
    assert.deepStrictEqual(
      Arr.map(frame.dots, dot => dot.kind),
      ['you'],
    )
    assert.deepStrictEqual(frame.walker, [0, 0])
  })

  it('ends with everyone drawn in full', () => {
    const frame = frameAt(timeline, timeline.end)
    assert.strictEqual(frame.dots.length, timeline.nodes.length)
    assert.strictEqual(frame.edges.length, timeline.edges.length)
    assert.isTrue(Arr.every(frame.dots, dot => dot.grown === 1))
  })

  it('marks the people you reach as met, and lights up their circle', () => {
    const first = timeline.hops[0]!
    const before = frameAt(timeline, first.start)
    const after = frameAt(timeline, arrivalOf(first) + 0.3)
    assert.notStrictEqual(before.dots[first.to]?.kind, 'met')
    assert.strictEqual(after.dots[first.to]?.kind, 'met')
    assert.isAbove(after.dots[first.to]!.lit, 0)
    assert.strictEqual(after.rings.length, 1)
    // Their own people are part of your wider network once you've met them.
    const theirs = Arr.filter(timeline.nodes, (node, i) => i !== first.to && node.circle === first.to)
    assert.isAbove(theirs.length, 0)
    const later = frameAt(timeline, timeline.end)
    for (const [i, node] of timeline.nodes.entries()) {
      if (node.circle === first.to && i !== first.to) {
        assert.include(['met', 'circle'], later.dots[i]!.kind)
      }
    }
  })

  it('picks out whoever the pointer is over, with their links', () => {
    const frame = frameAt(timeline, timeline.end)
    const plain = shapesOf(frame, 800, 450)
    const you = frame.dots[0]!
    const [x, y] = projection(800, 450)([you.x, you.y])
    const picked = shapesOf(frame, 800, 450, Option.some([x + 3, y]))
    assert.strictEqual(picked.dots.length, plain.dots.length + 1)
    assert.isTrue(Arr.some(picked.lines, line => line.width > 2))
    assert.deepStrictEqual(shapesOf(frame, 800, 450, Option.some([-100, -100])), plain)
  })

  it('draws one dot per person, a ring per arrival, plus you walking', () => {
    const time = arrivalOf(timeline.hops[3]!) + 0.2
    const frame = frameAt(timeline, time)
    const shapes = shapesOf(frame, 800, 450)
    assert.strictEqual(shapes.dots.length, frame.dots.length + frame.rings.length + 1)
    assert.strictEqual(shapes.lines.length, frame.edges.length)
    for (const dot of shapes.dots) {
      assert.isTrue(dot.x >= 0 && dot.x <= 800 && dot.y >= 0 && dot.y <= 450)
    }
  })

  it('a hop is never longer than its slot', () => {
    for (const hop of timeline.hops) assert.isAtMost(arrivalOf(hop) - hop.start, HOP)
  })
})

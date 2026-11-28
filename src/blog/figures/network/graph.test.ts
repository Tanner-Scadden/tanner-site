import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Clock, Effect, Option } from 'effect'

import {
  BOUNDS,
  MAX_EDGES,
  MAX_NODES,
  MAX_TEARS,
  TEAR_SETTLE,
  buildTimeline,
  distancesFrom,
  frameAt,
  positionAt,
  tearsOf,
  tornAt,
} from './graph.ts'
import { MAX_DOTS, MAX_LINES, projection, marksOf } from './marks.ts'

const SEEDS = Arr.range(1, 12)

describe('network timeline', () => {
  it('replays the same run from the same seed', () => {
    const a = buildTimeline(7)
    const b = buildTimeline(7)
    assert.deepStrictEqual(a.edges, b.edges)
    assert.deepStrictEqual(a.layout, b.layout)
    assert.notDeepEqual(a.edges, buildTimeline(8).edges)
  })

  it('stays inside its bounds and its buffer sizes', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      assert.isAtMost(timeline.nodes.length, MAX_NODES)
      assert.isAtMost(timeline.edges.length, MAX_EDGES)
      const misses: Array<string> = []
      for (const [k, key] of timeline.layout.entries()) {
        for (let i = 0; i < key.length; i += 2) {
          if (Math.abs(key[i]!) > BOUNDS.x || Math.abs(key[i + 1]!) > BOUNDS.y) misses.push(`key ${k}, ${i / 2}`)
        }
      }
      for (let t = 0; t <= timeline.end + 4; t += 0.1) {
        const marks = marksOf(frameAt(timeline, t), 800, 450, Option.some([400, 225]))
        if (marks.lines.length > MAX_LINES) misses.push(`${marks.lines.length} lines at ${t}`)
        if (marks.dots.length > MAX_DOTS) misses.push(`${marks.dots.length} dots at ${t}`)
      }
      assert.deepStrictEqual(Arr.take(misses, 5), [], `seed ${seed}`)
    }
  })

  it('only connects people who are there, and never twice', () => {
    for (const seed of SEEDS) {
      const { nodes, edges } = buildTimeline(seed)
      const keys = new Set<string>()
      for (const edge of edges) {
        assert.notStrictEqual(edge.a, edge.b)
        assert.isAtMost(nodes[edge.a]!.born, edge.born)
        assert.isAtMost(nodes[edge.b]!.born, edge.born + 0.5)
        const key = `${Math.min(edge.a, edge.b)}:${Math.max(edge.a, edge.b)}`
        assert.isFalse(keys.has(key))
        keys.add(key)
      }
    }
  })

  it('everyone you help brings their own people', () => {
    for (const seed of SEEDS) {
      const { nodes, helps } = buildTimeline(seed)
      assert.isAtLeast(helps.length, 5)
      for (const help of helps) {
        const theirs = Arr.filter(nodes, (node, i) => i !== help.person && node.circle === help.person)
        assert.isAtLeast(theirs.length, 2, `seed ${seed}, person ${help.person}`)
      }
    }
  })

  it('grows on its own, and reaches far beyond the people you helped', () => {
    for (const seed of SEEDS) {
      const { nodes, edges, helps, end } = buildTimeline(seed)
      assert.isTrue(
        Arr.some(edges, edge => !edge.yours),
        `seed ${seed}`,
      )
      assert.isAtLeast(nodes.length, helps.length * 6, `seed ${seed}`)
      const late = Arr.filter(nodes, node => node.born > end - 5)
      assert.isAbove(late.length, 0, `seed ${seed}`)
      const { distance } = distancesFrom(nodes.length, edges)
      assert.isTrue(
        Arr.some(Arr.fromIterable(distance), d => d >= 3),
        `seed ${seed}`,
      )
    }
  })

  it('ends a beat after the last link is drawn', () => {
    for (const seed of SEEDS) {
      const { edges, end } = buildTimeline(seed)
      const last = Arr.reduce(edges, 0, (latest, edge) => Math.max(latest, edge.born))
      assert.isAbove(end, last + 0.5, `seed ${seed}`)
      assert.isBelow(end, last + 2, `seed ${seed}`)
      assert.isAtMost(end, 20, `seed ${seed}`)
    }
  })

  it('barely moves anyone once they are there', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const misses: Array<string> = []
      for (let t = 0; t < timeline.end; t += 0.05) {
        for (const [i, node] of timeline.nodes.entries()) {
          if (node.born > t) continue
          const [ax, ay] = positionAt(timeline, i, t)
          const [bx, by] = positionAt(timeline, i, t + 0.05)
          if (Math.hypot(bx - ax, by - ay) / 0.05 > 0.2) misses.push(`person ${i} at ${t}`)
        }
      }
      assert.deepStrictEqual(Arr.take(misses, 5), [], `seed ${seed}`)
    }
  })

  it('keeps you in the middle while everyone else moves', () => {
    const timeline = buildTimeline(3)
    assert.deepStrictEqual(positionAt(timeline, 0, timeline.end), [0, 0])
    const [x, y] = positionAt(timeline, 1, timeline.end)
    assert.isAbove(Math.hypot(x, y), 0.1)
  })

  it.live('builds quickly', () =>
    Effect.gen(function* () {
      for (const seed of SEEDS) {
        const start = yield* Clock.currentTimeNanos
        buildTimeline(seed)
        const end = yield* Clock.currentTimeNanos
        assert.isBelow(Number(end - start) / 1e6, 250, `seed ${seed}`)
      }
    }),
  )
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
  })

  it('lights up the person you help, and the people they bring', () => {
    const first = timeline.helps[0]!
    const person = timeline.nodes[first.person]!
    const before = frameAt(timeline, first.start)
    assert.isUndefined(before.dots[first.person])
    assert.strictEqual(frameAt(timeline, first.start + 0.2).sparks.length, 1)
    const after = frameAt(timeline, person.born + 0.4)
    assert.strictEqual(after.dots[first.person]?.kind, 'met')
    assert.isAbove(after.dots[first.person]!.lit, 0)
    assert.isAbove(after.rings.length, 0)
    const later = frameAt(timeline, timeline.end)
    for (const [i, node] of timeline.nodes.entries()) {
      if (node.circle === first.person && i !== first.person) {
        assert.include(['circle', 'stranger'], later.dots[i]!.kind)
      }
    }
  })

  it('ends with everyone drawn in full', () => {
    const frame = frameAt(timeline, timeline.end)
    assert.strictEqual(frame.dots.length, timeline.nodes.length)
    assert.strictEqual(frame.edges.length, timeline.edges.length)
    assert.isTrue(Arr.every(frame.dots, dot => dot.grown === 1))
    assert.strictEqual(frame.sparks.length, 0)
  })

  it('picks out whoever the pointer is over, with their links', () => {
    const frame = frameAt(timeline, timeline.end)
    const plain = marksOf(frame, 800, 450)
    const you = frame.dots[0]!
    const [x, y] = projection(800, 450).px([you.x, you.y])
    const picked = marksOf(frame, 800, 450, Option.some([x + 3, y]))
    assert.strictEqual(picked.dots.length, plain.dots.length + 1)
    assert.isTrue(Arr.some(picked.lines, line => line.width > 2))
    assert.deepStrictEqual(marksOf(frame, 800, 450, Option.some([-100, -100])), plain)
  })

  it('draws every mark on the canvas', () => {
    for (const time of [1, 8, 14, timeline.end - 0.5, timeline.end]) {
      const marks = marksOf(frameAt(timeline, time), 800, 450)
      for (const dot of marks.dots) {
        assert.isTrue(dot.x >= 0 && dot.x <= 800 && dot.y >= 0 && dot.y <= 450)
      }
    }
  })
})

describe('network bad interactions', () => {
  const timeline = buildTimeline(3)
  const none = Option.none<readonly [number, number]>()
  const at = (time: number) => ({ time, aim: none })
  const helped = new Set(Arr.map(timeline.helps, help => help.person))
  const yourLinkTo = (frame: ReturnType<typeof frameAt>, person: number) =>
    Arr.some(frame.edges, edge => (edge.a === 0 && edge.b === person) || (edge.b === 0 && edge.a === person))

  it('tears your link to someone you helped, and dims their branch', () => {
    const [tear] = tearsOf(timeline, [at(12)])
    assert.isTrue(helped.has(tear!.person))
    const before = frameAt(timeline, tornAt(tear!) - 0.01, [tear!])
    assert.isTrue(yourLinkTo(before, tear!.person))
    assert.strictEqual(before.ripples.length, 1)
    const after = frameAt(timeline, tornAt(tear!) + TEAR_SETTLE, [tear!])
    assert.isFalse(yourLinkTo(after, tear!.person))
    assert.strictEqual(after.dots[tear!.person]!.cut, 1)
    for (const dot of after.dots) assert.strictEqual(dot.cut > 0, tear!.branch.includes(dot.id), `person ${dot.id}`)
    const plain = frameAt(timeline, tornAt(tear!) + TEAR_SETTLE)
    const d = (frame: typeof plain) => Math.hypot(frame.dots[tear!.person]!.x, frame.dots[tear!.person]!.y)
    assert.isAbove(d(after), d(plain))
  })

  it('shows nothing of it before it happened', () => {
    const tears = tearsOf(timeline, [at(12)])
    for (const t of [0.5, 6, 11.99]) assert.deepStrictEqual(frameAt(timeline, t, tears), frameAt(timeline, t))
  })

  it('hits another branch with every press, aimed or not', () => {
    const tears = tearsOf(timeline, Arr.map(Arr.range(1, timeline.helps.length), k => at(10 + k * 0.5)))
    assert.deepStrictEqual(new Set(Arr.map(tears, tear => tear.person)), helped)
    assert.strictEqual(tearsOf(timeline, [at(0.5)])[0]!.person, -1)
    const more = tearsOf(timeline, Arr.map(Arr.range(0, timeline.helps.length), k => at(10 + k * 0.5)))
    assert.strictEqual(more[more.length - 1]!.person, -1)
    const ripple = frameAt(timeline, 0.5 + 0.3, tearsOf(timeline, [at(0.5)]))
    assert.isTrue(Arr.some(ripple.rings, ring => ring.alarm === true))
    const target = timeline.helps[2]!.person
    const spot = positionAt(timeline, target, 14)
    assert.strictEqual(tearsOf(timeline, [{ time: 14, aim: Option.some(spot) }])[0]!.person, target)
  })

  it('draws the same frame from the same interactions', () => {
    const presses = [at(9), { time: 15, aim: Option.some([0.4, -0.2] as const) }, at(17)]
    for (const t of [9.3, 15.5, 17.5, timeline.end]) {
      assert.deepStrictEqual(
        marksOf(frameAt(timeline, t, tearsOf(timeline, presses)), 800, 450),
        marksOf(frameAt(timeline, t, tearsOf(buildTimeline(3), presses)), 800, 450),
      )
    }
  })

  it('stays on the canvas and inside its buffers with every press it takes', () => {
    for (const seed of Arr.take(SEEDS, 4)) {
      const run = buildTimeline(seed)
      const tears = tearsOf(run, Arr.map(Arr.range(0, MAX_TEARS - 1), k => at(3 + k * 2.2)))
      for (let t = 0; t <= run.end + 4; t += 0.1) {
        const marks = marksOf(frameAt(run, t, tears), 800, 450, Option.some([400, 225]))
        assert.isAtMost(marks.lines.length, MAX_LINES, `seed ${seed} at ${t}`)
        assert.isAtMost(marks.dots.length, MAX_DOTS, `seed ${seed} at ${t}`)
        for (const dot of marks.dots) {
          assert.isTrue(dot.x >= 0 && dot.x <= 800 && dot.y >= 0 && dot.y <= 450, `seed ${seed} at ${t}`)
        }
      }
    }
  })
})

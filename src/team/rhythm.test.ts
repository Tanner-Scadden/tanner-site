import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import {
  BOUNDS,
  END,
  FLARE,
  MAX_LINKS,
  MAX_PEOPLE,
  MIN_PEOPLE,
  buildTimeline,
  frameAt,
  peakAt,
  phaseAt,
  positionAt,
  syncAt,
  syncOf,
  trustAt,
  weightAt,
} from './rhythm.ts'
import { MAX_DOTS, MAX_LINES, projection, shapesOf } from './shapes.ts'

const SEEDS = Arr.range(1, 12)

// How in step everyone but whoever flared is.
const othersSync = (timeline: ReturnType<typeof buildTimeline>, time: number) => {
  const phases = Arr.map(
    Arr.filter(Arr.range(0, timeline.count - 1), i => i !== timeline.flarer),
    i => phaseAt(timeline, i, time),
  )
  return syncOf(phases, phases.length)
}

const mean = (values: ReadonlyArray<number>) => Arr.reduce(values, 0, (sum, v) => sum + v) / values.length
const moments = (from: number, to: number) => Arr.map(Arr.range(0, Math.round((to - from) / 0.1)), k => from + k * 0.1)

describe('team timeline', () => {
  it('replays the same run from the same seed', () => {
    const a = buildTimeline(7)
    const b = buildTimeline(7)
    assert.deepStrictEqual(a.keys, b.keys)
    assert.strictEqual(a.flarer, b.flarer)
    assert.notDeepEqual(a.keys, buildTimeline(8).keys)
  })

  it('stays inside its bounds and its buffer sizes', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      assert.isAtLeast(timeline.count, MIN_PEOPLE)
      assert.isAtMost(timeline.count, MAX_PEOPLE)
      assert.isAtMost(timeline.links.length, MAX_LINKS)
      for (let t = 0; t <= timeline.end + 4; t += 0.1) {
        for (let i = 0; i < timeline.count; i++) {
          const [x, y] = positionAt(timeline, i, t)
          assert.isAtMost(Math.abs(x), BOUNDS.x)
          assert.isAtMost(Math.abs(y), BOUNDS.y)
        }
        for (let e = 0; e < timeline.links.length; e++) {
          const w = weightAt(timeline, e, t)
          assert.isTrue(w >= 0 && w <= 1, `seed ${seed}, link ${e} at ${t}`)
          assert.isAtLeast(peakAt(timeline, e, t), w - 1e-6)
        }
        const shapes = shapesOf(frameAt(timeline, t), 800, 450, Option.some([400, 200]))
        assert.isAtMost(shapes.lines.length, MAX_LINES, `seed ${seed} at ${t}`)
        assert.isAtMost(shapes.dots.length, MAX_DOTS, `seed ${seed} at ${t}`)
        for (const dot of shapes.dots) {
          for (const c of dot.color) assert.isTrue(c >= 0 && c <= 1, `seed ${seed} at ${t}`)
        }
      }
    }
  })

  it('falls into one rhythm slowly', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      // Out of step at the start, in unison well before the flare.
      assert.isBelow(mean(Arr.map(moments(0, 2), t => syncAt(timeline, t))), 0.6, `seed ${seed}`)
      assert.isAbove(mean(Arr.map(moments(FLARE - 2, FLARE), t => syncAt(timeline, t))), 0.95, `seed ${seed}`)
      // And it takes a while: not locked in the first few seconds.
      assert.isBelow(syncAt(timeline, 1), 0.9, `seed ${seed}`)
    }
  })

  it('builds trust in drops, a little at a time', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const trust = Arr.map(moments(0, FLARE), t => trustAt(timeline, t))
      // It never falls while it builds, and it climbs in many small steps
      // rather than a few big ones.
      const steps = Arr.map(Arr.zip(trust, Arr.drop(trust, 1)), ([a, b]) => b - a)
      assert.isTrue(
        Arr.every(steps, step => step > -0.005),
        `seed ${seed}`,
      )
      assert.isBelow(Math.max(...steps), 0.05, `seed ${seed}`)
      assert.isAbove(trustAt(timeline, FLARE), 0.6, `seed ${seed}`)
      assert.isAbove(trustAt(timeline, FLARE), trustAt(timeline, FLARE / 2) * 1.5, `seed ${seed}`)
    }
  })

  it('loses it all at once at the flare', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const before = trustAt(timeline, FLARE)
      // Most of the trust is gone within about a second and a half.
      assert.isBelow(trustAt(timeline, FLARE + 1.6), before * 0.15, `seed ${seed}`)
      // And the rhythm breaks.
      assert.isBelow(Math.min(...Arr.map(moments(FLARE, FLARE + 1.5), t => syncAt(timeline, t))), 0.6, `seed ${seed}`)
    }
  })

  it('comes back slowly, and only partly', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const peak = trustAt(timeline, FLARE)
      const low = trustAt(timeline, FLARE + 1.6)
      const end = trustAt(timeline, END)
      // Some comes back, but nowhere near what was there.
      assert.isAbove(end, low + 0.04, `seed ${seed}`)
      assert.isBelow(end, peak * 0.5, `seed ${seed}`)
      // The others find the beat again before the end.
      assert.isAbove(mean(Arr.map(moments(END - 3, END), t => othersSync(timeline, t))), 0.9, `seed ${seed}`)
      // Losing it took a second. Building it back to here takes most of
      // the rest of the run.
      const back = Option.getOrElse(
        Arr.findFirst(moments(FLARE + 1.6, END), t => trustAt(timeline, t) >= low + (end - low) * 0.8),
        () => END,
      )
      assert.isAbove(back - FLARE, 5, `seed ${seed}`)
    }
  })

  it('routes around whoever flared', () => {
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      const theirs = Arr.filter(
        Arr.range(0, timeline.links.length - 1),
        e => timeline.links[e]!.a === timeline.flarer || timeline.links[e]!.b === timeline.flarer,
      )
      const rest = Arr.filter(Arr.range(0, timeline.links.length - 1), e => !theirs.includes(e))
      assert.isBelow(
        mean(Arr.map(theirs, e => weightAt(timeline, e, END))),
        mean(Arr.map(rest, e => weightAt(timeline, e, END))) * 0.5,
        `seed ${seed}`,
      )
      // And they've drifted a little away from the others.
      const [x0, y0] = positionAt(timeline, timeline.flarer, FLARE)
      const [x1, y1] = positionAt(timeline, timeline.flarer, END)
      assert.isAbove(Math.hypot(x1, y1 + 0.18), Math.hypot(x0, y0 + 0.18) + 0.02, `seed ${seed}`)
    }
  })

  it('moves calmly', () => {
    // Nobody jumps across the canvas: the team only draws in and drifts.
    for (const seed of SEEDS) {
      const timeline = buildTimeline(seed)
      for (let t = 0; t < timeline.end; t += 0.05) {
        for (let i = 0; i < timeline.count; i++) {
          const [ax, ay] = positionAt(timeline, i, t)
          const [bx, by] = positionAt(timeline, i, t + 0.05)
          assert.isAtMost(Math.hypot(bx - ax, by - ay) / 0.05, 0.08, `seed ${seed}, person ${i} at ${t}`)
        }
      }
    }
  })

  it('builds quickly', () => {
    for (const seed of SEEDS) {
      const start = performance.now()
      buildTimeline(seed)
      assert.isBelow(performance.now() - start, 250, `seed ${seed}`)
    }
  })
})

describe('team frames', () => {
  const timeline = buildTimeline(3)

  it('flashes from whoever flared, and only then', () => {
    assert.isTrue(Option.isNone(frameAt(timeline, FLARE - 0.1).flash))
    assert.isTrue(Option.isNone(frameAt(timeline, FLARE - 0.1).flared))
    const flash = frameAt(timeline, FLARE + 0.2)
    assert.isTrue(Option.isSome(flash.flash))
    assert.isAbove(flash.people[timeline.flarer]!.heat, 0.5)
  })

  it('beats as one in the middle only once the team is in step', () => {
    assert.isTrue(Option.isNone(frameAt(timeline, 0.5).shared))
    const beats = Arr.filter(moments(FLARE - 2, FLARE), t => Option.isSome(frameAt(timeline, t).shared))
    assert.strictEqual(beats.length, moments(FLARE - 2, FLARE).length)
  })

  it('ends on a frame that still shows what was built and what was lost', () => {
    // The last frame is all reduced motion shows.
    const last = frameAt(timeline, timeline.end)
    assert.isTrue(Option.isNone(last.flash))
    assert.isTrue(Option.isSome(last.flared))
    // Whoever flared still carries the mark.
    assert.isAbove(last.people[timeline.flarer]!.scar, 0)
    // Every link remembers being much stronger than it is.
    assert.isTrue(
      Arr.every(last.links, link => link.peak > link.weight + 0.2),
      'ghosts',
    )
    // The trace runs the whole way, climbing, falling, then partly back.
    const trust = Arr.map(last.trace, ([, value]) => value)
    assert.strictEqual(Arr.last(last.trace).pipe(Option.map(([time]) => time), Option.getOrUndefined), timeline.end)
    assert.isAbove(Math.max(...trust), 0.6)
    assert.isBelow(Arr.last(trust).pipe(Option.getOrElse(() => 1)), Math.max(...trust) * 0.5)
    assert.isTrue(Arr.every(last.people, person => person.grown === 1))
  })

  it('picks out whoever the pointer is over, with their links', () => {
    const frame = frameAt(timeline, FLARE - 1)
    const plain = shapesOf(frame, 800, 450)
    const person = frame.people[0]!
    const [x, y] = projection(800, 450).px([person.x, person.y])
    const picked = shapesOf(frame, 800, 450, Option.some([x + 3, y]))
    assert.strictEqual(picked.dots.length, plain.dots.length + 1)
    // Their links get wider, the rest stay as they were but dimmer.
    const widened = Arr.filter(
      Arr.zip(plain.lines, picked.lines),
      ([a, b]) => b.width > a.width,
    )
    assert.strictEqual(widened.length, timeline.count - 1)
    assert.isTrue(Arr.some(Arr.zip(plain.lines, picked.lines), ([a, b]) => b.color[3] < a.color[3]))
    assert.deepStrictEqual(shapesOf(frame, 800, 450, Option.some([-100, -100])), plain)
  })

  it('draws every shape on the canvas, even narrow', () => {
    for (const [width, height] of [
      [800, 450],
      [358, 201],
    ] as const) {
      for (const time of [0.5, 6, FLARE - 0.5, FLARE + 0.4, FLARE + 4, timeline.end]) {
        const shapes = shapesOf(frameAt(timeline, time), width, height)
        for (const dot of shapes.dots) {
          if (dot.ring > 0) continue
          assert.isTrue(dot.x >= 0 && dot.x <= width && dot.y >= 0 && dot.y <= height, `${width} at ${time}`)
        }
        for (const line of shapes.lines) {
          for (const [x, y] of [line.from, line.to]) {
            assert.isTrue(x >= 0 && x <= width && y >= 0 && y <= height, `${width} at ${time}`)
          }
        }
      }
    }
  })
})

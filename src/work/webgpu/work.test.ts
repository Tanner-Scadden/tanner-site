import { assert, describe, it } from '@effect/vitest'
import { Array as Arr } from 'effect'

import {
  DRAW_MS,
  GAP_MS,
  PING_MS,
  STAGGER_MS,
  TRAVEL_MS,
  type Hovered,
  type WorkState,
  entered,
  initialWork,
  pingOf,
  revealOf,
  seen,
  settled,
  sparkOf,
  step,
} from './work.ts'

const job = (state: WorkState) => state.jobs[0]!
const drawn = (2 * STAGGER_MS + DRAW_MS)

// Steps 60fps frames from `from` until the state settles, or gives up.
const run = (
  state: WorkState,
  { from = 0, hovered = null, still = false }: { from?: number; hovered?: Hovered | null; still?: boolean } = {},
) => {
  let now = from
  for (let frames = 0; frames < 600; frames++, now += 16) {
    state = step(state, { now, hovered, still })
    if (settled(state, { now, hovered, still })) break
  }
  return { state, now }
}

describe('work drawing', () => {
  it('rests before any job is seen', () => {
    const state = initialWork(5)
    assert.isTrue(settled(state, { now: 0, hovered: null, still: false }))
    assert.strictEqual(revealOf(job(state), { box: 0, now: 0, still: false }), 0)
  })

  it('drafts the boxes one after another', () => {
    const state = seen(initialWork(1), { job: 0, now: 1000 })
    const at = (now: number) =>
      Arr.map([0, 1, 2], box => revealOf(job(state), { box, now, still: false }))
    const [first, second, third] = at(1000 + STAGGER_MS + 40)
    assert.isAbove(first!, second!)
    assert.isAbove(second!, 0)
    assert.strictEqual(third, 0)
    assert.deepStrictEqual(at(1000 + drawn), [1, 1, 1])
  })

  it('sparks from box to box once drawn, then rests', () => {
    const state = seen(initialWork(1), { job: 0, now: 0 })
    const { sparkAt } = job(state)
    assert.isNotNull(sparkAt)
    assert.isBelow(sparkAt!, drawn)
    assert.isNull(sparkOf(job(state), { box: 2, now: sparkAt! + TRAVEL_MS / 2, still: false }))
    assert.isNotNull(sparkOf(job(state), { box: 1, now: sparkAt! + TRAVEL_MS / 2, still: false }))
    assert.isNotNull(sparkOf(job(state), { box: 2, now: sparkAt! + GAP_MS + TRAVEL_MS / 2, still: false }))
    assert.isAbove(pingOf(job(state), { box: 2, now: sparkAt! + GAP_MS + TRAVEL_MS + 10, still: false }), 0.9)

    const { state: rested, now } = run(state)
    assert.isAtLeast(now, sparkAt! + GAP_MS + TRAVEL_MS + PING_MS)
    assert.isTrue(settled(rested, { now, hovered: null, still: false }))
  })

  it('only draws a job the first time it is seen', () => {
    const once = seen(initialWork(1), { job: 0, now: 0 })
    assert.strictEqual(seen(once, { job: 0, now: 5000 }), once)
  })

  it('sparks again when the pointer comes back, but not mid-flight', () => {
    const state = seen(initialWork(1), { job: 0, now: 0 })
    assert.strictEqual(entered(state, { job: 0, now: drawn }), state)
    const later = entered(state, { job: 0, now: 10_000 })
    assert.strictEqual(job(later).sparkAt, 10_000)
    assert.strictEqual(entered(later, { job: 0, now: 10_100 }), later)
  })

  it('never sparks a job that has not drawn yet', () => {
    const state = initialWork(1)
    assert.strictEqual(entered(state, { job: 0, now: 100 }), state)
  })

  it('eases a hovered box in, then rests', () => {
    const hovered = { job: 0, step: 1 }
    const { state } = run(initialWork(1), { hovered })
    assert.deepStrictEqual(job(state).hover, [0, 1, 0])
  })

  it('with motion reduced, shows boxes whole and sends no spark', () => {
    const state = seen(initialWork(1), { job: 0, now: 0 })
    assert.strictEqual(revealOf(job(state), { box: 2, now: 0, still: true }), 1)
    assert.isNull(sparkOf(job(state), { box: 1, now: job(state).sparkAt! + 10, still: true }))
    assert.isTrue(settled(state, { now: 0, hovered: null, still: true }))
  })
})

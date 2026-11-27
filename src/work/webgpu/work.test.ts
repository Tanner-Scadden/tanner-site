import { assert, describe, it } from '@effect/vitest'

import {
  PING_MS,
  WAVE_DELAY_MS,
  WAVE_MS,
  WAVE_TAIL,
  type Hovered,
  type WorkState,
  replayed,
  initialWork,
  pingOf,
  seen,
  settled,
  step,
  waveOf,
} from './work.ts'

const job = (state: WorkState) => state.jobs[0]!
const moving = (now: number) => ({ now, still: false })

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
    assert.isNull(waveOf(job(state), moving(0)))
  })

  it('sends a wave a beat after a job is seen', () => {
    const state = seen(initialWork(1), { job: 0, now: 1000 })
    assert.strictEqual(job(state).waveAt, 1000 + WAVE_DELAY_MS)
    assert.isNull(waveOf(job(state), moving(1000)))
    assert.isFalse(settled(state, { now: 1000, hovered: null, still: false }))
  })

  it('runs the wave front from start to end at one speed', () => {
    const state = seen(initialWork(1), { job: 0, now: 0 })
    const at = WAVE_DELAY_MS
    assert.strictEqual(waveOf(job(state), moving(at)), 0)
    assert.closeTo(waveOf(job(state), moving(at + WAVE_MS / 2))!, 0.5, 1e-9)
    assert.closeTo(waveOf(job(state), moving(at + WAVE_MS))!, 1, 1e-9)
    // The rest of it runs out past the end, then it's gone.
    assert.isAbove(waveOf(job(state), moving(at + WAVE_MS * (1 + WAVE_TAIL / 2)))!, 1)
    assert.isNull(waveOf(job(state), moving(at + WAVE_MS * (1 + WAVE_TAIL) + 1)))
  })

  it('glows RESULT once the wave closes round it, then rests', () => {
    const state = seen(initialWork(1), { job: 0, now: 0 })
    const closes = WAVE_DELAY_MS + WAVE_MS
    assert.strictEqual(pingOf(job(state), moving(closes - 1)), 0)
    assert.isAbove(pingOf(job(state), moving(closes + 10)), 0.9)

    const { state: rested, now } = run(state)
    assert.isAtLeast(now, closes + PING_MS)
    assert.isTrue(settled(rested, { now, hovered: null, still: false }))
  })

  it('only sends the first wave the first time a job is seen', () => {
    const once = seen(initialWork(1), { job: 0, now: 0 })
    assert.strictEqual(seen(once, { job: 0, now: 5000 }), once)
  })

  it('sends another wave when the pointer comes back, but not mid-wave', () => {
    const state = seen(initialWork(1), { job: 0, now: 0 })
    assert.strictEqual(replayed(state, { job: 0, now: WAVE_DELAY_MS + WAVE_MS / 2 }), state)
    const later = replayed(state, { job: 0, now: 10_000 })
    assert.strictEqual(job(later).waveAt, 10_000)
    assert.strictEqual(replayed(later, { job: 0, now: 10_100 }), later)
  })

  it('never sends a wave through a job that has not been seen', () => {
    const state = initialWork(1)
    assert.strictEqual(replayed(state, { job: 0, now: 100 }), state)
  })

  it('eases a hovered box in, then rests', () => {
    const hovered = { job: 0, step: 1 }
    const { state } = run(initialWork(1), { hovered })
    assert.deepStrictEqual(job(state).hover, [0, 1, 0])
  })

  it('with motion reduced, sends no wave', () => {
    const state = seen(initialWork(1), { job: 0, now: 0 })
    const mid = WAVE_DELAY_MS + WAVE_MS / 2
    assert.isNull(waveOf(job(state), { now: mid, still: true }))
    assert.strictEqual(pingOf(job(state), { now: WAVE_DELAY_MS + WAVE_MS + 10, still: true }), 0)
    assert.isTrue(settled(state, { now: 0, hovered: null, still: true }))
  })
})

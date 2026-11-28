import { assert, describe, it } from '@effect/vitest'
import { Array as Arr } from 'effect'

import { approach, clamp01, nextRandom, random } from './math.ts'

const threaded = (seed: number, count: number): ReadonlyArray<number> =>
  Arr.reduce(Arr.range(1, count), { seed, values: Arr.empty<number>() }, ({ seed: s, values }) => {
    const [next, value] = nextRandom(s)
    return { seed: next, values: Arr.append(values, value) }
  }).values

const drawn = (seed: number, count: number): ReadonlyArray<number> => {
  const next = random(seed)
  return Arr.map(Arr.range(1, count), () => next())
}

describe('clamp01', () => {
  it('keeps a number between 0 and 1', () => {
    assert.strictEqual(clamp01(-0.5), 0)
    assert.strictEqual(clamp01(0.25), 0.25)
    assert.strictEqual(clamp01(3), 1)
  })
})

describe('random', () => {
  it('replays the same run from the same seed', () => {
    assert.deepStrictEqual(drawn(42, 50), drawn(42, 50))
    assert.deepStrictEqual(threaded(42, 50), threaded(42, 50))
  })

  it('gives mulberry32 numbers', () => {
    assert.deepStrictEqual(drawn(1, 3), [0.6270739405881613, 0.002735721180215478, 0.5274470399599522])
  })

  it('stays from 0 up to 1', () => {
    for (const value of drawn(7, 1000)) assert.isTrue(value >= 0 && value < 1)
  })

  it('gives the same run threaded or kept, for any whole seed', () => {
    for (const seed of [0, 1, 7, 2 ** 31 - 1, 2 ** 31, 2 ** 32 - 1, -1, -(2 ** 31)]) {
      assert.deepStrictEqual(drawn(seed, 200), threaded(seed, 200))
    }
  })

  it('takes a seed as its whole-number bits when it keeps it', () => {
    assert.deepStrictEqual(drawn(-0.5, 20), drawn(0, 20))
    assert.deepStrictEqual(drawn(2 ** 32 + 5, 20), drawn(5, 20))
  })

  it('differs from different seeds', () => {
    assert.notDeepEqual(drawn(1, 5), drawn(2, 5))
  })
})

describe('approach', () => {
  it('closes the same share of the gap at any frame rate', () => {
    const once = approach({ from: 0, to: 1, dt: 0.1, rate: 5 })
    const twice = approach({ from: approach({ from: 0, to: 1, dt: 0.05, rate: 5 }), to: 1, dt: 0.05, rate: 5 })
    assert.closeTo(once, 1 - Math.exp(-0.5), 1e-12)
    assert.closeTo(once, twice, 1e-12)
  })

  it('stays put with no time', () => {
    assert.strictEqual(approach({ from: 0.3, to: 1, dt: 0, rate: 12, snap: 0.002 }), 0.3)
  })

  it('lands exactly on its target once within the snap', () => {
    assert.strictEqual(approach({ from: 0.999, to: 1, dt: 0.016, rate: 12, snap: 0.002 }), 1)
    assert.notStrictEqual(approach({ from: 0.9, to: 1, dt: 0.016, rate: 12, snap: 0.002 }), 1)
  })

  it('never snaps without a snap', () => {
    const next = approach({ from: 0.99999, to: 1, dt: 0.016, rate: 12 })
    assert.isTrue(next < 1)
  })

  it('settles in finitely many frames', () => {
    let value = 0
    let frames = 0
    while (value !== 1 && frames < 1000) {
      value = approach({ from: value, to: 1, dt: 1 / 60, rate: 12, snap: 0.002 })
      frames++
    }
    assert.strictEqual(value, 1)
    assert.isBelow(frames, 100)
  })
})

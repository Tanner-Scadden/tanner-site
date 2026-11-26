import { assert, describe, it } from '@effect/vitest'
import { Array as Arr } from 'effect'

import { FIRST_SEED, TURNS, nextSeed, runOf } from './replay.ts'

describe('Workshop replay', () => {
  it('the same seed always plays the same run', () => {
    const seed = nextSeed(FIRST_SEED)
    const a = runOf(seed)
    assert.strictEqual(a.frames.length, TURNS + 1)
    assert.strictEqual(a.hash, runOf(seed).hash)
    assert.notStrictEqual(a.hash, runOf(nextSeed(seed)).hash)
  })

  it('some seeds hold the parlour and some get everybody eaten', () => {
    let seed = FIRST_SEED
    const held: Array<boolean> = []
    for (let i = 0; i < 40; i++) {
      held.push(runOf(seed).held)
      seed = nextSeed(seed)
    }
    assert.isTrue(runOf(FIRST_SEED).held)
    assert.isTrue(held.includes(false))
  })

  it('every zombie that goes down was shot, and misses happen too', () => {
    const run = runOf(FIRST_SEED)
    const shots = Arr.flatMap(run.frames, f => f.shots)
    assert.isTrue(Arr.some(shots, shot => shot.hit))
    assert.isTrue(Arr.some(shots, shot => !shot.hit))
    for (const frame of run.frames) {
      for (const splat of frame.splats) assert.include(frame.hits, splat.id)
      assert.strictEqual(
        frame.hits.length,
        Arr.filter(frame.shots, shot => shot.hit).length,
      )
    }
  })

  it('seeds stay five digits', () => {
    let seed = FIRST_SEED
    for (let i = 0; i < 50; i++) {
      seed = nextSeed(seed)
      assert.isTrue(seed >= 10000 && seed < 100000)
    }
  })
})

import { assert, describe, it } from '@effect/vitest'
import { Option } from 'effect'

import { LONGEST_STEP_S, stepBetween, stepSince } from './loop.ts'

describe('stepBetween', () => {
  it('steps 0 on the first frame of a burst', () => {
    assert.strictEqual(stepSince({ before: Option.none(), now: 5000 }), 0)
  })

  it('gives the seconds between frames', () => {
    assert.closeTo(stepBetween({ before: 1000, now: 1016 }), 0.016, 1e-12)
  })

  it('caps a long gap at the longest step', () => {
    assert.strictEqual(stepBetween({ before: 1000, now: 9000 }), LONGEST_STEP_S)
    assert.strictEqual(stepBetween({ before: 1000, now: 2000, longest: 0.1 }), 0.1)
  })

  it('steps from the last frame when there was one', () => {
    assert.closeTo(stepSince({ before: Option.some(1000), now: 1016 }), 0.016, 1e-12)
  })

  it('never steps backward', () => {
    assert.strictEqual(stepBetween({ before: 2000, now: 1000 }), 0)
  })
})

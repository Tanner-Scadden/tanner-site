import { assert, describe, it } from '@effect/vitest'

import { GOLD, INK, float, wgsl } from './palette.ts'

describe('palette', () => {
  it('gives a colour as 0 to 1 channels', () => {
    assert.deepStrictEqual(float(GOLD), [1, 209 / 255, 102 / 255])
    assert.deepStrictEqual(float(INK), [220 / 255, 235 / 255, 1])
  })

  it('writes a colour as WGSL', () => {
    assert.strictEqual(wgsl(GOLD), 'vec3f(255.0, 209.0, 102.0) / 255.0')
  })
})

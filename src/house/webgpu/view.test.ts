import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, String as Str } from 'effect'

import { DRAFT_MS, type Point, type Rect } from './house.ts'
import {
  LEVEL,
  LIFT_MS,
  type Tilt,
  cssTransform,
  fitFor,
  followTilt,
  liftOf,
  project,
  tiltToward,
  unproject,
  viewOf,
  wallHeight,
} from './view.ts'

const house: Rect = { x: 40, y: 40, w: 420, h: 285 }
const fit = fitFor(house)
const risen = (tilt: Tilt = LEVEL) => viewOf(house, { tilt, lift: 1, fit })
const flat = viewOf(house, { tilt: LEVEL, lift: 0, fit })

const close = (a: number, b: number, by = 1e-6) => assert.isAtMost(Math.abs(a - b), by)

const corners = (r: Rect, z: number) =>
  Arr.flatMap([r.x, r.x + r.w], x => Arr.map([r.y, r.y + r.h], y => ({ x, y, z })))

describe('liftOf', () => {
  it('waits for the drafting, then rises over LIFT_MS', () => {
    assert.strictEqual(liftOf({ since: DRAFT_MS / 2, still: false }), 0)
    assert.strictEqual(liftOf({ since: DRAFT_MS, still: false }), 0)
    close(liftOf({ since: DRAFT_MS + LIFT_MS / 2, still: false }), 0.5)
    assert.strictEqual(liftOf({ since: DRAFT_MS + LIFT_MS * 2, still: false }), 1)
  })

  it('is simply up when motion is reduced', () => {
    assert.strictEqual(liftOf({ since: 0, still: true }), 1)
  })
})

describe('viewOf', () => {
  it('leaves the plan exactly where it was while it lies flat', () => {
    for (const p of [{ x: 40, y: 40 }, { x: 250, y: 100 }, { x: 460, y: 325 }]) {
      const q = project(flat, { ...p, z: 0 })
      close(q.x, p.x)
      close(q.y, p.y)
      close(q.scale, 1)
    }
    assert.strictEqual(flat.height, 0)
  })

  it('stands the walls up, toward the top of the screen', () => {
    const view = risen()
    close(view.height, wallHeight(house))
    const foot = project(view, { x: 250, y: 200, z: 0 })
    const top = project(view, { x: 250, y: 200, z: view.height })
    assert.isBelow(top.y, foot.y - 5)
  })

  it('tips the back of the house away, so the front is nearer', () => {
    const view = risen()
    const back = project(view, { x: 250, y: house.y, z: 0 })
    const front = project(view, { x: 250, y: house.y + house.h, z: 0 })
    assert.isBelow(front.depth, back.depth)
    assert.isAbove(front.scale, back.scale)
    for (const p of [back, front]) {
      assert.isAbove(p.depth, 0)
      assert.isBelow(p.depth, 1)
    }
  })

  it('keeps the risen house in its footprint however the pointer leans it', () => {
    const leans: ReadonlyArray<Tilt> = [LEVEL, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }]
    for (const tilt of leans) {
      const view = risen(tilt)
      for (const p of [...corners(house, 0), ...corners(house, view.height)]) {
        const q = project(view, p)
        assert.isAtLeast(q.x, house.x - 11)
        assert.isAtMost(q.x, house.x + house.w + 11)
        assert.isAtLeast(q.y, house.y - 11)
        assert.isAtMost(q.y, house.y + house.h + 11)
      }
    }
  })
})

describe('unproject', () => {
  it('finds the spot on the floor under a point on the screen', () => {
    for (const view of [flat, risen(), risen({ x: 0.7, y: -0.4 })]) {
      for (const p of [{ x: 60, y: 70 }, { x: 300, y: 200 }, { x: 440, y: 310 }]) {
        const q = project(view, { ...p, z: 0 })
        const back = unproject(view, q)
        assert.isNotNull(back)
        close(back!.x, p.x, 1e-6)
        close(back!.y, p.y, 1e-6)
      }
    }
  })
})

describe('cssTransform', () => {
  // Applies a CSS matrix3d to a point in the element's own space.
  const applyCss = (css: string, { x, y }: Point): Point => {
    const inner = Str.slice('matrix3d('.length, -1)(css)
    const m = Arr.map(Str.split(',')(inner), Number)
    const w = m[3]! * x + m[7]! * y + m[15]!
    return { x: (m[0]! * x + m[4]! * y + m[12]!) / w, y: (m[1]! * x + m[5]! * y + m[13]!) / w }
  }

  it('moves the room links exactly where the GPU draws their floor', () => {
    const view = risen({ x: 0.3, y: 0.6 })
    const origin = { x: house.x, y: house.y }
    const css = cssTransform(view, origin)
    for (const p of [{ x: 0, y: 0 }, { x: 200, y: 120 }, { x: house.w, y: house.h }]) {
      const onScreen = project(view, { x: p.x + origin.x, y: p.y + origin.y, z: 0 })
      const moved = applyCss(css, p)
      close(moved.x + origin.x, onScreen.x, 1e-3)
      close(moved.y + origin.y, onScreen.y, 1e-3)
    }
  })
})

describe('leaning', () => {
  it('leans toward the pointer, and levels out without one', () => {
    assert.deepStrictEqual(tiltToward(null, house), LEVEL)
    const right = tiltToward({ x: house.x + house.w, y: house.y + house.h / 2 }, house)
    close(right.x, 1)
    close(right.y, 0)
    assert.deepStrictEqual(tiltToward({ x: 9999, y: -9999 }, house), { x: 1, y: -1 })
  })

  it('eases over and lands on the lean', () => {
    const to = { x: 1, y: -0.5 }
    let tilt = LEVEL
    tilt = followTilt(tilt, { to, dt: 1 / 60 })
    assert.isAbove(tilt.x, 0)
    assert.isBelow(tilt.x, 0.2)
    for (let i = 0; i < 240; i++) tilt = followTilt(tilt, { to, dt: 1 / 60 })
    assert.deepStrictEqual(tilt, to)
  })
})

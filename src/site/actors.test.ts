import { Router } from '@effect/ui'
import { assert, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { TestClock } from 'effect/testing'

import { THESES } from '#content/home'
import { RATTLES_SAYS, RATTLES_UPSET } from '#content/manor'
import type { EggId } from '#domain/Egg'

import { Gpu, GpuEvent, GpuState } from '../blueprint/machines/Gpu.ts'
import { Eggs, EggsEvent } from '../eggs/machines/Eggs.ts'
import { Horde, HordeEvent, zombiesOf } from '../horde/machines/Horde.ts'
import { Viewport } from '../horde/services/Viewport.ts'
import {
  CUT_OFF_LIMIT,
  Rattles,
  RattlesState,
  UPSET_MS,
  rattlesSays,
} from '../manor/machines/Rattles.ts'
import { SiteRoute, homeRoute, roomRoute } from '../routes.ts'
import { Thesis, ThesisEvent, thesisText } from '../thesis/machines/Thesis.ts'
import { ToastState, Toasts } from '../toast/machines/Toast.ts'
import { siteActors } from './actors.ts'
import { Keys, KeysEvent } from './machines/Keys.ts'
import { Page, PageEvent } from './machines/Page.ts'

// The site's actors as the app runs them, on an in-memory Router and a
// 1000px window with no frames: a test sends the frames it wants.
const site = (found: ReadonlyArray<EggId> = [], url = '/') =>
  siteActors({ found, reducedMotion: false, route: homeRoute }).pipe(
    Layer.provideMerge([
      Router.memory({ routes: SiteRoute, url }),
      Viewport.test(1000),
    ]),
  )

const toastSays = (text: string) =>
  Effect.gen(function* () {
    const toasts = yield* Toasts
    yield* toasts.waitFor(
      state => state._tag === 'Showing' && state.text === text,
    )
  })

it.layer(site(), { buildPerTest: true })('Eggs', it => {
  it.effect('an egg counts once and announces itself', () =>
    Effect.gen(function* () {
      const eggs = yield* Eggs
      yield* eggs.call(EggsEvent.Found({ egg: 'console' }))
      const again = yield* eggs.call(EggsEvent.Found({ egg: 'console' }))
      assert.isFalse(again.transitioned)
      const after = yield* eggs.snapshot
      assert.deepStrictEqual(after.found, ['console'])
      yield* toastSays('EGG FOUND: DEVTOOLS · 1/7')
    }),
  )

  it.effect('a toast goes away on its own', () =>
    Effect.gen(function* () {
      const eggs = yield* Eggs
      yield* eggs.call(EggsEvent.Found({ egg: 'print' }))
      yield* toastSays('EGG FOUND: PAPER COPY · 1/7')
      yield* TestClock.adjust('3 seconds')
      const toasts = yield* Toasts
      const hidden = yield* toasts.waitFor(state => state._tag === 'Hidden')
      // The dock on a hidden page keeps the last text to shrink it away.
      assert.deepStrictEqual(
        hidden,
        ToastState.Hidden({ last: 'EGG FOUND: PAPER COPY · 1/7' }),
      )
    }),
  )
})

it.layer(site(['manor', 'worlds', 'thesis', 'konami', 'console', 'print']))(
  'Eggs, one short',
  it => {
    it.effect('the last egg finds them all', () =>
      Effect.gen(function* () {
        const eggs = yield* Eggs
        const result = yield* eggs.call(EggsEvent.Found({ egg: 'gpu' }))
        assert.strictEqual(result.newState._tag, 'AllFound')
      }),
    )
  },
)

it.layer(site(), { buildPerTest: true })('Thesis', it => {
  it.effect(
    'simplifies down to one word, finds its egg, then starts over',
    () =>
      Effect.gen(function* () {
        const thesis = yield* Thesis
        const eggs = yield* Eggs
        yield* thesis.call(ThesisEvent.Clicked)
        yield* thesis.call(ThesisEvent.Clicked)
        const simple = yield* thesis.call(ThesisEvent.Clicked)
        assert.strictEqual(thesisText(simple.newState), 'Solved.')
        yield* eggs.waitFor(state => state.found.includes('thesis'))
        const over = yield* thesis.call(ThesisEvent.Clicked)
        assert.strictEqual(thesisText(over.newState), THESES[0])
      }),
  )
})

it.layer(site(), { buildPerTest: true })('Gpu', it => {
  it.effect('a click before WebGPU answers waits for it, then draws', () =>
    Effect.gen(function* () {
      const gpu = yield* Gpu
      const eggs = yield* Eggs
      yield* gpu.send(GpuEvent.Clicked)
      yield* gpu.send(GpuEvent.Started({ supported: true }))
      yield* gpu.waitFor(state => state._tag === 'Drafting')
      yield* eggs.waitFor(state => state.found.includes('gpu'))
      const down = yield* gpu.call(GpuEvent.Escaped)
      assert.strictEqual(down.newState._tag, 'Resting')
    }),
  )

  it.effect('an outbreak starts with patient zero, then keeps count', () =>
    Effect.gen(function* () {
      const gpu = yield* Gpu
      yield* gpu.call(GpuEvent.Started({ supported: true }))
      const on = yield* gpu.call(GpuEvent.Clicked)
      assert.deepStrictEqual(on.newState, GpuState.Drafting({ infected: 1 }))
      yield* gpu.call(GpuEvent.Counted({ infected: 42 }))
      const counted = yield* gpu.snapshot
      assert.deepStrictEqual(counted, GpuState.Drafting({ infected: 42 }))
      yield* gpu.call(GpuEvent.Clicked)
      // A count that lands after the pens go down changes nothing.
      const late = yield* gpu.call(GpuEvent.Counted({ infected: 7 }))
      assert.isFalse(late.transitioned)
      const again = yield* gpu.call(GpuEvent.Clicked)
      assert.deepStrictEqual(again.newState, GpuState.Drafting({ infected: 1 }))
    }),
  )

  it.effect('without WebGPU the egg still counts, and says why', () =>
    Effect.gen(function* () {
      const gpu = yield* Gpu
      yield* gpu.call(GpuEvent.Started({ supported: false }))
      yield* gpu.call(GpuEvent.Clicked)
      const toasts = yield* Toasts
      yield* toasts.waitFor(
        state =>
          state._tag === 'Showing' &&
          state.text === 'NO WEBGPU IN THIS BROWSER, BUT IT COUNTS',
      )
      const eggs = yield* Eggs
      const found = yield* eggs.snapshot
      assert.deepStrictEqual(found.found, ['gpu'])
    }),
  )
})

it.layer(site(), { buildPerTest: true })('Keys', it => {
  const konami = [
    'ArrowUp',
    'ArrowUp',
    'ArrowDown',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowLeft',
    'ArrowRight',
    'B',
    'a',
  ]

  it.effect('the Konami code sends the horde, and a click munches one', () =>
    Effect.gen(function* () {
      const keys = yield* Keys
      const horde = yield* Horde
      for (const key of konami) yield* keys.call(KeysEvent.Pressed({ key }))
      const marching = yield* horde.waitFor(state => state._tag === 'Marching')
      assert.strictEqual(zombiesOf(marching).length, 6)
      assert.strictEqual(zombiesOf(marching)[0]?.x, 1000)

      const munched = yield* horde.call(HordeEvent.Munched({ id: 0 }))
      assert.strictEqual(zombiesOf(munched.newState).length, 5)
      yield* toastSays('MUNCHED!')

      const walked = yield* horde.call(HordeEvent.Ticked({ delta: 100 }))
      for (const z of zombiesOf(walked.newState))
        assert.isBelow(z.x, 1000 + 5 * 90)
      const eggs = yield* Eggs
      const found = yield* eggs.snapshot
      assert.isTrue(found.found.includes('konami'))
    }),
  )

  it.effect('the horde leaves once it walks off the left edge', () =>
    Effect.gen(function* () {
      const horde = yield* Horde
      yield* horde.send(HordeEvent.Summoned)
      yield* horde.waitFor(state => state._tag === 'Marching')
      const gone = yield* horde.call(HordeEvent.Ticked({ delta: 1e9 }))
      // One long frame is capped, so it takes many to cross 1500px.
      assert.strictEqual(gone.newState._tag, 'Marching')
      for (let i = 0; i < 400; i++)
        yield* horde.send(HordeEvent.Ticked({ delta: 100 }))
      yield* horde.waitFor(state => state._tag === 'Gone')
    }),
  )

  it.effect('Escape puts the pens down before it leaves the page', () =>
    Effect.gen(function* () {
      const keys = yield* Keys
      const gpu = yield* Gpu
      const page = yield* Page
      yield* gpu.call(GpuEvent.Started({ supported: true }))
      yield* gpu.call(GpuEvent.Clicked)
      yield* keys.call(KeysEvent.Pressed({ key: 'Escape' }))
      const pens = yield* gpu.snapshot
      const where = yield* page.snapshot
      assert.strictEqual(pens._tag, 'Resting')
      assert.strictEqual(where._tag, 'Home')
    }),
  )

  it.effect(
    'typing rest on the front page goes to /rest and finds its egg',
    () =>
      Effect.gen(function* () {
        const keys = yield* Keys
        const page = yield* Page
        for (const key of ['r', 'e', 's', 't']) {
          yield* keys.call(KeysEvent.Pressed({ key }))
        }
        yield* page.waitFor(state => state._tag === 'Rest')
        const eggs = yield* Eggs
        yield* eggs.waitFor(state => state.found.includes('worlds'))
      }),
  )
})

const enter = (room: 'parlour' | 'trophy' | 'workshop') =>
  Effect.gen(function* () {
    const router = yield* Router.Router
    yield* router.push(roomRoute(room))
    // The Site root hands the Page each route the Router reports.
    const page = yield* Page
    yield* page.send(PageEvent.Navigated({ route: roomRoute(room) }))
    const rattles = yield* Rattles
    return yield* rattles.waitFor(
      state => state._tag !== 'Away' && state.room === room,
    )
  })

it.layer(site(), { buildPerTest: true })('Rattles', it => {
  it.effect('types the line out and stops', () =>
    Effect.gen(function* () {
      const typing = yield* enter('parlour')
      assert.strictEqual(typing._tag, 'Typing')
      yield* TestClock.adjust('10 seconds')
      const rattles = yield* Rattles
      const said = yield* rattles.waitFor(state => state._tag === 'Said')
      assert.strictEqual(rattlesSays(said), RATTLES_SAYS.parlour)
    }),
  )

  it.effect('cut off too many times, he gets upset, then calms down', () =>
    Effect.gen(function* () {
      const rooms = ['parlour', 'trophy', 'workshop', 'parlour'] as const
      let state: RattlesState = yield* enter(rooms[0])
      for (let n = 1; n <= CUT_OFF_LIMIT; n++) state = yield* enter(rooms[n]!)
      assert.deepStrictEqual(state, RattlesState.Upset({ room: 'parlour' }))
      assert.strictEqual(rattlesSays(state), RATTLES_UPSET)
      yield* TestClock.adjust(UPSET_MS)
      const rattles = yield* Rattles
      const calm = yield* rattles.waitFor(state => state._tag === 'Typing')
      assert.deepStrictEqual(
        calm,
        RattlesState.Typing({ room: 'parlour', shown: 0, cutOffs: 0 }),
      )
    }),
  )

  it.effect('letting him finish a line forgives the cut-offs', () =>
    Effect.gen(function* () {
      yield* enter('parlour')
      yield* enter('trophy')
      yield* TestClock.adjust('10 seconds')
      const rattles = yield* Rattles
      yield* rattles.waitFor(state => state._tag === 'Said')
      yield* enter('workshop')
      const state = yield* enter('parlour')
      assert.deepStrictEqual(
        state,
        RattlesState.Typing({ room: 'parlour', shown: 0, cutOffs: 1 }),
      )
    }),
  )
})

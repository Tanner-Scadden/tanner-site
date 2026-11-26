// @vitest-environment happy-dom
import { Router } from '@effect/ui'
import { HtmlPlay, TestGlobalEvents } from '@effect/ui/html/testing'
import { Locator, TestHost } from '@effect/ui/testing'
import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Layer } from 'effect'

import { RATTLES_SAYS } from './content'
import { EGG_HINTS, EGG_NAMES, type EggId } from './eggs'
import { Viewport } from './machines/Viewport'
import { FIRST_SEED, TURNS, nextSeed, runOf } from './replay'
import { SiteRoute, restRoute } from './routes'
import { Site } from './Site'

const propsFinding = (found: ReadonlyArray<EggId>) =>
  Effect.map(Router.currentRoute(SiteRoute), route => ({
    found,
    reducedMotion: true,
    route,
  }))
const siteProps = Effect.map(Router.currentRoute(SiteRoute), route => ({
  found: [] as ReadonlyArray<EggId>,
  reducedMotion: true,
  route,
}))

// NOTE: an actor stops on the scheduler it was spawned on, and TestHost's
// only runs inside `settle`. Unmounting the Site after a test waits on its
// actors stopping, so keep draining the scheduler for as long as the host
// lives, or the unmount never ends.
const drainWhileUnmounting = Layer.effectDiscard(
  Effect.gen(function* () {
    const host = yield* TestHost.TestHost
    yield* Effect.acquireRelease(
      // The test runs on TestClock, so an Effect schedule would never fire.
      // @effect-diagnostics-next-line globalTimersInEffect:off
      Effect.sync(() => setInterval(() => host.drain(host.budget), 1)),
      id => Effect.sync(() => clearInterval(id)),
    )
  }),
)

const playLayer = (url: string) =>
  Layer.mergeAll(
    Router.memory({ routes: SiteRoute, url }),
    Layer.provideMerge(drainWhileUnmounting, TestHost.layer()),
    TestGlobalEvents.layer,
    Viewport.test(1000),
  )

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

describe('Site routes', () => {
  it('every hidden page has its own URL', () => {
    assert.strictEqual(SiteRoute.print(SiteRoute.Manor()), '/manor')
    assert.strictEqual(
      SiteRoute.print(SiteRoute.ManorRoom({ params: { room: 'workshop' } })),
      '/manor/workshop',
    )
    assert.strictEqual(SiteRoute.print(restRoute), '/rest')
  })
})

it.layer(playLayer('/manor/trophy'), { buildPerTest: true })(
  'Site at /manor/trophy',
  it => {
    it.effect('a Manor room opens from its URL, and Escape goes home', () =>
      Effect.gen(function* () {
        const play = yield* HtmlPlay.make(Site, siteProps)
        yield* play.expect(Locator.text('YOU FOUND THE MANOR')).toExist()
        yield* play.expect(Locator.text(RATTLES_SAYS.trophy)).toExist()
        assert.strictEqual(
          play.root.head().title,
          'Trophy · The Manor · Tanner Scadden',
        )

        yield* TestGlobalEvents.fire('document', 'keydown', { key: 'Escape' })
        yield* TestHost.settle
        assert.strictEqual(play.root.model()?.page._tag, 'Home')
        assert.strictEqual(play.root.head().title, 'Tanner Scadden')
        // Landing on the Manor counted its egg.
        yield* play.expect(Locator.text('EGGS 1/7')).toExist()
      }).pipe(Effect.scoped),
    )
  },
)

it.layer(playLayer('/'), { buildPerTest: true })('Site at /', it => {
  it.effect('typing rest goes to /rest, and a pasted URL lands there', () =>
    Effect.gen(function* () {
      const play = yield* HtmlPlay.make(Site, siteProps)
      for (const key of ['r', 'e', 's', 't']) {
        yield* TestGlobalEvents.fire('document', 'keydown', { key })
      }
      yield* TestHost.settle
      assert.strictEqual(play.root.model()?.page._tag, 'Rest')
      yield* play.expect(Locator.text('GG, BACK TO WORK')).toExist()
    }).pipe(Effect.scoped),
  )

  it.effect(
    'the quest log hints at eggs still hidden, and names found ones',
    () =>
      Effect.gen(function* () {
        const play = yield* HtmlPlay.make(Site, propsFinding(['manor']))
        yield* play.expect(Locator.text('QUEST LOG · 1 OF 7 FOUND')).toExist()
        yield* play.expect(Locator.text(EGG_NAMES.manor)).toExist()
        yield* play.expect(Locator.text(EGG_HINTS.manor)).toBeAbsent()
        yield* play.expect(Locator.text(EGG_HINTS.worlds)).toExist()
      }).pipe(Effect.scoped),
  )
})

it.layer(playLayer('/blueprints/old'), { buildPerTest: true })(
  'Site at /blueprints/old',
  it => {
    it.effect('an unknown path shows the not found sheet', () =>
      Effect.gen(function* () {
        const play = yield* HtmlPlay.make(Site, siteProps)
        yield* play.expect(Locator.text('Sheet not found')).toExist()
        assert.strictEqual(play.root.head().title, 'Not found · Tanner Scadden')
      }).pipe(Effect.scoped),
    )
  },
)

// @vitest-environment happy-dom
import { Router } from '@effect/ui'
import { BrowserHost, BrowserRouter } from '@effect/ui/html'
import { HtmlLocator, HtmlPlay, TestGlobalEvents } from '@effect/ui/html/testing'
import { Locator, TestHost } from '@effect/ui/testing'
import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'

import { BLOG } from '#content/blog'
import { EGG_HINTS, EGG_NAMES } from '#content/eggs'
import { RATTLES_SAYS } from '#content/manor'
import { beSomeoneWorthCalling as firstPost } from '#content/posts/be-someone-worth-calling'
import type { EggId } from '#domain/Egg'

import { Viewport } from './horde/services/Viewport.ts'
import { SiteRoute, blogRoute, postRoute, restRoute } from './routes.ts'
import { Site } from './Site.ts'

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

// The blog search loads its in-page engine with `import()` (see
// SearchPosts.ts), and `settle` gives a Promise only a few macrotasks to come
// back, which Vite's module runner can take longer than. So a step that
// waits on a search tries again, a macrotask apart, for a while.
const macrotask = Effect.callback<void>(resume => {
  // The test runs on TestClock, so an Effect sleep would never wake.
  // @effect-diagnostics-next-line globalTimersInEffect:off
  const id = setTimeout(() => resume(Effect.void), 5)
  return Effect.sync(() => clearTimeout(id))
})

const eventually = <A, E, R>(step: Effect.Effect<A, E, R>, tries = 100): Effect.Effect<A, E, R> =>
  tries <= 1 ? step : Effect.catchCause(step, () => Effect.andThen(macrotask, eventually(step, tries - 1)))

const playLayer = (url: string) =>
  Layer.mergeAll(
    Router.memory({ routes: SiteRoute, url }),
    Layer.provideMerge(drainWhileUnmounting, TestHost.layer()),
    TestGlobalEvents.layer,
    Viewport.test(1000),
  )

describe('Site routes', () => {
  it('every hidden page has its own URL', () => {
    assert.strictEqual(SiteRoute.print(SiteRoute.Manor()), '/manor')
    assert.strictEqual(
      SiteRoute.print(SiteRoute.ManorRoom({ params: { room: 'workshop' } })),
      '/manor/workshop',
    )
    assert.strictEqual(SiteRoute.print(restRoute), '/rest')
    assert.strictEqual(SiteRoute.print(blogRoute), '/blog')
    assert.strictEqual(SiteRoute.print(postRoute(firstPost.slug)), '/blog/be-someone-worth-calling')
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
        // A hidden page docks the toast as the way back home.
        yield* play.expect(Locator.text('← BACK')).toExist()
        assert.strictEqual(
          play.root.head().title,
          'Trophy · The Manor · Tanner Scadden',
        )

        yield* TestGlobalEvents.fire('document', 'keydown', { key: 'Escape' })
        yield* TestHost.settle
        assert.strictEqual(play.root.model()?.page._tag, 'Home')
        assert.strictEqual(play.root.head().title, 'Tanner Scadden')
        // Landing on the Manor counted its egg.
        yield* play.expect(Locator.text('EGGS 1/8')).toExist()
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
        yield* play.expect(Locator.text('QUEST LOG · 1 OF 8 FOUND')).toExist()
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

it.layer(playLayer('/blog/be-someone-worth-calling'), { buildPerTest: true })(
  'Site at /blog/be-someone-worth-calling',
  it => {
    it.effect('a post opens from its URL, and Escape goes up to the index', () =>
      Effect.gen(function* () {
        const play = yield* HtmlPlay.make(Site, siteProps)
        yield* play.expect(Locator.text(firstPost.title)).toExist()
        yield* play.expect(Locator.text('SHEET B-01')).toExist()
        assert.strictEqual(
          play.root.head().title,
          `${firstPost.title} · Tanner Scadden`,
        )

        yield* TestGlobalEvents.fire('document', 'keydown', { key: 'Escape' })
        yield* TestHost.settle
        assert.strictEqual(play.root.model()?.page._tag, 'Blog')
        yield* play.expect(Locator.text(BLOG.title)).toExist()
        yield* play.expect(Locator.text(firstPost.summary)).toExist()
      }).pipe(Effect.scoped),
    )
  },
)

it.layer(playLayer('/blog'), { buildPerTest: true })('Site at /blog', it => {
  it.effect('the search narrows the posts by title and summary', () =>
    Effect.gen(function* () {
      const play = yield* HtmlPlay.make(Site, siteProps)
      yield* play.expect(Locator.text(firstPost.title)).toExist()
      yield* play.type(HtmlLocator.label('Search posts'), 'calling')
      yield* play.expect(Locator.text(firstPost.title)).toExist()
      yield* play.type(HtmlLocator.label('Search posts'), 'zzzz nothing')
      yield* eventually(play.expect(Locator.text(BLOG.noMatch)).toExist())
      // Punctuation alone isn't a search: every post shows.
      yield* play.type(HtmlLocator.label('Search posts'), '!?')
      yield* play.expect(Locator.text(firstPost.title)).toExist()
    }).pipe(Effect.scoped),
  )
})

it.layer(playLayer('/blog/no-such-post'), { buildPerTest: true })(
  'Site at /blog/no-such-post',
  it => {
    it.effect('a post that does not exist shows the not found sheet', () =>
      Effect.gen(function* () {
        const play = yield* HtmlPlay.make(Site, siteProps)
        yield* play.expect(Locator.text('Sheet not found')).toExist()
      }).pipe(Effect.scoped),
    )
  },
)

// The browser Router scrolls to the top once the root has the new route, so
// this mounts on the real host and Router rather than the test ones.
describe('Site in the browser', () => {
  it.live('a new page starts at the top', () =>
    Effect.gen(function* () {
      history.replaceState(null, '', '/')
      const container = document.body.appendChild(document.createElement('div'))
      yield* Layer.build(
        BrowserHost.mount(Site, siteProps, container).pipe(
          Layer.provide([BrowserRouter.layer({ routes: SiteRoute }), Viewport.test(1000)]),
        ),
      )
      yield* Effect.sleep('50 millis')
      window.scrollTo(0, 800)
      assert.strictEqual(window.scrollY, 800)

      for (const key of ['r', 'e', 's', 't']) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key }))
      }
      yield* Effect.sleep('50 millis')
      assert.strictEqual(location.pathname, '/rest')
      assert.include(container.textContent, 'GG, BACK TO WORK')
      assert.strictEqual(window.scrollY, 0)
    }).pipe(Effect.scoped),
  )
})

import { Router } from '@effect/ui'
import { BrowserHost, BrowserRouter } from '@effect/ui/html'
import { HtmlLocator, HtmlPlay, TestGlobalEvents } from '@effect/ui/html/testing'
import { Locator, TestHost } from '@effect/ui/testing'
import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Queue, Schedule, String as Str } from 'effect'
import { TestClock } from 'effect/testing'

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
const siteProps = propsFinding([])

const drainWhileUnmounting = Layer.effectDiscard(
  Effect.gen(function* () {
    const host = yield* TestHost.TestHost
    yield* Effect.forkScoped(
      TestClock.withLive(
        Effect.repeat(
          Effect.sync(() => host.drain(host.budget)),
          Schedule.spaced('1 millis'),
        ),
      ),
    )
  }),
)

const eventually = <A, E, R>(step: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  TestClock.withLive(
    Effect.retry(Effect.sandbox(step), { schedule: Schedule.spaced('5 millis'), times: 99 }),
  ).pipe(Effect.catch(Effect.failCause))

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
        yield* play.expect(Locator.text('← BACK')).toExist()
        assert.strictEqual(
          play.root.head().title,
          'Trophy · The Manor · Tanner Scadden',
        )

        yield* TestGlobalEvents.fire('document', 'keydown', { key: 'Escape' })
        yield* TestHost.settle
        assert.strictEqual(play.root.model()?.page._tag, 'Home')
        assert.strictEqual(play.root.head().title, 'Tanner Scadden')
        yield* play.expect(Locator.text('EGGS 1/9')).toExist()
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
        yield* play.expect(Locator.text('QUEST LOG · 1 OF 9 FOUND')).toExist()
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

const recordingScrolls = (onScroll: () => void): Window =>
  new Proxy(window, {
    get: (target, key) => {
      if (key === 'scrollTo') {
        return (x: number, y: number) => {
          onScroll()
          target.scrollTo(x, y)
        }
      }
      // oxlint-disable-next-line effect/noReflectGet -- BrowserRouter takes a whole Window, so this stand-in forwards every other member of the real one by key
      const member: unknown = Reflect.get(target, key, target)
      return member
    },
  })

const typeRest = Effect.sync(() => {
  for (const key of ['r', 'e', 's', 't']) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key }))
  }
})

const restIsOpen = Effect.sync(() => location.pathname).pipe(
  Effect.filterOrFail(
    path => path === '/rest',
    path => `still at ${path}`,
  ),
)

const typeRestUntilItOpens = typeRest.pipe(
  Effect.andThen(restIsOpen),
  Effect.retry({ schedule: Schedule.spaced('20 millis'), times: 150 }),
)

describe('Site in the browser', () => {
  it.live('a new page starts at the top', () =>
    Effect.gen(function* () {
      history.replaceState(history.state, '', '/')
      const container = document.body.appendChild(document.createElement('div'))
      const onRestWhenScrolled = yield* Queue.unbounded<boolean>()
      const routerWindow = recordingScrolls(() =>
        Queue.offerUnsafe(onRestWhenScrolled, Str.includes('GG, BACK TO WORK')(container.textContent)),
      )
      yield* Layer.build(
        BrowserHost.mount(Site, siteProps, container).pipe(
          Layer.provide([
            BrowserRouter.layer({ routes: SiteRoute, window: routerWindow }),
            Viewport.test(1000),
          ]),
        ),
      )
      window.scrollTo(0, 800)
      assert.strictEqual(window.scrollY, 800)

      yield* typeRestUntilItOpens
      const firstScroll = yield* Queue.take(onRestWhenScrolled)
      assert.isTrue(firstScroll)
      assert.strictEqual(location.pathname, '/rest')
      assert.strictEqual(window.scrollY, 0)
    }).pipe(Effect.scoped),
  )
})

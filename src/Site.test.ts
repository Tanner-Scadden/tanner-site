// @vitest-environment happy-dom
import { Component, Router } from '@effect/ui'
import {
  HtmlLocator,
  HtmlPlay,
  HtmlScene,
  TestGlobalEvents,
} from '@effect/ui/html/testing'
import { Locator, Story, TestHost } from '@effect/ui/testing'
import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Layer } from 'effect'

import { RATTLES_SAYS, THESES } from './content'
import { EGG_HINTS, EGG_NAMES, SaveEggs } from './eggs'
import { GpuBlueprint } from './gpu/Blueprint'
import { FIRST_SEED, TURNS, nextSeed, runOf } from './replay'
import { SiteRoute, homeRoute, restRoute } from './routes'
import { MeasureViewport, Site, SiteMessage, SiteNoDeps } from './Site'

const props = { found: [], reducedMotion: true, route: homeRoute }

describe('Site', () => {
  it.effect('arriving at the Manor finds its egg once', () =>
    Effect.gen(function* () {
      const s = yield* Story.make(SiteNoDeps, props)
      s.send(SiteMessage.ChangedRoute({ route: SiteRoute.Manor() }))
        .expectExact(SaveEggs)
      s.resolve(SaveEggs, Component.noop)
      assert.deepStrictEqual(s.model.found, ['manor'])
      assert.strictEqual(s.model.typed, RATTLES_SAYS.parlour.length)
      s.send(
        SiteMessage.ChangedRoute({
          route: SiteRoute.ManorRoom({ params: { room: 'trophy' } }),
        }),
      )
      assert.strictEqual(s.pending.length, 0)
      assert.strictEqual(s.model.typed, RATTLES_SAYS.trophy.length)
    }),
  )

  it.effect('opening /rest straight from its URL counts the egg', () =>
    Effect.gen(function* () {
      const s = yield* Story.make(SiteNoDeps, { ...props, route: restRoute })
      s.send(SiteMessage.Landed()).expectExact(SaveEggs)
      s.resolve(SaveEggs, Component.noop)
      assert.deepStrictEqual(s.model.found, ['worlds'])
    }),
  )

  it.effect('the thesis simplifies itself down to one word', () =>
    Effect.gen(function* () {
      const s = yield* Story.make(SiteNoDeps, props)
      s.send(SiteMessage.ClickedThesis())
      s.send(SiteMessage.ClickedThesis())
      assert.strictEqual(s.pending.length, 0)
      s.send(SiteMessage.ClickedThesis()).expectExact(SaveEggs)
      s.resolve(SaveEggs, Component.noop)
      assert.strictEqual(THESES[s.model.thesis], 'Solved.')
      assert.deepStrictEqual(s.model.found, ['thesis'])
    }),
  )

  it.effect('the Konami code sends the horde, and a click munches one', () =>
    Effect.gen(function* () {
      const s = yield* Story.make(SiteNoDeps, props)
      const keys = [
        'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
        'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
      ]
      for (const key of keys) s.send(SiteMessage.PressedKey({ key }))
      s.resolve(SaveEggs, Component.noop)
      s.resolve(
        MeasureViewport,
        SiteMessage.CompletedMeasureViewport({ width: 1000 }),
      )
      assert.strictEqual(s.model.zombies.length, 6)
      const first = s.model.zombies[0]!
      s.send(SiteMessage.ClickedZombie({ id: first.id }))
      assert.strictEqual(s.model.zombies.length, 5)
      s.send(SiteMessage.TickedFrame({ delta: 100 }))
      assert.isTrue(Arr.every(s.model.zombies, z => z.x < 1000 + 5 * 90))
    }),
  )

  it.effect('the Workshop replays a seed, and a new seed starts a new run', () =>
    Effect.gen(function* () {
      const s = yield* Story.make(SiteNoDeps, { ...props, reducedMotion: false })
      s.send(
        SiteMessage.ChangedRoute({
          route: SiteRoute.ManorRoom({ params: { room: 'workshop' } }),
        }),
      )
      s.resolve(SaveEggs, Component.noop)
      assert.strictEqual(s.model.turn, 0)
      for (let i = 0; i < TURNS + 5; i++) s.send(SiteMessage.TickedReplay())
      assert.strictEqual(s.model.turn, TURNS)
      s.send(SiteMessage.ClickedReplay())
      assert.strictEqual(s.model.seed, FIRST_SEED)
      assert.strictEqual(s.model.turn, 0)
      s.send(SiteMessage.ClickedNewSeed())
      assert.strictEqual(s.model.seed, nextSeed(FIRST_SEED))
      assert.strictEqual(s.model.turn, 0)
    }),
  )

  it.effect('devtools and printing count as eggs', () =>
    Effect.gen(function* () {
      const s = yield* Story.make(SiteNoDeps, props)
      s.send(SiteMessage.CalledHello()).expectExact(SaveEggs)
      s.resolve(SaveEggs, Component.noop)
      s.send(SiteMessage.StartedPrint()).expectExact(SaveEggs)
      s.resolve(SaveEggs, Component.noop)
      assert.deepStrictEqual(s.model.found, ['console', 'print'])
    }),
  )

})

it.layer(Router.memory({ routes: SiteRoute, url: '/' }), {
  buildPerTest: true,
})('Site with a Router', it => {
  it.effect('WebGPU in the footer turns the drafting pens on and off', () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(SiteNoDeps, props)
      s.expectMount(GpuBlueprint({ flow: false, still: true }))
        .mounted(GpuBlueprint, true)
        .click(HtmlLocator.role('button', { name: 'WebGPU' }))
        .expectExact(SaveEggs)
        .resolve(SaveEggs, Component.noop)
        .expectMount(GpuBlueprint({ flow: true, still: true }))
        .expect(Locator.text('EGG FOUND: DRAFTING PENS · 1/7'))
        .toExist()
        .fireDocument('keydown', { key: 'Escape' })
        .expectMount(GpuBlueprint({ flow: false, still: true }))
    }),
  )

  it.effect('without WebGPU the egg still counts, and says why', () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(SiteNoDeps, props)
      s.mounted(GpuBlueprint, false)
        .click(HtmlLocator.role('button', { name: 'WebGPU' }))
        .expectExact(SaveEggs)
        .resolve(SaveEggs, Component.noop)
        .expect(Locator.text('NO WEBGPU IN THIS BROWSER, BUT IT COUNTS'))
        .toExist()
    }),
  )

  it.effect('the quest log hints at eggs still hidden, and names found ones', () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(SiteNoDeps, {
        ...props,
        found: ['manor'],
      })
      s.mounted(GpuBlueprint, true)
        .expect(Locator.text('QUEST LOG · 1 OF 7 FOUND'))
        .toExist()
        .expect(Locator.text(EGG_NAMES.manor))
        .toExist()
        .expect(Locator.text(EGG_HINTS.manor))
        .toBeAbsent()
        .expect(Locator.text(EGG_HINTS.worlds))
        .toExist()
    }),
  )
})

const siteProps = Effect.map(Router.currentRoute(SiteRoute), route => ({
  found: [],
  reducedMotion: true,
  route,
}))

const playLayer = (url: string) =>
  Layer.mergeAll(
    Router.memory({ routes: SiteRoute, url }),
    TestHost.layer(),
    TestGlobalEvents.layer,
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

it.layer(playLayer('/manor/trophy'), { buildPerTest: true })('Site at /manor/trophy', it => {
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
      assert.strictEqual(play.root.model()?.route._tag, 'Home')
      assert.strictEqual(play.root.head().title, 'Tanner Scadden')
      // Landing on the Manor counted its egg.
      yield* play.expect(Locator.text('EGGS 1/7')).toExist()
    }).pipe(Effect.scoped),
  )
})

it.layer(playLayer('/'), { buildPerTest: true })('Site at /', it => {
  it.effect('typing rest goes to /rest, and a pasted URL lands there', () =>
    Effect.gen(function* () {
      const play = yield* HtmlPlay.make(Site, siteProps)
      for (const key of ['r', 'e', 's', 't']) {
        yield* TestGlobalEvents.fire('document', 'keydown', { key })
      }
      yield* TestHost.settle
      assert.strictEqual(play.root.model()?.route._tag, 'Rest')
      yield* play.expect(Locator.text('GG, BACK TO WORK')).toExist()
    }).pipe(Effect.scoped),
  )
})

it.layer(playLayer('/blueprints/old'), { buildPerTest: true })('Site at /blueprints/old', it => {
  it.effect('an unknown path shows the not found sheet', () =>
    Effect.gen(function* () {
      const play = yield* HtmlPlay.make(Site, siteProps)
      yield* play.expect(Locator.text('Sheet not found')).toExist()
      assert.strictEqual(play.root.head().title, 'Not found · Tanner Scadden')
    }).pipe(Effect.scoped),
  )
})

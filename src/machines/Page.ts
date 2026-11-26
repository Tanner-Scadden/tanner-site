import { Router } from '@effect/ui'
import { Context, Effect, Layer, Option, Schema, Stream } from 'effect'
import { Event, Machine, State } from 'effect-machine'

import { ROOMS } from '../content'
import { SiteRoute, homeRoute, restRoute } from '../routes'
import { type Actor, started } from './actor'
import { findEgg } from './Eggs'

// NOTE: the page being shown. The Router owns the URL: every page comes from
// a route it reports, and leaving a page is a push to the Router.
export const PageState = State({
  Home: {},
  Manor: { room: Schema.Literals(ROOMS) },
  Rest: {},
  NotFound: {},
})
export type PageState = typeof PageState.Type

export const PageEvent = Event({
  Navigated: { route: SiteRoute },
  Escaped: {},
  TypedRest: {},
})
export type PageEvent = typeof PageEvent.Type

export const pageOf = (route: SiteRoute): PageState =>
  SiteRoute.match(route, {
    Home: () => PageState.Home,
    Manor: () => PageState.Manor({ room: 'parlour' }),
    ManorRoom: ({ params }) => PageState.Manor({ room: params.room }),
    Rest: () => PageState.Rest,
    NotFound: () => PageState.NotFound,
  })

const goTo =
  (route: SiteRoute) =>
  ({ state }: { readonly state: PageState }) =>
    Effect.gen(function* () {
      const router = yield* Router.Router
      const outcome = yield* router.push(route)
      return outcome === 'navigated' ? pageOf(route) : state
    })

export const pageMachine = Machine.make({
  state: PageState,
  event: PageEvent,
  initial: (input: { readonly route: SiteRoute }) => pageOf(input.route),
})
  .onAny(PageEvent.Navigated, ({ event }) => pageOf(event.route))
  .on(
    [PageState.Manor, PageState.Rest, PageState.NotFound],
    PageEvent.Escaped,
    goTo(homeRoute),
  )
  .on(PageState.Home, PageEvent.TypedRest, goTo(restRoute))
  // Reaching the Manor or /rest finds its egg: by a link, a typed word, the
  // back button or a URL pasted in. Moving between rooms stays in Manor, so
  // it doesn't find it again.
  .spawn(PageState.Manor, () => findEgg('manor'), { name: 'findManorEgg' })
  .spawn(PageState.Rest, () => findEgg('worlds'), { name: 'findWorldsEgg' })
  .background(function followRouter({ self }) {
    return Effect.gen(function* () {
      const router = yield* Router.Router
      yield* Stream.runForEach(router.changes, location =>
        Option.match(SiteRoute.parse(location.url), {
          onNone: () => Effect.void,
          onSome: route => self.send(PageEvent.Navigated({ route })),
        }),
      )
    })
  })

export class Page extends Context.Service<
  Page,
  Actor<PageState, PageEvent>
>()('tanner-site/machines/Page') {
  static readonly layer = (route: SiteRoute) =>
    Layer.effect(this, started(Machine.spawn(pageMachine, { input: { route } })))
}

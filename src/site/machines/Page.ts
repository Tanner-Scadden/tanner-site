import { Router } from '@effect/ui'
import { Context, Effect, Layer, Option, Schema } from 'effect'
import { Event, Machine, State } from 'effect-machine'

import { RoomId } from '#domain/Room'

import { BLOG_OPEN, findPost } from '../../blog/posts.ts'
import { findEgg } from '../../eggs/machines/Eggs.ts'
import { type Actor, started } from '../../lib/actor.ts'
import { SiteRoute, blogRoute, homeRoute, restRoute } from '../../routes.ts'

// NOTE: the page being shown. The Router owns the URL: every page comes from
// a route it reports, and leaving a page is a push to the Router. The Site
// root hears each route (see `Router.subscription` in Site.ts) and hands it
// here as `Navigated`, so the browser Router can scroll and announce.
export const PageState = State({
  Home: {},
  Manor: { room: RoomId },
  Rest: {},
  Blog: {},
  Post: { slug: Schema.String },
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
    Blog: () => (BLOG_OPEN ? PageState.Blog : PageState.NotFound),
    // A slug with no post (or a draft, in a build) is a sheet not in the set.
    BlogPost: ({ params }) =>
      Option.isSome(findPost(params.slug))
        ? PageState.Post({ slug: params.slug })
        : PageState.NotFound,
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
    [PageState.Manor, PageState.Rest, PageState.Blog, PageState.NotFound],
    PageEvent.Escaped,
    goTo(homeRoute),
  )
  // Escape from a post goes up a level, to the index.
  .on(PageState.Post, PageEvent.Escaped, goTo(blogRoute))
  .on(PageState.Home, PageEvent.TypedRest, goTo(restRoute))
  // Reaching the Manor or /rest finds its egg: by a link, a typed word, the
  // back button or a URL pasted in. Moving between rooms stays in Manor, so
  // it doesn't find it again.
  .spawn(PageState.Manor, () => findEgg('manor'), { name: 'findManorEgg' })
  .spawn(PageState.Rest, () => findEgg('worlds'), { name: 'findWorldsEgg' })

export class Page extends Context.Service<
  Page,
  Actor<PageState, PageEvent>
>()('tanner-site/site/machines/Page') {
  static readonly layer = (route: SiteRoute) =>
    Layer.effect(this, started(Machine.spawn(pageMachine, { input: { route } })))
}

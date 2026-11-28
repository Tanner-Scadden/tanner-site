import { Router } from '@effect/ui'
import { Boolean as Bool, Context, Effect, Layer, Option, Schema } from 'effect'
import { Event, Machine, State } from 'effect-machine'

import { RoomId } from '#domain/Room'

import { BLOG_OPEN, findPost } from '../../blog/posts.ts'
import { findEgg } from '../../eggs/machines/Eggs.ts'
import { type Actor, started } from '../../lib/actor.ts'
import { SiteRoute, blogRoute, homeRoute, restRoute } from '../../routes.ts'

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
    Blog: () =>
      Bool.match(BLOG_OPEN, {
        onTrue: (): PageState => PageState.Blog,
        onFalse: () => PageState.NotFound,
      }),
    BlogPost: ({ params }) =>
      Option.match(findPost(params.slug), {
        onNone: (): PageState => PageState.NotFound,
        onSome: () => PageState.Post({ slug: params.slug }),
      }),
    NotFound: () => PageState.NotFound,
  })

const goTo =
  (route: SiteRoute) =>
  ({ state }: { readonly state: PageState }) =>
    Effect.gen(function* () {
      const router = yield* Router.Router
      const outcome = yield* router.push(route)
      if (outcome === 'navigated') return pageOf(route)
      return state
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
  .on(PageState.Post, PageEvent.Escaped, goTo(blogRoute))
  .on(PageState.Home, PageEvent.TypedRest, goTo(restRoute))
  .spawn(PageState.Manor, () => findEgg('manor'), { name: 'findManorEgg' })
  .spawn(PageState.Rest, () => findEgg('worlds'), { name: 'findWorldsEgg' })

export class Page extends Context.Service<
  Page,
  Actor<PageState, PageEvent>
>()('tanner-site/site/machines/Page') {
  static readonly layer = (route: SiteRoute) =>
    Layer.effect(this, started(Machine.spawn(pageMachine, { input: { route } })))
}

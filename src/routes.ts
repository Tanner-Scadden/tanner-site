import { Route } from '@effect/ui'
import { Schema } from 'effect'

import type { RoomId } from '#domain/Room'

export const SiteRoute = Route.union({
  Home: Route.make('/'),
  Manor: Route.make('/manor'),
  ManorRoom: Route.make('/manor/:room', {
    params: { room: Schema.Literals(['trophy', 'workshop']) },
  }),
  Rest: Route.make('/rest'),
  Blog: Route.make('/blog'),
  BlogPost: Route.make('/blog/:slug', { params: { slug: Schema.String } }),
  NotFound: Route.make('/*'),
})
export type SiteRoute = typeof SiteRoute.Type

export const homeRoute = SiteRoute.Home()
export const restRoute = SiteRoute.Rest()
export const blogRoute = SiteRoute.Blog()

export const postRoute = (slug: string): SiteRoute =>
  SiteRoute.BlogPost({ params: { slug } })

export const roomRoute = (room: RoomId): SiteRoute => {
  if (room === 'parlour') return SiteRoute.Manor()
  return SiteRoute.ManorRoom({ params: { room } })
}

export const href = (route: SiteRoute): string => SiteRoute.print(route)

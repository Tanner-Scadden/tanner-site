import { Route } from '@effect/ui'
import { Schema } from 'effect'

import type { RoomId } from './content'

// NOTE: the parlour is the Manor's front room, so it lives at /manor itself.
// Always build URLs with `SiteRoute.print`, never by hand.
export const SiteRoute = Route.union({
  Home: Route.make('/'),
  Manor: Route.make('/manor'),
  ManorRoom: Route.make('/manor/:room', {
    params: { room: Schema.Literals(['trophy', 'workshop']) },
  }),
  Rest: Route.make('/rest'),
  NotFound: Route.make('/*'),
})
export type SiteRoute = typeof SiteRoute.Type

export const homeRoute = SiteRoute.Home()
export const restRoute = SiteRoute.Rest()

export const roomRoute = (room: RoomId): SiteRoute =>
  room === 'parlour'
    ? SiteRoute.Manor()
    : SiteRoute.ManorRoom({ params: { room } })

export const roomOf = (route: SiteRoute): RoomId | null =>
  SiteRoute.match(route, {
    Home: () => null,
    Manor: () => 'parlour' as const,
    ManorRoom: ({ params }) => params.room,
    Rest: () => null,
    NotFound: () => null,
  })

export const href = (route: SiteRoute): string => SiteRoute.print(route)

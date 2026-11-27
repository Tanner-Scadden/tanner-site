import { Query } from '@effect/ui'
import { Duration, Effect, Layer, Schema } from 'effect'

import { Found } from './schema.ts'

export class SearchPosts extends Query.Service<SearchPosts>()('blog/SearchPosts', {
  args: { query: Schema.String },
  success: Schema.Array(Found),
  error: Schema.Never,
  // The posts don't change while the page is open, so a search stays good;
  // the limit only lets the strings typed on the way to it go.
  staleTime: Duration.minutes(5),
}) {}

const layerLocal = Layer.unwrap(
  Effect.promise(() => import('./SearchLocal.ts')).pipe(Effect.map(module => module.layerLocal)),
)

const layerWorker = Layer.unwrap(
  Effect.promise(() => import('./SearchWorker.ts')).pipe(Effect.map(module => module.layerWorker)),
)

export const SearchPostsLive: Layer.Layer<SearchPosts> = typeof Worker === 'undefined' ? layerLocal : layerWorker

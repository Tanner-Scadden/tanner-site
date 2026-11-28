import { Query } from '@effect/ui'
import { Boolean as Bool, Duration, Effect, Layer, Schema } from 'effect'

import { Found } from './schema.ts'

export class SearchPosts extends Query.Service<SearchPosts>()('blog/SearchPosts', {
  args: { query: Schema.String },
  success: Schema.Array(Found),
  error: Schema.Never,
  staleTime: Duration.minutes(5),
}) {}

const layerLocal = Layer.unwrap(
  Effect.promise(() => import('./SearchLocal.ts')).pipe(Effect.map(module => module.layerLocal)),
)

const layerWorker = Layer.unwrap(
  Effect.promise(() => import('./SearchWorker.ts')).pipe(Effect.map(module => module.layerWorker)),
)

export const SearchPostsLive: Layer.Layer<SearchPosts> = Bool.match(typeof Worker === 'undefined', {
  onTrue: () => layerLocal,
  onFalse: () => layerWorker,
})

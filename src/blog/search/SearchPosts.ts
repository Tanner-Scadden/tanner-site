import { Query } from '@effect/ui'
import { Duration, Effect, Layer, Schema } from 'effect'

import { Found } from './schema.ts'

// NOTE: the blog search, as a query the index page reads. In a browser it
// runs in a Web Worker: the worker starts when the blog index mounts, gets
// the posts' text, and builds the index there, so neither the build nor a
// search ever holds up typing. Where there's no Worker (tests, an old
// browser), or the worker can't start or stops answering, the same search
// runs on the page instead (see SearchLocal.ts), with the index built on the
// first search. Each way loads in a chunk of its own, so a browser only
// downloads the one it uses.

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

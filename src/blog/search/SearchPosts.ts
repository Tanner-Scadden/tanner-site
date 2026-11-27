import { Query } from '@effect/ui'
import { Duration, Effect, Layer, Schema } from 'effect'

import { POSTS } from '../posts.ts'
import { build } from './index.ts'
import { searchIndex } from './found.ts'
import { postDocs } from './posts.ts'
import { Found } from './schema.ts'

// NOTE: the blog search, as a query the index page reads. In a browser it
// runs in a Web Worker: the worker starts when the blog index mounts, gets
// the posts' text, and builds the index there, so neither the build nor a
// search ever holds up typing. Where there's no Worker (tests, an old
// browser), the same search runs on the page, with the index built on the
// first search.

export class SearchPosts extends Query.Service<SearchPosts>()('blog/SearchPosts', {
  args: { query: Schema.String },
  success: Schema.Array(Found),
  error: Schema.Never,
  // The posts don't change while the page is open.
  staleTime: Duration.infinity,
}) {}

// In the page's own thread.
const layerLocal = SearchPosts.toLayer(
  Effect.gen(function* () {
    const run = yield* Effect.cached(Effect.sync(() => searchIndex(build(postDocs(POSTS)))))
    return ({ query }) => Effect.map(run, search => search(query))
  }),
)

// In a worker, with the worker's client loaded in a chunk of its own.
const layerWorker = Layer.unwrap(
  Effect.promise(() => import('./SearchWorker.ts')).pipe(Effect.map(module => module.layerWorker)),
)

export const SearchPostsLive: Layer.Layer<SearchPosts> = typeof Worker === 'undefined' ? layerLocal : layerWorker

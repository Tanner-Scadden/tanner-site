import { Effect, type Layer } from 'effect'

import { POSTS } from '../posts.ts'
import { build } from './index.ts'
import { postDocs } from './posts.ts'
import type { Found } from './schema.ts'
import { searchIndex } from './search.ts'
import { SearchPosts } from './SearchPosts.ts'

// NOTE: the search on the page's own thread, where there's no worker or the
// worker failed. It loads in a chunk of its own, so a browser whose worker
// answers never downloads the engine twice. The index is built on the first
// search.

export const makeLocal: Effect.Effect<(query: string) => Effect.Effect<ReadonlyArray<Found>>> = Effect.map(
  Effect.cached(Effect.sync(() => searchIndex(build(postDocs(POSTS))))),
  run => query => Effect.map(run, search => search(query)),
)

export const layerLocal: Layer.Layer<SearchPosts> = SearchPosts.toLayer(
  Effect.map(makeLocal, search => ({ query }) => search(query)),
)

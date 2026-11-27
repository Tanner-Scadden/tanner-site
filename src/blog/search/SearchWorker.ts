import { BrowserWorker } from '@effect/platform-browser'
import { Effect, Layer } from 'effect'
import { RpcClient, RpcWorker } from 'effect/rpc'

import { POSTS } from '../posts.ts'
import { postDocs } from './posts.ts'
import { SearchRpcs } from './rpc.ts'
import { Docs } from './schema.ts'
import { SearchPosts } from './SearchPosts.ts'

// NOTE: `SearchPosts` answered by the search worker. This module, and the
// RPC client it brings, load only once the blog index mounts: see
// `SearchPostsLive`.
export const layerWorker: Layer.Layer<SearchPosts> = SearchPosts.toLayer(
  Effect.gen(function* () {
    const client = yield* RpcClient.make(SearchRpcs)
    return ({ query }) => client.Search({ query }).pipe(Effect.orDie)
  }),
).pipe(
  Layer.provide(RpcClient.layerProtocolWorker({ size: 1 })),
  Layer.provide(
    BrowserWorker.layer(() => new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })),
  ),
  Layer.provide(RpcWorker.layerInitialMessage(Docs, Effect.sync(() => postDocs(POSTS)))),
  Layer.orDie,
)

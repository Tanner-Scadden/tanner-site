import { BrowserWorker } from '@effect/platform-browser'
import { Duration, Effect, Layer, Ref } from 'effect'
import { RpcClient, RpcWorker } from 'effect/rpc'

import { POSTS } from '../posts.ts'
import { postDocs } from './posts.ts'
import { Docs, SearchRpcs } from './schema.ts'
import { SearchPosts } from './SearchPosts.ts'

// NOTE: `SearchPosts` answered by the search worker. This module, and the
// RPC client it brings, load only once the blog index mounts: see
// `SearchPostsLive`. If the worker can't start, fails, or takes longer than
// `TIMEOUT` to answer (its chunk 404s, a policy blocks it, it hangs), the
// search moves onto the page for good (see SearchLocal.ts), so the list
// never goes blank. The first answer includes building the index, which
// takes well under a second.

const TIMEOUT = Duration.seconds(3)

// The in-page search, loaded only if the worker fails.
const onPage = Effect.cached(
  Effect.promise(() => import('./SearchLocal.ts')).pipe(Effect.flatMap(module => module.makeLocal)),
)

const viaWorker = SearchPosts.toLayer(
  Effect.gen(function* () {
    const client = yield* RpcClient.make(SearchRpcs)
    const local = yield* onPage
    const failed = yield* Ref.make(false)
    const fallback = (query: string) => Effect.flatMap(local, search => search(query))
    return ({ query }) =>
      Effect.flatMap(Ref.get(failed), broken =>
        broken
          ? fallback(query)
          : client.Search({ query }).pipe(
              Effect.timeout(TIMEOUT),
              Effect.catchCause(cause =>
                Effect.logWarning('Search worker failed; searching on the page', cause).pipe(
                  Effect.andThen(Ref.set(failed, true)),
                  Effect.andThen(fallback(query)),
                ),
              ),
            ),
      )
  }),
).pipe(
  Layer.provide(RpcClient.layerProtocolWorker({ size: 1 })),
  Layer.provide(
    BrowserWorker.layer(() => new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })),
  ),
  Layer.provide(RpcWorker.layerInitialMessage(Docs, Effect.sync(() => postDocs(POSTS)))),
)

export const layerWorker: Layer.Layer<SearchPosts> = viaWorker.pipe(
  Layer.catchCause(cause =>
    Layer.unwrap(
      Effect.logWarning('Search worker didn’t start; searching on the page', cause).pipe(
        Effect.andThen(Effect.promise(() => import('./SearchLocal.ts'))),
        Effect.map(module => module.layerLocal),
      ),
    ),
  ),
)

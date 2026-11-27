import { BrowserRuntime, BrowserWorkerRunner } from '@effect/platform-browser'
import { Effect, Layer } from 'effect'
import { RpcServer, RpcWorker } from 'effect/rpc'

import { build } from './index.ts'
import { searchIndex } from './found.ts'
import { SearchRpcs } from './rpc.ts'
import { Docs } from './schema.ts'

// NOTE: the search worker. It takes the posts' text as its initial message,
// builds the index off the page's thread, and answers searches over RPC.

const Handlers = SearchRpcs.toLayer(
  Effect.gen(function* () {
    const docs = yield* RpcWorker.initialMessage(Docs)
    const started = performance.now()
    const run = searchIndex(build(docs))
    yield* Effect.logDebug(`Search index: ${docs.length} posts in ${(performance.now() - started).toFixed(1)}ms`)
    return { Search: ({ query }: { readonly query: string }) => Effect.sync(() => run(query)) }
  }).pipe(Effect.orDie),
)

const Main = RpcServer.layer(SearchRpcs).pipe(
  Layer.provide(Handlers),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(BrowserWorkerRunner.layer),
)

BrowserRuntime.runMain(Layer.launch(Main))

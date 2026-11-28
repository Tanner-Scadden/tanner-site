import { BrowserRuntime, BrowserWorkerRunner } from '@effect/platform-browser'
import { Clock, Effect, Layer } from 'effect'
import { RpcServer, RpcWorker } from 'effect/rpc'

import { build } from './index.ts'
import { Docs, SearchRpcs } from './schema.ts'
import { searchIndex } from './search.ts'

const Handlers = SearchRpcs.toLayer(
  Effect.gen(function* () {
    const docs = yield* RpcWorker.initialMessage(Docs)
    const started = yield* Clock.currentTimeNanos
    const run = searchIndex(build(docs))
    const built = yield* Clock.currentTimeNanos
    yield* Effect.logDebug(`Search index: ${docs.length} posts in ${(Number(built - started) / 1e6).toFixed(1)}ms`)
    return { Search: ({ query }: { readonly query: string }) => Effect.sync(() => run(query)) }
  }).pipe(Effect.orDie),
)

const Main = RpcServer.layer(SearchRpcs).pipe(
  Layer.provide(Handlers),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(BrowserWorkerRunner.layer),
)

BrowserRuntime.runMain(Layer.launch(Main))

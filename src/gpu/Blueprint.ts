import { Mount } from '@effect/ui'
import { Effect, Option, Queue, Schema, Stream } from 'effect'

import { type BlueprintRenderer, startBlueprint } from './renderer'

class GpuStartError extends Schema.TaggedError<
  GpuStartError,
  { readonly brand: unique symbol }
>()('GpuStartError', {
  reason: Schema.String,
}) {}

const start = (
  canvas: HTMLCanvasElement,
  settings: { readonly flow: boolean; readonly still: boolean },
): Effect.Effect<Option.Option<BlueprintRenderer>> =>
  Effect.orElseSucceed(
    Effect.map(
      Effect.tryPromise({
        try: () => startBlueprint(canvas, settings),
        catch: error => GpuStartError.make({ reason: String(error) }),
      }),
      Option.fromNullishOr,
    ),
    () => Option.none(),
  )

// NOTE: the live blueprint behind the page. It reports once whether WebGPU
// started, then follows the Model's settings for as long as the canvas is
// mounted. Without WebGPU the canvas stays empty and the CSS grid on body
// shows through, so the page looks the same, just still.
export const GpuBlueprint = Mount.makeStream(
  'GpuBlueprint',
  { args: { flow: Schema.Boolean, still: Schema.Boolean } },
  (canvas: HTMLCanvasElement, args, changes) =>
    Stream.callback<boolean>(queue =>
      Effect.gen(function* () {
        const renderer = yield* Effect.acquireRelease(
          start(canvas, args),
          maybe =>
            Effect.sync(() => {
              Option.map(maybe, r => r.destroy())
            }),
        )
        Queue.offerUnsafe(queue, Option.isSome(renderer))
        yield* Option.match(renderer, {
          onNone: () => Effect.void,
          onSome: r =>
            Effect.forkScoped(
              Stream.runForEach(changes, settings =>
                Effect.sync(() => r.update(settings)),
              ),
            ),
        })
      }),
    ),
)

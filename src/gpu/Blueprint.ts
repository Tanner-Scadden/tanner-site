import { Mount } from '@effect/ui'
import { Effect, Queue, Schema, Stream } from 'effect'

import { runBlueprint } from './renderer'

// NOTE: the live blueprint behind the page. It reports once whether WebGPU
// started, then follows the Model's settings for as long as the canvas is
// mounted; the mount's Scope owns every GPU object. Without WebGPU the canvas
// stays empty and the CSS grid on body shows through, so the page looks the
// same, just still.
export const GpuBlueprint = Mount.makeStream(
  'GpuBlueprint',
  { args: { flow: Schema.Boolean, still: Schema.Boolean } },
  (canvas: HTMLCanvasElement, args, changes) =>
    Stream.callback<boolean>(
      Effect.fnUntraced(function* (queue) {
        const started = yield* runBlueprint(canvas, args, changes).pipe(
          Effect.as(true),
          Effect.catchTag('GpuUnavailable', error =>
            Effect.as(Effect.logDebug('No WebGPU blueprint', error.reason), false),
          ),
        )
        Queue.offerUnsafe(queue, started)
      }),
    ),
)

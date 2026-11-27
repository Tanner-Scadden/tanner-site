import { Mount } from '@effect/ui'
import { Effect, Queue, Schema, Stream } from 'effect'

import { runHouseDrawing } from '../webgpu/renderer.ts'

export const HouseDrawing = Mount.makeStream(
  'HouseDrawing',
  { args: { still: Schema.Boolean } },
  (canvas: HTMLCanvasElement, args, changes) =>
    Stream.callback<void>(queue =>
      runHouseDrawing(canvas, args, changes, Effect.asVoid(Queue.offer(queue, undefined))).pipe(
        // The plan waits hidden while the GPU starts (see House.ts), so
        // without one it's handed back to CSS.
        Effect.catchTag('GpuUnavailable', error =>
          Effect.andThen(
            Effect.sync(() => {
              if (canvas.parentElement !== null) canvas.parentElement.dataset['gpu'] = 'off'
            }),
            Effect.logDebug('No WebGPU house drawing', error.reason),
          ),
        ),
      ),
    ),
)

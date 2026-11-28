import { Mount } from '@effect/ui'
import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { constVoid } from 'effect/Function'

import { runHouseDrawing } from '../webgpu/renderer.ts'

export const HouseDrawing = Mount.makeStream(
  'HouseDrawing',
  { args: { still: Schema.Boolean } },
  (canvas: HTMLCanvasElement, args, changes) =>
    Stream.callback<true>(queue =>
      runHouseDrawing(canvas, args, changes, Effect.asVoid(Queue.offer(queue, true))).pipe(
        Effect.catchTag('GpuUnavailable', error =>
          Effect.andThen(
            Effect.sync(() => {
              const parent = Option.fromNullishOr(canvas.parentElement)
              if (Option.isSome(parent)) parent.value.dataset['gpu'] = 'off'
            }),
            Effect.logDebug('No WebGPU house drawing', error.reason),
          ),
        ),
      ),
    ).pipe(Stream.map(constVoid)),
)

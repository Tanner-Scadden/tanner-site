import { Mount } from '@effect/ui'
import { Effect, Queue, Schema, Stream } from 'effect'

import { runHouseDrawing } from '../webgpu/renderer.ts'

// NOTE: the floor plan drawing, on a canvas inside the house figure. With
// WebGPU it drafts the walls and lets Teddy and Rain in, and without it the
// CSS walls stay, so the plan reads the same either way, just with nobody
// home. It reports each time Teddy starts playing with someone.
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

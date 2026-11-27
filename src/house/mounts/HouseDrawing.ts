import { Mount } from '@effect/ui'
import { Effect, Schema, Stream } from 'effect'

import { runHouseDrawing } from '../webgpu/renderer.ts'

// NOTE: the floor plan drawing, on a canvas inside the house figure. It has
// nothing to report: with WebGPU it drafts the walls and lets Teddy and Rain
// in, and without it the CSS walls stay, so the plan reads the same either
// way, just with nobody home.
export const HouseDrawing = Mount.makeStream(
  'HouseDrawing',
  { args: { still: Schema.Boolean } },
  (canvas: HTMLCanvasElement, args, changes) =>
    Stream.callback<never>(() =>
      runHouseDrawing(canvas, args, changes).pipe(
        Effect.catchTag('GpuUnavailable', error =>
          Effect.logDebug('No WebGPU house drawing', error.reason),
        ),
      ),
    ),
)

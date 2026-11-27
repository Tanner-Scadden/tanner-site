import { Mount } from '@effect/ui'
import { Effect, Schema, Stream } from 'effect'

import { runWorkDrawing } from '../webgpu/renderer.ts'

export const WorkDrawing = Mount.makeStream(
  'WorkDrawing',
  { args: { still: Schema.Boolean } },
  (canvas: HTMLCanvasElement, args, changes) =>
    Stream.callback<never>(() =>
      runWorkDrawing(canvas, args, changes).pipe(
        Effect.catchTag('GpuUnavailable', error =>
          Effect.logDebug('No WebGPU work drawing', error.reason),
        ),
      ),
    ),
)

import { Mount } from '@effect/ui'
import { Effect, Schema, Stream } from 'effect'

import { runWorkDrawing } from '../webgpu/renderer.ts'

// NOTE: the Selected Work drawing, on a canvas inside the job list. It has
// nothing to report: with WebGPU it takes over the box outlines, and without
// it the CSS borders stay, so the list reads the same either way.
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

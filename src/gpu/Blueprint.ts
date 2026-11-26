import { Mount } from '@effect/ui'
import { Effect, Queue, Schema, Stream } from 'effect'

import { runBlueprint } from './renderer'
import { runWorkDrawing } from './workRenderer'

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

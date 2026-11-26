import { Mount } from '@effect/ui'
import { Data, Effect, Queue, Schema, Stream } from 'effect'

import { runBlueprint } from '../webgpu/renderer.ts'

// What the blueprint tells the page: once whether WebGPU started, then how
// many pens are zombies while they run.
export type BlueprintReport = Data.TaggedEnum<{
  Started: { readonly supported: boolean }
  Infected: { readonly count: number }
}>
export const BlueprintReport = Data.taggedEnum<BlueprintReport>()

// NOTE: the live blueprint behind the page. It follows the Model's settings
// for as long as the canvas is mounted; the mount's Scope owns every GPU
// object. Without WebGPU the canvas stays empty and the CSS grid on body
// shows through, so the page looks the same, just still.
export const GpuBlueprint = Mount.makeStream(
  'GpuBlueprint',
  { args: { flow: Schema.Boolean, still: Schema.Boolean } },
  (canvas: HTMLCanvasElement, args, changes) =>
    Stream.callback<BlueprintReport>(
      Effect.fnUntraced(function* (queue) {
        const infected = (count: number) =>
          Effect.asVoid(Queue.offer(queue, BlueprintReport.Infected({ count })))
        const supported = yield* runBlueprint(canvas, args, changes, infected).pipe(
          Effect.as(true),
          Effect.catchTag('GpuUnavailable', error =>
            Effect.as(Effect.logDebug('No WebGPU blueprint', error.reason), false),
          ),
        )
        Queue.offerUnsafe(queue, BlueprintReport.Started({ supported }))
      }),
    ),
)

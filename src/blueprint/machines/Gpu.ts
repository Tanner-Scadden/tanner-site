import { Context, Effect, Layer, Schema } from 'effect'
import { Event, Machine, State } from 'effect-machine'

import { Eggs, EggsEvent, findEgg } from '../../eggs/machines/Eggs.ts'
import { FIRST_INFECTED } from '../webgpu/shaders.ts'
import { type Actor, started } from '../../lib/actor.ts'
import { TOAST_MS, ToastEvent, Toasts } from '../../toast/machines/Toast.ts'

// NOTE: the blueprint behind the page. It starts once, and from then on the
// drafting pens are either resting or drawing. While they draw, the page
// keeps count of how many are zombies.
export const GpuState = State({
  Starting: {},
  Unsupported: {},
  Resting: {},
  Drafting: { infected: Schema.Finite },
})
export type GpuState = typeof GpuState.Type

export const GpuEvent = Event({
  Started: { supported: Schema.Boolean },
  Clicked: {},
  Escaped: {},
  Counted: { infected: Schema.Finite },
})
export type GpuEvent = typeof GpuEvent.Type

export const gpuMachine = Machine.make({
  state: GpuState,
  event: GpuEvent,
  initial: GpuState.Starting,
})
  .on(GpuState.Starting, GpuEvent.Started, ({ event }) =>
    event.supported ? GpuState.Resting : GpuState.Unsupported,
  )
  // A click before WebGPU answers waits for the answer.
  .postpone(GpuState.Starting, GpuEvent.Clicked)
  .on(GpuState.Resting, GpuEvent.Clicked, () =>
    GpuState.Drafting({ infected: FIRST_INFECTED }),
  )
  .on(GpuState.Drafting, GpuEvent.Counted, ({ event }) =>
    GpuState.Drafting({ infected: event.infected }),
  )
  .on(GpuState.Drafting, GpuEvent.Clicked, () => GpuState.Resting)
  .on(GpuState.Drafting, GpuEvent.Escaped, () => GpuState.Resting)
  .spawn(GpuState.Drafting, () => findEgg('gpu'), { name: 'findGpuEgg' })
  // A browser without WebGPU still finds the egg, and is told why nothing
  // moved. The egg is counted first, so its toast is the one replaced.
  .on(GpuState.Unsupported, GpuEvent.Clicked, function explainNoWebGpu({ state }) {
    return Effect.gen(function* () {
      const eggs = yield* Eggs
      const toasts = yield* Toasts
      yield* eggs.call(EggsEvent.Found({ egg: 'gpu' }))
      yield* toasts.send(
        ToastEvent.Announced({
          text: 'NO WEBGPU IN THIS BROWSER, BUT IT COUNTS',
          ms: TOAST_MS,
        }),
      )
      return state
    })
  })

export class Gpu extends Context.Service<
  Gpu,
  Actor<GpuState, GpuEvent>
>()('tanner-site/blueprint/machines/Gpu') {
  static readonly layer = Layer.effect(this, started(Machine.spawn(gpuMachine)))
}

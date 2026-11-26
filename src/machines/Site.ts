import { Command, Component, UiSchema } from '@effect/ui'
import { Effect, Layer, Schema, Stream } from 'effect'

import type { EggId } from '../eggs'
import type { SiteRoute } from '../routes'
import { Eggs, EggsEvent, EggsState, eggsOf } from './Eggs'
import { Gpu, GpuEvent, GpuState, gpuMachine } from './Gpu'
import { Horde, HordeEvent, HordeState, hordeMachine } from './Horde'
import { Keys, KeysEvent } from './Keys'
import { Page, PageState, pageOf } from './Page'
import { Thesis, ThesisEvent, ThesisState, thesisMachine } from './Thesis'
import { ToastState, Toasts, toastMachine } from './Toast'

// NOTE: the site's state lives in one actor per concern. The Site component
// renders their snapshots side by side and reports what the user did; it
// holds no state of its own.

// What the page reports: the Site's messages, minus its own sync message.
export const siteInputs = {
  ClickedThesis: {},
  ClickedWebGpu: {},
  StartedGpu: { supported: Schema.Boolean },
  ClickedZombie: { id: Schema.Finite },
  PressedKey: { key: Schema.String },
  CalledHello: {},
  StartedPrint: {},
}
export const SiteInput = UiSchema.TaggedEnum(siteInputs)
export type SiteInput = typeof SiteInput.Type

export const SiteSnapshot = Schema.Struct({
  page: PageState,
  eggs: EggsState,
  thesis: ThesisState,
  gpu: GpuState,
  horde: HordeState,
  toast: ToastState,
})
export type SiteSnapshot = typeof SiteSnapshot.Type

export interface SiteSeed {
  readonly found: ReadonlyArray<EggId>
  readonly route: SiteRoute
}

// The snapshot the actors start in, so the first render matches them.
export const initialSnapshot = ({ found, route }: SiteSeed): SiteSnapshot => ({
  page: pageOf(route),
  eggs: eggsOf(found),
  thesis: thesisMachine.initial,
  gpu: gpuMachine.initial,
  horde: hordeMachine.initial,
  toast: toastMachine.initial,
})

// Each actor's stream starts with its current state, so this emits a whole
// snapshot at once and again on every write.
export const siteSnapshots = Stream.unwrap(
  Effect.gen(function* () {
    const page = yield* Page
    const eggs = yield* Eggs
    const thesis = yield* Thesis
    const gpu = yield* Gpu
    const horde = yield* Horde
    const toast = yield* Toasts
    return Stream.zipLatestAll(
      page.changes,
      eggs.changes,
      thesis.changes,
      gpu.changes,
      horde.changes,
      toast.changes,
    ).pipe(
      Stream.map(
        ([page, eggs, thesis, gpu, horde, toast]): SiteSnapshot => ({
          page,
          eggs,
          thesis,
          gpu,
          horde,
          toast,
        }),
      ),
    )
  }),
)

export class Dispatch extends Command.Service<Dispatch>()('site/Dispatch', {
  args: { input: SiteInput },
  success: Component.Noop,
}) {
  static readonly layer = this.toLayer(
    Effect.gen(function* () {
      const eggs = yield* Eggs
      const thesis = yield* Thesis
      const gpu = yield* Gpu
      const horde = yield* Horde
      const keys = yield* Keys
      return ({ input }: { readonly input: SiteInput }) =>
        SiteInput.match(input, {
          ClickedThesis: () => thesis.send(ThesisEvent.Clicked),
          ClickedWebGpu: () => gpu.send(GpuEvent.Clicked),
          StartedGpu: ({ supported }) => gpu.send(GpuEvent.Started({ supported })),
          ClickedZombie: ({ id }) => horde.send(HordeEvent.Munched({ id })),
          PressedKey: ({ key }) => keys.send(KeysEvent.Pressed({ key })),
          CalledHello: () => eggs.send(EggsEvent.Found({ egg: 'console' })),
          StartedPrint: () => eggs.send(EggsEvent.Found({ egg: 'print' })),
        }).pipe(Effect.as(Component.noop))
    }),
  )
}

// NOTE: the actors start in dependency order (toasts, then eggs, then the
// machines that find eggs, then the keyboard that drives them), and stop
// when the Site unmounts. The Router and the Viewport are the platform's.
export const siteActors = ({ found, route }: SiteSeed) => {
  const shared = Layer.provideMerge(Eggs.layer(found), Toasts.layer)
  const machines = Layer.provideMerge(
    Layer.mergeAll(Page.layer(route), Thesis.layer, Gpu.layer, Horde.layer),
    shared,
  )
  return Layer.provideMerge(Dispatch.layer, Layer.provideMerge(Keys.layer, machines))
}

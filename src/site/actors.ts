import { Effect, Layer, Schema, Stream } from 'effect'

import type { EggId } from '#domain/Egg'

import { Gpu, GpuState, gpuMachine } from '../blueprint/machines/Gpu.ts'
import { Eggs, EggsState, eggsOf } from '../eggs/machines/Eggs.ts'
import { Horde, HordeState, hordeMachine } from '../horde/machines/Horde.ts'
import type { SiteRoute } from '../routes.ts'
import { Thesis, ThesisState, thesisMachine } from '../thesis/machines/Thesis.ts'
import { ToastState, Toasts, toastMachine } from '../toast/machines/Toast.ts'
import { Keys } from './machines/Keys.ts'
import { Page, PageState, pageOf } from './machines/Page.ts'

// NOTE: the site's state lives in one actor per concern. The Site renders
// their snapshots side by side and reports what the user did; it holds no
// state of its own.

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

// NOTE: the actors start in dependency order (toasts, then eggs, then the
// machines that find eggs, then the keyboard that drives them), and stop
// when the Site unmounts. The Router and the Viewport are the platform's.
export const siteActors = ({ found, route }: SiteSeed) => {
  const shared = Layer.provideMerge(Eggs.layer(found), Toasts.layer)
  const machines = Layer.provideMerge(
    Layer.mergeAll(Page.layer(route), Thesis.layer, Gpu.layer, Horde.layer),
    shared,
  )
  return Layer.provideMerge(Keys.layer, machines)
}

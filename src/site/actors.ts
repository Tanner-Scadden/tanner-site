import { Effect, Layer, Schema, Stream } from 'effect'

import type { EggId } from '#domain/Egg'

import { Gpu, GpuState, gpuMachine } from '../blueprint/machines/Gpu.ts'
import { Eggs, EggsState, eggsOf } from '../eggs/machines/Eggs.ts'
import { Horde, HordeState, hordeMachine } from '../horde/machines/Horde.ts'
import { Rattles, RattlesState, rattlesOf } from '../manor/machines/Rattles.ts'
import type { SiteRoute } from '../routes.ts'
import { Thesis, ThesisState, thesisMachine } from '../thesis/machines/Thesis.ts'
import { ToastState, Toasts, toastMachine } from '../toast/machines/Toast.ts'
import { Keys } from './machines/Keys.ts'
import { Page, PageState, pageOf } from './machines/Page.ts'

export const SiteSnapshot = Schema.Struct({
  page: PageState,
  rattles: RattlesState,
  eggs: EggsState,
  thesis: ThesisState,
  gpu: GpuState,
  horde: HordeState,
  toast: ToastState,
})
export type SiteSnapshot = typeof SiteSnapshot.Type

export interface SiteSeed {
  readonly found: ReadonlyArray<EggId>
  readonly reducedMotion: boolean
  readonly route: SiteRoute
}

export const initialSnapshot = ({
  found,
  reducedMotion,
  route,
}: SiteSeed): SiteSnapshot => ({
  page: pageOf(route),
  rattles: rattlesOf({ reducedMotion, route }),
  eggs: eggsOf(found),
  thesis: thesisMachine.initial,
  gpu: gpuMachine.initial,
  horde: hordeMachine.initial,
  toast: toastMachine.initial,
})

export const siteSnapshots = Stream.unwrap(
  Effect.gen(function* () {
    const page = yield* Page
    const rattles = yield* Rattles
    const eggs = yield* Eggs
    const thesis = yield* Thesis
    const gpu = yield* Gpu
    const horde = yield* Horde
    const toast = yield* Toasts
    return Stream.zipLatestAll(
      page.changes,
      rattles.changes,
      eggs.changes,
      thesis.changes,
      gpu.changes,
      horde.changes,
      toast.changes,
    ).pipe(
      Stream.map(
        ([page, rattles, eggs, thesis, gpu, horde, toast]): SiteSnapshot => ({
          page,
          rattles,
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

export const siteActors = ({ found, reducedMotion, route }: SiteSeed) => {
  const shared = Layer.provideMerge(Eggs.layer(found), Toasts.layer)
  const machines = Layer.provideMerge(
    Layer.provideMerge(
      Rattles.layer({ reducedMotion, route }),
      Layer.mergeAll(Page.layer(route), Thesis.layer, Gpu.layer, Horde.layer),
    ),
    shared,
  )
  return Layer.provideMerge(Keys.layer, machines)
}

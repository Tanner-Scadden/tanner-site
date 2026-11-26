import { Mount } from '@effect/ui'
import type { Html } from '@effect/ui/html'

import type { GpuState } from '../machines/Gpu.ts'
import { GpuBlueprint } from '../mounts/GpuBlueprint.ts'

// The blueprint canvas behind every page. It reports once whether WebGPU
// started, draws while the pens are out, and counts the zombie pens.
export const Blueprint = <M>(
  h: Html.H<M>,
  options: {
    readonly gpu: GpuState
    readonly still: boolean
    readonly started: (supported: boolean) => M
    readonly infected: (count: number) => M
  },
) =>
  h.canvas
    .class('blueprint')
    .attr('aria-hidden', 'true')
    .onMount(
      GpuBlueprint({ flow: options.gpu._tag === 'Drafting', still: options.still }).pipe(
        Mount.map((report): M =>
          report._tag === 'Started'
            ? options.started(report.supported)
            : options.infected(report.count),
        ),
      ),
    )

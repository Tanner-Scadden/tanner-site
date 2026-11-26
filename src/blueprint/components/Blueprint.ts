import { Mount } from '@effect/ui'
import type { Html } from '@effect/ui/html'

import type { GpuState } from '../machines/Gpu.ts'
import { GpuBlueprint } from '../mounts/GpuBlueprint.ts'

// The blueprint canvas behind every page. It reports once whether WebGPU
// started, and draws while the pens are out.
export const Blueprint = <M>(
  h: Html.H<M>,
  options: {
    readonly gpu: GpuState
    readonly still: boolean
    readonly started: (supported: boolean) => M
  },
) =>
  h.canvas
    .class('blueprint')
    .attr('aria-hidden', 'true')
    .onMount(
      GpuBlueprint({ flow: options.gpu._tag === 'Drafting', still: options.still }).pipe(
        Mount.map(options.started),
      ),
    )

import { Mount } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'

import { sx } from '../../styles/sx.ts'
import { media } from '../../styles/tokens.stylex.ts'
import type { GpuState } from '../machines/Gpu.ts'
import { GpuBlueprint } from '../mounts/GpuBlueprint.ts'

// NOTE: WebGPU draws the grid behind the page. Until it starts, or without
// WebGPU, the canvas is empty and the body's CSS grid shows. The renderer
// marks a lost device with `data-gpu="lost"`.
const styles = stylex.create({
  canvas: {
    position: 'fixed',
    inset: 0,
    width: '100%',
    height: '100%',
    zIndex: -1,
    pointerEvents: 'none',
    display: { default: 'block', ':is([data-gpu="lost"])': 'none', [media.print]: 'none' },
  },
  hidden: { display: 'none' },
})

// The blueprint canvas behind every page. It reports once whether WebGPU
// started, draws while the pens are out, and counts the zombie pens.
export const Blueprint = <M>(
  h: Html.H<M>,
  options: {
    readonly gpu: GpuState
    readonly still: boolean
    readonly hidden: boolean
    readonly started: (supported: boolean) => M
    readonly infected: (count: number) => M
  },
) =>
  sx(h.canvas, styles.canvas, options.hidden && styles.hidden)
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

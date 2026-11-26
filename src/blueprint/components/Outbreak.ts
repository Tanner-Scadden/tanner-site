import type { Html } from '@effect/ui/html'

import type { GpuState } from '../machines/Gpu.ts'
import { PARTICLE_COUNT } from '../webgpu/shaders.ts'

// How bad the outbreak is, the way Munch Manor calls a wave.
const levelOf = (share: number): string =>
  share < 0.05 ? 'PATIENT ZERO' : share < 0.2 ? 'OUTBREAK' : share < 0.45 ? 'HORDE' : 'OVERRUN'

// NOTE: while the pens run, a wave call drops in (HERE THEY COME), then
// settles into a counter of the zombie pens. It's only for show, so screen
// readers skip it; the toast already says what happened.
export const Outbreak = <M>(h: Html.H<M>, gpu: GpuState) => {
  const infected = gpu._tag === 'Drafting' ? gpu.infected : 0
  const share = infected / PARTICLE_COUNT
  return h.div
    .class('outbreak', gpu._tag === 'Drafting' && 'on')
    .attr('aria-hidden', 'true')
    .children(
      h.div.class('call').children('HERE THEY COME'),
      h.div
        .class('tally')
        .children(
          h.span.class('level').children(levelOf(share)),
          h.span.class('what').children('INFECTED'),
          h.b.class('count').children(`${infected}/${PARTICLE_COUNT}`),
          h.span
            .class('bar')
            .attr('style', `--infected: ${share}`)
            .children(h.i()),
        ),
    )
}

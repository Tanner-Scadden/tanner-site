import type { Html } from '@effect/ui/html'

import { Sprite } from '#components/Sprite'

import { type RattlesState, rattlesSays } from '../machines/Rattles.ts'

const RATTLES_PX = 5.5

// Rattles' speech box. Upset, he shouts, so screen readers hear it at once.
export const RattlesBox = <M>(h: Html.H<M>, rattles: RattlesState) =>
  h.div
    .class('dlg', rattles._tag === 'Upset' && 'upset')
    .children(
      Sprite(h, 'rattles', RATTLES_PX),
      h.div(
        h.div.class('who').children('RATTLES'),
        h.div
          .class('txt')
          .attr('aria-live', rattles._tag === 'Upset' ? 'assertive' : 'polite')
          .children(rattlesSays(rattles)),
      ),
    )

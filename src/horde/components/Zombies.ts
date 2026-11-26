import type { Html } from '@effect/ui/html'
import { Array as Arr } from 'effect'

import { Sprite } from '#components/Sprite'

import type { Zombie } from '../machines/Horde.ts'

// The marching horde, each zombie a button that reports its munch.
export const Zombies = <M>(
  h: Html.H<M>,
  zombies: ReadonlyArray<Zombie>,
  munched: (id: number) => M,
) =>
  zombies.length > 0 &&
  h.div.class('horde').children(
    ...Arr.map(zombies, z =>
      h.button
        .key(String(z.id))
        .class('zombie')
        .attr('type', 'button')
        .attr('aria-label', 'Munch this zombie')
        .on('click', munched(z.id))
        .style({
          left: `${z.x}px`,
          transform: `translateY(${Math.sin(z.x / 8) * 2}px)`,
        })
        .children(Sprite(h, 'zombie', 3.5)),
    ),
  )

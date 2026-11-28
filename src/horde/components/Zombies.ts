import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr } from 'effect'

import { Sprite } from '#components/Sprite'

import { base } from '../../styles/base.ts'
import { sx } from '../../styles/sx.ts'
import { media } from '../../styles/tokens.stylex.ts'
import type { Zombie } from '../machines/Horde.ts'

const styles = stylex.create({
  horde: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
    pointerEvents: 'none',
    zIndex: 15,
    overflow: 'hidden',
    display: { [media.print]: 'none' },
  },
  zombie: (x: number) => ({
    position: 'absolute',
    bottom: 6,
    width: 56,
    height: 56,
    pointerEvents: 'auto',
    cursor: 'crosshair',
    left: `${x}px`,
    transform: `translateY(${Math.sin(x / 8) * 2}px)`,
  }),
})

export const Zombies = <M>(
  h: Html.H<M>,
  zombies: ReadonlyArray<Zombie>,
  munched: (id: number) => M,
) =>
  zombies.length > 0 &&
  sx(h.div, styles.horde).children(
    ...Arr.map(zombies, z =>
      sx(h.button.key(String(z.id)), base.button, styles.zombie(z.x))
        .attr('type', 'button')
        .attr('aria-label', 'Munch this zombie')
        .on('click', munched(z.id))
        .children(Sprite(h, 'zombie', 3.5)),
    ),
  )

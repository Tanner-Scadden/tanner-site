import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'

import { Sprite } from '#components/Sprite'

import { sx } from '../../styles/sx.ts'
import { fonts, manor, media } from '../../styles/tokens.stylex.ts'
import { type RattlesState, rattlesSays } from '../machines/Rattles.ts'

const RATTLES_PX = 5.5

const rattle = stylex.keyframes({
  '50%': { transform: 'translate(3px, -2px) rotate(.6deg)' },
})

const styles = stylex.create({
  box: {
    marginTop: 20,
    backgroundColor: manor.cream,
    color: manor.ink,
    borderWidth: 6,
    borderStyle: 'solid',
    borderColor: manor.ink,
    boxShadow: `6px 6px 0 ${manor.purple}`,
    display: 'flex',
    gap: { default: 16, [media.narrow]: 10 },
    padding: { default: 14, [media.narrow]: 12 },
    minHeight: 130,
  },
  // Cut off too many times, he shakes and shouts.
  upset: {
    backgroundColor: manor.red,
    color: manor.pale,
    boxShadow: `6px 6px 0 ${manor.ink}`,
    animationName: { default: rattle, [media.reducedMotion]: 'none' },
    animationDuration: '.12s',
    animationTimingFunction: 'steps(2, end)',
    animationIterationCount: 'infinite',
  },
  sprite: {
    transform: { default: null, [media.narrow]: 'scale(.6)' },
    transformOrigin: { default: null, [media.narrow]: 'top left' },
    marginRight: { default: null, [media.narrow]: -35 },
    marginBottom: { default: null, [media.narrow]: -35 },
  },
  who: { fontFamily: fonts.pixel, fontWeight: 700, fontSize: 12, color: manor.purple, lineHeight: 'normal' },
  whoUpset: { color: manor.ink },
  text: { fontSize: { default: 23, [media.narrow]: 21 } },
  textUpset: {
    fontFamily: fonts.pixel,
    lineHeight: 'normal',
    fontWeight: 700,
    fontSize: 'clamp(18px, 4vw, 30px)',
  },
})

// Rattles' speech box. Upset, he shouts, so screen readers hear it at once.
export const RattlesBox = <M>(h: Html.H<M>, rattles: RattlesState) => {
  const upset = rattles._tag === 'Upset'
  return sx(h.div, styles.box, upset && styles.upset).children(
    Sprite(h, 'rattles', RATTLES_PX, styles.sprite),
    h.div(
      sx(h.div, styles.who, upset && styles.whoUpset).children('RATTLES'),
      sx(h.div, styles.text, upset && styles.textUpset)
        .attr('aria-live', upset ? 'assertive' : 'polite')
        .children(rattlesSays(rattles)),
    ),
  )
}

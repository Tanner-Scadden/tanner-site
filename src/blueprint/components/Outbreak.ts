import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'

import { sx } from '../../styles/sx.ts'
import { arcade, blueprint, fonts, manor, media } from '../../styles/tokens.stylex.ts'
import type { GpuState } from '../machines/Gpu.ts'
import { PARTICLE_COUNT } from '../webgpu/shaders.ts'

const waveCall = stylex.keyframes({
  '0%': { opacity: 0, transform: 'scale(2.2)' },
  '10%': { opacity: 1, transform: 'scale(1)' },
  '13%': { transform: 'translate(-4px, 3px)' },
  '16%': { transform: 'translate(4px, -2px)' },
  '19%': { transform: 'translate(-3px, -2px)' },
  '22%': { transform: 'translate(2px, 2px)' },
  '25%, 78%': { opacity: 1, transform: 'none' },
  '100%': { opacity: 0, transform: 'translateY(-10vh) scale(.4)' },
})
const tallyIn = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(-8px)' },
  to: { opacity: 1, transform: 'none' },
})
const alarm = stylex.keyframes({
  from: { backgroundColor: arcade.alarm },
  to: { backgroundColor: arcade.alarmHi },
})

const styles = stylex.create({
  outbreak: {
    position: 'fixed',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 25,
    pointerEvents: 'none',
    display: { default: 'grid', [media.print]: 'none' },
    justifyItems: 'center',
    alignItems: 'start',
    fontFamily: fonts.pixel,
    opacity: 0,
    visibility: 'hidden',
    transitionProperty: 'opacity, visibility',
    transitionDuration: '.3s, 0s',
    transitionDelay: '0s, .3s',
  },
  on: {
    opacity: 1,
    visibility: 'visible',
    transitionProperty: 'opacity',
    transitionDuration: '.15s',
    transitionDelay: '0s',
  },
  // The call and the tally share one cell, one after the other.
  layer: { gridColumn: 1, gridRow: 1 },
  call: {
    fontFamily: fonts.pixel,
    fontWeight: 700,
    fontSize: 'clamp(24px, 6vw, 44px)',
    lineHeight: 1,
    color: manor.green,
    textShadow: `3px 3px 0 ${arcade.callShadow}, 6px 6px 0 ${blueprint.shadow}`,
    letterSpacing: '.04em',
    whiteSpace: 'nowrap',
    marginTop: '10vh',
    opacity: 0,
  },
  callOn: {
    animationName: { default: waveCall, [media.reducedMotion]: 'none' },
    animationDuration: '2.2s',
    animationTimingFunction: 'linear',
    animationFillMode: 'both',
  },
  tally: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    backgroundColor: arcade.panel,
    color: arcade.text,
    paddingBlock: 7,
    paddingInline: 10,
    boxShadow: `0 0 0 2px ${manor.green}, 4px 4px 0 2px ${manor.shadow}`,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    opacity: 0,
  },
  tallyOn: {
    opacity: { default: 0, [media.reducedMotion]: 1 },
    animationName: { default: tallyIn, [media.reducedMotion]: 'none' },
    animationDuration: '.25s',
    animationTimingFunction: 'steps(3, end)',
    animationDelay: '1.9s',
    animationFillMode: 'both',
  },
  level: { backgroundColor: arcade.alarm, color: arcade.screen, paddingBlock: 2, paddingInline: 6 },
  levelOn: {
    animationName: { default: alarm, [media.reducedMotion]: 'none' },
    animationDuration: '1s',
    animationTimingFunction: 'steps(2, jump-none)',
    animationDelay: '2.2s',
    animationIterationCount: 4,
  },
  what: { color: arcade.muted },
  count: { color: manor.green, minWidth: '6.4em' },
  bar: { width: 64, height: 8, backgroundColor: arcade.meter, boxShadow: `0 0 0 1px ${manor.shadow}` },
  fill: (share: number) => ({
    display: 'block',
    height: '100%',
    width: `${share * 100}%`,
    backgroundColor: manor.green,
    transitionProperty: 'width',
    transitionDuration: { default: '.25s', [media.reducedMotion]: '0s' },
    transitionTimingFunction: 'steps(3, end)',
  }),
})

// How bad the outbreak is, the way Munch Manor calls a wave.
const levelOf = (share: number): string =>
  share < 0.05 ? 'PATIENT ZERO' : share < 0.2 ? 'OUTBREAK' : share < 0.45 ? 'HORDE' : 'OVERRUN'

// NOTE: while the pens run, a wave call drops in (HERE THEY COME), then
// settles into a counter of the zombie pens. It's only for show, so screen
// readers skip it; the toast already says what happened.
export const Outbreak = <M>(h: Html.H<M>, gpu: GpuState) => {
  const on = gpu._tag === 'Drafting'
  const infected = on ? gpu.infected : 0
  const share = infected / PARTICLE_COUNT
  return sx(h.div, styles.outbreak, on && styles.on)
    .attr('aria-hidden', 'true')
    .children(
      sx(h.div, styles.layer, styles.call, on && styles.callOn).children('HERE THEY COME'),
      sx(h.div, styles.layer, styles.tally, on && styles.tallyOn).children(
        sx(h.span, styles.level, on && styles.levelOn).children(levelOf(share)),
        sx(h.span, styles.what).children('INFECTED'),
        sx(h.b, styles.count).children(`${infected}/${PARTICLE_COUNT}`),
        sx(h.span, styles.bar).children(sx(h.i, styles.fill(share))),
      ),
    )
}

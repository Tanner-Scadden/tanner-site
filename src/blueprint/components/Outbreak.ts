import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'

import { sx } from '../../styles/sx.ts'
import { fonts, manor, media } from '../../styles/tokens.stylex.ts'
import type { GpuState } from '../machines/Gpu.ts'
import { PARTICLE_COUNT } from '../webgpu/shaders.ts'

// The outbreak's own colors, from Munch Manor's HUD.
const HUD = {
  dark: '#1c1622',
  text: '#f4f1de',
  muted: '#b8c2b0',
  alarm: '#ff6b5e',
  alarmHi: '#ffe066',
  alarmText: '#140c10',
  barEmpty: '#24401a',
  callShadow: '#10240a',
}

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
  from: { backgroundColor: HUD.alarm },
  to: { backgroundColor: HUD.alarmHi },
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
    transition: 'opacity .3s, visibility 0s .3s',
  },
  on: { opacity: 1, visibility: 'visible', transition: 'opacity .15s' },
  layer: { gridArea: '1 / 1' },
  call: {
    fontFamily: fonts.pixel,
    fontWeight: 700,
    fontSize: 'clamp(24px, 6vw, 44px)',
    lineHeight: 1,
    color: manor.green,
    textShadow: `3px 3px 0 ${HUD.callShadow}, 6px 6px 0 rgba(0, 0, 0, .35)`,
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
    backgroundColor: HUD.dark,
    color: HUD.text,
    paddingBlock: 7,
    paddingInline: 10,
    boxShadow: `0 0 0 2px ${manor.green}, 4px 4px 0 2px #000`,
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
  level: { backgroundColor: HUD.alarm, color: HUD.alarmText, paddingBlock: 2, paddingInline: 6 },
  levelOn: {
    animationName: { default: alarm, [media.reducedMotion]: 'none' },
    animationDuration: '1s',
    animationTimingFunction: 'steps(2, jump-none)',
    animationDelay: '2.2s',
    animationIterationCount: 4,
  },
  what: { color: HUD.muted },
  count: { color: manor.green, minWidth: '6.4em' },
  bar: { width: 64, height: 8, backgroundColor: HUD.barEmpty, boxShadow: '0 0 0 1px #000' },
  fill: (share: number) => ({
    display: 'block',
    height: '100%',
    width: `${share * 100}%`,
    backgroundColor: manor.green,
    transition: { default: 'width .25s steps(3, end)', [media.reducedMotion]: 'none' },
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

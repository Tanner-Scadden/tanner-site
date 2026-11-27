import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'

import { homeRoute, href } from '../../routes.ts'
import { sx } from '../../styles/sx.ts'
import { blueprint, fonts, manor, media, rest } from '../../styles/tokens.stylex.ts'
import type { ToastState } from '../machines/Toast.ts'

const PAPER = '#0f3b78'

const styles = stylex.create({
  toast: {
    position: 'fixed',
    left: '50%',
    bottom: 24,
    transform: 'translateX(-50%) translateY(20px)',
    opacity: 0,
    backgroundColor: blueprint.hi,
    color: PAPER,
    fontFamily: fonts.mono,
    lineHeight: 'normal',
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: '.1em',
    paddingBlock: 10,
    paddingInline: 16,
    zIndex: 30,
    transition: '.25s',
    pointerEvents: 'none',
    maxWidth: 'calc(100vw - 32px)',
    display: { default: null, [media.print]: 'none' },
  },
  on: { opacity: 1, transform: 'translateX(-50%)' },
  // The dock: the toast on a hidden page, which turns into the way home.
  dock: {
    pointerEvents: 'auto',
    cursor: 'pointer',
    textDecoration: 'none',
    display: { default: 'grid', [media.print]: 'none' },
    justifyItems: 'center',
    backgroundColor: PAPER,
    color: blueprint.hi,
    boxShadow: `0 0 0 2px ${blueprint.hi}, 0 8px 24px rgba(0, 0, 0, .35)`,
    transform: {
      default: 'translateX(-50%)',
      ':hover': 'translateX(-50%) translateY(-2px)',
      ':focus-visible': 'translateX(-50%) translateY(-2px)',
    },
    outline: { default: null, ':focus-visible': '2px solid #fff' },
    outlineOffset: { default: null, ':focus-visible': 3 },
    transitionProperty: 'background-color, color, box-shadow, opacity, transform',
    transitionDuration: { default: '.3s, .3s, .3s, .25s, .25s', [media.reducedMotion]: '0s' },
    transitionDelay: '.2s, .2s, .2s, 0s, 0s',
  },
  news: {
    backgroundColor: blueprint.hi,
    color: PAPER,
    pointerEvents: 'none',
    transitionDelay: '0s',
  },
  manor: {
    backgroundColor: manor.green,
    color: manor.ink,
    boxShadow: '4px 4px 0 #000',
  },
  rest: {
    backgroundColor: rest.red,
    color: rest.night,
    boxShadow: '0 8px 24px rgba(0, 0, 0, .5)',
  },
  text: {
    gridArea: '1 / 1',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    transitionProperty: 'opacity, transform',
    transitionDuration: { default: '.2s', [media.reducedMotion]: '0s' },
  },
  // NOTE: the pill shrinks to fit BACK as the news slides out: the news
  // text's max-width is what eases, so the pill's width follows it.
  newsText: {
    opacity: 0,
    transform: 'translateY(6px)',
    maxWidth: 0,
    transitionProperty: 'opacity, transform, max-width',
    transitionDuration: { default: '.2s, .2s, .5s', [media.reducedMotion]: '0s' },
    transitionTimingFunction: 'ease, ease, cubic-bezier(.2, 0, .2, 1)',
    transitionDelay: '0s, 0s, .1s',
  },
  // The news text's own width: exactly this many characters.
  newsTextOn: (chars: number) => ({
    opacity: 1,
    transform: 'none',
    maxWidth: `min(calc(${chars} * (1ch + .1em)), calc(100vw - 64px))`,
  }),
  backText: { transitionDelay: '.3s' },
  backTextOff: { opacity: 0, transform: 'translateY(-6px)', transitionDelay: '0s' },
  manorBack: { fontFamily: fonts.pixel },
})

// The front page's toast: it shows while there is news, then fades.
export const Toast = <M>(h: Html.H<M>, toast: ToastState) =>
  sx(h.div, styles.toast, toast._tag === 'Showing' && styles.on)
    .attr('role', 'status')
    .children(toast._tag === 'Showing' ? toast.text : '')

// NOTE: on a hidden page the toast never leaves. It floats at the bottom as
// the way home, and shows the latest news (like EGG FOUND) while there is
// some, then turns back into BACK, in the room's own colors.
export const Dock = <M>(
  h: Html.H<M>,
  toast: ToastState,
  room: 'blueprint' | 'manor' | 'rest',
) => {
  const news = toast._tag === 'Showing'
  const text = news ? toast.text : toast.last
  return sx(
    h.a,
    styles.toast,
    styles.on,
    styles.dock,
    !news && room === 'manor' && styles.manor,
    !news && room === 'rest' && styles.rest,
    news && styles.news,
  )
    .attrs({ href: href(homeRoute), 'aria-label': 'Back to the front page' })
    .children(
      sx(h.span, styles.text, styles.newsText, news && styles.newsTextOn(text.length))
        .attr('role', 'status')
        .children(text),
      sx(
        h.span,
        styles.text,
        styles.backText,
        room === 'manor' && styles.manorBack,
        news && styles.backTextOff,
      )
        .attr('aria-hidden', 'true')
        .children('← BACK'),
    )
}

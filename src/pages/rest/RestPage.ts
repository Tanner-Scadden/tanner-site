import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr } from 'effect'

import { REST_FACTS, SHOTS } from '#content/rest'

import { homeRoute, href } from '../../routes.ts'
import { sx } from '../../styles/sx.ts'
import { fonts, media, rest, widths } from '../../styles/tokens.stylex.ts'

const styles = stylex.create({
  page: {
    display: 'block',
    minHeight: stylex.firstThatWorks('100dvh', '100vh'),
    backgroundColor: rest.night,
    color: rest.text,
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 1.5,
  },
  wrap: {
    maxWidth: 1040,
    marginInline: 'auto',
    paddingTop: 28,
    paddingInline: 20,
    paddingBottom: 96,
  },
  bar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    fontFamily: fonts.mono,
    lineHeight: 'normal',
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: '.16em',
    color: rest.muted,
  },
  back: {
    cursor: 'pointer',
    textDecoration: 'none',
    color: rest.night,
    backgroundColor: rest.red,
    paddingBlock: 8,
    paddingInline: 14,
    outlineColor: { default: null, ':focus-visible': rest.white },
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: 900,
    fontSize: 'clamp(56px, 12vw, 140px)',
    lineHeight: 0.85,
    fontStretch: widths.widest,
    marginTop: 26,
    marginBottom: 6,
    backgroundImage: `linear-gradient(180deg, ${rest.white} 30%, ${rest.steel})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
  },
  sub: {
    color: rest.muted,
    fontFamily: fonts.mono,
    lineHeight: 'normal',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: '.14em',
    marginBottom: 28,
  },
  fact: { whiteSpace: 'nowrap' },
  shots: {
    display: 'grid',
    gridTemplateColumns: { default: 'repeat(6, 1fr)', [media.narrow]: '1fr 1fr' },
    gap: 10,
  },
  shot: {
    position: 'relative',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: rest.edge,
    backgroundColor: rest.card,
    aspectRatio: '4 / 3',
    overflow: 'hidden',
  },
  photo: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center 25%',
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBlock: 10,
    paddingInline: 12,
    backgroundImage: `linear-gradient(transparent, ${rest.shade})`,
    fontFamily: fonts.mono,
    lineHeight: 'normal',
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: '.12em',
  },
  when: { display: 'block', color: rest.gold, fontSize: 10 },
})

// How much of the gallery each shot takes.
const sizes = stylex.create({
  big: {
    gridColumn: { default: 'span 4', [media.narrow]: 'span 2' },
    gridRow: 'span 2',
    aspectRatio: { default: 'auto', [media.narrow]: '4 / 3' },
  },
  mid: { gridColumn: 'span 2' },
  full: { gridColumn: { default: 'span 6', [media.narrow]: 'span 2' }, aspectRatio: '16 / 9' },
})

// NOTE: /rest, the playing days. The gallery shows only shots with a photo.
export const RestPage = <M>(h: Html.H<M>) =>
  sx(h.main, styles.page)
    .attr('aria-label', 'Playing days')
    .children(
      sx(h.div, styles.wrap).children(
        sx(h.div, styles.bar).children(
          h.span('REPLAY · 2018 → 2022'),
          sx(h.a, styles.back).attr('href', href(homeRoute)).children('GG, BACK TO WORK'),
        ),
        sx(h.h1, styles.title).children('REST'),
        sx(h.div, styles.sub).children(
          ...Arr.flatMap(REST_FACTS, (fact, i) => [
            i > 0 && ' ',
            sx(h.span, styles.fact).children(i < REST_FACTS.length - 1 ? `${fact} ·` : fact),
          ]),
        ),
        sx(h.div, styles.shots).children(
          ...Arr.flatMap(SHOTS, shot =>
            shot.photo === undefined
              ? []
              : [
                  sx(h.figure, styles.shot, sizes[shot.size]).children(
                    sx(h.img, styles.photo).attrs({
                      src: `/${shot.photo}`,
                      alt: `${shot.title}, ${shot.when}`,
                      loading: 'lazy',
                    }),
                    sx(h.figcaption, styles.caption).children(
                      sx(h.span, styles.when).children(shot.when),
                      shot.title,
                    ),
                  ),
                ],
          ),
        ),
      ),
    )

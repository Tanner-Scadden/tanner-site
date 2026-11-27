import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'

import { sx } from '../styles/sx.ts'
import { blueprint, fonts, media, widths } from '../styles/tokens.stylex.ts'

// NOTE: the drawing sheet the blueprint pages sit on: its border, its title
// block and its sections. The front page and the 404 page share them.
export const sheet = stylex.create({
  sheet: {
    maxWidth: { default: 1080, [media.print]: 'none' },
    marginBlock: { default: 20, [media.print]: 0 },
    marginInline: { default: 'auto', [media.sheetScreen]: 16, [media.print]: 0 },
    borderWidth: 2,
    borderStyle: { default: 'solid', [media.print]: 'none' },
    borderColor: blueprint.line,
    outlineWidth: 1,
    outlineStyle: { default: 'solid', [media.print]: 'none' },
    outlineColor: blueprint.line,
    outlineOffset: 6,
  },
  hero: {
    paddingTop: { default: 72, [media.narrowScreen]: 36, [media.print]: 12 },
    paddingBottom: { default: 56, [media.narrowScreen]: 36, [media.print]: 12 },
    paddingInline: { default: 40, [media.narrowScreen]: 20, [media.print]: 0 },
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: blueprint.rule,
  },
  // The last block on a sheet: the sheet's own border closes it.
  last: { borderBottomStyle: 'none' },
  title: {
    fontFamily: fonts.display,
    fontWeight: 900,
    fontSize: { default: 'clamp(36px, 7vw, 84px)', [media.print]: 36 },
    lineHeight: 0.95,
    fontStretch: widths.widest,
    textTransform: 'uppercase',
  },
  role: {
    fontFamily: fonts.display,
    fontWeight: 800,
    fontSize: 'clamp(18px, 2.6vw, 28px)',
    lineHeight: 1.2,
    fontStretch: widths.semi,
    textTransform: 'uppercase',
    color: blueprint.dim,
    marginTop: 14,
  },
  // Body copy in a section.
  prose: { color: blueprint.dim, maxWidth: 640, marginBottom: 14 },
})

const styles = stylex.create({
  section: {
    paddingBlock: { default: 44, [media.narrowScreen]: 36, [media.print]: 16 },
    paddingInline: { default: 40, [media.narrowScreen]: 20, [media.print]: 0 },
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: blueprint.rule,
    breakInside: { default: null, [media.print]: 'avoid' },
  },
  callout: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 26,
    fontFamily: fonts.mono,
    fontWeight: 400,
    fontSize: 13,
    lineHeight: 1,
    letterSpacing: '.18em',
    color: blueprint.line,
  },
  bubble: {
    display: 'inline-grid',
    placeItems: 'center',
    flexGrow: 0,
    flexShrink: 0,
    width: 30,
    height: 30,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: blueprint.line,
    borderRadius: '50%',
    fontStyle: 'normal',
    fontSize: 12,
    letterSpacing: 0,
    color: blueprint.hi,
  },
  leader: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 24,
    position: 'relative',
    height: 1,
    backgroundColor: blueprint.dim,
    // The tick at the end of the leader.
    '::after': {
      content: '""',
      position: 'absolute',
      right: 0,
      top: -4,
      width: 1,
      height: 9,
      backgroundColor: blueprint.dim,
    },
  },
})

// A section of the sheet. Its callout goes first.
export const Section = <M>(h: Html.H<M>, id: string) =>
  sx(h.section, styles.section).attr('id', id)

// NOTE: a section heading drawn like a drawing callout: a numbered bubble,
// the title, and a leader line out to a tick at the sheet edge.
export const Callout = <M>(h: Html.H<M>, n: number, text: string) =>
  sx(h.h2, styles.callout).children(
    sx(h.i, styles.bubble).attr('aria-hidden', 'true').children(String(n)),
    text,
    sx(h.span, styles.leader).attr('aria-hidden', 'true'),
  )

import * as stylex from '@stylexjs/stylex'

import { blueprint, fonts, media } from '../styles/tokens.stylex.ts'

// NOTE: the drawing sheet the blueprint pages sit on, and its title block.
// The front page and the 404 page share them.
export const sheet = stylex.create({
  sheet: {
    maxWidth: { default: 1080, [media.print]: 'none' },
    marginBlock: { default: 20, [media.print]: 0 },
    marginInline: { default: 'auto', [media.sheet]: 16, [media.print]: 0 },
    borderWidth: 2,
    borderStyle: { default: 'solid', [media.print]: 'none' },
    borderColor: blueprint.line,
    outlineWidth: 1,
    outlineStyle: { default: 'solid', [media.print]: 'none' },
    outlineColor: blueprint.line,
    outlineOffset: 6,
  },
  hero: {
    paddingTop: { default: 72, [media.narrow]: 36, [media.print]: 12 },
    paddingBottom: { default: 56, [media.narrow]: 36, [media.print]: 12 },
    paddingInline: { default: 40, [media.narrow]: 20, [media.print]: 0 },
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
    fontStretch: '125%',
    textTransform: 'uppercase',
  },
  role: {
    fontFamily: fonts.display,
    fontWeight: 800,
    fontSize: 'clamp(18px, 2.6vw, 28px)',
    lineHeight: 1.2,
    fontStretch: '112%',
    textTransform: 'uppercase',
    color: blueprint.dim,
    marginTop: 14,
  },
})

import * as stylex from '@stylexjs/stylex'

import { fonts, manor, media } from '../styles/tokens.stylex.ts'

export const panel = stylex.create({
  panel: {
    marginTop: 20,
    backgroundColor: manor.ink,
    borderWidth: 4,
    borderStyle: 'solid',
    borderColor: manor.plum,
    paddingTop: { default: 22, [media.narrow]: 18 },
    paddingInline: { default: 22, [media.narrow]: 16 },
    paddingBottom: { default: 24, [media.narrow]: 20 },
  },
  heading: {
    fontFamily: fonts.pixel,
    lineHeight: 'normal',
    fontWeight: 700,
    fontSize: 16,
    color: manor.gold,
    marginBottom: 14,
  },
  text: { maxWidth: 680, marginBottom: 12 },
  aside: { maxWidth: 680, marginTop: 18, color: manor.lilac },
  asideLink: { color: manor.green },
})

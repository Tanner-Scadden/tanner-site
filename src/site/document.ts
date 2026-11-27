import * as stylex from '@stylexjs/stylex'

import { blueprint, fonts, manor, media, rest } from '../styles/tokens.stylex.ts'

// NOTE: the document itself: the blueprint paper behind every page, and the
// hidden pages' own colors, so overscroll, the space under short pages and
// the mobile toolbar all match the room. Set on <html> and <body> through
// the head, since no component draws them.
export const documentStyles = stylex.create({
  body: {
    '--link': blueprint.hi,
    backgroundColor: blueprint.paper,
    color: blueprint.line,
    fontFamily: fonts.mono,
    fontSize: 14,
    lineHeight: 1.65,
    backgroundImage: {
      default: `linear-gradient(${blueprint.faint} 1px, transparent 1px), linear-gradient(90deg, ${blueprint.faint} 1px, transparent 1px), linear-gradient(${blueprint.grid} 1px, transparent 1px), linear-gradient(90deg, ${blueprint.grid} 1px, transparent 1px)`,
      [media.print]: 'none',
    },
    backgroundSize: '120px 120px, 120px 120px, 24px 24px, 24px 24px',
  },
  manor: { backgroundColor: manor.night, backgroundImage: 'none' },
  rest: { backgroundColor: rest.night, backgroundImage: 'none' },
})

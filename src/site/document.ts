import * as stylex from '@stylexjs/stylex'

import { blueprint, fonts, media, paper } from '../styles/tokens.stylex.ts'

export const documentStyles = stylex.create({
  body: {
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
  manor: { backgroundColor: paper.manor, backgroundImage: 'none' },
  rest: { backgroundColor: paper.rest, backgroundImage: 'none' },
})

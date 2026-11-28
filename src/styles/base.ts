import * as stylex from '@stylexjs/stylex'

import { blueprint } from './tokens.stylex.ts'

export const base = stylex.create({
  link: {
    color: blueprint.hi,
    outlineWidth: { ':focus-visible': 2 },
    outlineStyle: { ':focus-visible': 'solid' },
    outlineColor: { ':focus-visible': blueprint.hi },
    outlineOffset: { ':focus-visible': 2 },
  },
  focus: {
    outlineWidth: { ':focus-visible': 2 },
    outlineStyle: { ':focus-visible': 'solid' },
    outlineColor: { ':focus-visible': blueprint.hi },
    outlineOffset: { ':focus-visible': 2 },
  },
  button: {
    appearance: 'none',
    borderStyle: 'none',
    padding: 0,
    margin: 0,
    backgroundColor: 'transparent',
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: 'inherit',
    lineHeight: 'inherit',
    letterSpacing: 'inherit',
    textAlign: 'inherit',
    outlineWidth: { ':focus-visible': 2 },
    outlineStyle: { ':focus-visible': 'solid' },
    outlineColor: { ':focus-visible': blueprint.hi },
    outlineOffset: { ':focus-visible': 2 },
  },
})

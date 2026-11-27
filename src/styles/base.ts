import * as stylex from '@stylexjs/stylex'

import { blueprint } from './tokens.stylex.ts'

export const base = stylex.create({
  // A link: gold, with the focus ring.
  link: {
    color: blueprint.hi,
    outlineWidth: { default: null, ':focus-visible': 2 },
    outlineStyle: { default: null, ':focus-visible': 'solid' },
    outlineColor: { default: null, ':focus-visible': blueprint.hi },
    outlineOffset: { default: null, ':focus-visible': 2 },
  },
  // Anything else you can tab to: the focus ring alone.
  focus: {
    outlineWidth: { default: null, ':focus-visible': 2 },
    outlineStyle: { default: null, ':focus-visible': 'solid' },
    outlineColor: { default: null, ':focus-visible': blueprint.hi },
    outlineOffset: { default: null, ':focus-visible': 2 },
  },
  // StyleX has no `all: unset`, so a button that draws itself starts from
  // this: no browser chrome, the type of the words around it, and the focus
  // ring.
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
    outlineWidth: { default: null, ':focus-visible': 2 },
    outlineStyle: { default: null, ':focus-visible': 'solid' },
    outlineColor: { default: null, ':focus-visible': blueprint.hi },
    outlineOffset: { default: null, ':focus-visible': 2 },
  },
})

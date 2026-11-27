import * as stylex from '@stylexjs/stylex'

// NOTE: StyleX has no `all: unset`, so a button that draws itself starts
// from this: no browser chrome, and the type of the words around it.
export const base = stylex.create({
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
  },
})

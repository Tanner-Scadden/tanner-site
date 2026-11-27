import * as stylex from '@stylexjs/stylex'

// NOTE: a post body's rhythm. `size` is the body type, which the post sets
// and a heading reads to pull the block after it closer. `gap` is the space
// between blocks, which a note tightens for the paragraphs inside it.
export const flow = stylex.defineVars({
  size: '18px',
  gap: '1.2em',
})

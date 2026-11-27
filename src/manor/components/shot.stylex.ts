import * as stylex from '@stylexjs/stylex'

// Where a shot leaves the gun and where it lands, as board percentages. The
// tracer's keyframes fly between them, and each shot sets its own.
export const shot = stylex.defineVars({
  x0: '0%',
  y0: '0%',
  x1: '0%',
  y1: '0%',
})

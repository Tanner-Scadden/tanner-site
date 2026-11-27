import * as stylex from '@stylexjs/stylex'

// NOTE: the job list. The renderer marks it with `data-gpu="on"` while
// WebGPU draws the outlines, and the CSS borders follow it.
export const workMarker = stylex.defineMarker()

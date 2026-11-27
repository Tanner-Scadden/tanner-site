import * as stylex from '@stylexjs/stylex'

// NOTE: the house figure. The renderer marks it with `data-gpu="on"` while
// WebGPU draws the plan, and `data-drafting` until the walls are up, and
// the CSS walls and labels follow it.
export const houseMarker = stylex.defineMarker()

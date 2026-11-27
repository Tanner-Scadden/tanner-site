import * as stylex from '@stylexjs/stylex'

// NOTE: markers let an element's style follow an ancestor's state, in place
// of descendant selectors. The WebGPU drawings mark their containers with
// `data-gpu` (and the house with `data-drawn`), so the CSS outlines step
// aside while the GPU draws them. Hover and focus use the default marker.
export const houseMarker = stylex.defineMarker()
export const workMarker = stylex.defineMarker()

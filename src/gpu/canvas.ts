// Sizing a canvas's backing store to the screen, for every drawing on the
// site.

// Past 2x the extra pixels cost more than they show.
export const MAX_PIXEL_RATIO = 2

export interface Fit {
  // How the CSS size is read: `client` is whole px and ignores transforms,
  // `rect` is the exact box on screen.
  readonly measure?: 'client' | 'rect'
  // How the backing store rounds to whole pixels.
  readonly round?: (value: number) => number
  // The GPU's largest texture side, so a huge canvas lowers its pixel
  // ratio instead of failing.
  readonly maxSize?: number
}

export interface Fitted {
  // The canvas's CSS size.
  readonly width: number
  readonly height: number
  // Backing pixels per CSS px, as it came out after rounding.
  readonly ratio: number
}

// Matches the canvas's backing store to its CSS size times the screen's
// pixel ratio, and gives back that CSS size. Only touches the canvas when
// the size changed, since setting it clears the drawing.
export const fitCanvas = (
  canvas: HTMLCanvasElement,
  { measure = 'client', round = Math.round, maxSize = Infinity }: Fit = {},
): Fitted => {
  const box = measure === 'rect' ? canvas.getBoundingClientRect() : null
  const width = box?.width ?? canvas.clientWidth
  const height = box?.height ?? canvas.clientHeight
  const across = Math.max(1, width)
  const down = Math.max(1, height)
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO, maxSize / across, maxSize / down)
  const w = Math.max(1, round(across * dpr))
  const h = Math.max(1, round(down * dpr))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  return { width, height, ratio: w / across }
}

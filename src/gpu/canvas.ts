
export const MAX_PIXEL_RATIO = 2

export interface Fit {
  readonly measure?: 'client' | 'rect'
  readonly round?: (value: number) => number
  readonly maxSize?: number
}

export interface Fitted {
  readonly width: number
  readonly height: number
  readonly ratio: number
}

const measured = (canvas: HTMLCanvasElement, measure: Fit['measure']) => {
  if (measure === 'rect') {
    const { width, height } = canvas.getBoundingClientRect()
    return { width, height }
  }
  return { width: canvas.clientWidth, height: canvas.clientHeight }
}

export const fitCanvas = (
  canvas: HTMLCanvasElement,
  { measure = 'client', round = Math.round, maxSize = Infinity }: Fit = {},
): Fitted => {
  const { width, height } = measured(canvas, measure)
  const across = Math.max(1, width)
  const down = Math.max(1, height)
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO, maxSize / across, maxSize / down)
  const w = Math.max(1, round(across * dpr))
  const h = Math.max(1, round(down * dpr))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  return { width, height, ratio: w / across }
}

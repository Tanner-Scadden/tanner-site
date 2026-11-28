import { Array as Arr } from 'effect'

// The site's own colours, as every drawing paints them: channels from 0 to
// 255, the same numbers the CSS uses.

export type Rgb255 = readonly [number, number, number]
export type Rgb = readonly [number, number, number]

// The highlight gold, #ffd166.
export const GOLD: Rgb255 = [255, 209, 102]
// The line colour, #dcebff.
export const INK: Rgb255 = [220, 235, 255]

// A colour as 0 to 1 channels, as the GPU takes it.
export const float = ([r, g, b]: Rgb255): Rgb => [r / 255, g / 255, b / 255]

// A colour as a WGSL expression for its 0 to 1 channels.
export const wgsl = (rgb: Rgb255): string => `vec3f(${Arr.join(Arr.map(rgb, c => `${c}.0`), ', ')}) / 255.0`

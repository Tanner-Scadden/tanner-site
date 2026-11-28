import { Array as Arr } from 'effect'


export type Rgb255 = readonly [number, number, number]
export type Rgb = readonly [number, number, number]

export const GOLD: Rgb255 = [255, 209, 102]
export const INK: Rgb255 = [220, 235, 255]

export const float = ([r, g, b]: Rgb255): Rgb => [r / 255, g / 255, b / 255]

export const wgsl = (rgb: Rgb255): string => `vec3f(${Arr.join(Arr.map(rgb, c => `${c}.0`), ', ')}) / 255.0`

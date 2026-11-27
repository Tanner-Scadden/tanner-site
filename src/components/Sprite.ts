import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr } from 'effect'

import { sx } from '../styles/sx.ts'

// NOTE: 16x16 pixel maps, one letter per palette color and '.' for clear.
// Effect UI's Html has no SVG elements, so a sprite is one pixel-sized box
// whose box-shadow paints the rest: pure CSS, no canvas, no mount.

const PALETTE: Record<string, string> = {
  k: '#1c1426',
  w: '#f3e6c8',
  g: '#7ce36b',
  p: '#8a5bd6',
  r: '#e0475a',
  y: '#f3c14b',
  o: '#c98a2b',
  b: '#5b8bd6',
  s: '#e8b48a',
  h: '#5a3a2a',
  z: '#8fb86a',
  Z: '#5f8a45',
  n: '#2a3a6a',
}

const MAPS = {
  rattles: [
    '....kkkkkkkk....',
    '....kppppppk....',
    '....kppppppk....',
    '....kppppppk....',
    '..kkkkkkkkkkkk..',
    '..kkyyyyyyyykk..',
    '....kwwwwwwk....',
    '...kwwwwwwwwk...',
    '...kwkgkwkgkwk..',
    '...kwkkkwkkkwk..',
    '...kwwwwkwwwwk..',
    '....kwkwkwkwk...',
    '....kwwwwwwwk...',
    '.....kkkkkkk....',
    '....nnnrrrnnn...',
    '...nnnnnrnnnnn..',
  ],
  tanner: [
    '................',
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '....hsssssshh...',
    '....ssksskss....',
    '....ssssssss....',
    '....sssrrsss....',
    '.....ssssss.....',
    '......ssss......',
    '....bbbbbbbb....',
    '...bbbbbbbbbb...',
    '...bbbwwwwbbb...',
    '...ssbbbbbbss...',
    '....bbbbbbbb....',
    '....nnn..nnn....',
    '....kkk..kkk....',
  ],
  trophy: [
    '................',
    '...kkkkkkkkkk...',
    '..kyyyyyyyyyyk..',
    'kkkyyyywyyyyykkk',
    'kykyyyywyyyykyk.',
    'kyykyyyyyyyykyyk',
    '.kykyyyyyyyykyk.',
    '..kkyyyyyyyykk..',
    '....kyyyyyyk....',
    '.....kyyyyk.....',
    '......kyyk......',
    '......kyyk......',
    '.....kooook.....',
    '....kooooook....',
    '....kkkkkkkk....',
    '................',
  ],
  zombie: [
    '................',
    '....kkkkkkkk....',
    '...kZzzzzzzZk...',
    '..kzzzzzzzzzzk..',
    '..kzkkzzzzkkzk..',
    '..kzkrzzzzkrzk..',
    '..kzzzzzzzzzzk..',
    '..kzzzzkkzzzzk..',
    '..kzzzzzzzzzzk..',
    '..kzkwkwkwkwzk..',
    '..kzzkkkkkkzzk..',
    '...kzzzzzzzzk...',
    '....kkkkkkkk....',
    '.....kZZZZk.....',
    '....kZZZZZZk....',
    '................',
  ],
} as const

export type SpriteName = keyof typeof MAPS

const SPRITE_SIZE = 16

interface SpriteSpec {
  readonly name: SpriteName
  readonly pixel: number
}

const shadowFor = ({ name, pixel }: SpriteSpec): string =>
  Arr.join(
    Arr.flatMap(MAPS[name], (row, y) =>
      Arr.flatMap(Arr.fromIterable(row), (cell, x) => {
        const color = PALETTE[cell]
        return color === undefined
          ? []
          : [`${x * pixel}px ${y * pixel}px 0 0 ${color}`]
      }),
    ),
    ',',
  )

const cache = new Map<string, string>()

const spriteShadow = (spec: SpriteSpec): string => {
  const key = `${spec.name}:${spec.pixel}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const shadow = shadowFor(spec)
  cache.set(key, shadow)
  return shadow
}

const styles = stylex.create({
  sprite: (pixel: number) => ({
    display: 'inline-block',
    position: 'relative',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    width: `${SPRITE_SIZE * pixel}px`,
    height: `${SPRITE_SIZE * pixel}px`,
  }),
  // One pixel box; its box-shadow paints the rest.
  px: (pixel: number, shadow: string) => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: `${pixel}px`,
    height: `${pixel}px`,
    boxShadow: shadow,
  }),
})

// What a layout may set on a sprite: where it sits, and how it shrinks on
// small screens. Its size and its pixels are the sprite's own.
type Placement = stylex.StyleXStyles<{
  readonly transform?: string | number | null
  readonly transformOrigin?: string | number | null
  readonly marginBlock?: string | number | null
  readonly marginRight?: string | number | null
  readonly marginBottom?: string | number | null
}>

// A sprite `pixel` CSS pixels per sprite pixel, hidden from screen readers.
export const Sprite = <M>(
  h: Html.H<M>,
  name: SpriteName,
  pixel: number,
  style?: Placement,
) =>
  sx(h.span, styles.sprite(pixel), style)
    .attr('aria-hidden', 'true')
    .children(sx(h.span, styles.px(pixel, spriteShadow({ name, pixel }))))

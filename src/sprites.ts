import { Array as Arr } from 'effect'

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

export const SPRITE_SIZE = 16

export interface SpriteSpec {
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

export const spriteShadow = (spec: SpriteSpec): string => {
  const key = `${spec.name}:${spec.pixel}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const shadow = shadowFor(spec)
  cache.set(key, shadow)
  return shadow
}

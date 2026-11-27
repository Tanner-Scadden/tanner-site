// NOTE: a frame of the grove as lines and dots in CSS px, coloured like the
// rest of the sheet. Both renderers draw exactly this.
//
// The ground is drawn like a section on a drawing: a line with hatching
// under it. Trunks, branches and roots are the sheet's pale line colour.
// Leaves and seeds are gold, and a leaf about to let a seed go glows.
//
// Pointing at a tree picks it out: its branches warm up and its leaves
// glow, and the rest of the grove steps back a little.

import { Array as Arr, Option } from 'effect'

import type { Dot, Line, Point, Rgba, Shapes } from '../blog/animation/scene.ts'
import { BOUNDS, type Frame, GROUND, HATCHES, HATCH_GAP, MAX_SEGMENTS, MAX_TREES, ROOTS } from './grove.ts'

type Rgb = readonly [number, number, number]

// The sheet's line colour, its gold, and a warm white.
const LINE: Rgb = [0.86, 0.92, 1]
const GOLD: Rgb = [1, 0.82, 0.4]
const WARM: Rgb = [1, 0.94, 0.8]

// The most a frame draws: the ground and its hatching, every branch and
// root, a wisp per seed; every leaf, a seed and a landing ring each.
// Plus up to four lines per tree for the roots it reaches toward a neighbour.
export const MAX_LINES = 1 + HATCHES + MAX_TREES * (MAX_SEGMENTS + ROOTS + 4) + MAX_TREES
export const MAX_DOTS = MAX_TREES * MAX_SEGMENTS + MAX_TREES * 2

// How much of itself the rest of the grove keeps while a tree's picked.
const DIMMED = 0.55

const rgba = (rgb: Rgb, alpha: number): Rgba => [rgb[0], rgb[1], rgb[2], alpha]

// Scale and centre the world box into a canvas this big.
export const projection = (width: number, height: number) => {
  const scale = Math.min(width / (BOUNDS.x * 2 + 0.1), height / (BOUNDS.y * 2 + 0.1))
  return {
    scale,
    px: ([x, y]: Point): Point => [width / 2 + x * scale, height / 2 + y * scale],
  }
}

// The tree whose crown the pointer is in, nearest its trunk.
const pickedBy = (
  frame: Frame,
  px: (point: Point) => Point,
  pointer: Option.Option<Point>,
): Option.Option<number> =>
  Option.flatMap(pointer, ([x, y]) => {
    let best = Option.none<number>()
    let nearest = Infinity
    for (const tree of frame.trees) {
      if (tree.grown < 0.3) continue
      const [left, top] = px([tree.left, tree.top])
      const [right, bottom] = px([tree.right, GROUND])
      if (x < left - 6 || x > right + 6 || y < top - 6 || y > bottom + 6) continue
      const [trunk] = px([tree.x, GROUND])
      if (Math.abs(trunk - x) < nearest) {
        nearest = Math.abs(trunk - x)
        best = Option.some(tree.id)
      }
    }
    return best
  })

export const shapesOf = (
  frame: Frame,
  width: number,
  height: number,
  pointer: Option.Option<Point> = Option.none(),
): Shapes => {
  const { scale, px } = projection(width, height)
  const picked = pickedBy(frame, px, pointer)
  const isPicked = (tree: number) => Option.exists(picked, id => id === tree)
  const keep = (tree: number) => (Option.isNone(picked) || isPicked(tree) ? 1 : DIMMED)

  // The ground draws out from the middle, and its hatching with it.
  const reach = BOUNDS.x * frame.ground
  const ground: ReadonlyArray<Line> =
    frame.ground > 0
      ? [{ from: px([-reach, GROUND]), to: px([reach, GROUND]), width: 1.25, color: rgba(LINE, 0.7) }]
      : []
  const hatching = Arr.flatMap(Arr.range(0, HATCHES - 1), (k): ReadonlyArray<Line> => {
    const x = -BOUNDS.x + 0.06 + k * HATCH_GAP
    if (Math.abs(x) > reach - 0.05 || x > BOUNDS.x - 0.02) return []
    return [{ from: px([x, GROUND]), to: px([x - 0.045, GROUND + 0.045]), width: 1, color: rgba(LINE, 0.2) }]
  })

  const branches = Arr.map(frame.branches, (branch): Line => {
    const lit = isPicked(branch.tree)
    const alpha = branch.root ? 0.32 + 0.45 * branch.bond : 0.78
    // Roots that have knotted with a neighbour's turn gold.
    const tint = lit ? WARM : branch.bond > 0 ? GOLD : LINE
    return {
      from: px(branch.from),
      to: px(branch.to),
      width: Math.max(0.9, branch.width * scale) + (lit ? 0.5 : 0),
      color: rgba(tint, (lit ? Math.min(1, alpha + 0.15) : alpha) * keep(branch.tree)),
    }
  })

  const wisps = Arr.flatMap(frame.seeds, (seed): ReadonlyArray<Line> =>
    seed.flying ? [{ from: px(seed.tail), to: px([seed.x, seed.y]), width: 1.2, color: rgba(GOLD, 0.45 * seed.alpha) }] : [],
  )

  const rings = Arr.map(frame.rings, (ring): Dot => {
    const [x, y] = px([ring.x, ring.y])
    const t = 1 - (1 - ring.progress) ** 3
    return { x, y, radius: 4 + 22 * t, glow: 0, ring: 1.25, color: rgba(GOLD, 0.6 * (1 - ring.progress)) }
  })

  const leaves = Arr.map(frame.leaves, (leaf): Dot => {
    const [x, y] = px([leaf.x, leaf.y])
    const lit = isPicked(leaf.tree)
    const radius = Math.max(1.1, leaf.size * scale) * (leaf.size > 0 ? 1 : 0)
    return {
      x,
      y,
      radius: radius * (1 + 0.35 * leaf.blossom),
      glow: (2 + 10 * leaf.blossom + (lit ? 4 : 0)) * Math.min(1, radius / 1.5),
      ring: 0,
      color: rgba(lit ? WARM : GOLD, (0.85 + 0.15 * leaf.blossom) * keep(leaf.tree)),
    }
  })

  const seeds = Arr.map(frame.seeds, (seed): Dot => {
    const [x, y] = px([seed.x, seed.y])
    return {
      x,
      y,
      radius: Math.max(2, seed.size * scale),
      glow: seed.flying ? 10 : 6,
      ring: 0,
      color: rgba(GOLD, seed.alpha),
    }
  })

  return {
    lines: [...ground, ...hatching, ...branches, ...wisps],
    dots: [...rings, ...leaves, ...seeds],
  }
}

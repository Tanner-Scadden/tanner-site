import { Array as Arr, Option } from 'effect'

import { GOLD, LINE, type Projection, WARM, mix, rgba } from '../../animation/kit.ts'
import type { Dot, Line, Point, Shapes } from '../../animation/scene.ts'
import {
  BOUNDS,
  type Frame,
  GROUND,
  HATCHES,
  HATCH_GAP,
  MAX_SEGMENTS,
  MAX_TREES,
} from './grove.ts'
import { REACH_LINES, ROOT_PIECES } from './roots.ts'

// The most a frame draws: the ground and its hatching, every branch and
// root, a wisp per seed; every leaf, a seed and a landing ring each.
// Each tree has its own roots, up to ROOT_PIECES lines, plus two reaching
// roots: its own, and its neighbour's reaching back.
export const MAX_LINES = 1 + HATCHES + MAX_TREES * (MAX_SEGMENTS + ROOT_PIECES + 2 * REACH_LINES) + MAX_TREES
export const MAX_DOTS = MAX_TREES * MAX_SEGMENTS + MAX_TREES * 2

// How much of itself the rest of the grove keeps while a tree's picked.
const DIMMED = 0.55

// Scale and centre the world box into a canvas this big.
export const projection: Projection = (width, height) => {
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
    // Roots are fainter than the crowns, so the crowns lead, except where
    // they've knotted with a neighbour's: those turn gold and brighten as
    // the tie strengthens.
    const alpha = branch.root ? 0.3 + 0.62 * branch.bond : 0.78
    const tint = lit ? WARM : branch.root ? mix(LINE, GOLD, Math.min(1, branch.bond * 3)) : LINE
    const thinnest = branch.root ? 0.7 + 0.5 * branch.bond : 0.9
    return {
      from: px(branch.from),
      to: px(branch.to),
      width: Math.max(thinnest, branch.width * scale) + (lit ? 0.5 : 0),
      color: rgba(tint, (lit ? Math.min(1, alpha + 0.15) : alpha) * keep(branch.tree)),
    }
  })

  const wisps = Arr.flatMap(frame.seeds, (seed): ReadonlyArray<Line> =>
    seed.flying
      ? [{ from: px(seed.tail), to: px([seed.x, seed.y]), width: 1.2, color: rgba(GOLD, 0.45 * seed.alpha) }]
      : [],
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

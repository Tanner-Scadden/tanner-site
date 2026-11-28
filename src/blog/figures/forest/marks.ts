import { Array as Arr, Boolean as Bool, Option } from 'effect'

import { GOLD, LINE, type Projection, type Rgb, WARM, mix, rgba } from '../../animation/kit.ts'
import type { Dot, Line, Point, Marks } from '../../animation/scene.ts'
import {
  BOUNDS,
  type Frame,
  type FrameBranch,
  GROUND,
  HATCHES,
  HATCH_GAP,
  MAX_SEGMENTS,
  MAX_TREES,
} from './grove.ts'
import { REACH_LINES, ROOT_PIECES } from './roots.ts'

export const MAX_LINES = 1 + HATCHES + MAX_TREES * (MAX_SEGMENTS + ROOT_PIECES + 2 * REACH_LINES) + MAX_TREES
export const MAX_DOTS = MAX_TREES * MAX_SEGMENTS + MAX_TREES * 2

const DIMMED = 0.55

export const projection: Projection = (width, height) => {
  const scale = Math.min(width / (BOUNDS.x * 2 + 0.1), height / (BOUNDS.y * 2 + 0.1))
  return {
    scale,
    px: ([x, y]: Point): Point => [width / 2 + x * scale, height / 2 + y * scale],
  }
}

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

const branchAlpha = (branch: FrameBranch): number => {
  if (branch.root) return 0.3 + 0.62 * branch.bond
  return 0.78
}

const branchTint = (branch: FrameBranch, lit: boolean): Rgb => {
  if (lit) return WARM
  if (branch.root) return mix(LINE, GOLD, Math.min(1, branch.bond * 3))
  return LINE
}

const thinnestOf = (branch: FrameBranch): number => {
  if (branch.root) return 0.7 + 0.5 * branch.bond
  return 0.9
}

const branchLine = (
  branch: FrameBranch,
  lit: boolean,
  keep: number,
  scale: number,
  px: (point: Point) => Point,
): Line => {
  const alpha = branchAlpha(branch)
  const width = Math.max(thinnestOf(branch), branch.width * scale)
  return {
    from: px(branch.from),
    to: px(branch.to),
    width: Bool.match(lit, { onTrue: () => width + 0.5, onFalse: () => width }),
    color: rgba(
      branchTint(branch, lit),
      Bool.match(lit, { onTrue: () => Math.min(1, alpha + 0.15), onFalse: () => alpha }) * keep,
    ),
  }
}

export const marksOf = (
  frame: Frame,
  width: number,
  height: number,
  pointer: Option.Option<Point> = Option.none(),
): Marks => {
  const { scale, px } = projection(width, height)
  const picked = pickedBy(frame, px, pointer)
  const isPicked = (tree: number) => Option.exists(picked, id => id === tree)
  const keep = (tree: number) => {
    if (Option.isNone(picked) || isPicked(tree)) return 1
    return DIMMED
  }

  const reach = BOUNDS.x * frame.ground
  const ground = Arr.filter(
    [{ from: px([-reach, GROUND]), to: px([reach, GROUND]), width: 1.25, color: rgba(LINE, 0.7) }],
    () => frame.ground > 0,
  )
  const hatching = Arr.flatMap(Arr.range(0, HATCHES - 1), (k): ReadonlyArray<Line> => {
    const x = -BOUNDS.x + 0.06 + k * HATCH_GAP
    if (Math.abs(x) > reach - 0.05 || x > BOUNDS.x - 0.02) return []
    return [{ from: px([x, GROUND]), to: px([x - 0.045, GROUND + 0.045]), width: 1, color: rgba(LINE, 0.2) }]
  })

  const branches = Arr.map(frame.branches, (branch): Line =>
    branchLine(branch, isPicked(branch.tree), keep(branch.tree), scale, px),
  )

  const wisps = Arr.map(
    Arr.filter(frame.seeds, seed => seed.flying),
    (seed): Line => ({ from: px(seed.tail), to: px([seed.x, seed.y]), width: 1.2, color: rgba(GOLD, 0.45 * seed.alpha) }),
  )

  const rings = Arr.map(frame.rings, (ring): Dot => {
    const [x, y] = px([ring.x, ring.y])
    const t = 1 - (1 - ring.progress) ** 3
    return { x, y, radius: 4 + 22 * t, glow: 0, ring: 1.25, color: rgba(GOLD, 0.6 * (1 - ring.progress)) }
  })

  const leaves = Arr.map(frame.leaves, (leaf): Dot => {
    const [x, y] = px([leaf.x, leaf.y])
    const lit = isPicked(leaf.tree)
    const radius = Math.max(1.1, leaf.size * scale) * Bool.match(leaf.size > 0, { onTrue: () => 1, onFalse: () => 0 })
    return {
      x,
      y,
      radius: radius * (1 + 0.35 * leaf.blossom),
      glow: (2 + 10 * leaf.blossom + Bool.match(lit, { onTrue: () => 4, onFalse: () => 0 })) * Math.min(1, radius / 1.5),
      ring: 0,
      color: rgba(
        Bool.match(lit, { onTrue: () => WARM, onFalse: () => GOLD }),
        (0.85 + 0.15 * leaf.blossom) * keep(leaf.tree),
      ),
    }
  })

  const seeds = Arr.map(frame.seeds, (seed): Dot => {
    const [x, y] = px([seed.x, seed.y])
    return {
      x,
      y,
      radius: Math.max(2, seed.size * scale),
      glow: Bool.match(seed.flying, { onTrue: () => 10, onFalse: () => 6 }),
      ring: 0,
      color: rgba(GOLD, seed.alpha),
    }
  })

  return {
    lines: [...ground, ...hatching, ...branches, ...wisps],
    dots: [...rings, ...leaves, ...seeds],
  }
}

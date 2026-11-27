// NOTE: Teddy and Rain, drawn as blueprint line art onto one sprite sheet
// the GPU samples. Teddy is a goldendoodle (a curly gold outline), Rain a
// Nebelung (long gray fur and a plumed tail). Both face right; the shader
// flips them. Each has four walking frames and a resting pose.
//
// Coordinates are in a 64 x 48 cell with the ground at y = 44.

import { REST_FRAME as REST, WALK_FRAMES } from './house.ts'

export const CELL_W = 64
export const CELL_H = 48
// Walking frames, then the resting pose.
export const COLS = WALK_FRAMES + 1
// Teddy's row, then Rain's.
export const ROWS = 2
export const TEDDY_ROW = 0
export const RAIN_ROW = 1
// Texture px per cell unit at the sharpest mip level. Each smaller level is
// drawn again at half the scale, so thin lines stay crisp when the pets are
// small instead of being averaged away.
export const SHEET_SCALE = 2
export const SHEET_LEVELS = 4

type Ctx = CanvasRenderingContext2D
type Pt = readonly [number, number]

const GOLD = '#ffd166'
const INK = '#dcebff'
// The paper behind the drawing, so walls and grid don't show through.
const PAPER = 'rgba(15, 59, 120, 0.94)'
const LINE = 1.6

// Points round an ellipse, optionally rotated.
const ellipse = (cx: number, cy: number, rx: number, ry: number, n: number, rot = 0): Array<Pt> => {
  const out: Array<Pt> = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = Math.cos(a) * rx
    const y = Math.sin(a) * ry
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)])
  }
  return out
}

// A closed outline of little outward bumps: curly fur.
const curly = (ctx: Ctx, pts: ReadonlyArray<Pt>, bump: number) => {
  const n = pts.length
  const cx = pts.reduce((s, p) => s + p[0], 0) / n
  const cy = pts.reduce((s, p) => s + p[1], 0) / n
  ctx.beginPath()
  ctx.moveTo(pts[0]![0], pts[0]![1])
  for (let i = 0; i < n; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % n]!
    const mx = (a[0] + b[0]) / 2
    const my = (a[1] + b[1]) / 2
    const d = Math.hypot(mx - cx, my - cy) || 1
    ctx.quadraticCurveTo(mx + ((mx - cx) / d) * bump, my + ((my - cy) / d) * bump, b[0], b[1])
  }
  ctx.closePath()
}

const smooth = (ctx: Ctx, pts: ReadonlyArray<Pt>) => curly(ctx, pts, 0.4)

const ink = (ctx: Ctx, color: string, width = LINE) => {
  ctx.fillStyle = PAPER
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

const dot = (ctx: Ctx, x: number, y: number, r: number, color: string) => {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

const line = (ctx: Ctx, from: Pt, to: Pt, color: string, width = LINE) => {
  ctx.beginPath()
  ctx.moveTo(from[0], from[1])
  ctx.lineTo(to[0], to[1])
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.stroke()
}

// A soft tube along a curve, outlined: a tail.
const tube = (
  ctx: Ctx,
  from: Pt,
  c1: Pt,
  c2: Pt,
  to: Pt,
  width: number,
  color: string,
) => {
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(from[0], from[1])
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], to[0], to[1])
  }
  ctx.lineCap = 'round'
  path()
  ctx.strokeStyle = color
  ctx.lineWidth = width + LINE * 2
  ctx.stroke()
  path()
  ctx.strokeStyle = PAPER
  ctx.lineWidth = width
  ctx.stroke()
}

// A leg hanging from `hip`, swung by `angle`, down to the ground.
const leg = (
  ctx: Ctx,
  hip: Pt,
  angle: number,
  width: number,
  color: string,
  fur: number,
) => {
  const length = 44 - hip[1]
  ctx.save()
  ctx.translate(hip[0], hip[1])
  ctx.rotate(angle)
  if (fur > 0) {
    const pts: Array<Pt> = []
    const steps = 4
    for (let i = 0; i <= steps; i++) pts.push([width / 2, (length * i) / steps])
    for (let i = steps; i >= 0; i--) pts.push([-width / 2, (length * i) / steps])
    curly(ctx, pts, fur)
  } else {
    ctx.beginPath()
    ctx.roundRect(-width / 2, -1, width, length + 1, width / 2)
  }
  ink(ctx, color)
  ctx.restore()
}

// The walk: legs swing forward and back, the near and far pairs opposed.
const SWING = [0.32, 0.08, -0.32, -0.08] as const
const swing = (frame: number, offset: number): number => SWING[(frame + offset) % WALK_FRAMES]!

// ---------------------------------------------------------------------------
// Teddy, the goldendoodle
// ---------------------------------------------------------------------------

const teddyHead = (ctx: Ctx, x: number, y: number) => {
  curly(ctx, ellipse(x, y, 8, 7.5, 12), 1.5)
  ink(ctx, GOLD)
  // A fluffy muzzle.
  curly(ctx, ellipse(x + 6.5, y + 3.2, 4.4, 3.2, 8), 0.9)
  ink(ctx, GOLD)
  dot(ctx, x + 10.6, y + 2.2, 1.4, GOLD)
  dot(ctx, x + 2.4, y - 1.6, 1.1, GOLD)
  // The floppy ear.
  curly(ctx, ellipse(x - 3.5, y + 3.5, 3.2, 6.2, 9, 0.15), 1)
  ink(ctx, GOLD)
}

const teddyWalk = (ctx: Ctx, frame: number) => {
  const far = (x: number, o: number) => {
    ctx.globalAlpha = 0.55
    leg(ctx, [x, 27], swing(frame, o), 5, GOLD, 0.7)
    ctx.globalAlpha = 1
  }
  far(23, 2)
  far(43, 0)
  // The legs hang from under the body, so it covers their tops.
  leg(ctx, [18, 27], swing(frame, 2), 5, GOLD, 0.7)
  leg(ctx, [39, 27], swing(frame, 0), 5, GOLD, 0.7)
  // The tail, a fluffy plume held up behind.
  curly(ctx, ellipse(13, 15, 3.4, 8, 11, -0.5), 1.2)
  ink(ctx, GOLD)
  curly(ctx, ellipse(30, 23, 17, 8.5, 16), 1.6)
  ink(ctx, GOLD)
  teddyHead(ctx, 49, 13)
}

const teddySit = (ctx: Ctx) => {
  // The tail on the floor behind him.
  curly(ctx, ellipse(14, 41, 7, 2.6, 10), 1)
  ink(ctx, GOLD)
  ctx.globalAlpha = 0.55
  leg(ctx, [41, 28], 0.05, 5, GOLD, 0.7)
  ctx.globalAlpha = 1
  curly(ctx, ellipse(30, 30, 11, 9.5, 14, -1.0), 1.6)
  ink(ctx, GOLD)
  // The haunch, and the front leg standing in front.
  curly(ctx, ellipse(24, 37, 7.5, 6.5, 11), 1.4)
  ink(ctx, GOLD)
  leg(ctx, [37, 28], 0, 5, GOLD, 0.7)
  teddyHead(ctx, 42, 12)
}

// ---------------------------------------------------------------------------
// Rain, the Nebelung
// ---------------------------------------------------------------------------

const rainHead = (ctx: Ctx, x: number, y: number, asleep: boolean) => {
  // Pointed ears, behind the head.
  const ear = (a: Pt, tip: Pt, b: Pt) => {
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(tip[0], tip[1])
    ctx.lineTo(b[0], b[1])
    ctx.closePath()
    ctx.lineJoin = 'round'
    ink(ctx, INK)
  }
  ear([x - 4.5, y - 2.5], [x - 3, y - 9.5], [x, y - 4.5])
  ear([x, y - 4.5], [x + 3.2, y - 9.8], [x + 4.6, y - 2.6])
  smooth(ctx, ellipse(x, y, 6.2, 5.4, 12))
  ink(ctx, INK)
  if (asleep) {
    ctx.beginPath()
    ctx.arc(x + 2.6, y - 0.6, 1.5, 0.2, Math.PI - 0.2)
    ctx.strokeStyle = INK
    ctx.lineWidth = 1
    ctx.stroke()
  } else {
    // An almond eye.
    ctx.beginPath()
    ctx.ellipse(x + 2.8, y - 0.8, 1.6, 0.9, -0.2, 0, Math.PI * 2)
    ctx.fillStyle = INK
    ctx.fill()
  }
  dot(ctx, x + 6, y + 1.6, 0.8, INK)
  line(ctx, [x + 5, y + 2.6], [x + 11, y + 1.6], INK, 0.5)
  line(ctx, [x + 5, y + 3.4], [x + 11, y + 4.4], INK, 0.5)
}

// Long fur hanging off the belly.
const fringe = (ctx: Ctx, from: number, to: number, y: number) => {
  for (let x = from; x <= to; x += 2.4) {
    line(ctx, [x, y - 1], [x - 1.4, y + 3], INK, 1)
  }
}

const rainWalk = (ctx: Ctx, frame: number) => {
  const far = (x: number, o: number) => {
    ctx.globalAlpha = 0.55
    leg(ctx, [x, 30], swing(frame, o), 3.4, INK, 0)
    ctx.globalAlpha = 1
  }
  far(25, 2)
  far(41, 0)
  leg(ctx, [21, 30], swing(frame, 2), 3.4, INK, 0)
  leg(ctx, [37, 30], swing(frame, 0), 3.4, INK, 0)
  // The plumed tail, up from her back and curling over at the tip.
  tube(ctx, [17, 25], [8, 22], [4, 12], [10, 6], 5, INK)
  fringe(ctx, 19, 41, 32)
  curly(ctx, ellipse(30, 27, 15.5, 6.6, 18), 0.7)
  ink(ctx, INK)
  // The ruff round her neck.
  curly(ctx, ellipse(43, 25, 5, 6.4, 10), 1.1)
  ink(ctx, INK)
  rainHead(ctx, 49, 18, false)
}

const rainNap = (ctx: Ctx) => {
  // Curled into a loaf, tail wrapped round the front.
  curly(ctx, ellipse(29, 36, 15, 7.5, 18), 0.8)
  ink(ctx, INK)
  fringe(ctx, 18, 38, 40.5)
  rainHead(ctx, 44, 29, true)
  tube(ctx, [15, 39], [10, 46], [28, 46], [42, 43], 3.6, INK)
}

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

const cell = (ctx: Ctx, scale: number, col: number, row: number, draw: (ctx: Ctx) => void) => {
  ctx.save()
  ctx.translate(col * CELL_W * scale, row * CELL_H * scale)
  ctx.scale(scale, scale)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  draw(ctx)
  ctx.restore()
}

// Draws every frame of both pets onto a new canvas, for mip `level`.
export const drawSheet = (level = 0): HTMLCanvasElement => {
  const scale = SHEET_SCALE / 2 ** level
  const canvas = document.createElement('canvas')
  canvas.width = COLS * CELL_W * scale
  canvas.height = ROWS * CELL_H * scale
  const ctx = canvas.getContext('2d')
  if (ctx === null) return canvas
  for (let f = 0; f < WALK_FRAMES; f++) {
    cell(ctx, scale, f, TEDDY_ROW, c => teddyWalk(c, f))
    cell(ctx, scale, f, RAIN_ROW, c => rainWalk(c, f))
  }
  cell(ctx, scale, REST, TEDDY_ROW, teddySit)
  cell(ctx, scale, REST, RAIN_ROW, rainNap)
  return canvas
}

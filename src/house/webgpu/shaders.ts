// NOTE: the floor plan drawing. Coordinates are CSS pixels from the canvas's
// top-left. Every wall and every dot is one instanced quad a little larger
// than itself, so a fragment only ever looks at its own shape.

const COMMON = /* wgsl */ `
struct View {
  size: vec2f,
  dpr: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> view: View;

const INK = vec3f(220.0, 235.0, 255.0) / 255.0;
const HIGHLIGHT = vec3f(255.0, 209.0, 102.0) / 255.0;

// Coverage of a line of the given width, d px from its middle.
fn line(d: f32, width: f32) -> f32 {
  return clamp((width * 0.5 - d) * view.dpr + 0.5, 0.0, 1.0);
}

// Distance from p to the segment a-b, and how far along it p falls.
fn segment(p: vec2f, a: vec2f, b: vec2f) -> vec2f {
  let ab = b - a;
  let len = max(length(ab), 1e-4);
  let t = clamp(dot(p - a, ab) / (len * len), 0.0, 1.0);
  return vec2f(length(p - (a + ab * t)), t * len);
}

fn toClip(p: vec2f) -> vec4f {
  return vec4f(p / view.size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
}

// Premultiplied "over".
fn over(top: vec4f, under: vec4f) -> vec4f {
  return top + under * (1.0 - top.a);
}

fn paint(color: vec3f, alpha: f32) -> vec4f {
  let a = clamp(alpha, 0.0, 1.0);
  return vec4f(color * a, a);
}

const QUAD = array<vec2f, 6>(
  vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
);

struct Out {
  @builtin(position) position: vec4f,
  @location(0) p: vec2f,
  @location(1) @interpolate(flat) i: u32,
}

fn hidden(i: u32) -> Out {
  var out: Out;
  out.i = i;
  out.position = vec4f(2.0, 2.0, 0.0, 1.0);
  out.p = vec2f(0.0);
  return out;
}
`

// NOTE: from.xy, to.xy, then width, reveal, gold, dash, alpha, and three
// unused. Matches `struct Wall`.
export const WALL_FLOATS = 12

export const WALLS = /* wgsl */ `
${COMMON}

struct Wall {
  path: vec4f,
  // width, reveal, gold, dash
  look: vec4f,
  // alpha, unused
  more: vec4f,
}

@group(0) @binding(1) var<storage, read> walls: array<Wall>;

const MARGIN = 10.0;

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let w = walls[i];
  // A wall the pen hasn't reached covers nothing.
  if (w.look.y <= 0.0) { return hidden(i); }
  let lo = min(w.path.xy, w.path.zw) - MARGIN;
  let hi = max(w.path.xy, w.path.zw) + MARGIN;
  var out: Out;
  out.i = i;
  let p = mix(lo, hi, QUAD[v]);
  out.position = toClip(p);
  out.p = p;
  return out;
}

@fragment
fn fs(in: Out) -> @location(0) vec4f {
  let w = walls[in.i];
  let a = w.path.xy;
  let b = w.path.zw;
  let width = w.look.x;
  let reveal = w.look.y;
  let gold = w.look.z;
  let dash = w.look.w;
  let alpha = w.more.x;

  let len = length(b - a);
  let along = segment(in.p, a, b);
  let head = reveal * len;
  let drawn = select(0.0, 1.0, along.y <= head);

  // Dashes: on for a dash, off for a gap the same length.
  var on = 1.0;
  if (dash > 0.0) {
    on = select(0.0, 1.0, fract(along.y / (dash * 2.0)) < 0.5);
  }

  let drawing = select(0.0, 1.0, reveal < 1.0);
  let base = mix(INK, HIGHLIGHT, gold);
  // Fresh ink is warm, and cools to the line color behind the pen.
  let fresh = exp(-max(head - along.y, 0.0) / 60.0) * drawing;
  let ink = mix(base, HIGHLIGHT, fresh);
  var color = paint(ink, line(along.x, width) * drawn * on * alpha);

  // A soft glow at the pen's tip while it draws.
  let tip = a + (b - a) * reveal;
  let r = length(in.p - tip);
  let glow = exp(-(r * r) / 14.0) * drawing;
  color = over(paint(HIGHLIGHT, glow * 0.9), color);
  return color;
}
`

// NOTE: centre.xy, radius, ring (0 filled, otherwise the ring's width),
// gold, alpha, and two unused. Matches `struct Dot`.
export const DOT_FLOATS = 8

export const DOTS = /* wgsl */ `
${COMMON}

struct Dot {
  // centre, radius, ring
  shape: vec4f,
  // gold, alpha, unused
  look: vec4f,
}

@group(0) @binding(1) var<storage, read> dots: array<Dot>;

const MARGIN = 3.0;

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let d = dots[i];
  if (d.look.y <= 0.0 || d.shape.z <= 0.0) { return hidden(i); }
  let reach = d.shape.z + MARGIN;
  var out: Out;
  out.i = i;
  let p = mix(d.shape.xy - reach, d.shape.xy + reach, QUAD[v]);
  out.position = toClip(p);
  out.p = p;
  return out;
}

@fragment
fn fs(in: Out) -> @location(0) vec4f {
  let d = dots[in.i];
  let r = length(in.p - d.shape.xy);
  let radius = d.shape.z;
  let ring = d.shape.w;
  let color = mix(INK, HIGHLIGHT, d.look.x);
  var cover: f32;
  if (ring > 0.0) {
    cover = line(abs(r - radius + ring * 0.5), ring);
  } else {
    cover = clamp((radius - r) * view.dpr + 0.5, 0.0, 1.0);
  }
  return paint(color, cover * d.look.y);
}
`

// NOTE: left, top, width, height, then the sheet's column and row, flip (1
// faces left) and alpha. Matches `struct Sprite`.
export const SPRITE_FLOATS = 8

export const spritesShader = (cols: number, rows: number) => /* wgsl */ `
${COMMON}

struct Sprite {
  box: vec4f,
  // column, row, flip, alpha
  cell: vec4f,
}

@group(0) @binding(1) var<storage, read> sprites: array<Sprite>;
@group(0) @binding(2) var sheet: texture_2d<f32>;
@group(0) @binding(3) var sheetSampler: sampler;

const SHEET = vec2f(${cols}.0, ${rows}.0);

struct SpriteOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) alpha: f32,
}

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> SpriteOut {
  let s = sprites[i];
  let q = QUAD[v];
  var out: SpriteOut;
  out.position = toClip(s.box.xy + q * s.box.zw);
  // The sheet faces right; a pet heading left reads it mirrored.
  let u = select(q.x, 1.0 - q.x, s.cell.z > 0.5);
  out.uv = (s.cell.xy + vec2f(u, q.y)) / SHEET;
  out.alpha = s.cell.w;
  return out;
}

@fragment
fn fs(in: SpriteOut) -> @location(0) vec4f {
  // The sheet is premultiplied already.
  return textureSample(sheet, sheetSampler, in.uv) * in.alpha;
}
`

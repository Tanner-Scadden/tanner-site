// NOTE: the floor plan drawing. Plan space is CSS px from the canvas's
// top-left, with z rising out of the floor; `view.m` (see ./view) takes it to
// the screen. The floor, its strokes and the walls are drawn in plan space,
// so they tip and rise with the house. The pets, their paw prints and
// Teddy's barks are placed on the CPU and drawn flat on the screen, since
// they always face the viewer. Every shape is one instanced quad a little
// larger than itself, so a fragment only ever looks at its own shape.

const COMMON = /* wgsl */ `
struct View {
  size: vec2f,
  dpr: f32,
  time: f32,
  m: mat4x4f,
  // The house's outline on the floor.
  house: vec4f,
  // 0 while the plan lies flat, 1 once the house has risen.
  lift: f32,
  // How tall a full wall stands right now, in plan px.
  height: f32,
  _pad: vec2f,
}

@group(0) @binding(0) var<uniform> view: View;

const INK = vec3f(220.0, 235.0, 255.0) / 255.0;
const HIGHLIGHT = vec3f(255.0, 209.0, 102.0) / 255.0;
const SHADOW = vec3f(3.0, 18.0, 46.0) / 255.0;

// Coverage of a line of the given width, d px from its middle, on the screen.
fn line(d: f32, width: f32) -> f32 {
  return clamp((width * 0.5 - d) * view.dpr + 0.5, 0.0, 1.0);
}

// The same in plan space, where one device pixel spans fw plan px.
fn cover(d: f32, width: f32, fw: f32) -> f32 {
  return clamp((width * 0.5 - d) / max(fw, 1e-4) + 0.5, 0.0, 1.0);
}

// Coverage of an edge that's px device pixels wide however far away it is.
fn edge(d: f32, px: f32, fw: f32) -> f32 {
  return clamp(px * 0.5 - abs(d) / max(fw, 1e-4) + 0.5, 0.0, 1.0);
}

// Distance from p to the segment a-b, and how far along it p falls.
fn segment(p: vec2f, a: vec2f, b: vec2f) -> vec2f {
  let ab = b - a;
  let len = max(length(ab), 1e-4);
  let t = clamp(dot(p - a, ab) / (len * len), 0.0, 1.0);
  return vec2f(length(p - (a + ab * t)), t * len);
}

// A point on the screen, in canvas px.
fn toClip(p: vec2f) -> vec4f {
  return vec4f(p / view.size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
}

// A point in the house, in plan px.
fn project(p: vec3f) -> vec4f {
  let q = view.m * vec4f(p, 1.0);
  return vec4f(q.x * 2.0 / view.size.x - q.w, q.w - q.y * 2.0 / view.size.y, q.z, q.w);
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

// NOTE: the floor under the house, once it rises: a shade where the house
// stands, a fine grid that fades out past its walls, and a gold sweep that
// runs back across it as the walls go up.
export const FLOOR = /* wgsl */ `
${COMMON}

const PAD = 40.0;
const GRID = 12.0;

@vertex
fn vs(@builtin(vertex_index) v: u32) -> Out {
  let r = view.house;
  if (view.lift <= 0.0) { return hidden(0u); }
  let p = mix(r.xy - PAD, r.xy + r.zw + PAD, QUAD[v]);
  var out: Out;
  out.i = 0u;
  out.position = project(vec3f(p, 0.0));
  out.p = p;
  return out;
}

@fragment
fn fs(in: Out) -> @location(0) vec4f {
  let fw = fwidth(in.p);
  let r = view.house;
  let rel = in.p - r.xy;
  let inside = clamp(
    min(min(rel.x, rel.y), min(r.z - rel.x, r.w - rel.y)) / max(max(fw.x, fw.y), 1e-4) + 0.5,
    0.0,
    1.0,
  );
  let outside = length(max(max(r.xy - in.p, in.p - (r.xy + r.zw)), vec2f(0.0)));
  let fade = exp(-(outside * outside) / (2.0 * 16.0 * 16.0));

  let g = abs(rel - GRID * round(rel / GRID));
  let grid = max(edge(g.x, 1.0, fw.x), edge(g.y, 1.0, fw.y));

  // A soft shadow, a little past the walls, so the house sits on the page.
  let shade = exp(-(outside * outside) / (2.0 * 7.0 * 7.0));
  var color = paint(SHADOW, max(inside, shade * 0.6) * 0.28 * view.lift);
  color = over(paint(INK, grid * fade * 0.11 * view.lift), color);

  // The sweep, from the front of the house to the back while it rises.
  let rising = select(0.0, 1.0, view.lift < 1.0);
  let sweep = mix(r.y + r.w, r.y, view.lift);
  let band = exp(-pow((in.p.y - sweep) / 9.0, 2.0)) * inside * rising;
  color = over(paint(HIGHLIGHT, band * 0.32), color);
  return color;
}
`

// NOTE: from.xy, to.xy, then width, reveal, gold, dash, alpha, rise, and
// two unused. Matches `struct Wall`.
export const WALL_FLOATS = 12

const WALL_STRUCT = /* wgsl */ `
struct Wall {
  path: vec4f,
  // width, reveal, gold, dash
  look: vec4f,
  // alpha, rise, unused
  more: vec4f,
}

@group(0) @binding(1) var<storage, read> walls: array<Wall>;
`

// NOTE: every wall's line on the floor, drafted by the pen. In plan space,
// so with the house flat it's exactly the 2D drawing, and once it tips the
// lines lie on the floor in perspective.
export const STROKES = /* wgsl */ `
${COMMON}
${WALL_STRUCT}

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
  out.position = project(vec3f(p, 0.0));
  out.p = p;
  return out;
}

@fragment
fn fs(in: Out) -> @location(0) vec4f {
  let fw = max(fwidth(in.p.x), fwidth(in.p.y));
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
  var color = paint(ink, cover(along.x, width, fw) * drawn * on * alpha);

  // A soft glow at the pen's tip while it draws.
  let tip = a + (b - a) * reveal;
  let r = length(in.p - tip);
  let glow = exp(-(r * r) / 14.0) * drawing;
  color = over(paint(HIGHLIGHT, glow * 0.9), color);
  return color;
}
`

// NOTE: the walls standing up: each one a see-through panel over its line,
// with a bright top edge and corners, faint section hatching, and a slow
// scan line. The top edge glows gold while the walls rise, then cools to
// ink. Panels are tested against the pets' depth, so a wall in front of a
// pet tints it and a wall behind one doesn't.
export const PANELS = /* wgsl */ `
${COMMON}
${WALL_STRUCT}

struct PanelOut {
  @builtin(position) position: vec4f,
  // Along the wall, and up it, in plan px.
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) i: u32,
  @location(2) @interpolate(flat) h: f32,
}

const BLEED = 2.0;
const HATCH = 9.0;
// Light from the back left of the house, for a little shading.
const LIGHT = vec2f(-0.6, -0.8);

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> PanelOut {
  let w = walls[i];
  let h = view.height * w.more.y;
  var out: PanelOut;
  out.i = i;
  out.h = h;
  if (h < 0.25 || w.look.y <= 0.0) {
    out.position = vec4f(2.0, 2.0, 0.0, 1.0);
    out.uv = vec2f(0.0);
    return out;
  }
  let a = w.path.xy;
  let ab = w.path.zw - a;
  let len = max(length(ab), 1e-4);
  let q = QUAD[v];
  let u = mix(-BLEED, len * w.look.y + BLEED, q.x);
  let z = mix(-BLEED, h + BLEED, q.y);
  out.position = project(vec3f(a + ab / len * u, z));
  out.uv = vec2f(u, z);
  return out;
}

@fragment
fn fs(in: PanelOut) -> @location(0) vec4f {
  let fw = fwidth(in.uv);
  let fd = fwidth(in.uv.x + in.uv.y);
  let w = walls[in.i];
  let ab = w.path.zw - w.path.xy;
  let len = length(ab) * w.look.y;
  let h = in.h;
  let u = in.uv.x;
  let v = in.uv.y;

  let across = clamp(min(u, len - u) / max(fw.x, 1e-4) + 0.5, 0.0, 1.0);
  let up = clamp(min(v, h - v) / max(fw.y, 1e-4) + 0.5, 0.0, 1.0);
  let fill = across * up;
  let t = clamp(v / max(h, 1e-4), 0.0, 1.0);

  let dir = ab / max(length(ab), 1e-4);
  let shade = 0.6 + 0.4 * abs(dot(vec2f(-dir.y, dir.x), normalize(LIGHT)));
  let base = mix(INK, HIGHLIGHT, w.look.z);
  let alpha = w.more.x;

  // Clearer at the floor, denser toward the top.
  var color = paint(base, fill * mix(0.03, 0.15, t) * shade * alpha);
  // Section hatching, as a drafter shades a cut wall.
  let d = abs(fract((u + v) / HATCH) - 0.5) * HATCH;
  color = over(paint(base, edge(d, 0.8, fd) * fill * 0.07 * alpha), color);
  // A scan line that climbs each wall now and then.
  let phase = fract(view.time * 0.11 + f32(in.i) * 0.137);
  let scan = exp(-pow((t - phase) * 10.0, 2.0)) * fill;
  color = over(paint(base, scan * 0.16 * alpha), color);

  // The top edge and the two upright corners.
  let px = 1.25 * view.dpr;
  let top = edge(v - h, px, fw.y) * across;
  let ends = max(edge(u, px, fw.x), edge(u - len, px, fw.x)) * up;
  let rising = 1.0 - view.lift;
  let rim = mix(base, HIGHLIGHT, rising);
  color = over(paint(rim, max(top, ends * 0.65) * alpha), color);
  // While rising, the top edge glows.
  let bloom = exp(-pow((v - h) / max(fw.y * 4.0, 1e-4), 2.0)) * across * rising;
  color = over(paint(HIGHLIGHT, bloom * 0.45), color);
  return color;
}
`

// NOTE: screen-space lines, for Teddy's barks. Same layout as `struct Wall`.
export const LINES = /* wgsl */ `
${COMMON}
${WALL_STRUCT}

const MARGIN = 10.0;

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let w = walls[i];
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
  let along = segment(in.p, w.path.xy, w.path.zw);
  let color = mix(INK, HIGHLIGHT, w.look.z);
  return paint(color, line(along.x, w.look.x) * w.more.x);
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
// faces left) and alpha, then depth and three unused. Matches `struct
// Sprite`.
export const SPRITE_FLOATS = 12

export const spritesShader = (cols: number, rows: number) => /* wgsl */ `
${COMMON}

struct Sprite {
  box: vec4f,
  // column, row, flip, alpha
  cell: vec4f,
  // depth, unused
  more: vec4f,
}

@group(0) @binding(1) var<storage, read> sprites: array<Sprite>;
@group(0) @binding(2) var sheet: texture_2d<f32>;
@group(0) @binding(3) var sheetSampler: sampler;

const SHEET = vec2f(${cols}.0, ${rows}.0);
// The parts of a pet solid enough to hide a wall behind them.
const SOLID = 0.35;

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
  // Standing up and facing the viewer, at the depth of its feet.
  let clip = toClip(s.box.xy + q * s.box.zw);
  out.position = vec4f(clip.xy, s.more.x, 1.0);
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

// A depth-only pass first, so the walls know where the pets are.
@fragment
fn solid(in: SpriteOut) -> @location(0) vec4f {
  let c = textureSample(sheet, sheetSampler, in.uv) * in.alpha;
  if (c.a < SOLID) { discard; }
  return vec4f(0.0);
}
`

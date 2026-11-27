// NOTE: the Selected Work drawing. Coordinates are CSS pixels from the
// canvas's top-left. Each box and each arrow is one instanced quad a little
// larger than itself, so a fragment only ever looks at its own shape and a
// frame costs about as much as the boxes' area, not the whole section.

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

// The wave: a crest of light with a ripple in it, rising over its first
// RISE px and dying away over the rest of its length.
const RISE = 14.0;
const RIPPLE = 15.0;
const SWELL = 2.2;

// How strong the wave is, a given number of px back from its front, 0 to 1.
fn swell(behind: f32, len: f32) -> f32 {
  if (behind < 0.0 || behind > len) { return 0.0; }
  return smoothstep(0.0, RISE, behind) * pow(1.0 - behind / len, 1.6);
}

// The crest is the wave's colour lifted toward white.
fn crest(color: vec3f) -> vec3f {
  return mix(color, vec3f(1.0), 0.35);
}

// How far the wave pushes the line off its rest, in px.
fn ripple(behind: f32, strength: f32) -> f32 {
  return SWELL * strength * sin(behind * 6.2831853 / RIPPLE);
}

const QUAD = array<vec2f, 6>(
  vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
);
`

// NOTE: rect.xy, rect.zw (size); hover, out, ping, entry; then the wave:
// start, front, length, on; then its colour (rgb, unused).
export const BOX_FLOATS = 16

export const BOXES = /* wgsl */ `
${COMMON}

struct Box {
  rect: vec4f,
  // hover, out (the RESULT box is gold), ping, entry (0 left, 1 top)
  anim: vec4f,
  // How far along the job's path the wave reaches this box, where its front
  // is, how long it is (all px), and 1 while there's a wave.
  wave: vec4f,
  // The wave's colour: gold, or the job's own.
  color: vec4f,
}

@group(0) @binding(1) var<storage, read> boxes: array<Box>;

const MARGIN = 14.0;
// Corner marks sit this far out from the box, and grow to this length.
const TICK_GAP = 5.0;
const TICK_LEN = 8.0;
const HATCH = 7.0;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) p: vec2f,
  @location(1) @interpolate(flat) i: u32,
}

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let b = boxes[i];
  var out: Out;
  out.i = i;
  // A box that isn't laid out covers nothing.
  if (b.rect.z <= 0.0) {
    out.position = vec4f(2.0, 2.0, 0.0, 1.0);
    out.p = vec2f(0.0);
    return out;
  }
  let p = mix(b.rect.xy - MARGIN, b.rect.xy + b.rect.zw + MARGIN, QUAD[v]);
  out.position = toClip(p);
  out.p = p;
  return out;
}

@fragment
fn fs(in: Out) -> @location(0) vec4f {
  let b = boxes[in.i];
  let hover = b.anim.x;
  let gold = b.anim.y;
  let ping = b.anim.z;
  let p = in.p;

  // The CSS border is the box's outer 1px, so its middle is half a px in.
  let lo = b.rect.xy + 0.5;
  let hi = b.rect.xy + b.rect.zw - 0.5;
  let w = hi.x - lo.x;
  let h = hi.y - lo.y;
  let perimeter = 2.0 * (w + h);

  // How far round the outline (clockwise from the top-left corner) the
  // nearest point on it is.
  let top = segment(p, lo, vec2f(hi.x, lo.y));
  let right = segment(p, vec2f(hi.x, lo.y), hi);
  let bottom = segment(p, hi, vec2f(lo.x, hi.y));
  let left = segment(p, vec2f(lo.x, hi.y), lo);
  var d = top.x;
  var s = top.y;
  if (right.x < d) { d = right.x; s = w + right.y; }
  if (bottom.x < d) { d = bottom.x; s = w + h + bottom.y; }
  if (left.x < d) { d = left.x; s = 2.0 * w + h + left.y; }

  // Signed distance to the outline: negative inside.
  let centre = (lo + hi) * 0.5;
  let q = abs(p - centre) - (hi - lo) * 0.5;
  let sd = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0);

  // The wave comes in at the middle of one side, splits both ways round the
  // box, and meets itself again opposite, where the next arrow leaves.
  let entry = select(perimeter - h * 0.5, w * 0.5, b.anim.w > 0.5);
  let gone = abs(s - entry);
  let local = min(gone, perimeter - gone);
  let behind = b.wave.y - (b.wave.x + local);
  let strength = swell(behind, b.wave.z) * b.wave.w;
  let dd = abs(sd - ripple(behind, strength));

  let base = mix(INK, HIGHLIGHT, gold);
  let baseAlpha = mix(0.9, 1.0, gold);
  let tint = b.color.rgb;
  let ink = mix(base, crest(tint), strength);
  var color = paint(ink, line(dd, 1.0 + strength * 0.8) * max(baseAlpha, strength));

  // Light round the crest, and a moment's glow once the wave closes on
  // RESULT, both in the wave's colour; and a hint of gold under the pointer.
  let wash = exp(-(dd * dd) / 30.0);
  color = over(paint(tint, wash * (strength * 0.55 + ping * 0.45)), color);
  color = over(paint(HIGHLIGHT, wash * hover * 0.12), color);

  // Hover: faint drafting hatch inside, and crop marks at the corners.
  if (hover > 0.0) {
    let inside = all(p > lo) && all(p < hi);
    let u = (p.x - p.y) * 0.70710678;
    let m = abs(u - HATCH * round(u / HATCH));
    let hatch = line(m, 1.0) * 0.07 * hover * select(0.0, 1.0, inside);
    color = over(paint(base, hatch), color);

    // Fold every corner onto the top-left one.
    let folded = centre - abs(p - centre);
    let corner = lo - TICK_GAP;
    let len = TICK_LEN * hover;
    let across = segment(folded, corner, corner + vec2f(len, 0.0)).x;
    let down = segment(folded, corner, corner + vec2f(0.0, len)).x;
    let tick = line(min(across, down), 1.0) * hover * select(0.0, 1.0, len > 0.5);
    color = over(paint(base, tick * 0.8), color);
  }

  return color;
}
`

// NOTE: from.xy, to.xy, then the wave as for a box: start, front, length,
// on; then its colour (rgb, unused).
export const GAP_FLOATS = 12

export const GAPS = /* wgsl */ `
${COMMON}

struct Gap {
  path: vec4f,
  wave: vec4f,
  color: vec4f,
}

@group(0) @binding(1) var<storage, read> gaps: array<Gap>;

const MARGIN = 10.0;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) p: vec2f,
  @location(1) @interpolate(flat) i: u32,
}

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let g = gaps[i];
  var out: Out;
  out.i = i;
  if (g.wave.w <= 0.0) {
    out.position = vec4f(2.0, 2.0, 0.0, 1.0);
    out.p = vec2f(0.0);
    return out;
  }
  let lo = min(g.path.xy, g.path.zw) - MARGIN;
  let hi = max(g.path.xy, g.path.zw) + MARGIN;
  let p = mix(lo, hi, QUAD[v]);
  out.position = toClip(p);
  out.p = p;
  return out;
}

// Only the wave crosses an arrow: the arrow itself is the page's glyph.
@fragment
fn fs(in: Out) -> @location(0) vec4f {
  let g = gaps[in.i];
  let a = g.path.xy;
  let b = g.path.zw;
  let len = max(length(b - a), 1e-4);
  let dir = (b - a) / len;
  let normal = vec2f(-dir.y, dir.x);
  let along = dot(in.p - a, dir);
  let across = dot(in.p - a, normal);
  let onArrow = select(0.0, 1.0, along >= 0.0 && along <= len);

  let behind = g.wave.y - (g.wave.x + along);
  let strength = swell(behind, g.wave.z) * onArrow;
  let dd = abs(across - ripple(behind, strength));

  var color = paint(crest(g.color.rgb), line(dd, 1.0 + strength * 0.8) * strength);
  let glow = exp(-(dd * dd) / 30.0) * strength * 0.55;
  color = over(paint(g.color.rgb, glow), color);
  return color;
}
`

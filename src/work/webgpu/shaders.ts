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

const QUAD = array<vec2f, 6>(
  vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
);
`

// NOTE: rect.xy, rect.zw (size), then reveal, hover, out, ping.
export const BOX_FLOATS = 8

export const BOXES = /* wgsl */ `
${COMMON}

struct Box {
  rect: vec4f,
  // reveal, hover, out (the RESULT box is gold), ping
  anim: vec4f,
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
  // A box that hasn't started drawing covers nothing.
  if (b.anim.x <= 0.0 && b.anim.y <= 0.0) {
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
  let reveal = b.anim.x;
  let hover = b.anim.y;
  let gold = b.anim.z;
  let ping = b.anim.w;
  let p = in.p;

  // The CSS border is the box's outer 1px, so its middle is half a px in.
  let lo = b.rect.xy + 0.5;
  let hi = b.rect.xy + b.rect.zw - 0.5;
  let w = hi.x - lo.x;
  let h = hi.y - lo.y;
  let perimeter = 2.0 * (w + h);

  // The nearest edge, and how far round the outline (clockwise from the
  // top-left corner) the nearest point on it is.
  let top = segment(p, lo, vec2f(hi.x, lo.y));
  let right = segment(p, vec2f(hi.x, lo.y), hi);
  let bottom = segment(p, hi, vec2f(lo.x, hi.y));
  let left = segment(p, vec2f(lo.x, hi.y), lo);
  var d = top.x;
  var s = top.y;
  if (right.x < d) { d = right.x; s = w + right.y; }
  if (bottom.x < d) { d = bottom.x; s = w + h + bottom.y; }
  if (left.x < d) { d = left.x; s = 2.0 * w + h + left.y; }

  // Two pens leave the top-left corner in opposite directions and meet at
  // the bottom-right, so each draws half the outline.
  let head = reveal * perimeter * 0.5;
  // How far behind each pen this point is: negative until that pen passes.
  let one = head - s;
  let two = head - (perimeter - s);
  let drawn = select(0.0, 1.0, max(one, two) >= 0.0);
  // Distance back to the nearest pen that has passed, and to the nearest tip.
  let behind = select(select(two, one, one >= 0.0), min(one, two), one >= 0.0 && two >= 0.0);
  let toTip = min(abs(one), abs(two));
  let drawing = select(0.0, 1.0, reveal < 1.0);

  let base = mix(INK, HIGHLIGHT, gold);
  let baseAlpha = mix(0.9, 1.0, gold);
  // Fresh ink is warm, and cools to the line color behind the pen.
  let fresh = exp(-max(behind, 0.0) / 70.0) * drawing;
  let ink = mix(base, HIGHLIGHT, fresh);

  var color = paint(ink, line(d, 1.0) * drawn * baseAlpha);

  // A soft glow at each pen's tip while it draws.
  let tip = exp(-(toTip * toTip) / 90.0) * exp(-(d * d) / 18.0) * drawing;
  color = over(paint(HIGHLIGHT, tip * 0.9), color);

  // The spark just landed: the outline glows for a moment.
  let glow = exp(-(d * d) / 40.0) * (ping * 0.45 + hover * 0.12) * drawn;
  color = over(paint(HIGHLIGHT, glow), color);

  // Hover: faint drafting hatch inside, and crop marks at the corners.
  if (hover > 0.0) {
    let inside = all(p > lo) && all(p < hi);
    let u = (p.x - p.y) * 0.70710678;
    let m = abs(u - HATCH * round(u / HATCH));
    let hatch = line(m, 1.0) * 0.07 * hover * select(0.0, 1.0, inside);
    color = over(paint(base, hatch), color);

    // Fold every corner onto the top-left one.
    let centre = (lo + hi) * 0.5;
    let q = centre - abs(p - centre);
    let corner = lo - TICK_GAP;
    let len = TICK_LEN * hover;
    let across = segment(q, corner, corner + vec2f(len, 0.0)).x;
    let down = segment(q, corner, corner + vec2f(0.0, len)).x;
    let tick = line(min(across, down), 1.0) * hover * select(0.0, 1.0, len > 0.5);
    color = over(paint(base, tick * 0.8), color);
  }

  return color;
}
`

// NOTE: from.xy, to.xy, then t (0 to 1 travelling, past 1 fading), unused.
export const SPARK_FLOATS = 8

export const SPARKS = /* wgsl */ `
${COMMON}

struct Spark {
  path: vec4f,
  anim: vec4f,
}

@group(0) @binding(1) var<storage, read> sparks: array<Spark>;

const MARGIN = 10.0;
const TRAIL = 22.0;
const TAIL = 0.4;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) p: vec2f,
  @location(1) @interpolate(flat) i: u32,
}

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let s = sparks[i];
  var out: Out;
  out.i = i;
  if (s.anim.x < 0.0) {
    out.position = vec4f(2.0, 2.0, 0.0, 1.0);
    out.p = vec2f(0.0);
    return out;
  }
  let lo = min(s.path.xy, s.path.zw) - MARGIN;
  let hi = max(s.path.xy, s.path.zw) + MARGIN;
  let p = mix(lo, hi, QUAD[v]);
  out.position = toClip(p);
  out.p = p;
  return out;
}

@fragment
fn fs(in: Out) -> @location(0) vec4f {
  let s = sparks[in.i];
  let a = s.path.xy;
  let b = s.path.zw;
  let t = s.anim.x;
  let len = length(b - a);
  let fade = 1.0 - smoothstep(1.0, 1.0 + TAIL, t);

  let head = min(t, 1.0) * len;
  let along = segment(in.p, a, b);
  // The trail: brightest at the spark, gone TRAIL px behind it.
  let behind = head - along.y;
  let trail = select(0.0, pow(1.0 - behind / TRAIL, 2.0), behind >= 0.0 && behind <= TRAIL);
  var color = paint(HIGHLIGHT, line(along.x, 1.5) * trail * 0.9 * fade);

  let tip = a + (b - a) * (head / max(len, 1e-4));
  let r = length(in.p - tip);
  let spot = exp(-(r * r) / 8.0) * fade;
  color = over(paint(mix(HIGHLIGHT, vec3f(1.0), 0.5), spot), color);
  return color;
}
`

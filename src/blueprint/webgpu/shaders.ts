// NOTE: all coordinates are CSS pixels. "Doc" space is the page's own
// coordinates (viewport + scroll), so the GPU grid lines up exactly with the
// CSS grid on body that it replaces: a minor line every 24px, a major line
// every 120px, each 1px wide at the start of its cell.

const COMMON = /* wgsl */ `
struct Frame {
  viewport: vec2f,
  scroll: vec2f,
  pointer: vec2f,
  extent: vec2f,
  warp: f32,
  flow: f32,
  dpr: f32,
  dt: f32,
  time: f32,
  seed: f32,
  _pad: vec2f,
}

@group(0) @binding(0) var<uniform> frame: Frame;

const MINOR = 24.0;
const MAJOR = 120.0;
const LENS_RADIUS = 140.0;
// Below 1, so the lens magnifies smoothly and never folds over itself.
const LENS_STRENGTH = 0.14;

// A soft magnifier at the pointer: the screen point p shows the page at
// p - lensOffset(p), so the lines spread a little around the cursor.
fn lensOffset(p: vec2f) -> vec2f {
  let d = p - frame.pointer;
  let falloff = exp(-dot(d, d) / (2.0 * LENS_RADIUS * LENS_RADIUS));
  return d * LENS_STRENGTH * falloff * frame.warp;
}
`

export const BACKGROUND = /* wgsl */ `
${COMMON}

struct Out {
  @builtin(position) position: vec4f,
}

@vertex
fn vs(@builtin(vertex_index) i: u32) -> Out {
  // One triangle that covers the screen.
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var out: Out;
  out.position = vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
  return out;
}

// Coverage of a 1px line at the start of every cell of the given size.
fn lines(doc: vec2f, size: f32) -> f32 {
  let m = doc - 0.5 - size * round((doc - 0.5) / size);
  let dist = min(abs(m.x), abs(m.y));
  return clamp((0.5 - dist) * frame.dpr + 0.5, 0.0, 1.0);
}

const PAPER = vec3f(15.0, 59.0, 120.0) / 255.0;
const INK = vec3f(200.0, 222.0, 255.0) / 255.0;
const HIGHLIGHT = vec3f(255.0, 209.0, 102.0) / 255.0;

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let p = position.xy / frame.dpr;
  let doc = p - lensOffset(p) + frame.scroll;

  let d = p - frame.pointer;
  let near = exp(-dot(d, d) / (2.0 * 90.0 * 90.0)) * frame.warp;

  let major = lines(doc, MAJOR);
  let minor = lines(doc, MINOR);
  var color = PAPER;
  color = mix(color, INK, minor * (0.05 + 0.05 * near));
  color = mix(color, INK, major * (0.14 + 0.16 * near));
  // While the flow runs, the major lines warm up a little.
  color = mix(color, HIGHLIGHT, major * 0.06 * frame.flow);
  return vec4f(color, 1.0);
}
`

export const PARTICLE_COUNT = 1024
export const WORKGROUP = 64
// NOTE: pos.xy, vel.xy per particle.
export const PARTICLE_FLOATS = 4

export const SIMULATE = /* wgsl */ `
${COMMON}

struct Particle {
  pos: vec2f,
  vel: vec2f,
}

@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

fn hash(n: u32) -> f32 {
  var x = n;
  x = (x ^ 61u) ^ (x >> 16u);
  x = x * 9u;
  x = x ^ (x >> 4u);
  x = x * 0x27d4eb2du;
  x = x ^ (x >> 15u);
  return f32(x) / 4294967295.0;
}

const TURN_CHANCE = 0.32;

// A pen moves along a grid line. At each crossing it may turn onto the
// crossing line, so it draws the blueprint one segment at a time.
@compute @workgroup_size(${WORKGROUP})
fn step(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&particles)) { return; }
  var p = particles[i];
  let speed = length(p.vel);
  let alongX = abs(p.vel.x) > 0.0;

  let before = select(p.pos.y, p.pos.x, alongX);
  p.pos += p.vel * frame.dt;
  let after = select(p.pos.y, p.pos.x, alongX);

  let cellBefore = floor((before - 0.5) / MINOR);
  let cellAfter = floor((after - 0.5) / MINOR);
  if (cellBefore != cellAfter) {
    let roll = hash(i * 7919u + u32(frame.seed));
    if (roll < TURN_CHANCE) {
      let crossing = max(cellBefore, cellAfter) * MINOR + 0.5;
      let sign = select(-1.0, 1.0, roll < TURN_CHANCE * 0.5);
      if (alongX) {
        p.pos.x = crossing;
        p.vel = vec2f(0.0, sign * speed);
      } else {
        p.pos.y = crossing;
        p.vel = vec2f(sign * speed, 0.0);
      }
    }
  }

  p.pos = p.pos - frame.extent * floor(p.pos / frame.extent);
  particles[i] = p;
}
`

export const PENS = /* wgsl */ `
${COMMON}

struct Particle {
  pos: vec2f,
  vel: vec2f,
}

@group(0) @binding(1) var<storage, read> particles: array<Particle>;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) along: f32,
}

const TRAIL = 30.0;
const WIDTH = 1.6;

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let p = particles[i];
  let dir = normalize(p.vel + vec2f(1e-5, 0.0));
  let side = vec2f(-dir.y, dir.x);

  // The particle wraps on the page in doc space; draw it where it shows now.
  var head = p.pos - frame.scroll;
  head = head - frame.extent * floor(head / frame.extent);
  head = head + lensOffset(head);

  // Two triangles: tail (along = 0) to head (along = 1).
  let corners = array<vec2f, 6>(
    vec2f(0.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(0.0, -1.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
  );
  let c = corners[v];
  let point = head - dir * TRAIL * (1.0 - c.x) + side * c.y * WIDTH * 0.5;
  let clip = point / frame.viewport * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0);

  var out: Out;
  out.position = vec4f(clip, 0.0, 1.0);
  out.along = c.x;
  return out;
}

const PEN = vec3f(255.0, 209.0, 102.0) / 255.0;

@fragment
fn fs(in: Out) -> @location(0) vec4f {
  let a = in.along * in.along * 0.7 * frame.flow;
  return vec4f(PEN * a, a);
}
`

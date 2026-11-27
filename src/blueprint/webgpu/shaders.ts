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
const LENS_STRENGTH = 0.09;

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
  color = mix(color, INK, minor * (0.05 + 0.025 * near));
  color = mix(color, INK, major * (0.14 + 0.08 * near));
  // While the flow runs, the major lines warm up a little.
  color = mix(color, HIGHLIGHT, major * 0.06 * frame.flow);
  return vec4f(color, 1.0);
}
`

// NOTE: a multiple of WORKGROUP, so every compute invocation has a pen.
export const PARTICLE_COUNT = 320
export const WORKGROUP = 64
// NOTE: pos.xy, vel.xy, aim.xy, zombie, caught per pen. Matches `Pen`.
export const PARTICLE_FLOATS = 8
// Pen 0 is patient zero: a zombie from the start that never gets better.
export const PATIENT_ZERO = 0
export const PATIENT_ZERO_SPEED = 70
// A new outbreak has one zombie: patient zero.
export const FIRST_INFECTED = 1
export const FOREVER = 1e9
// A pen that has never been sick, and can be caught.
export const HEALTHY = -1e4

const PEN_STRUCT = /* wgsl */ `
struct Pen {
  pos: vec2f,
  vel: vec2f,
  // A zombie's way to the nearest pen it can see, or zero.
  aim: vec2f,
  // Seconds left as a zombie. Zero or less is a yellow pen, which counts
  // on down while it's immune after getting better.
  zombie: f32,
  // 1 when a zombie touched this pen in the last infect pass.
  caught: f32,
}

const TRAIL = 30.0;
`

export const SIMULATE = /* wgsl */ `
${COMMON}
${PEN_STRUCT}

@group(0) @binding(1) var<storage, read_write> pens: array<Pen>;

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
// How long an infection lasts before the pen turns yellow again. Each pen
// gets a little more or less, so they don't all get better at once.
const SICK_S = 24.0;
// How long a pen that got better can't be caught again. It lets an outbreak
// burn out, then flare up again.
const IMMUNE_S = 12.0;
const LONG_AGO = -1e4;

fn catchable(zombie: f32) -> bool {
  return zombie <= -IMMUNE_S;
}
// How close a zombie has to get to a pen's line to bite it.
const BITE = 4.0;
// How far a zombie can see a pen to chase it.
const SIGHT = 360.0;

// The shortest way from one point to another on the wrapping field.
fn toward(d: vec2f) -> vec2f {
  return d - frame.extent * round(d / frame.extent);
}

fn heading(vel: vec2f) -> vec2f {
  return normalize(vel + vec2f(1e-5, 0.0));
}

// How far a point is from a pen's line, which runs back TRAIL px from its head.
fn lineDistance(point: vec2f, head: vec2f, dir: vec2f) -> f32 {
  let rel = toward(point - head);
  let t = clamp(dot(rel, -dir), 0.0, TRAIL);
  return length(rel + dir * t);
}

// Pass 1. A pen moves along a grid line. At each crossing a plain pen may
// turn onto the crossing line, so it draws the blueprint one segment at a
// time, and a zombie turns toward the pen it's chasing.
@compute @workgroup_size(${WORKGROUP})
fn step(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&pens)) { return; }
  var p = pens[i];

  if (p.caught > 0.0 && catchable(p.zombie)) {
    p.zombie = SICK_S * mix(0.7, 1.3, hash(i * 2654435761u + u32(frame.seed)));
  }
  p.caught = 0.0;
  p.zombie = max(p.zombie - frame.dt, LONG_AGO);

  let speed = length(p.vel);
  let alongX = abs(p.vel.x) > 0.0;
  let before = select(p.pos.y, p.pos.x, alongX);
  p.pos += p.vel * frame.dt;
  let after = select(p.pos.y, p.pos.x, alongX);

  let cellBefore = floor((before - 0.5) / MINOR);
  let cellAfter = floor((after - 0.5) / MINOR);
  if (cellBefore != cellAfter) {
    let crossing = max(cellBefore, cellAfter) * MINOR + 0.5;
    if (p.zombie > 0.0 && dot(p.aim, p.aim) > 0.0) {
      // Head for the pen along whichever axis it's farther on.
      let wantX = abs(p.aim.x) > abs(p.aim.y);
      if (wantX != alongX) {
        if (alongX) { p.pos.x = crossing; } else { p.pos.y = crossing; }
      }
      p.vel = select(
        vec2f(0.0, sign(p.aim.y)),
        vec2f(sign(p.aim.x), 0.0),
        wantX,
      ) * speed;
    } else {
      let roll = hash(i * 7919u + u32(frame.seed));
      if (roll < TURN_CHANCE) {
        let turn = select(-1.0, 1.0, roll < TURN_CHANCE * 0.5);
        if (alongX) {
          p.pos.x = crossing;
          p.vel = vec2f(0.0, turn * speed);
        } else {
          p.pos.y = crossing;
          p.vel = vec2f(turn * speed, 0.0);
        }
      }
    }
  }

  p.pos = p.pos - frame.extent * floor(p.pos / frame.extent);
  pens[i] = p;
}

// Pass 2. Every pen looks at every other. A zombie picks the nearest pen it
// can see and catch to chase, and a pen a zombie bites is caught. Each pen only
// writes its own aim and caught, which no one reads here, so the pass is
// free of races. A bite turns a pen on the next step.
@compute @workgroup_size(${WORKGROUP})
fn infect(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let count = arrayLength(&pens);
  if (i >= count) { return; }
  let pos = pens[i].pos;
  let dir = heading(pens[i].vel);
  let isZombie = pens[i].zombie > 0.0;
  // Immune pens sit this out.
  if (!isZombie && !catchable(pens[i].zombie)) {
    pens[i].aim = vec2f(0.0);
    pens[i].caught = 0.0;
    return;
  }

  var nearest = SIGHT * SIGHT;
  var aim = vec2f(0.0);
  var caught = 0.0;
  for (var j = 0u; j < count; j++) {
    let otherZombie = pens[j].zombie > 0.0;
    if (j == i || otherZombie == isZombie) { continue; }
    if (!otherZombie && !catchable(pens[j].zombie)) { continue; }
    let other = pens[j].pos;
    if (isZombie) {
      let d = toward(other - pos);
      let d2 = dot(d, d);
      if (d2 < nearest) {
        nearest = d2;
        aim = d;
      }
    } else if (lineDistance(other, pos, dir) < BITE) {
      // A zombie's head on this pen's line.
      caught = 1.0;
    }
  }
  pens[i].aim = aim;
  pens[i].caught = caught;
}
`

export const PENS = /* wgsl */ `
${COMMON}
${PEN_STRUCT}

@group(0) @binding(1) var<storage, read> pens: array<Pen>;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) along: f32,
  // 0 for a yellow pen, 1 for a zombie, in between while it gets better.
  @location(1) zombie: f32,
}

const WIDTH = 1.6;

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let p = pens[i];
  let dir = normalize(p.vel + vec2f(1e-5, 0.0));
  let side = vec2f(-dir.y, dir.x);

  // The pen wraps on the page in doc space; draw it where it shows now.
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
  out.zombie = clamp(p.zombie, 0.0, 1.0);
  return out;
}

const PEN = vec3f(255.0, 209.0, 102.0) / 255.0;
// Munch Manor green.
const ZOMBIE = vec3f(124.0, 227.0, 107.0) / 255.0;

@fragment
fn fs(in: Out) -> @location(0) vec4f {
  let a = in.along * in.along * mix(0.7, 0.95, in.zombie) * frame.flow;
  return vec4f(mix(PEN, ZOMBIE, in.zombie) * a, a);
}
`

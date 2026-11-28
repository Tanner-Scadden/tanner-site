import { GOLD, INK as INK_RGB, wgsl } from './palette.ts'


export const INK = `
const INK = ${wgsl(INK_RGB)};
`

export const HIGHLIGHT = `
const HIGHLIGHT = ${wgsl(GOLD)};
`

export const LINE = `
// Coverage of a line of the given width, d px from its middle, on the screen.
fn line(d: f32, width: f32) -> f32 {
  return clamp((width * 0.5 - d) * view.dpr + 0.5, 0.0, 1.0);
}
`

export const SEGMENT = `
// Distance from p to the segment a-b, and how far along it p falls.
fn segment(p: vec2f, a: vec2f, b: vec2f) -> vec2f {
  let ab = b - a;
  let len = max(length(ab), 1e-4);
  let t = clamp(dot(p - a, ab) / (len * len), 0.0, 1.0);
  return vec2f(length(p - (a + ab * t)), t * len);
}
`

export const TO_CLIP = `
// A point on the screen, in canvas px.
fn toClip(p: vec2f) -> vec4f {
  return vec4f(p / view.size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
}
`

export const OVER = `
// Premultiplied "over".
fn over(top: vec4f, under: vec4f) -> vec4f {
  return top + under * (1.0 - top.a);
}
`

export const PAINT = `
fn paint(color: vec3f, alpha: f32) -> vec4f {
  let a = clamp(alpha, 0.0, 1.0);
  return vec4f(color * a, a);
}
`

export const QUAD = `
const QUAD = array<vec2f, 6>(
  vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
);
`

export const OUT = `
struct Out {
  @builtin(position) position: vec4f,
  @location(0) p: vec2f,
  @location(1) @interpolate(flat) i: u32,
}
`

export const HIDDEN = `
fn hidden(i: u32) -> Out {
  var out: Out;
  out.i = i;
  out.position = vec4f(2.0, 2.0, 0.0, 1.0);
  out.p = vec2f(0.0);
  return out;
}
`

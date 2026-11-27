const VIEW = /* wgsl */ `
struct View { size: vec2f, opacity: f32, pad: f32 };
@group(0) @binding(0) var<uniform> view: View;

fn clip(p: vec2f) -> vec4f {
  return vec4f(p.x / view.size.x * 2.0 - 1.0, 1.0 - p.y / view.size.y * 2.0, 0.0, 1.0);
}
`

// One line: start, end, colour, width. 12 floats with padding.
export const LINE_FLOATS = 12

export const LINES = /* wgsl */ `
${VIEW}
struct Line { start: vec2f, end: vec2f, color: vec4f, width: f32, p0: f32, p1: f32, p2: f32 };
@group(0) @binding(1) var<storage, read> lines: array<Line>;

struct Out {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) across: f32,
  @location(2) half: f32,
};

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let line = lines[i];
  let d = line.end - line.start;
  let len = max(length(d), 0.0001);
  let dir = d / len;
  let n = vec2f(-dir.y, dir.x);
  var corners = array<vec2f, 6>(
    vec2f(0.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(0.0, -1.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
  );
  let c = corners[v];
  let half = line.width * 0.5 + 1.0;
  var out: Out;
  out.pos = clip(line.start + dir * (c.x * len) + n * (c.y * half));
  out.color = line.color;
  out.across = c.y * half;
  out.half = line.width * 0.5;
  return out;
}

@fragment fn fs(in: Out) -> @location(0) vec4f {
  let a = clamp(in.half + 0.5 - abs(in.across), 0.0, 1.0) * in.color.a * view.opacity;
  return vec4f(in.color.rgb * a, a);
}
`

// One dot: centre, radius, glow, colour, ring. 12 floats with padding.
export const DOT_FLOATS = 12

export const DOTS = /* wgsl */ `
${VIEW}
struct Dot { center: vec2f, radius: f32, glow: f32, color: vec4f, ring: f32, p0: f32, p1: f32, p2: f32 };
@group(0) @binding(1) var<storage, read> dots: array<Dot>;

struct Out {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) local: vec2f,
  @location(2) radius: f32,
  @location(3) glow: f32,
  @location(4) ring: f32,
};

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let dot = dots[i];
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let reach = dot.radius + dot.glow + dot.ring + 1.0;
  let local = corners[v] * reach;
  var out: Out;
  out.pos = clip(dot.center + local);
  out.color = dot.color;
  out.local = local;
  out.radius = dot.radius;
  out.glow = dot.glow;
  out.ring = dot.ring;
  return out;
}

@fragment fn fs(in: Out) -> @location(0) vec4f {
  let d = length(in.local);
  // A ring is only its outline, at its radius.
  if (in.ring > 0.0) {
    let edge = clamp(in.ring * 0.5 + 0.5 - abs(d - in.radius), 0.0, 1.0) * in.color.a * view.opacity;
    return vec4f(in.color.rgb * edge, edge);
  }
  let core = clamp(in.radius + 0.5 - d, 0.0, 1.0);
  var halo = 0.0;
  if (in.glow > 0.0) {
    halo = (1.0 - smoothstep(in.radius, in.radius + in.glow, d)) * 0.35;
  }
  let a = max(core, halo) * in.color.a * view.opacity;
  return vec4f(in.color.rgb * a, a);
}
`

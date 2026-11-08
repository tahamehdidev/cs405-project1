// Coloured lines (axes, frustum, curves, control polygons).
// Vertex layout: [x y z  r g b]  (stride 24 bytes), line-list or line-strip.
// Colours are LINEAR RGB.

struct Uniforms {
  mvp: mat4x4f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) colour: vec3f,
};

@vertex
fn vs(@location(0) pos: vec3f, @location(1) col: vec3f) -> VSOut {
  var o: VSOut;
  o.position = u.mvp * vec4f(pos, 1.0);
  o.colour = col;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4f {
  return toOutput(vec4f(i.colour, 1.0));
}

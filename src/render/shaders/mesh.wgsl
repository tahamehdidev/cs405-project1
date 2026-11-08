// Lit mesh: one directional light plus ambient, flat colour per object.
// Vertex layout: [x y z  nx ny nz]  (stride 24 bytes), triangle-list.
// All lighting is done in LINEAR colour and returned through toOutput().

struct Uniforms {
  mvp: mat4x4f,        // P · V · M
  normalMat: mat4x4f,  // upper 3×3 = inverse-transpose of M's 3×3 (world-space normals)
  colour: vec4f,       // linear RGB + alpha
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
};

@vertex
fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f) -> VSOut {
  var o: VSOut;
  o.position = u.mvp * vec4f(pos, 1.0);
  o.normal = (u.normalMat * vec4f(nrm, 0.0)).xyz;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4f {
  let n = normalize(i.normal);
  let l = normalize(vec3f(0.35, 0.8, 0.5));      // light direction (world space)
  let diffuse = max(dot(n, l), 0.0);
  let lit = u.colour.rgb * (0.30 + 0.70 * diffuse); // ambient + diffuse
  return toOutput(vec4f(lit, u.colour.a));
}

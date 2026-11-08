/**
 * mat4 — 4×4 matrices for Parts A and C.
 *
 * CONVENTIONS (the tests check exactly these):
 *   • A matrix is a Float32Array(16) in COLUMN-MAJOR order — the layout WebGPU
 *     expects for a mat4x4f in a uniform buffer. Element (row r, column c)
 *     lives at index  c * 4 + r.  The translation of an affine matrix is
 *     therefore at indices 12, 13, 14.
 *   • Column vectors: a point p is transformed as  M · p.
 *     multiply(A, B) returns A·B, so B is applied FIRST.
 *   • Right-handed world space. Angles in RADIANS. A positive angle rotates
 *     counter-clockwise when you look down the axis towards the origin
 *     (rotateZ(π/2) takes +x to +y).
 *   • View space: the camera sits at the origin and looks down −z, +y is up.
 *   • Clip space is WebGPU's: after the divide by w, x and y are in [−1, 1]
 *     and z is in [0, 1] (near → 0, far → 1). NOT OpenGL's [−1, 1].
 *
 * No maths libraries (no gl-matrix, no Three.js). Tests: tests/mat4.test.js
 */
import { sub, cross, dot, normalize, length } from './vec3.js';

/* ------------------------------------------------------------- Part A ---- */

/** The 4×4 identity. */
export function identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** A · B (apply B first, then A). Must not modify a or b. */
export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

/** Translation by (tx, ty, tz). */
export function translate(tx, ty, tz) {
  const m = identity();
  m[12] = tx;
  m[13] = ty;
  m[14] = tz;
  return m;
}

/** Rotation by `rad` about the x axis. */
export function rotateX(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  const m = identity();
  m[5] = c;   // (1,1)
  m[6] = s;   // (2,1)
  m[9] = -s;  // (1,2)
  m[10] = c;  // (2,2)
  return m;
}

/** Rotation by `rad` about the y axis. */
export function rotateY(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  const m = identity();
  m[0] = c;   // (0,0)
  m[2] = -s;  // (2,0)
  m[8] = s;   // (0,2)
  m[10] = c;  // (2,2)
  return m;
}

/** Rotation by `rad` about the z axis. */
export function rotateZ(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  const m = identity();
  m[0] = c;   // (0,0)
  m[1] = s;   // (1,0)
  m[4] = -s;  // (0,1)
  m[5] = c;   // (1,1)
  return m;
}

/** Non-uniform scale by (sx, sy, sz). */
export function scale(sx, sy, sz) {
  const m = identity();
  m[0] = sx;
  m[5] = sy;
  m[10] = sz;
  return m;
}

/** Mᵀ */
export function transpose(m) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) out[c * 4 + r] = m[r * 4 + c];
  }
  return out;
}

/**
 * Inverse of a RIGID transform M = T·R (rotation + translation only, no scale).
 * Do not write a general 4×4 inverse: use the structure (Week 3).
 *
 * M = [R t; 0 1]  ⇒  M⁻¹ = [Rᵀ  −Rᵀt; 0 1]
 */
export function invertRigid(m) {
  const out = new Float32Array(16);
  // Rᵀ in the upper-left 3×3
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) out[c * 4 + r] = m[r * 4 + c];
  }
  // −Rᵀt : component r is −(column r of R) · t
  const tx = m[12], ty = m[13], tz = m[14];
  for (let r = 0; r < 3; r++) {
    out[12 + r] = -(m[r * 4 + 0] * tx + m[r * 4 + 1] * ty + m[r * 4 + 2] * tz);
  }
  out[15] = 1;
  return out;
}

/** M · v for a 4-component v = [x, y, z, w]; returns [x', y', z', w']. */
export function transformVec4(m, v) {
  const out = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) {
    out[r] = m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3];
  }
  return out;
}

/* ------------------------------------------------------------- Part C ---- */

/**
 * View matrix for a camera at `eye` looking at `target`, with `up` as the
 * approximate up direction. Build the camera basis with two cross products.
 * Must stay finite when `up` is parallel to the view direction — handle it.
 * eye, target, up: [x, y, z]
 */
export function lookAt(eye, target, up) {
  // forward (camera looks along f)
  let f = normalize(sub(target, eye));
  if (length(f) === 0) f = [0, 0, -1]; // eye == target: pick a default

  // right
  let s = cross(f, up);
  if (length(s) < 1e-6) {
    // up is parallel to f (or zero): substitute an axis that isn't
    const alt = Math.abs(f[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    s = cross(f, alt);
  }
  s = normalize(s);

  // true up (already unit length since s ⟂ f and both are unit)
  const u = cross(s, f);
  // back axis
  const b = [-f[0], -f[1], -f[2]];

  const m = new Float32Array(16);
  // rows of the rotation block: s, u, b   (index = col*4 + row)
  m[0] = s[0]; m[4] = s[1]; m[8]  = s[2];
  m[1] = u[0]; m[5] = u[1]; m[9]  = u[2];
  m[2] = b[0]; m[6] = b[1]; m[10] = b[2];
  // translation
  m[12] = -dot(s, eye);
  m[13] = -dot(u, eye);
  m[14] = -dot(b, eye);
  m[15] = 1;
  return m;
}

/**
 * Perspective projection for WebGPU (depth z ∈ [0, 1]).
 * fovY: vertical field of view in radians; aspect = width / height;
 * near, far: positive distances along −z.
 *
 * Derivation of the depth row. With w_clip = −z_view and
 * z_clip = A·z_view + B, we need z_clip / w_clip = z_ndc:
 *   z_view = −n → z_ndc = 0:  (−A·n + B) / n = 0  ⇒  B = A·n
 *   z_view = −f → z_ndc = 1:  (−A·f + B) / f = 1  ⇒  −A·f + A·n = f
 *                                                  ⇒  A = f / (n − f)
 *   so  B = n·f / (n − f).
 */
export function perspective(fovY, aspect, near, far) {
  const t = Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = 1 / (aspect * t);
  m[5] = 1 / t;
  m[10] = far / (near - far);          // A
  m[11] = -1;                          // w = −z_view
  m[14] = (near * far) / (near - far); // B
  return m;
}

/**
 * Orthographic projection for WebGPU (depth z ∈ [0, 1]) of the box
 * x ∈ [left, right], y ∈ [bottom, top], z ∈ [−near, −far] in view space.
 *
 * Depth: z_ndc = A·z_view + B with
 *   z_view = −n → 0:  −A·n + B = 0  ⇒  B = A·n
 *   z_view = −f → 1:  −A·f + B = 1  ⇒  A = 1 / (n − f),  B = n / (n − f)
 */
export function orthographic(left, right, bottom, top, near, far) {
  const m = new Float32Array(16);
  m[0] = 2 / (right - left);
  m[5] = 2 / (top - bottom);
  m[10] = 1 / (near - far);
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[14] = near / (near - far);
  m[15] = 1;
  return m;
}

/* ------------------------------------------------- provided (not graded) - */

/**
 * Pretty-print a column-major matrix as four rows, for showing matrices on
 * screen (Part A asks you to display T·R·S and S·R·T).
 */
export function format(m, digits = 2) {
  if (!m) return '(none)';
  const w = digits + 4;
  let s = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) s += (+m[c * 4 + r]).toFixed(digits).padStart(w);
    if (r < 3) s += '\n';
  }
  return s;
}

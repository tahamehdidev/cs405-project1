/**
 * Part A — building a model matrix from translation, rotation and scale.
 *
 *   t         [tx, ty, tz]   translation
 *   rotation  Float32Array   a ready-made 4×4 rotation matrix (the caller
 *                            builds it with mat4.rotateX/Y/Z)
 *   s         [sx, sy, sz]   scale factors
 *
 * composeTRS returns  M = T · R · S   (scale first, then rotate, then translate)
 * composeSRT returns  M = S · R · T   (translate first, then rotate, then scale)
 *
 * Remember: multiply(A, B) = A·B, so the matrix written on the RIGHT acts first.
 * Tests: tests/compose.test.js
 */
import * as mat4 from '../math/mat4.js';

/** M = T · R · S */
export function composeTRS(t, rotation, s) {
  const T = mat4.translate(t[0], t[1], t[2]);
  const S = mat4.scale(s[0], s[1], s[2]);
  return mat4.multiply(T, mat4.multiply(rotation, S));
}

/** M = S · R · T */
export function composeSRT(t, rotation, s) {
  const T = mat4.translate(t[0], t[1], t[2]);
  const S = mat4.scale(s[0], s[1], s[2]);
  return mat4.multiply(S, mat4.multiply(rotation, T));
}

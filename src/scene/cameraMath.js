/**
 * Part C — the two camera functions that are YOURS to write (they are graded).
 * Everything else in the camera/frustum code only calls these.
 * Tests: tests/cameraMath.test.js
 */
import * as mat4 from '../math/mat4.js';

/**
 * Position of an orbiting camera.
 *
 *   eye = target + distance · ( cos(pitch)·sin(yaw),  sin(pitch),  cos(pitch)·cos(yaw) )
 */
export function orbitEye(target, yaw, pitch, distance) {
  const dx = Math.cos(pitch) * Math.sin(yaw);
  const dy = Math.sin(pitch);
  const dz = Math.cos(pitch) * Math.cos(yaw);
  return [
    target[0] + distance * dx,
    target[1] + distance * dy,
    target[2] + distance * dz,
  ];
}

/**
 * The 8 corners of a camera's view volume in WORLD space.
 * Indices 0..3 near plane, 4..7 far plane, each in the order
 * (−x,−y), (+x,−y), (+x,+y), (−x,+y).
 */
export function frustumCorners(cam, aspect, drawFar = cam.far) {
  // A. half-sizes at the near and far distances
  let nearH, farH;
  if (cam.projection === 'orthographic') {
    nearH = farH = cam.orthoHeight / 2;
  } else {
    const t = Math.tan(cam.fovY / 2);
    nearH = cam.near * t;
    farH = drawFar * t;
  }
  const nearW = nearH * aspect;
  const farW = farH * aspect;

  // B. view-space corners (camera at origin looking down −z)
  const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const viewCorners = [
    ...signs.map(([sx, sy]) => [sx * nearW, sy * nearH, -cam.near, 1]),
    ...signs.map(([sx, sy]) => [sx * farW, sy * farH, -drawFar, 1]),
  ];

  // C. view -> world is the inverse of the (rigid) view matrix
  const view = mat4.lookAt(cam.eye, cam.target, cam.up);
  const invView = mat4.invertRigid(view);

  // D. transform each corner, keep xyz
  return viewCorners.map((c) => {
    const p = mat4.transformVec4(invView, c);
    return [p[0], p[1], p[2]];
  });
}

/**
 * YOU WRITE THIS (Part D, graded): where does the mouse point on the painting?
 *
 * Turn a mouse position into a point on the painting's plane z = 0.
 *
 *   ndc    [x, y]  mouse position in normalised device coordinates,
 *                  x, y ∈ [−1, 1], +y UP (that is what ui/input.js gives you)
 *   cam    camera data { eye, target, up, fovY, projection, orthoHeight, ... }
 *   aspect canvas width / height
 *
 * Build a ray in VIEW space, move it to WORLD space, intersect it with z = 0:
 *   perspective:   origin = (0, 0, 0);
 *                  direction = ( ndc.x · tan(fovY/2) · aspect,  ndc.y · tan(fovY/2),  −1 )
 *   orthographic:  origin = ( ndc.x · (orthoHeight/2) · aspect,  ndc.y · (orthoHeight/2),  0 );
 *                  direction = (0, 0, −1)
 *   World space:   use the inverse of the view matrix, i.e.
 *                  mat4.invertRigid(mat4.lookAt(cam.eye, cam.target, cam.up)),
 *                  with mat4.transformVec4: the origin is a POINT (w = 1),
 *                  the direction is a VECTOR (w = 0, so it ignores translation).
 *   Intersect:     t = −origin.z / direction.z, point = origin + t · direction.
 *
 * Return [x, y] on the plane, or null when the ray is parallel to the plane
 * (|direction.z| tiny) or the hit is behind the ray's start (t < 0).
 * Tests: tests/picking.test.js
 *
 * @returns {number[]|null}
 */
export function screenToPaintingPoint(ndc, cam, aspect) {
  // 1. Ray in VIEW space (camera at origin, looking down −z)
  let origin, dir;
  if (cam.projection === 'orthographic') {
    const halfH = cam.orthoHeight / 2;
    origin = [ndc[0] * halfH * aspect, ndc[1] * halfH, 0, 1]; // point  (w = 1)
    dir = [0, 0, -1, 0];                                       // vector (w = 0)
  } else {
    const t = Math.tan(cam.fovY / 2);
    origin = [0, 0, 0, 1];
    dir = [ndc[0] * t * aspect, ndc[1] * t, -1, 0];
  }

  // 2. Move the ray to WORLD space with the inverse of the rigid view matrix
  const invView = mat4.invertRigid(mat4.lookAt(cam.eye, cam.target, cam.up));
  const o = mat4.transformVec4(invView, origin);
  const d = mat4.transformVec4(invView, dir);

  // 3. Intersect with the plane z = 0
  if (Math.abs(d[2]) < 1e-9) return null;   // ray parallel to the plane
  const t = -o[2] / d[2];
  if (t < 0) return null;                    // hit is behind the ray's start

  return [o[0] + t * d[0], o[1] + t * d[1]];
}

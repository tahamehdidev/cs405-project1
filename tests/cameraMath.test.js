import { test, describe } from 'node:test';
import { orbitEye, frustumCorners } from '../src/scene/cameraMath.js';
import { closeArr } from './helpers.js';

const D = Math.PI / 180;
const TOL = 1e-4;

describe('Part C · orbitEye', () => {
  test('yaw 0, pitch 0: eye on +z in front of the target', () => {
    closeArr(orbitEye([0, 0, 0], 0, 0, 2.8), [0, 0, 2.8], TOL);
  });
  test('positive yaw moves the eye towards +x', () => {
    closeArr(orbitEye([0, 0, 0], 90 * D, 0, 2.8), [2.8, 0, 0], TOL);
  });
  test('positive pitch moves the eye up', () => {
    closeArr(orbitEye([0, 0, 0], 0, 90 * D, 2.8), [0, 2.8, 0], TOL);
    closeArr(orbitEye([0, 0, 0], 0, 30 * D, 2), [0, 1, Math.cos(30 * D) * 2], TOL);
  });
  test('the target offset is added', () => {
    closeArr(orbitEye([1, 2, 3], 0, 0, 5), [1, 2, 8], TOL);
  });
  test('always the requested distance from the target', () => {
    const e = orbitEye([0, 1, 0], 0.7, -0.4, 3.3);
    const d = Math.hypot(e[0], e[1] - 1, e[2]);
    closeArr([d], [3.3], TOL);
  });
});

describe('Part C · frustumCorners', () => {
  const base = { eye: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0], fovY: 90 * D, near: 1, far: 3, projection: 'perspective', orthoHeight: 2 };

  test('perspective: near and far corners in world space', () => {
    const c = frustumCorners(base, 2);
    // near plane at distance 1 → z = 4: half-height 1, half-width 2
    closeArr(c[0], [-2, -1, 4], TOL);
    closeArr(c[1], [2, -1, 4], TOL);
    closeArr(c[2], [2, 1, 4], TOL);
    closeArr(c[3], [-2, 1, 4], TOL);
    // far plane at distance 3 → z = 2: half-height 3, half-width 6
    closeArr(c[4], [-6, -3, 2], TOL);
    closeArr(c[6], [6, 3, 2], TOL);
  });

  test('drawFar overrides the far plane', () => {
    const c = frustumCorners(base, 2, 2);
    closeArr(c[4], [-4, -2, 3], TOL);
    closeArr(c[6], [4, 2, 3], TOL);
  });

  test('orthographic: same cross-section at near and far', () => {
    const c = frustumCorners({ ...base, projection: 'orthographic' }, 2);
    closeArr(c[0], [-2, -1, 4], TOL);
    closeArr(c[2], [2, 1, 4], TOL);
    closeArr(c[4], [-2, -1, 2], TOL);
    closeArr(c[6], [2, 1, 2], TOL);
  });

  test('a rotated camera: the corners follow the view matrix', () => {
    // eye on +x looking at the origin: forward = −x, camera right = −z
    const c = frustumCorners({ ...base, eye: [5, 0, 0] }, 2);
    closeArr(c[0], [4, -1, 2], TOL);
    closeArr(c[2], [4, 1, -2], TOL);
  });

  test('returns 8 points of length 3', () => {
    const c = frustumCorners(base, 1.5);
    if (c.length !== 8 || c.some((p) => p.length !== 3)) throw new Error('expected 8 points [x, y, z]');
  });
});

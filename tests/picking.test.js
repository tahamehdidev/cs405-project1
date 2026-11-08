import { test, describe } from 'node:test';
import { screenToPaintingPoint } from '../src/scene/cameraMath.js';
import { closeArr } from './helpers.js';

const D = Math.PI / 180;
const TOL = 1e-4;
const cam = { eye: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0], fovY: 90 * D, near: 0.1, far: 100, projection: 'perspective', orthoHeight: 2 };

describe('Part D · screenToPaintingPoint (mouse → painting plane z = 0)', () => {
  test('perspective: the centre of the screen hits the point the camera looks at', () => {
    closeArr(screenToPaintingPoint([0, 0], cam, 1.5), [0, 0], TOL);
  });

  test('perspective: a corner ray (fov 90°, camera 5 away)', () => {
    // direction in view space (1, 1, −1) → reaches z = 0 after t = 5 → (5, 5)
    closeArr(screenToPaintingPoint([1, 1], cam, 1), [5, 5], TOL);
    // aspect scales x only: (1·tan45·2, ...) → x = 10
    closeArr(screenToPaintingPoint([1, 0.5], cam, 2), [10, 2.5], TOL);
  });

  test('perspective: an off-axis camera still hits the target at the screen centre', () => {
    closeArr(screenToPaintingPoint([0, 0], { ...cam, eye: [3, 2, 5] }, 1.3), [0, 0], TOL);
  });

  test('orthographic: parallel rays, offset origin', () => {
    const o = { ...cam, projection: 'orthographic', orthoHeight: 2 };
    // half-height 1, half-width 2 (aspect 2): ndc (1, 0.5) → (2, 0.5)
    closeArr(screenToPaintingPoint([1, 0.5], o, 2), [2, 0.5], TOL);
  });

  test('a ray parallel to the plane returns null', () => {
    // eye on +x looking at the origin: the centre ray runs inside the plane z = 0
    const r = screenToPaintingPoint([0, 0], { ...cam, eye: [5, 0, 0] }, 1);
    if (r !== null) throw new Error(`expected null for a parallel ray, got ${JSON.stringify(r)}`);
  });

  test('a hit behind the camera returns null', () => {
    // camera at z = −5 looking AWAY from the plane (target further along −z)
    const r = screenToPaintingPoint([0, 0], { ...cam, eye: [0, 0, -5], target: [0, 0, -10] }, 1);
    if (r !== null) throw new Error(`expected null for a hit behind the camera, got ${JSON.stringify(r)}`);
  });
});

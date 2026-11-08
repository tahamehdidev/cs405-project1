import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { revolve } from '../src/scene/revolve.js';
import { close } from './helpers.js';

const TOL = 1e-4;
const verts = (a) => {
  const out = [];
  for (let i = 0; i < a.length; i += 6) out.push({ p: [a[i], a[i + 1], a[i + 2]], n: [a[i + 3], a[i + 4], a[i + 5]] });
  return out;
};

describe('Bonus · revolve (surface of revolution)', () => {
  const cylinder = [[1, 2], [1, 0]]; // radius 1, from y = 2 (top) down to y = 0

  test('returns a Float32Array with (m − 1) · steps · 6 vertices of 6 floats', () => {
    const a = revolve(cylinder, 4);
    assert.ok(a instanceof Float32Array);
    assert.equal(a.length, 1 * 4 * 6 * 6);
    const b = revolve([[0, 3], [1, 2], [1, 0], [0.5, -1]], 10);
    assert.equal(b.length, 3 * 10 * 6 * 6);
  });

  test('cylinder: every vertex lies on the cylinder (radius 1, y in [0, 2])', () => {
    for (const { p } of verts(revolve(cylinder, 8))) {
      close(Math.hypot(p[0], p[2]), 1, TOL, 'radius');
      assert.ok(p[1] >= -TOL && p[1] <= 2 + TOL, `y = ${p[1]}`);
    }
  });

  test('cylinder: normals are unit length and point straight away from the axis', () => {
    for (const { p, n } of verts(revolve(cylinder, 8))) {
      close(Math.hypot(n[0], n[1], n[2]), 1, TOL, 'unit length');
      close(n[1], 0, TOL, 'no vertical part');
      close(n[0], p[0], TOL, 'nx = x (radius 1)');
      close(n[2], p[2], TOL, 'nz = z (radius 1)');
    }
  });

  test('cone (apex on top): normals tilt upwards', () => {
    const cone = [[0, 1], [1, 0]];
    for (const { n } of verts(revolve(cone, 6))) {
      close(Math.hypot(n[0], n[1], n[2]), 1, TOL, 'unit length');
      close(n[1], Math.SQRT1_2, TOL, 'ny = 1/√2');
    }
  });

  test('the surface closes: both ends of the sweep use the same positions', () => {
    const a = revolve(cylinder, 6);
    // the first vertex of the first quad is at θ = 0 → (1, 2, 0); the last quad ends at θ = 2π → same point
    const vs = verts(a);
    const atStart = vs.some(({ p }) => Math.abs(p[0] - 1) < TOL && Math.abs(p[2]) < TOL);
    assert.ok(atStart, 'a vertex at θ = 0 / 2π exists');
    // no vertex may be NaN
    for (const x of a) assert.ok(Number.isFinite(x), 'finite values only');
  });

  test('profiles with fewer than 2 points give an empty array', () => {
    assert.equal(revolve([], 8).length, 0);
    assert.equal(revolve([[1, 1]], 8).length, 0);
  });

  test('does not modify the profile', () => {
    const prof = [[1, 2], [1.5, 1], [1, 0]];
    const copy = JSON.stringify(prof);
    revolve(prof, 5);
    assert.equal(JSON.stringify(prof), copy);
  });
});

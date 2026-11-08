import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { curveToJSON } from '../src/scene/curveExport.js';
import { closeArr } from './helpers.js';

describe('Part D · curveToJSON (normalised coordinates)', () => {
  // painting aspect a = 0.5:  x ∈ [−0.5, 0.5], y ∈ [−1, 1]   →   u = (x + a)/(2a),  v = (1 − y)/2
  const curve = {
    painting: 'test-painting',
    aspect: 0.5,
    kind: 'bezier-c1',
    segments: [
      [[-0.5, 1], [-0.25, 0.5], [0.25, -0.5], [0.5, -1]],
      [[0.5, -1], [0.75, -1.5], [0, 0], [0, 0.5]],
    ],
  };

  test('keeps painting id and kind', () => {
    const j = curveToJSON(curve);
    assert.equal(j.painting, 'test-painting');
    assert.equal(j.kind, 'bezier-c1');
  });

  test('converts the corners and the centre of the painting', () => {
    const j = curveToJSON(curve);
    closeArr(j.segments[0][0], [0, 0], 1e-4);       // top-left     (x = −a, y = 1)
    closeArr(j.segments[0][3], [1, 1], 1e-4);       // bottom-right (x = +a, y = −1)
    closeArr(j.segments[1][2], [0.5, 0.5], 1e-4);   // centre       (0, 0)
  });

  test('converts an interior point', () => {
    const j = curveToJSON(curve);
    // (−0.25, 0.5) → u = 0.25/1 = 0.25, v = 0.5/2 = 0.25
    closeArr(j.segments[0][1], [0.25, 0.25], 1e-4);
  });

  test('same structure: 2 segments of 4 points [u, v]', () => {
    const j = curveToJSON(curve);
    assert.equal(j.segments.length, 2);
    for (const s of j.segments) {
      assert.equal(s.length, 4);
      for (const p of s) assert.equal(p.length, 2);
    }
  });

  test('does not modify its input', () => {
    const copy = JSON.stringify(curve);
    curveToJSON(curve);
    assert.equal(JSON.stringify(curve), copy);
  });
});

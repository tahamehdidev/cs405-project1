import { test, describe } from 'node:test';
import * as m from '../src/math/mat4.js';
import { composeTRS, composeSRT } from '../src/scene/compose.js';
import { closeArr, apply } from './helpers.js';

const D = Math.PI / 180;
const t = [1, 2, 0], s = [2, 2, 2];

describe('Part A · compose (T·R·S vs S·R·T)', () => {
  test('composeTRS: scale, then rotate, then translate', () => {
    const M = composeTRS(t, m.rotateZ(90 * D), s);
    // (1,0,0) → scale → (2,0,0) → rotZ 90° → (0,2,0) → translate → (1,4,0)
    closeArr(apply(M, [1, 0, 0, 1]), [1, 4, 0, 1]);
    closeArr([M[12], M[13], M[14]], [1, 2, 0], undefined, 'translation column:');
  });

  test('composeSRT: translate, then rotate, then scale', () => {
    const M = composeSRT(t, m.rotateZ(90 * D), s);
    // (1,0,0) → translate → (2,2,0) → rotZ 90° → (−2,2,0) → scale → (−4,4,0)
    closeArr(apply(M, [1, 0, 0, 1]), [-4, 4, 0, 1]);
    closeArr([M[12], M[13], M[14]], [-4, 2, 0], undefined, 'translation column (= S·R·t):');
  });

  test('order matters even with no translation (non-uniform scale)', () => {
    const R = m.rotateZ(90 * D), S = [2, 1, 1], zero = [0, 0, 0];
    // T·R·S: (1,0,0) → (2,0,0) → (0,2,0)
    closeArr(apply(composeTRS(zero, R, S), [1, 0, 0, 1]), [0, 2, 0, 1]);
    // S·R·T: (1,0,0) → (0,1,0) → (0,1,0)
    closeArr(apply(composeSRT(zero, R, S), [1, 0, 0, 1]), [0, 1, 0, 1]);
  });

  test('results are Float32Array(16)', () => {
    const M = composeTRS(t, m.rotateZ(0.3), s);
    if (!(M instanceof Float32Array) || M.length !== 16) throw new Error('return a Float32Array(16)');
  });
});

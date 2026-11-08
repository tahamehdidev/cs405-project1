/**
 * Draws the main camera's view frustum (and the camera itself) so it can be
 * seen from the inspection camera. Plumbing only: the corner positions come
 * from YOUR frustumCorners() (cameraMath.js).
 *
 *   const fv = createFrustumView(gpu);
 *   const problem = fv.update(camera, aspect);   // null, or a TODO message
 *   fv.draw(pass, inspectionViewProj, renderer);
 *
 * The real far plane (e.g. 100) would be far too large to see, so the far
 * plane is DRAWN no further than `distance + 1` behind the camera.
 */
import * as mat4 from '../math/mat4.js';
import { NotImplemented } from '../math/todo.js';
import { LineRenderer } from '../render/lines.js';
import { axes } from './geometry.js';
import { frustumCorners } from './cameraMath.js';

const NEAR_COL = [1.0, 0.85, 0.15];
const FAR_COL = [1.0, 0.45, 0.10];
const SIDE_COL = [0.85, 0.85, 0.85];

// corner index pairs: near rectangle, far rectangle, four connecting edges
const EDGES = [
  [0, 1, NEAR_COL], [1, 2, NEAR_COL], [2, 3, NEAR_COL], [3, 0, NEAR_COL],
  [4, 5, FAR_COL], [5, 6, FAR_COL], [6, 7, FAR_COL], [7, 4, FAR_COL],
  [0, 4, SIDE_COL], [1, 5, SIDE_COL], [2, 6, SIDE_COL], [3, 7, SIDE_COL],
];

export function createFrustumView(gpu) {
  const lines = new LineRenderer(gpu);
  const frustum = lines.createBatch('line-list', EDGES.length * 2);
  const marker = lines.createBatch('line-list', 6, axes(0.25));
  let camToWorld = null;
  let ok = false;

  return {
    /** Recompute the frustum lines for `cam`. Returns null, or a message if a TODO is hit. */
    update(cam, aspect) {
      try {
        const drawFar = Math.max(cam.near + 0.1, Math.min(cam.far, (cam.distance ?? 3) + 1));
        const c = frustumCorners(cam, aspect, drawFar);
        const v = new Float32Array(EDGES.length * 12);
        EDGES.forEach(([a, b, col], i) => v.set([...c[a], ...col, ...c[b], ...col], i * 12));
        lines.setVertices(frustum, v);
        camToWorld = mat4.invertRigid(mat4.lookAt(cam.eye, cam.target, cam.up)); // camera axes in world space
        ok = true;
        return null;
      } catch (e) {
        if (!(e instanceof NotImplemented)) throw e;
        ok = false;
        return e.message;
      }
    },

    /** @param {Float32Array} viewProj  P · V of the camera you are looking from */
    draw(pass, viewProj, renderer) {
      if (!ok) return;
      lines.draw(pass, frustum, viewProj, renderer);
      lines.draw(pass, marker, mat4.multiply(viewProj, camToWorld), renderer);
    },
  };
}

/**
 * Camera — Part C.
 *
 * The camera is plain data. viewProjection() turns it into P · V using YOUR
 * mat4.lookAt / mat4.perspective / mat4.orthographic / mat4.multiply.
 *
 * The main camera orbits its target: yaw / pitch / distance are the state,
 * and syncEye() derives `eye` from them with YOUR orbitEye() (cameraMath.js).
 * A second, fixed "inspection" camera is used to look at the first one.
 *
 * Until lookAt etc. exist it falls back to a fixed "fit the painting to the
 * window" matrix, so the starter shows your painting from the first
 * `npm run dev`. The panel tells you which of the two is active.
 */
import * as mat4 from '../math/mat4.js';
import { NotImplemented } from '../math/todo.js';
import { orbitEye } from './cameraMath.js';

const DEG = Math.PI / 180;

export function createCamera() {
  return {
    eye: [0, 0, 2.8],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fovY: Math.PI / 4, // radians
    near: 0.1,
    far: 100,
    projection: 'perspective', // or 'orthographic'
    orthoHeight: 2.2, // world units visible vertically in orthographic mode
    // orbit state (eye is derived from these by syncEye)
    yaw: 0,
    pitch: 0,
    distance: 2.8,
  };
}

/** A fixed camera that looks at the scene (and at the main camera's frustum) from the side. */
export function createInspectionCamera() {
  return {
    eye: [3.0, 2.0, 6.0],
    target: [0, 0, 1.2],
    up: [0, 1, 0],
    fovY: Math.PI / 4,
    near: 0.1,
    far: 100,
    projection: 'perspective',
    orthoHeight: 2.2,
  };
}

/**
 * Recompute cam.eye from yaw / pitch / distance with orbitEye().
 * Returns null when it worked, or a message while orbitEye is still a TODO.
 */
export function syncEye(cam) {
  try {
    cam.eye = orbitEye(cam.target, cam.yaw, cam.pitch, cam.distance);
    return null;
  } catch (e) {
    if (!(e instanceof NotImplemented)) throw e;
    return e.message;
  }
}

/** Mouse drag: change yaw / pitch (radians per pixel), keeping pitch away from the poles. */
export function orbitBy(cam, dx, dy, speed = 0.006) {
  cam.yaw -= dx * speed;
  cam.pitch += dy * speed;
  const lim = 85 * DEG;
  cam.pitch = Math.max(-lim, Math.min(lim, cam.pitch));
}

/** Mouse wheel: dolly in perspective, change the visible height in orthographic. */
export function zoomBy(cam, wheelDelta) {
  const k = Math.exp(wheelDelta * 0.001);
  if (cam.projection === 'orthographic') {
    cam.orthoHeight = Math.max(0.3, Math.min(10, cam.orthoHeight * k));
  } else {
    cam.distance = Math.max(0.6, Math.min(15, cam.distance * k));
  }
}

/**
 * @param {object} cam     from createCamera()
 * @param {number} aspect  canvas width / height
 * @param {number} paintingAspect  image width / height (only used by the fallback)
 * @returns {{ matrix: Float32Array, fallback: boolean, missing?: string }}
 */
export function viewProjection(cam, aspect, paintingAspect = 1) {
  try {
    const view = mat4.lookAt(cam.eye, cam.target, cam.up);
    let proj;
    if (cam.projection === 'orthographic') {
      const h = cam.orthoHeight / 2, w = h * aspect;
      proj = mat4.orthographic(-w, w, -h, h, cam.near, cam.far);
    } else {
      proj = mat4.perspective(cam.fovY, aspect, cam.near, cam.far);
    }
    return { matrix: mat4.multiply(proj, view), fallback: false };
  } catch (e) {
    if (!(e instanceof NotImplemented)) throw e;
    return { matrix: fitMatrix(aspect, paintingAspect), fallback: true, missing: e.message };
  }
}

/**
 * Placeholder used until Part C works: scales the painting quad (height 2,
 * width 2·paintingAspect, centred at the origin in the z = 0 plane) to fit
 * the canvas, and maps world z to depth so that +z is in front.
 * There is no camera here — do not build on this.
 */
function fitMatrix(aspect, paintingAspect) {
  const s = 0.92 * Math.min(1, aspect / paintingAspect);
  return new Float32Array([
    s / aspect, 0, 0, 0,
    0, s, 0, 0,
    0, 0, -0.05, 0,
    0, 0, 0.5, 1,
  ]);
}

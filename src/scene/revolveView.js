/**
 * Bonus — the surface of revolution on screen. Plumbing only: the mesh comes from
 * YOUR revolve() (scene/revolve.js).
 *
 * The column profile (a second curve, edited like the arch) is sampled into
 * [r, y] points, where r = (distance from the painted column's centre line).
 * revolve() spins them around the y axis; the resulting mesh is drawn with the
 * lit mesh pipeline, pulled out of the painting towards the camera.
 * The mesh is rebuilt whenever the profile curve or the number of steps changes.
 */
import * as mat4 from '../math/mat4.js';
import { NotImplemented } from '../math/todo.js';
import * as curves from '../math/curves.js';
import { MeshRenderer } from '../render/mesh.js';
import { composeTRS } from './compose.js';
import { revolve } from './revolve.js';
import { COLUMN_AXIS_U } from './defaultCurves.js';

const SAMPLES_PER_SEGMENT = 24;
const COLOUR = [0.30, 0.36, 0.30]; // marble, linear RGB
const DEFAULTS = { show: true, steps: 48, z: 0.5, spin: true };

export function createRevolveView({ gpu, renderer, panel, painting, columnEditor }) {
  const meshes = new MeshRenderer(gpu);
  const state = { ...DEFAULTS };
  if (new URLSearchParams(location.search).get('col') === '0') state.show = false; // ?col=0 hides the 3D column
  let inst = null;          // mesh instance (own uniform buffer)
  let lastSig = '';
  let angle = 0;
  let problem = null;
  let vertexCount = 0;

  const f = panel.folder('Bonus · surface of revolution');
  const status = f.text('');
  const widgets = [
    f.toggle('show 3D column', state, 'show'),
    f.slider('steps around axis', state, 'steps', 3, 96, 1),
    f.slider('distance from painting (z)', state, 'z', 0, 1.2, 0.01),
    f.toggle('spin', state, 'spin'),
  ];
  f.note('Edit the green profile curve (the column\'s right edge) and the 3D column follows.');

  const axisX = () => (2 * COLUMN_AXIS_U - 1) * painting.aspect; // world x of the painted column's centre line

  /** Sample the profile curve into [r, y] points, top to bottom. */
  function sampleProfile(segs) {
    const n = segs.length * SAMPLES_PER_SEGMENT;
    const ax = axisX();
    const out = [];
    for (let i = 0; i <= n; i++) {
      const p = curves.evalPiecewise(segs, i / n);
      out.push([Math.max(0, p[0] - ax), p[1]]);
    }
    return out;
  }

  function rebuild(segs) {
    const data = revolve(sampleProfile(segs), Math.round(state.steps));
    vertexCount = data.length / 6;
    if (!(data instanceof Float32Array) || vertexCount === 0) { inst = null; return; }
    const geo = meshes.createGeometry(data, 'revolved column');
    if (inst) inst.geometry.buffer.destroy();
    if (inst) inst.geometry = geo; else inst = meshes.createInstance(geo, 'revolved column');
  }

  return {
    state,

    update(dt) {
      const segs = columnEditor.getSegments();
      if (!segs) return;
      if (state.spin) angle = (angle + dt * 0.6) % (2 * Math.PI);
      const sig = `${JSON.stringify(segs)}|${Math.round(state.steps)}`;
      if (sig === lastSig) return;
      try {
        rebuild(segs);
        problem = null;
        lastSig = sig;
        status.set(`${vertexCount.toLocaleString('en-US')} vertices (${Math.round(state.steps)} steps)`);
        status.el.classList.remove('warn');
      } catch (e) {
        if (!(e instanceof NotImplemented)) throw e;
        problem = e.message;
        lastSig = '';
        status.set(`${e.message}\n(write it in src/scene/revolve.js)`);
        status.el.classList.add('warn');
      }
    },

    /** @param {GPURenderPassEncoder} pass  @param {Float32Array} viewProj  P · V */
    draw(pass, viewProj) {
      if (!state.show || problem || !inst) return;
      const model = composeTRS([axisX(), 0, state.z], mat4.rotateY(angle), [1, 1, 1]);
      meshes.draw(pass, inst, viewProj, model, COLOUR, renderer);
    },
  };
}

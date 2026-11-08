/**
 * YOUR SCENE — Parts A, B and D live here (and in files you add next to it).
 *
 * main.js calls, every frame:
 *     scene.update(dt, time)          dt and time in seconds
 *     scene.draw(pass, viewProj)      inside the frame's render pass
 * and scene.reset() from the panel's "reset" button.
 *
 * Part A: three static objects standing on the painted threshold, plus one
 * controlled cube. All model matrices come from composeTRS / composeSRT
 * (scene/compose.js). A switch chooses which order drives the controlled cube
 * and BOTH matrices are always shown on screen.
 *
 * Part B: a hanging lamp on a swinging arm, as a SceneNode tree
 *
 *     gate (fixed bracket)                      level 1
 *      └─ arm   (swings about z)                level 2
 *          └─ chain (hinged at the arm's end)   level 3
 *              └─ lamp  (spins about y)         level 4
 *                  └─ bead (orbits the lamp)    level 5
 *
 * Every node's world matrix comes from SceneNode.updateWorld() (scene/node.js).
 *
 * WebGPU gotcha: every drawn object has its own uniform buffer (see
 * render/mesh.js), because queue.writeBuffer() calls all run BEFORE the
 * frame's commands.
 */
import * as mat4 from '../math/mat4.js';
import { NotImplemented } from '../math/todo.js';
import { MeshRenderer } from '../render/mesh.js';
import { LineRenderer } from '../render/lines.js';
import { cube, axes } from './geometry.js';
import { composeTRS, composeSRT } from './compose.js';
import { SceneNode } from './node.js';

const DEG = Math.PI / 180;
const ONE = [1, 1, 1];

/** Initial values of everything the panel controls (reset restores these). */
const DEFAULTS = {
  debugAxes: false,
  order: 'TRS',            // 'TRS' → M = T·R·S,  'SRT' → M = S·R·T
  tx: 0, ty: -0.35, tz: 0.35,
  angleDeg: 30,            // rotation about the z axis
  sx: 0.25, sy: 0.25, sz: 0.25,
  // Part B
  showTree: true,          // hide the lamp while tracing curves
  frozen: false,
  t: 0,                   // animation clock in seconds, wraps at PERIOD
  nodeAxes: false,
  inspect: 'bead',
};

/** Static objects in front of the painting (z > 0). Colours are linear RGB. */
const STATIC_OBJECTS = [
  { name: 'pedestal', t: [0, -0.82, 0.25], rotY: 0, s: [0.9, 0.08, 0.35], colour: [0.10, 0.14, 0.22] },
  { name: 'crate', t: [0.38, -0.62, 0.28], rotY: 0.5, s: [0.22, 0.22, 0.22], colour: [0.03, 0.30, 0.06] },
  { name: 'block', t: [-0.38, -0.66, 0.30], rotY: -0.4, s: [0.18, 0.30, 0.18], colour: [0.25, 0.07, 0.30] },
];
const CONTROLLED_COLOUR = [0.80, 0.25, 0.08];

/* ---- Part B: lamp-on-an-arm geometry and animation ------------------------ */

const GATE_POS = [-0.25, 0.55, 0.35]; // where the bracket sits (above the door, in front of the tiles)
const ARM_LEN = 0.55;                 // arm extends along +x from the gate
const CHAIN_LEN = 0.32;               // chain hangs along −y from the arm's end
const ORBIT_R = 0.14;                 // bead's orbit radius around the lamp

/**
 * The clock wraps at PERIOD seconds. Every motion below repeats within a
 * divisor of 20 s, so the wrap is seamless.
 *
 * At t = 2.5 s (a good time to freeze for the hand check) the angles are:
 *   arm +30°,  chain −30°,  lamp spin 90°,  bead orbit 180°.
 */
const PERIOD = 20;
const armAngle = (t) => 30 * DEG * Math.sin((2 * Math.PI * t) / 10);       // period 10 s
const chainAngle = (t) => 30 * DEG * Math.cos((2 * Math.PI * t) / 5);      // period  5 s
const lampSpin = (t) => 36 * DEG * t;                                      // 36°/s
const beadOrbit = (t) => 72 * DEG * t;                                     // 72°/s

export function createScene({ gpu, renderer, painting, panel }) {
  // Preset URL parameters (for reproducible screenshots), e.g.
  //   ?tx=0.4&ty=0.2&tz=0.3&angle=90&s=0.3&order=SRT   (Part A)      ?t=2.5&axes=1&lamp=1   (Part B)
  const q = new URLSearchParams(location.search);
  const qn = (k) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? v : undefined; };
  const initial = {};
  for (const [key, param] of [['tx', 'tx'], ['ty', 'ty'], ['tz', 'tz'], ['angleDeg', 'angle']]) {
    if (qn(param) !== undefined) initial[key] = qn(param);
  }
  if (qn('s') !== undefined) initial.sx = initial.sy = initial.sz = qn('s');
  if (q.get('order') === 'TRS' || q.get('order') === 'SRT') initial.order = q.get('order');
  if (qn('t') !== undefined) { initial.t = qn('t'); initial.frozen = true; }   // t=… also freezes the clock
  if (q.get('lamp') === '0') initial.showTree = false;
  if (q.get('axes') === '1') initial.nodeAxes = true;
  const state = { ...DEFAULTS, ...initial };

  /* ---------------- rendering resources ---------------- */
  const meshes = new MeshRenderer(gpu);
  const lines = new LineRenderer(gpu);
  const cubeGeo = meshes.createGeometry(cube(), 'cube');
  const axesBatch = lines.createBatch('line-list', 6, axes(0.6));

  const staticObjs = STATIC_OBJECTS.map((o) => ({ ...o, inst: meshes.createInstance(cubeGeo, o.name), model: null }));
  const controlled = { inst: meshes.createInstance(cubeGeo, 'controlled'), model: null };

  /* ---------------- Part B: build the tree ---------------- */
  const I = mat4.identity();
  /** Add a node whose mesh is a box placed by `visual` (kept apart from the node's
   *  local transform so scaling the box never scales the node's children). */
  function makeNode(name, colour, visual) {
    const node = new SceneNode(name);
    node.data.colour = colour;
    node.data.visual = visual;                       // box placement in the node's own frame
    node.data.inst = meshes.createInstance(cubeGeo, `node ${name}`);
    node.data.axes = lines.createBatch('line-list', 6, axes(0.2));
    return node;
  }
  const gate = makeNode('gate', [0.70, 0.45, 0.05], composeTRS([0, 0, 0], I, [0.10, 0.10, 0.10]));
  const arm = makeNode('arm', [0.30, 0.30, 0.38], composeTRS([ARM_LEN / 2, 0, 0], I, [ARM_LEN, 0.04, 0.04]));
  const chain = makeNode('chain', [0.50, 0.50, 0.55], composeTRS([0, -CHAIN_LEN / 2, 0], I, [0.025, CHAIN_LEN, 0.025]));
  const lamp = makeNode('lamp', [0.90, 0.55, 0.05], composeTRS([0, 0, 0], I, [0.12, 0.16, 0.12]));
  const bead = makeNode('bead', [0.05, 0.70, 0.80], composeTRS([0, 0, 0], I, [0.05, 0.05, 0.05]));
  gate.addChild(arm);
  arm.addChild(chain);
  chain.addChild(lamp);
  lamp.addChild(bead);
  const root = gate;
  const nodes = { gate, arm, chain, lamp, bead };

  /** Set every node's LOCAL matrix for clock time t, then let the graph do the rest. */
  function animate(t) {
    // gate: fixed bracket, just a translation
    gate.local = mat4.translate(GATE_POS[0], GATE_POS[1], GATE_POS[2]);

    // arm: swings about z at the gate's origin
    arm.local = mat4.rotateZ(armAngle(t));

    // chain: T(ARM_LEN, 0, 0) · Rz(chainAngle). The rotation acts first (hinge),
    // then the hinge is moved out to the end of the arm.
    chain.local = mat4.multiply(
      mat4.translate(ARM_LEN, 0, 0),
      mat4.rotateZ(chainAngle(t)),
    );

    // lamp: T(0, −CHAIN_LEN, 0) · Ry(lampSpin). It spins in place, then hangs at the chain's end.
    lamp.local = mat4.multiply(
      mat4.translate(0, -CHAIN_LEN, 0),
      mat4.rotateY(lampSpin(t)),
    );

    // bead: Ry(beadOrbit) · T(ORBIT_R, 0, 0). It is pushed out first, then the
    // rotation swings it around the lamp's y axis (an orbit, not a spin).
    bead.local = mat4.multiply(
      mat4.rotateY(beadOrbit(t)),
      mat4.translate(ORBIT_R, 0, 0),
    );

    root.updateWorld();
  }

  /* ---------------- UI ---------------- */
  const handles = []; // widgets that need refreshing on reset
  const f = panel.folder('Part A · transformations');
  const status = f.text('');
  const orderWidget = f.select('order', [
    { value: 'TRS', label: 'M = T·R·S' },
    { value: 'SRT', label: 'M = S·R·T' },
  ], state.order, (v) => { state.order = v; });
  const slider = (label, key, min, max, step) => handles.push(f.slider(label, state, key, min, max, step));
  slider('tx', 'tx', -1.5, 1.5, 0.01);
  slider('ty', 'ty', -1.5, 1.5, 0.01);
  slider('tz', 'tz', -0.5, 1.5, 0.01);
  slider('angle°', 'angleDeg', -180, 180, 1);
  slider('sx', 'sx', 0.05, 1, 0.01);
  slider('sy', 'sy', 0.05, 1, 0.01);
  slider('sz', 'sz', 0.05, 1, 0.01);
  f.note('M = T·R·S (scale, rotate, translate)');
  const readTRS = f.text('');
  f.note('M = S·R·T (translate, rotate, scale)');
  const readSRT = f.text('');

  const bf = panel.folder('Part B · scene graph');
  const treeLines = [];
  root.traverse((n, d) => treeLines.push('  '.repeat(d) + (d ? '└─ ' : '') + n.name));
  bf.text(treeLines.join('\n'));
  handles.push(bf.toggle('show lamp', state, 'showTree'));
  handles.push(bf.toggle('freeze animation', state, 'frozen'));
  const tSlider = bf.slider('t (s)', state, 't', 0, PERIOD, 0.01);
  handles.push(tSlider);
  handles.push(bf.toggle('node axes', state, 'nodeAxes'));
  const inspectWidget = bf.select('inspect node', Object.keys(nodes), state.inspect, (v) => { state.inspect = v; });
  bf.note('local matrix');
  const readLocal = bf.text('');
  bf.note('world matrix');
  const readWorld = bf.text('');
  const readTime = bf.text('');

  const sf = panel.folder('Scene');
  handles.push(sf.toggle('debug axes', state, 'debugAxes'));

  /* ---------------- scene logic ---------------- */
  let ready = false;

  function buildModels() {
    const t = [state.tx, state.ty, state.tz];
    const s = [state.sx, state.sy, state.sz];
    const R = mat4.rotateZ(state.angleDeg * DEG);
    const trs = composeTRS(t, R, s);
    const srt = composeSRT(t, R, s);
    controlled.model = state.order === 'TRS' ? trs : srt;
    readTRS.set(mat4.format(trs));
    readSRT.set(mat4.format(srt));
    for (const o of staticObjs) {
      o.model = composeTRS(o.t, mat4.rotateY(o.rotY), o.s);
    }
  }

  return {
    state,

    update(dt, time) {
      try {
        if (!state.frozen) {
          state.t = (state.t + dt) % PERIOD;
          tSlider.update();
        }
        buildModels();
        animate(state.t);
        const sel = nodes[state.inspect];
        readLocal.set(mat4.format(sel.local, 3));
        readWorld.set(mat4.format(sel.world, 3));
        readTime.set(`t = ${state.t.toFixed(2)} s${state.frozen ? '  (frozen)' : ''}`);
        ready = true;
        status.set(`controlled cube uses ${state.order === 'TRS' ? 'T·R·S' : 'S·R·T'}`);
        status.el.classList.remove('warn');
      } catch (e) {
        if (!(e instanceof NotImplemented)) throw e;
        ready = false;
        status.set(`${e.message}\n(write it in src/scene/compose.js)`);
        status.el.classList.add('warn');
      }
    },

    /** @param {GPURenderPassEncoder} pass  @param {Float32Array} viewProj  P · V */
    draw(pass, viewProj) {
      if (!ready) return;
      for (const o of staticObjs) meshes.draw(pass, o.inst, viewProj, o.model, o.colour, renderer);
      meshes.draw(pass, controlled.inst, viewProj, controlled.model, CONTROLLED_COLOUR, renderer);

      // Part B: draw every node's box at  world · visual
      if (state.showTree) root.traverse((n) => {
        meshes.draw(pass, n.data.inst, viewProj, mat4.multiply(n.world, n.data.visual), n.data.colour, renderer);
      });
      if (state.showTree && state.nodeAxes) {
        root.traverse((n) => lines.draw(pass, n.data.axes, mat4.multiply(viewProj, n.world), renderer));
      }

      if (state.debugAxes) {
        lines.draw(pass, axesBatch, mat4.multiply(viewProj, mat4.translate(0, 0, 0.02)), renderer);
      }
    },

    reset() {
      Object.assign(state, DEFAULTS);
      for (const h of handles) h.update();
      orderWidget.set(state.order);
      inspectWidget.set(state.inspect);
    },
  };
}

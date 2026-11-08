/**
 * Curve editor (Part D): interaction, drawing and UI around YOUR curve maths.
 *
 * The curve is a piecewise cubic Bézier in the plane of the painting. Segment k
 * is [P0, P1, P2, P3] (2D points in world coordinates). C¹ continuity is
 * ENFORCED BY CONSTRUCTION: for every segment after the first,
 *     P0 = previous P3                              (shared joint)
 *     P1 = c1NextControl(previous P2, previous P3)  (mirror of previous P2)
 * so only P2 and P3 of those segments are free. Dragging a handle updates its
 * neighbours so the joints stay C¹ (see moveHandle).
 *
 * Mouse: drag a handle to move it · shift+click on the painting adds a segment
 * ending at that point · dragging empty space orbits the camera.
 *
 * Maths used (all yours): curves.* (curves.js), screenToPaintingPoint
 * (cameraMath.js), curveToJSON (curveExport.js), composeTRS (compose.js).
 */
import * as mat4 from '../math/mat4.js';
import { NotImplemented } from '../math/todo.js';
import * as curves from '../math/curves.js';
import { MeshRenderer } from '../render/mesh.js';
import { LineRenderer } from '../render/lines.js';
import { cube } from './geometry.js';
import { composeTRS } from './compose.js';
import { curveToJSON, downloadJSON } from './curveExport.js';
import { screenToPaintingPoint } from './cameraMath.js';
import { DEFAULT_ARCH_UV } from './defaultCurves.js';

// Curve lines sit just in front of the painting (avoids z-fighting). ?zoff=0.0002 shrinks the gap
// on purpose, to show how near/far change depth precision (Part C experiment).
const zoffParam = parseFloat(new URLSearchParams(location.search).get('zoff'));
const Z_CURVE = Number.isFinite(zoffParam) ? zoffParam : 0.012;
const Z_HANDLE = 0.03;
const Z_MARKER = 0.05;
const SAMPLES_PER_SEGMENT = 40;
const PICK_RADIUS_PX = 16;
const MIN_SEGMENTS = 3;
const I4 = mat4.identity();

const COL = {
  curve: [1.0, 0.9, 0.3],
  polygon: [0.45, 0.55, 0.9],
  cr: [0.2, 0.9, 0.9],
  dc1: [0.35, 0.55, 1.0],
  dc2: [0.3, 0.95, 0.4],
};
const HANDLE_COL = { free: [0.9, 0.35, 0.1], joint: [0.9, 0.9, 0.9], derived: [0.6, 0.3, 0.8] };

const DEFAULTS = { edit: true, polygon: true, cr: false, dc: true, dcSeg: 0, dcT: 0.5, animate: true, speed: 0.08, u: 0 };

/** Which file to open for a "TODO: implement ..." message. */
function whereIs(msg) {
  if (/curveToJSON/.test(msg)) return 'src/scene/curveExport.js';
  if (/screenToPaintingPoint/.test(msg)) return 'src/scene/cameraMath.js';
  if (/composeTRS|composeSRT/.test(msg)) return 'src/scene/compose.js';
  return 'src/math/curves.js';
}

/**
 * Options let the same editor drive a second curve (the column profile, bonus):
 *   title      panel section title
 *   defaultUV  traced default, see defaultCurves.js
 *   colour     colour of the curve line
 *   extras     false → no Catmull–Rom / de Casteljau / animated marker for this curve
 *   shiftAdd   true  → shift+click on the painting adds a segment to THIS curve
 *   exportName file name of the exported JSON
 */
export function createCurveEditor({
  gpu, renderer, panel, painting, getPaintingId,
  title = 'Part D · curves', defaultUV = DEFAULT_ARCH_UV, colour = COL.curve,
  extras = true, shiftAdd = true, exportName = 'curve.json',
}) {
  const meshes = new MeshRenderer(gpu);
  const lines = new LineRenderer(gpu);
  const cubeGeo = meshes.createGeometry(cube(), 'curve cube');
  const batch = {
    curve: lines.createBatch('line-strip', 4096),
    polygon: lines.createBatch('line-list', 2048),
    cr: lines.createBatch('line-strip', 4096),
    dc: lines.createBatch('line-list', 16),
  };
  const pool = [];
  const inst = (i) => (pool[i] ??= meshes.createInstance(cubeGeo, `curve cube ${i}`));
  // ?curves=0 hides every curve, ?profile=0 hides only the column profile (screenshots)
  const qp = new URLSearchParams(location.search);
  const hidden = qp.get('curves') === '0' || (!extras && qp.get('profile') === '0');
  const hideMarker = qp.get('marker') === 'off'; // ?marker=off hides the animated box entirely

  const state = { ...DEFAULTS, ...(extras ? {} : { cr: false, dc: false, animate: false }) };
  if (extras) {
    // Preset URL parameters (for reproducible screenshots), e.g. ?marker=0&u=0.5&cr=1&dc=0&dcSeg=1&dcT=0.4&edit=0&poly=0
    const q = new URLSearchParams(location.search);
    const n = (k) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? v : undefined; };
    if (q.get('marker') === '0' || hideMarker) state.animate = false;
    if (n('u') !== undefined) state.u = Math.min(Math.max(n('u'), 0), 1);
    if (q.get('cr') === '1') state.cr = true;
    if (q.get('dc') === '0') state.dc = false;
    if (n('dcT') !== undefined) state.dcT = n('dcT');
    if (n('dcSeg') !== undefined) state.dcSeg = n('dcSeg');
  }
  {
    // ?edit=0 hides the handles and ?poly=0 the control polygons, for every curve
    const q = new URLSearchParams(location.search);
    if (q.get('edit') === '0') state.edit = false;
    if (q.get('poly') === '0') state.polygon = false;
  }
  let segs = null;         // [[P0,P1,P2,P3], ...] in world xy
  let problem = null;       // TODO message from the main curve maths
  let crProblem = null;     // TODO message from the second curve family
  let drag = null;          // { handle, grab } while a handle is being dragged
  let capturing = false;    // a click already did something (e.g. added a segment): no orbit
  let marker = null;        // { pos, angle } for the animated object
  let dcPoint = null;       // the point on the curve for the de Casteljau view

  /* ---------------- coordinates ---------------- */
  const uvToWorld = ([u, v], a) => [(2 * u - 1) * a, 1 - 2 * v];

  /** Shared joints and mirrored P1: the C¹ condition. */
  function enforceC1(s) {
    for (let k = 1; k < s.length; k++) {
      s[k][0] = [...s[k - 1][3]];
      s[k][1] = curves.c1NextControl(s[k - 1][2], s[k - 1][3]);
    }
  }

  function buildDefault() {
    const a = painting.aspect;
    const d = defaultUV;
    const s = [d.first.map((p) => uvToWorld(p, a))];
    for (const [p2, p3] of d.rest) s.push([[0, 0], [0, 0], uvToWorld(p2, a), uvToWorld(p3, a)]);
    enforceC1(s);
    return s;
  }

  /* ---------------- handles ---------------- */
  function handles() {
    const out = [];
    segs.forEach((s, k) => {
      if (k === 0) {
        out.push({ k, i: 0, kind: 'joint' }, { k, i: 1, kind: 'free' });
      } else {
        out.push({ k, i: 1, kind: 'derived' });
      }
      out.push({ k, i: 2, kind: 'free' }, { k, i: 3, kind: 'joint' });
    });
    return out;
  }
  const posOf = (h) => segs[h.k][h.i];

  /** Move a handle to p = [x, y] and repair the neighbours so every joint stays C¹. */
  function moveHandle(h, p) {
    const s = segs[h.k];
    if (h.k === 0 && h.i === 0) {               // first point: carry P1 along
      const dx = p[0] - s[0][0], dy = p[1] - s[0][1];
      s[0] = [p[0], p[1]];
      s[1] = [s[1][0] + dx, s[1][1] + dy];
    } else if (h.i === 3) {                     // a joint: carry the incoming P2 along
      const dx = p[0] - s[3][0], dy = p[1] - s[3][1];
      s[3] = [p[0], p[1]];
      s[2] = [s[2][0] + dx, s[2][1] + dy];
    } else if (h.i === 1 && h.k > 0) {          // the mirrored control point: mirror it back
      const prev = segs[h.k - 1];
      prev[2] = curves.c1NextControl(p, prev[3]);
    } else {                                    // P1 of segment 0, or any P2
      s[h.i] = [p[0], p[1]];
    }
    enforceC1(segs);
  }

  function addSegment(target) {
    const prev = segs[segs.length - 1];
    const p0 = [...prev[3]];
    const p1 = curves.c1NextControl(prev[2], prev[3]);
    const p3 = target ?? [p0[0] + (p0[0] - prev[2][0]) * 1.5, p0[1] + (p0[1] - prev[2][1]) * 1.5];
    const p2 = [p3[0] + (p1[0] - p3[0]) * 0.4, p3[1] + (p1[1] - p3[1]) * 0.4];
    segs.push([p0, p1, p2, p3]);
  }

  /* ---------------- UI ---------------- */
  const f = panel.folder(title);
  const status = f.text('');
  const widgets = [];
  widgets.push(f.toggle('edit points (drag)', state, 'edit'));
  widgets.push(f.toggle('control polygon', state, 'polygon'));
  let uSlider = { update() {} };
  if (extras) {
    widgets.push(f.toggle('Catmull–Rom overlay', state, 'cr'));
    widgets.push(f.toggle('de Casteljau', state, 'dc'));
    widgets.push(f.slider('dC segment', state, 'dcSeg', 0, 9, 1));
    widgets.push(f.slider('dC t', state, 'dcT', 0, 1, 0.01));
    widgets.push(f.toggle('animate marker', state, 'animate'));
    widgets.push(f.slider('speed (u/s)', state, 'speed', 0, 0.4, 0.01));
    uSlider = f.slider('marker u', state, 'u', 0, 1, 0.001);
    widgets.push(uSlider);
  }
  f.button('add segment', () => run(() => addSegment()));
  f.button('remove last segment', () => run(() => { if (segs.length > MIN_SEGMENTS) segs.pop(); }));
  f.button('reset curve', () => { segs = null; });
  f.button('export JSON', () => run(() => {
    const json = curveToJSON({
      painting: getPaintingId(),
      aspect: painting.aspect,
      kind: 'bezier-c1',
      segments: segs.map((s) => s.map((p) => [...p])),
    });
    downloadJSON(json, exportName);
  }));
  f.note(shiftAdd
    ? 'Drag points · shift+click adds a segment · drag empty space to orbit.'
    : 'Drag points · drag empty space to orbit.');

  /** Run a UI action; a missing function shows up in the status box instead of crashing. */
  function run(fn) {
    if (!segs) return;
    try { fn(); } catch (e) {
      if (!(e instanceof NotImplemented)) throw e;
      problem = e.message;
    }
  }

  /* ---------------- per-frame model ---------------- */
  const push = (arr, p, z, c) => arr.push(p[0], p[1], z, c[0], c[1], c[2]);

  function rebuild() {
    const n = segs.length;

    // the curve itself: sample evalPiecewise over the global parameter u
    const steps = n * SAMPLES_PER_SEGMENT;
    const cv = [];
    for (let i = 0; i <= steps; i++) push(cv, curves.evalPiecewise(segs, i / steps), Z_CURVE, colour);
    lines.setVertices(batch.curve, new Float32Array(cv));

    // control polygon: P0-P1, P1-P2, P2-P3 of every segment
    const pg = [];
    for (const s of segs) for (let i = 0; i < 3; i++) { push(pg, s[i], Z_CURVE, COL.polygon); push(pg, s[i + 1], Z_CURVE, COL.polygon); }
    lines.setVertices(batch.polygon, new Float32Array(pg));

    // second curve family: Catmull–Rom through the joints
    crProblem = null;
    lines.setVertices(batch.cr, new Float32Array(0));
    if (state.cr) {
      try {
        const J = [segs[0][0], ...segs.map((s) => s[3])];
        const m = J.length - 1;
        const cr = [];
        for (let i = 0; i < m; i++) {
          const p0 = J[Math.max(i - 1, 0)], p1 = J[i], p2 = J[i + 1], p3 = J[Math.min(i + 2, m)];
          for (let j = i === 0 ? 0 : 1; j <= 24; j++) push(cr, curves.catmullRom(p0, p1, p2, p3, j / 24), Z_CURVE, COL.cr);
        }
        lines.setVertices(batch.cr, new Float32Array(cr));
      } catch (e) {
        if (!(e instanceof NotImplemented)) throw e;
        crProblem = e.message;
      }
    }

    // de Casteljau construction of one segment at parameter t
    dcPoint = null;
    lines.setVertices(batch.dc, new Float32Array(0));
    if (state.dc) {
      const k = Math.min(Math.round(state.dcSeg), n - 1);
      const L = curves.deCasteljau(segs[k], state.dcT);
      const dc = [];
      for (let i = 0; i + 1 < L[1].length; i++) { push(dc, L[1][i], Z_CURVE, COL.dc1); push(dc, L[1][i + 1], Z_CURVE, COL.dc1); }
      for (let i = 0; i + 1 < L[2].length; i++) { push(dc, L[2][i], Z_CURVE, COL.dc2); push(dc, L[2][i + 1], Z_CURVE, COL.dc2); }
      lines.setVertices(batch.dc, new Float32Array(dc));
      dcPoint = L[L.length - 1][0];
    }

    // animated object: position on the curve, rotated to the tangent
    if (!extras) { marker = null; return; }
    const u = Math.min(Math.max(state.u, 0), 1);
    const k = Math.min(Math.floor(u * n), n - 1);
    const t = u * n - k;
    const pos = curves.cubicBezier(...segs[k], t);
    const tan = curves.cubicBezierTangent(...segs[k], t);
    marker = { pos, angle: Math.atan2(tan[1], tan[0]) };
  }

  /* ---------------- pointer handling ---------------- */
  /** ctx: { cam, aspect, vp (P·V of the active camera), size: [canvas css width, height] } */
  function project(vp, p, z) {
    const c = mat4.transformVec4(vp, [p[0], p[1], z, 1]);
    return c[3] > 1e-6 ? [c[0] / c[3], c[1] / c[3]] : null;
  }

  function pointerDown(e, ctx) {
    drag = null;
    capturing = false;
    if (!segs || problem || !state.edit || !ctx.vp) return false;
    try {
      let best = null, bestD = PICK_RADIUS_PX;
      for (const h of handles()) {
        const n = project(ctx.vp, posOf(h), Z_HANDLE);
        if (!n) continue;
        const d = Math.hypot((n[0] - e.ndc[0]) * ctx.size[0] / 2, (n[1] - e.ndc[1]) * ctx.size[1] / 2);
        if (d < bestD) { best = h; bestD = d; }
      }
      const hit = screenToPaintingPoint(e.ndc, ctx.cam, ctx.aspect);
      if (best) {
        const p = posOf(best);
        drag = { handle: best, grab: hit ? [hit[0] - p[0], hit[1] - p[1]] : [0, 0] };
        capturing = true;
        return true;
      }
      if (shiftAdd && e.shift && hit) { addSegment(hit); capturing = true; return true; }
    } catch (err) {
      if (!(err instanceof NotImplemented)) throw err;
      problem = err.message;
    }
    return false;
  }

  function pointerDrag(e, ctx) {
    if (!drag) return capturing;
    try {
      const hit = screenToPaintingPoint(e.ndc, ctx.cam, ctx.aspect);
      if (hit) moveHandle(drag.handle, [hit[0] - drag.grab[0], hit[1] - drag.grab[1]]);
    } catch (err) {
      if (!(err instanceof NotImplemented)) throw err;
      problem = err.message;
    }
    return true;
  }

  function pointerUp() { drag = null; capturing = false; }

  /* ---------------- frame hooks ---------------- */
  return {
    state,
    /** The current segments in world xy (or null before the first update). */
    getSegments: () => segs,

    update(dt) {
      try {
        if (!segs) segs = buildDefault();
        if (state.animate) { state.u = (state.u + dt * state.speed) % 1; uSlider.update(); }
        rebuild();
        problem = null;
        status.set(
          `${segs.length} segments · C¹ at ${segs.length - 1} joints` +
          (crProblem ? `\n${crProblem}\n(write it in src/math/curves.js)` : '')
        );
        status.el.classList.toggle('warn', !!crProblem);
      } catch (e) {
        if (!(e instanceof NotImplemented)) throw e;
        problem = e.message;
        segs = segs && segs.length ? segs : null;
        status.set(`${e.message}\n(write it in ${whereIs(e.message)})`);
        status.el.classList.add('warn');
      }
    },

    /** @param {GPURenderPassEncoder} pass  @param {Float32Array} viewProj  P · V */
    draw(pass, viewProj) {
      if (hidden || !segs || problem) return;
      if (state.polygon) lines.draw(pass, batch.polygon, viewProj, renderer);
      lines.draw(pass, batch.curve, viewProj, renderer);
      if (state.cr) lines.draw(pass, batch.cr, viewProj, renderer);
      if (state.dc) lines.draw(pass, batch.dc, viewProj, renderer);

      let k = 0;
      const drawCube = (model, colour) => meshes.draw(pass, inst(k++), viewProj, model, colour, renderer);
      if (state.edit) {
        for (const h of handles()) {
          const p = posOf(h);
          const s = drag && drag.handle.k === h.k && drag.handle.i === h.i ? 0.045 : 0.028;
          drawCube(composeTRS([p[0], p[1], Z_HANDLE], I4, [s, s, s]), HANDLE_COL[h.kind]);
        }
      }
      if (dcPoint) drawCube(composeTRS([dcPoint[0], dcPoint[1], Z_HANDLE], I4, [0.04, 0.04, 0.04]), [1.0, 0.1, 0.1]);
      if (marker && !hideMarker) {
        drawCube(composeTRS([marker.pos[0], marker.pos[1], Z_MARKER], mat4.rotateZ(marker.angle), [0.14, 0.05, 0.05]), [1.0, 0.2, 0.6]);
      }
    },

    pointerDown,
    pointerDrag,
    pointerUp,
  };
}

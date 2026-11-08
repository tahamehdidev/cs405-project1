/**
 * Entry point: wires GPU, painting, camera, scene and UI together and runs
 * the render loop. You will edit this file a little (camera controls, views);
 * most of your work goes into src/math/ and src/scene/.
 *
 *   p_clip = P · V · M · p_object
 */
import './ui/style.css';
import { initWebGPU, showFatal } from './render/gpu.js';
import { Renderer } from './render/renderer.js';
import { Painting } from './render/painting.js';
import {
  createCamera, createInspectionCamera, syncEye, orbitBy, zoomBy, viewProjection,
} from './scene/camera.js';
import { createFrustumView } from './scene/frustum.js';
import { createCurveEditor } from './scene/curveEditor.js';
import { createRevolveView } from './scene/revolveView.js';
import { DEFAULT_COLUMN_UV } from './scene/defaultCurves.js';
import { createScene } from './scene/scene.js';
import { createPanel } from './ui/panel.js';
import { Stats } from './ui/stats.js';
import { attachPointer } from './ui/input.js';
import { PAINTINGS, DEFAULT_PAINTING, paintingURL } from './config.js';
import * as mat4 from './math/mat4.js';

const DEG = Math.PI / 180;

async function main() {
  const canvas = document.getElementById('gfx');
  const gpu = await initWebGPU(canvas);
  const renderer = new Renderer(gpu);
  const painting = new Painting(gpu);

  const params = new URLSearchParams(location.search);
  let current = PAINTINGS.find((p) => p.id === params.get('painting'))
    ?? PAINTINGS.find((p) => p.id === DEFAULT_PAINTING);
  await painting.load(paintingURL(current));

  /* ---------------- UI ---------------- */
  const panelRoot = document.getElementById('panel');
  const panel = createPanel(panelRoot);
  const title = document.createElement('h1');
  title.textContent = 'CS405 · Project 1';
  panelRoot.appendChild(title);
  const stats = new Stats(panelRoot);
  // GPU name for the report (adapter.info is not available in every browser)
  const gi = gpu.adapter?.info;
  const gpuName = gi ? [gi.vendor, gi.architecture, gi.description].filter(Boolean).join(' · ') : '';
  panel.note(`GPU: ${gpuName || 'unknown (see chrome://gpu)'}`);

  const pf = panel.folder('Painting');
  pf.select('painting', PAINTINGS.map((p) => ({ value: p.id, label: `${p.artist} — ${p.title}` })), current.id,
    async (id) => {
      current = PAINTINGS.find((p) => p.id === id);
      await painting.load(paintingURL(current));
      history.replaceState(null, '', `?painting=${id}`);
    });

  const camera = createCamera();
  // Preset URL parameters (for reproducible screenshots), e.g. ?yaw=25&pitch=10&proj=ortho&view=inspection
  const qn = (k) => { const v = parseFloat(params.get(k)); return Number.isFinite(v) ? v : undefined; };
  if (qn('yaw') !== undefined) camera.yaw = qn('yaw') * DEG;
  if (qn('pitch') !== undefined) camera.pitch = qn('pitch') * DEG;
  if (qn('dist') !== undefined) camera.distance = qn('dist');
  if (qn('cx') !== undefined) camera.target[0] = qn('cx'); // aim the camera, e.g. ?cx=-0.17&cy=0.78&dist=0.9
  if (qn('cy') !== undefined) camera.target[1] = qn('cy');
  if (qn('fov') !== undefined) camera.fovY = qn('fov') * DEG;
  if (qn('near') !== undefined) camera.near = qn('near');
  if (qn('far') !== undefined) camera.far = qn('far');
  if (params.get('proj') === 'ortho') camera.projection = 'orthographic';
  const inspection = createInspectionCamera();
  const view = { mode: params.get('view') === 'inspection' ? 'inspection' : 'main', showFrustum: true };
  const ui = { fovDeg: camera.fovY / DEG };

  const cf = panel.folder('Camera');
  const camStatus = cf.text('');
  const projSelect = cf.select('projection', ['perspective', 'orthographic'], camera.projection, (v) => (camera.projection = v));
  const orbitStatus = cf.text('');
  const camReadout = cf.text('');
  const camSliders = [
    cf.slider('fov°', ui, 'fovDeg', 10, 120, 1, (v) => { camera.fovY = v * DEG; }),
    cf.slider('near', camera, 'near', 0.001, 5, 0.001),
    cf.slider('far', camera, 'far', 6, 1000, 1),
    cf.slider('ortho height', camera, 'orthoHeight', 0.5, 6, 0.01),
  ];
  cf.note('drag: orbit · wheel: zoom (dolly, or ortho height)');

  const scene = createScene({ gpu, renderer, painting, panel });
  const frustumView = createFrustumView(gpu);
  const editor = createCurveEditor({ gpu, renderer, panel, painting, getPaintingId: () => current.id });
  // Bonus: a second curve, the column's profile, spun into a 3D column
  const columnEditor = createCurveEditor({
    gpu, renderer, panel, painting, getPaintingId: () => current.id,
    title: 'Bonus · column profile', defaultUV: DEFAULT_COLUMN_UV, colour: [0.35, 1.0, 0.45],
    extras: false, shiftAdd: false, exportName: 'curve-column.json',
  });
  const revolveView = createRevolveView({ gpu, renderer, panel, painting, columnEditor });
  const editors = [editor, columnEditor];

  const vf = panel.folder('View');
  const viewSelect = vf.select('view', [
    { value: 'main', label: 'main camera' },
    { value: 'inspection', label: 'inspection camera (fixed)' },
  ], view.mode, (v) => { view.mode = v; });
  const frustumToggle = vf.toggle('show frustum', view, 'showFrustum');
  vf.note('In the inspection view the main camera is drawn with its frustum; dragging still orbits the MAIN camera.');
  vf.button('reset', () => {
    Object.assign(camera, createCamera());
    ui.fovDeg = camera.fovY / DEG;
    for (const s of camSliders) s.update();
    projSelect.set(camera.projection);
    view.mode = 'main';
    view.showFrustum = true;
    viewSelect.set(view.mode);
    frustumToggle.update();
    scene.reset();
  });
  vf.note(gpu.encodeSRGB ? 'sRGB: encoded in shader (fallback)' : 'sRGB: canvas -srgb view');

  /* -------------- input --------------- */
  // what the pointer handlers need to know about the view currently on screen (set every frame)
  let pickCam = camera, pickVP = null;
  const pickCtx = () => ({
    cam: pickCam, vp: pickVP, aspect: canvas.width / canvas.height,
    size: [canvas.clientWidth, canvas.clientHeight],
  });
  attachPointer(canvas, {
    down(e) { const ctx = pickCtx(); for (const ed of editors) if (ed.pointerDown(e, ctx)) break; },
    drag(e) { const ctx = pickCtx(); if (!editors.some((ed) => ed.pointerDrag(e, ctx))) orbitBy(camera, e.dx, e.dy); },
    up() { for (const ed of editors) ed.pointerUp(); },
    wheel(e) { zoomBy(camera, e.delta); },
  });

  /* ------------ render loop ----------- */
  let last = performance.now();
  function frame(now) {
    stats.begin(now);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    scene.update(dt, now / 1000);
    for (const ed of editors) ed.update(dt);
    revolveView.update(dt);

    // main camera: orbit state → eye
    const orbitProblem = syncEye(camera);
    orbitStatus.set(orbitProblem ? `${orbitProblem}\n(write it in src/scene/cameraMath.js)` : `yaw ${(camera.yaw / DEG).toFixed(1)}° pitch ${(camera.pitch / DEG).toFixed(1)}° d ${camera.distance.toFixed(2)}`);
    orbitStatus.el.classList.toggle('warn', !!orbitProblem);

    const aspect = canvas.width / canvas.height;
    const inInspection = view.mode === 'inspection';
    const activeCam = inInspection ? inspection : camera;
    const vp = viewProjection(activeCam, aspect, painting.aspect);
    pickCam = activeCam;
    pickVP = vp.fallback ? null : vp.matrix;
    camStatus.set(vp.fallback
      ? `PLACEHOLDER view (no camera yet)\n${vp.missing}`
      : `${inInspection ? 'inspection' : 'main'} view · P·V (${activeCam.projection})`);
    camStatus.el.classList.toggle('warn', vp.fallback);
    camReadout.set(
      `main camera\n` +
      `eye    ${camera.eye.map((x) => x.toFixed(2)).join(', ')}\n` +
      `target ${camera.target.map((x) => x.toFixed(2)).join(', ')}\n` +
      `fovY ${(camera.fovY / DEG).toFixed(1)}°  near ${camera.near}  far ${camera.far}`
    );

    // frustum lines are only needed (and only meaningful) when looking from the inspection camera
    let frustumProblem = null;
    if (inInspection && view.showFrustum) frustumProblem = frustumView.update(camera, aspect);

    const paintingMVP = vp.fallback ? vp.matrix : mat4.multiply(vp.matrix, painting.model);
    renderer.render((pass) => {
      painting.draw(pass, paintingMVP, renderer);
      scene.draw(pass, vp.matrix);
      for (const ed of editors) ed.draw(pass, vp.matrix);
      revolveView.draw(pass, vp.matrix);
      if (inInspection && view.showFrustum && !frustumProblem) frustumView.draw(pass, vp.matrix, renderer);
    });
    if (frustumProblem) camStatus.set(`${frustumProblem}\n(write it in src/scene/cameraMath.js)`);

    stats.end(renderer.stats);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  showFatal(e.message ?? String(e));
});

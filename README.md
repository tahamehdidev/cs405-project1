# CS405 Project 1 — Transformations, Projection & Curves from Paintings

A single WebGPU application (WebGPU + WGSL, plain JavaScript, served by Vite) that turns
a painting from the Sakıp Sabancı Museum collection into a small 3D scene.

**Painting:** Şevket Dağ — *II. Selim Türbesi Kapısı*.
The painting hangs in the scene as a textured quad. In front of it are lit objects (Part A),
a hanging lamp built as a scene graph (Part B), a camera you orbit with the mouse (Part C),
and a curve traced over the painted tile border (Part D).

Everything follows one chain: `p_clip = P · V · M · p_object`.
All maths (vectors, 4×4 matrices, camera, curves) is written from scratch — no maths or
scene-graph library is used.

## Run it

Requirements: **Node.js 20.19 or newer** and a browser with WebGPU (current Chrome or Edge,
Safari 26+, Firefox 141+ on Windows). It must be served from `localhost`
(opening `index.html` as a file does not work).

```bash
npm install
npm run dev        # opens http://localhost:5173
npm test           # unit tests for the maths (all pass)
```

## Controls

Everything is in the panel on the right. The mouse works on the painting.

### Mouse
| Action | What it does |
|---|---|
| Drag on empty space | Orbit the **main** camera around the painting (also in the inspection view) |
| Mouse wheel | Zoom: moves the camera closer or further (perspective), or changes the visible height (orthographic) |
| Drag a curve point | Move that control point; the curve stays C¹ at every joint |
| Shift + click on the painting | Add a curve segment ending at that point |

### Panel
| Section | Control | What it does |
|---|---|---|
| top | frame / cpu / draws / vertices | Frame time (ms and fps), CPU time per frame, draw calls and **vertices submitted per frame** |
| Painting | painting | Choose which painting is shown |
| Camera | projection | Switch **perspective / orthographic** at run time |
| | fov°, near, far, ortho height | Camera parameters (the readout shows eye, target, fov, near, far, yaw, pitch, distance) |
| Part A | order | Which composition drives the orange cube: `M = T·R·S` or `M = S·R·T` |
| | tx, ty, tz, angle°, sx, sy, sz | Translation, rotation about z, and scale of the orange cube |
| | two matrix boxes | **Both** matrices, `T·R·S` and `S·R·T`, are always shown numerically |
| Part B | tree box | The scene graph: gate → arm → chain → lamp → bead |
| | show lamp | Hide or show the lamp (useful while tracing the curve) |
| | freeze animation, t (s) | Stop the animation and set the clock exactly (use t = 2.5 s for the hand check) |
| | node axes | Draw each node's local axes |
| | inspect node | Show the chosen node's local and world matrix |
| Scene | debug axes | Draw the world axes |
| Part D | edit points (drag) | Turn mouse editing of the curve on or off |
| | control polygon | Show the Bézier control polygons |
| | Catmull–Rom overlay | Show a Catmull–Rom spline through the curve's joints |
| | de Casteljau, dC segment, dC t | Show the de Casteljau construction of one segment at parameter t |
| | animate marker, speed, marker u | The pink marker travels along the curve and points along the tangent |
| | add / remove segment, reset curve | Edit the number of segments (at least 3), or go back to the traced curve |
| | export JSON | Download the curve as `curve.json` (normalised painting coordinates) |
| Bonus · column profile | edit points, control polygon, add / remove segment, reset curve, export JSON | A second curve (green) traces the right edge of the painted marble column, top to bottom. It is edited exactly like the arch curve |
| Bonus · surface of revolution | show 3D column, steps around axis, distance from painting (z), spin | The column profile is spun around the vertical axis into a lit 3D mesh that stands in front of the painting; it rebuilds when the profile or the steps change |
| View | view | **Main camera** or the fixed **inspection camera** |
| | show frustum | In the inspection view, draw the main camera's view frustum (near plane yellow, far plane orange) |
| | reset | Reset the camera, the view and the Part A / Part B scene |

### Starting values from the address bar

Every control can also be preset in the address, for reproducible screenshots, for example
`http://localhost:5173/?tx=0.4&ty=0.2&tz=0.3&angle=90&s=0.3&order=SRT` or
`http://localhost:5173/?view=inspection&yaw=25&pitch=10&t=2.5`.
The full list is at the end of `report/screenshots.md`.

## Project structure

```
src/
  math/     vec3.js, mat4.js, curves.js        the maths (Parts A, C, D)
  scene/    node.js                            scene-graph node (Part B)
            compose.js                         T·R·S and S·R·T (Part A)
            camera.js, cameraMath.js           camera, orbit, frustum corners, mouse → painting (Part C, D)
            frustum.js                         draws the camera frustum
            scene.js                           objects, lamp tree, animation (Parts A, B)
            curveEditor.js                     interaction and drawing of the curve (Part D)
            curveExport.js, defaultCurves.js   JSON export and the traced curve
            revolve.js, revolveView.js         bonus: surface of revolution (mesh maths, and drawing it)
            geometry.js                        cube and axes vertex data
  render/   gpu.js, renderer.js, painting.js,  WebGPU setup, frame, painting quad
            mesh.js, lines.js, shaders/*.wgsl  lit mesh and line pipelines
  ui/       panel.js, stats.js, input.js       panel, frame-time counter, pointer events
  main.js                                      wiring and render loop
tests/                                         unit tests (node --test)
curve.json                                     the exported curve (Part D)
```

## Conventions

- Matrices are `Float32Array(16)`, **column-major**: element (row r, column c) is at index
  `c*4 + r`; translation is at indices 12, 13, 14. This is exactly the layout WebGPU expects.
- Column vectors: `p' = M · p`. `multiply(A, B)` is `A·B`, so `B` acts first.
  The whole project uses **`M = T · R · S`**: scale, then rotate, then translate.
- Right-handed world, angles in radians, camera looks down −z.
- Clip space is WebGPU's: after the divide by w, x and y are in [−1, 1] and **z is in [0, 1]**.
- The painting quad is centred at the origin in the plane z = 0: y ∈ [−1, 1],
  x ∈ [−a, a] with a = image width / height. "In front of the painting" means z > 0.

## Curve export

`curve.json` holds the three Bézier segments (four `[u, v]` points each) in normalised
painting coordinates: `u, v ∈ [0, 1]`, origin at the top-left corner, `v` downwards
(`u = (x + a) / (2a)`, `v = (1 − y) / 2`). The same curve is the default shown by the app.

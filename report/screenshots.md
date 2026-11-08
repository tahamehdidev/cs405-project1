# Reproducing the report figures

Every control of the application can also be preset from the address bar, so each figure in `report.pdf` can be
reproduced exactly. Start the app (`npm install && npm run dev`) and open the addresses below in Chrome or Edge,
window maximised, browser zoom 100 %, base address `http://localhost:5173/`. The settings only set the starting
values; every control still works. The screenshots are saved in `report/img/`.

## Figures

| File in `report/img/` | Part | Address (append to the base address) |
|---|---|---|
| `A-trs.png` | A | `?tx=0.4&ty=0.2&tz=0.3&angle=90&s=0.3&order=TRS&lamp=0&curves=0&col=0` |
| `A-srt.png` | A | `?tx=0.4&ty=0.2&tz=0.3&angle=90&s=0.3&order=SRT&lamp=0&curves=0&col=0` |
| `B-axes.png` | B | `?t=2.5&axes=1&curves=0&col=0` |
| `C-perspective.png` | C | `?t=2.5&yaw=25&pitch=12&curves=0&col=0` |
| `C-ortho.png` | C | `?t=2.5&yaw=25&pitch=12&proj=ortho&curves=0&col=0` |
| `C-frustum.png` | C | `?view=inspection&t=2.5&yaw=25&pitch=10&curves=0&col=0` |
| `C-depth-good.png` | C | `?dist=15&fov=8&near=0.1&far=20&zoff=0.0002&lamp=0&col=0&marker=0&edit=0&poly=0&dc=0` |
| `C-depth-bad.png` | C | `?dist=15&fov=8&near=0.00001&far=100000&zoff=0.0002&lamp=0&col=0&marker=0&edit=0&poly=0&dc=0` |
| `D-traced.png` | D | `?dist=0.9&cx=-0.17&cy=0.78&marker=off&edit=0&poly=0&dc=0&lamp=0&col=0&profile=0` |
| `D-catmull.png` | D | `?dist=0.9&cx=-0.17&cy=0.78&marker=off&cr=1&dc=0&edit=0&poly=0&lamp=0&col=0&profile=0` |
| `D-marker.png` | D | `?dist=0.9&cx=-0.17&cy=0.78&marker=0&u=0.5&edit=0&poly=0&dc=0&lamp=0&col=0&profile=0` |
| `D-handles.png` | D | `?marker=0&dc=0&lamp=0&col=0` |
| `D-decasteljau.png` | D | `?marker=0&dc=1&dcSeg=1&dcT=0.4&lamp=0&col=0` |
| `bonus-column.png` | Bonus | `?lamp=0&marker=0&dc=0&curves=0&yaw=30&pitch=5`, then set "distance from painting (z)" to about 0.5 and untick "spin" |
| `E-stats-all.png` | E | the plain address (everything on) |
| `E-stats-nocolumn.png` | E | `?col=0` |
| `E-stats-minimal.png` | E | `?curves=0&col=0&lamp=0` |

Other files in `report/img/`: `D-trace-check.png` (the traced curve overlaid on the full-resolution painting with a
20-pixel grid), `bernstein-basis.png` (plot of the four cubic Bernstein functions), and `B-proof-1.jpg` to
`B-proof-3.jpg` (photos of the handwritten Part B calculation; the untouched originals are in `original/`).

## Notes on individual figures

- **Part A and B:** scroll the right-hand panel to "Part A" or "Part B" so the matrices are visible in the shot. For
  Part B keep "inspect node" on `bead`: the world matrix shows translation about (0.226, 0.505, 0.490) at t = 2.5 s.
- **Depth-precision experiment:** the camera is 15 units away with a narrow field of view so the painting fills the
  screen, and the curve lines are drawn only 0.0002 in front of the painting. Only near/far change between the two
  figures. A 24-bit depth buffer resolves roughly Δd ≈ d² / (near · 2²⁴): about 0.00013 for near 0.1 and about 1.3 for
  near 0.00001 at d = 15. The sliders only reach near 0.001 and far 1000, but the address bar can go further.
- **Part D zoom:** `dist=0.9&cx=-0.17&cy=0.78` aims the camera at the traced arch, `marker=off` hides the pink box and
  `profile=0` hides the green column curve.
- **Part E:** wait about 10 s and screenshot the top of the panel (frame time, CPU time, draw calls, vertices, GPU
  line). The frame time follows the monitor's refresh rate (5.00 ms on a 200 Hz display), so the CPU time is the more
  informative number. Some browsers hide the GPU name in the panel ("unknown"); the exact model is shown on the
  browser's GPU information page (`chrome://gpu`).

## All address-bar settings

| Setting | Meaning |
|---|---|
| `tx ty tz angle s order` | Part A cube: translation, angle (degrees), uniform scale, `TRS` or `SRT` |
| `t` | Part B clock in seconds (also freezes the animation) |
| `lamp=0` · `axes=1` | hide the lamp · show node axes |
| `yaw pitch dist fov near far` | main camera (angles and fov in degrees) |
| `cx cy` | aim the camera at (cx, cy) on the painting, together with `dist` to zoom |
| `proj=ortho` · `view=inspection` | orthographic projection · fixed inspection camera |
| `marker=0` · `marker=off` · `u` | pause the marker · hide it completely · its position on the curve (0 to 1) |
| `cr=1` · `dc=0` · `dcSeg` `dcT` | Catmull–Rom overlay · hide de Casteljau · its segment and t |
| `edit=0` · `poly=0` | hide the curve handles · hide the control polygons |
| `curves=0` · `profile=0` · `col=0` | hide all curves · hide only the column profile · hide the 3D column |
| `zoff` | gap between the curve lines and the painting (used in the depth experiment) |

/**
 * Curve export — Part D.
 *
 * Required JSON format (control points in NORMALISED painting coordinates:
 * u, v ∈ [0, 1], origin at the TOP-LEFT corner of the painting, v downwards,
 * the same as texture coordinates):
 *
 * {
 *   "painting": "kavunlu",
 *   "kind": "bezier-c1",                 // or "catmull-rom" / "bspline"
 *   "segments": [                          // for "bezier-c1": 4 points each
 *     [[0.12, 0.40], [0.18, 0.31], [0.27, 0.30], [0.33, 0.38]],
 *     ...
 *   ],
 *   "points": [[u, v], ...]                // for "catmull-rom" / "bspline"
 * }
 *
 * The painting quad spans x ∈ [−a, a], y ∈ [−1, 1] at z = 0 (a = image
 * width / height), so  u = (x + a) / (2a)  and  v = (1 − y) / 2.
 */
/**
 * YOU WRITE THIS (Part D, graded). Build the JSON object described above.
 *
 * Input `curve` (what the editor passes in):
 *   {
 *     painting: 'selim-turbesi',     // painting id            → "painting"
 *     aspect: 0.6078,                // image width / height   (the `a` in the formulas above)
 *     kind: 'bezier-c1',             //                         → "kind"
 *     segments: [[[x,y],[x,y],[x,y],[x,y]], ...]   // control points in WORLD coordinates
 *   }
 *
 * Output: { painting, kind, segments } where every point is converted to
 * normalised painting coordinates  u = (x + a) / (2a),  v = (1 − y) / 2.
 * Tests: tests/curveExport.test.js
 */
export function curveToJSON(curve) {
  const a = curve.aspect;
  const toUV = ([x, y]) => [(x + a) / (2 * a), (1 - y) / 2];

  return {
    painting: curve.painting,
    kind: curve.kind,
    segments: curve.segments.map((seg) => seg.map(toUV)),
  };
}

/** Provided: save any object as a .json download in the browser. */
export function downloadJSON(obj, filename = 'curve.json') {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

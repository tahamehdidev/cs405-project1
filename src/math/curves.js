/**
 * curves — Part D.
 *
 * Points are plain arrays of any dimension: [x, y] or [x, y, z].
 * All functions return new arrays and never modify their inputs.
 *
 * Tests: tests/curves.test.js
 */

/* ---------------------------------------------------------- helpers ----- */

/** Linear interpolation between two points of the same dimension. */
function lerpPoint(a, b, t) {
  return a.map((v, i) => (1 - t) * v + t * b[i]);
}

/* ---------------------------------------------------------- Bézier ------ */

/** The four cubic Bernstein basis values [B0(t), B1(t), B2(t), B3(t)]. */
export function bernstein3(t) {
  const s = 1 - t;
  return [s * s * s, 3 * t * s * s, 3 * t * t * s, t * t * t];
}

/** Point on the cubic Bézier curve with control points p0..p3 at t ∈ [0, 1]. */
export function cubicBezier(p0, p1, p2, p3, t) {
  const [b0, b1, b2, b3] = bernstein3(t);
  return p0.map((_, i) => b0 * p0[i] + b1 * p1[i] + b2 * p2[i] + b3 * p3[i]);
}

/** First derivative dB/dt of the cubic Bézier at t (not normalised). */
export function cubicBezierTangent(p0, p1, p2, p3, t) {
  const s = 1 - t;
  return p0.map(
    (_, i) =>
      3 * (s * s * (p1[i] - p0[i]) +
           2 * s * t * (p2[i] - p1[i]) +
           t * t * (p3[i] - p2[i]))
  );
}

/**
 * de Casteljau's construction for any number of control points.
 * levels[0] = the input points, levels[k] = k-th round of interpolation,
 * levels[n - 1] = [the point on the curve].
 */
export function deCasteljau(points, t) {
  let current = points.map((p) => p.slice()); // copy, don't alias the input
  const levels = [current];
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length - 1; i++) {
      next.push(lerpPoint(current[i], current[i + 1], t));
    }
    levels.push(next);
    current = next;
  }
  return levels;
}

/* ----------------------------------------------- piecewise, C¹ joints --- */

/** P1 of the next segment that makes the joint at P3 C¹-continuous: 2·P3 − P2. */
export function c1NextControl(p2, p3) {
  return p3.map((v, i) => 2 * v - p2[i]);
}

/**
 * Evaluate a piecewise cubic Bézier at a global parameter u ∈ [0, 1].
 * With n segments: index = floor(u·n) (capped at n−1), local t = u·n − index.
 */
export function evalPiecewise(segments, u) {
  const n = segments.length;
  const scaled = u * n;
  const index = Math.max(0, Math.min(Math.floor(scaled), n - 1));
  const t = scaled - index;
  const [p0, p1, p2, p3] = segments[index];
  return cubicBezier(p0, p1, p2, p3, t);
}

/* ---------------------------- second curve family ----------------------- */

/**
 * Uniform Catmull–Rom segment between p1 and p2 (passes through both):
 * 0.5 · [ 2p1 + (p2−p0)t + (2p0−5p1+4p2−p3)t² + (3p1−p0−3p2+p3)t³ ]
 */
export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return p0.map(
    (_, i) =>
      0.5 * (
        2 * p1[i] +
        (p2[i] - p0[i]) * t +
        (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
        (3 * p1[i] - p0[i] - 3 * p2[i] + p3[i]) * t3
      )
  );
}

/** Uniform cubic B-spline basis values [N0(t), N1(t), N2(t), N3(t)]. */
export function bsplineBasis(t) {
  const s = 1 - t;
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    (s * s * s) / 6,
    (3 * t3 - 6 * t2 + 4) / 6,
    (-3 * t3 + 3 * t2 + 3 * t + 1) / 6,
    t3 / 6,
  ];
}

/** Point on the uniform cubic B-spline segment controlled by p0..p3. */
export function bspline(p0, p1, p2, p3, t) {
  const [n0, n1, n2, n3] = bsplineBasis(t);
  return p0.map((_, i) => n0 * p0[i] + n1 * p1[i] + n2 * p2[i] + n3 * p3[i]);
}

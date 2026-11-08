/**
 * Bonus — surface of revolution (see the spec in the task for details).
 * Returns a non-indexed triangle list, 6 floats per vertex: [x, y, z, nx, ny, nz].
 */
export function revolve(profile, steps) {
  const m = profile.length;
  if (m < 2) return new Float32Array(0);

  // Step 2: one outward normal [nr, ny] per profile point
  const normals = profile.map((_, i) => {
    let dr, dy;
    if (i === 0) {
      dr = profile[1][0] - profile[0][0];
      dy = profile[1][1] - profile[0][1];
    } else if (i === m - 1) {
      dr = profile[m - 1][0] - profile[m - 2][0];
      dy = profile[m - 1][1] - profile[m - 2][1];
    } else {
      dr = profile[i + 1][0] - profile[i - 1][0];
      dy = profile[i + 1][1] - profile[i - 1][1];
    }
    const len = Math.hypot(dr, dy);
    return len === 0 ? [1, 0] : [-dy / len, dr / len];
  });

  // Step 3: cos/sin for j = 0 … steps (steps + 1 values, the last closes the surface)
  const cosT = new Array(steps + 1);
  const sinT = new Array(steps + 1);
  for (let j = 0; j <= steps; j++) {
    const theta = (2 * Math.PI * j) / steps;
    cosT[j] = Math.cos(theta);
    sinT[j] = Math.sin(theta);
  }

  // Step 4: pre-sized output and a vertex-adding helper
  const out = new Float32Array((m - 1) * steps * 6 * 6);
  let k = 0;
  const addVertex = (i, j) => {
    const r = profile[i][0];
    const y = profile[i][1];
    const [nr, ny] = normals[i];
    out[k++] = r * cosT[j];
    out[k++] = y;
    out[k++] = r * sinT[j];
    out[k++] = nr * cosT[j];
    out[k++] = ny;
    out[k++] = nr * sinT[j];
  };

  // Step 5: for each profile segment and angle, emit (A,B,C) and (A,C,D)
  for (let i = 0; i < m - 1; i++) {
    for (let j = 0; j < steps; j++) {
      // A = (i, j)  B = (i, j+1)  C = (i+1, j+1)  D = (i+1, j)
      addVertex(i, j);         addVertex(i, j + 1);     addVertex(i + 1, j + 1);
      addVertex(i, j);         addVertex(i + 1, j + 1); addVertex(i + 1, j);
    }
  }

  return out;
}

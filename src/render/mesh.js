/**
 * Lit mesh rendering (plumbing, not graded maths).
 *
 *   const meshes = new MeshRenderer(gpu);
 *   const cubeGeo = meshes.createGeometry(cube());     // vertex data, shareable
 *   const inst    = meshes.createInstance(cubeGeo);    // one per drawn object
 *   meshes.draw(pass, inst, viewProj, model, [r, g, b], renderer);
 *
 * WHY "instance": queue.writeBuffer() calls all run BEFORE the frame's commands,
 * so two draws that share one uniform buffer would both see the last matrix.
 * Every object that is drawn gets its own instance (own uniform buffer and
 * bind group); instances may share a geometry (vertex buffer).
 *
 * Vertex layout: [x y z  nx ny nz], stride 24 bytes, topology triangle-list.
 */
import meshWGSL from './shaders/mesh.wgsl?raw';
import { createShader, fragmentConstants } from './shader.js';
import { DEPTH_FORMAT } from './renderer.js';
import * as mat4 from '../math/mat4.js';
import * as vec3 from '../math/vec3.js';

const STRIDE = 6 * 4;
const UNIFORM_FLOATS = 16 + 16 + 4; // mvp, normalMat, colour

/**
 * Matrix that transforms normals into world space: the inverse-transpose of the
 * model's upper 3×3. With a non-uniform scale a plain model matrix would tilt
 * the normals and the lighting would look wrong.
 *
 * For a 3×3 matrix with columns a, b, c, the rows of the inverse are
 * (b×c, c×a, a×b)/det, so the inverse-transpose has those as its COLUMNS.
 */
export function normalMatrix(model) {
  const a = [model[0], model[1], model[2]];
  const b = [model[4], model[5], model[6]];
  const c = [model[8], model[9], model[10]];
  const bc = vec3.cross(b, c);
  const det = vec3.dot(a, bc);
  const k = det !== 0 ? 1 / det : 1;
  const m = mat4.identity();
  m.set(vec3.scale(bc, k), 0);
  m.set(vec3.scale(vec3.cross(c, a), k), 4);
  m.set(vec3.scale(vec3.cross(a, b), k), 8);
  return m;
}

export class MeshRenderer {
  /** @param {Awaited<ReturnType<import('./gpu.js').initWebGPU>>} gpu */
  constructor(gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const module = createShader(device, meshWGSL, 'mesh');
    this.pipeline = device.createRenderPipeline({
      label: 'mesh',
      layout: 'auto',
      vertex: {
        module, entryPoint: 'vs',
        buffers: [{
          arrayStride: STRIDE,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },     // position
            { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' }, // normal
          ],
        }],
      },
      fragment: {
        module, entryPoint: 'fs',
        targets: [{ format: gpu.viewFormat }],
        constants: fragmentConstants(gpu),
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
    });
  }

  /** Upload interleaved [pos, normal] vertex data. Returns { buffer, count }. */
  createGeometry(data, label = 'mesh geometry') {
    const buffer = this.gpu.device.createBuffer({
      label,
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.gpu.device.queue.writeBuffer(buffer, 0, data);
    return { buffer, count: data.length / 6 };
  }

  /** One drawable object: own uniform buffer and bind group, shared geometry. */
  createInstance(geometry, label = 'mesh instance') {
    const { device } = this.gpu;
    const uniform = device.createBuffer({
      label: `${label} uniforms`,
      size: UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniform } }],
    });
    return { geometry, uniform, bindGroup, scratch: new Float32Array(UNIFORM_FLOATS) };
  }

  /**
   * @param {GPURenderPassEncoder} pass
   * @param {object} inst        from createInstance()
   * @param {Float32Array} viewProj  P · V
   * @param {Float32Array} model     M (the object's world matrix)
   * @param {number[]} colour    linear RGB
   * @param {import('./renderer.js').Renderer} renderer  for the vertex counter
   */
  draw(pass, inst, viewProj, model, colour, renderer) {
    const s = inst.scratch;
    s.set(mat4.multiply(viewProj, model), 0);  // mvp = P · V · M
    s.set(normalMatrix(model), 16);
    s[32] = colour[0]; s[33] = colour[1]; s[34] = colour[2]; s[35] = 1;
    this.gpu.device.queue.writeBuffer(inst.uniform, 0, s);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, inst.bindGroup);
    pass.setVertexBuffer(0, inst.geometry.buffer);
    pass.draw(inst.geometry.count);
    renderer.countDraw(inst.geometry.count);
  }
}

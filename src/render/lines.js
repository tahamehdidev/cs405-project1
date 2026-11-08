/**
 * Coloured line rendering (plumbing, not graded maths): axes, frustum, curves.
 *
 *   const lines = new LineRenderer(gpu);
 *   const batch = lines.createBatch('line-list', 6, axes(1));  // static data
 *   const dyn   = lines.createBatch('line-strip', 512);        // changes per frame
 *   lines.setVertices(dyn, floats);                            // [x y z r g b] ...
 *   lines.draw(pass, batch, mvp, renderer);
 *
 * Each batch owns its uniform buffer (see the note in mesh.js about
 * writeBuffer), so draw every batch with its own matrix freely.
 * Vertex layout: [x y z  r g b] (linear RGB), stride 24 bytes.
 * Note: WebGPU lines are always 1 pixel wide.
 */
import linesWGSL from './shaders/lines.wgsl?raw';
import { createShader, fragmentConstants } from './shader.js';
import { DEPTH_FORMAT } from './renderer.js';

const STRIDE = 6 * 4;

export class LineRenderer {
  /** @param {Awaited<ReturnType<import('./gpu.js').initWebGPU>>} gpu */
  constructor(gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const module = createShader(device, linesWGSL, 'lines');
    const make = (topology) => device.createRenderPipeline({
      label: `lines ${topology}`,
      layout: 'auto',
      vertex: {
        module, entryPoint: 'vs',
        buffers: [{
          arrayStride: STRIDE,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },     // position
            { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' }, // colour
          ],
        }],
      },
      fragment: {
        module, entryPoint: 'fs',
        targets: [{ format: gpu.viewFormat }],
        constants: fragmentConstants(gpu),
      },
      primitive: { topology },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.pipelines = { 'line-list': make('line-list'), 'line-strip': make('line-strip') };
  }

  /**
   * @param {'line-list'|'line-strip'} topology
   * @param {number} maxVertices  capacity of the vertex buffer
   * @param {Float32Array} [data] optional initial vertices
   */
  createBatch(topology, maxVertices, data) {
    const { device } = this.gpu;
    const pipeline = this.pipelines[topology];
    const buffer = device.createBuffer({
      label: `lines ${topology} vertices`,
      size: Math.max(1, maxVertices) * STRIDE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const uniform = device.createBuffer({
      label: 'lines uniforms',
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniform } }],
    });
    const batch = { topology, pipeline, buffer, uniform, bindGroup, max: maxVertices, count: 0 };
    if (data) this.setVertices(batch, data);
    return batch;
  }

  /** Replace the batch's vertices (clipped to its capacity). */
  setVertices(batch, data) {
    const count = Math.min(Math.floor(data.length / 6), batch.max);
    if (count > 0) this.gpu.device.queue.writeBuffer(batch.buffer, 0, data, 0, count * 6);
    batch.count = count;
  }

  /**
   * @param {GPURenderPassEncoder} pass
   * @param {object} batch  from createBatch()
   * @param {Float32Array} mvp  matrix applied to the batch's vertices
   * @param {import('./renderer.js').Renderer} renderer  for the vertex counter
   */
  draw(pass, batch, mvp, renderer) {
    if (batch.count < 2) return;
    this.gpu.device.queue.writeBuffer(batch.uniform, 0, mvp);
    pass.setPipeline(batch.pipeline);
    pass.setBindGroup(0, batch.bindGroup);
    pass.setVertexBuffer(0, batch.buffer);
    pass.draw(batch.count);
    renderer.countDraw(batch.count);
  }
}

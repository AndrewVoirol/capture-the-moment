import { GPUContextState } from './gpu-context';

/**
 * TextRenderer: Colored Pencil Inscription of "capture the moment"
 * - Hand-lettered calligraphy rendered in multi-stage colored pencil
 * - Botanical vine flourishes entwined with the letterforms
 * - Fixed 2:1 aspect ratio preservation in WGSL (no stretching on any screen)
 * - Stroke waypoint extraction for aerial leaf calligraphy
 * - Interactive hover burnishing
 */
export class TextRenderer {
  private device: GPUDevice;
  private format: GPUTextureFormat;
  private pipeline!: GPURenderPipeline;
  private bindGroup!: GPUBindGroup;
  private uniformBuffer!: GPUBuffer;

  private textTexture!: GPUTexture;
  private textTextureView!: GPUTextureView;
  private textSampler!: GPUSampler;

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  constructor(gpu: GPUContextState) {
    this.device = gpu.device;
    this.format = gpu.format;

    this.initTextCanvas();
    this.initTextTexture();
    this.initUniforms();
    this.initPipeline();
  }

  private initTextCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 2048;
    this.canvas.height = 1024;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;

    this.renderTextArt();
  }

  /**
   * Generates high-resolution hand-sketched colored pencil lettering of "capture the moment"
   */
  private renderTextArt() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.48;

    ctx.save();

    // 1. Under-sketch: Light 2H graphite pencil guide lines & construction marks
    ctx.strokeStyle = 'rgba(120, 100, 85, 0.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 700, cy + 70);
    ctx.lineTo(cx + 700, cy + 70);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(120, 100, 85, 0.08)';
    ctx.beginPath();
    ctx.moveTo(cx - 600, cy - 65);
    ctx.lineTo(cx + 600, cy - 65);
    ctx.stroke();

    // 2. Botanical flourishes & sketched autumn sprigs entwined with the words
    this.drawBotanicalFlourish(ctx, cx - 520, cy - 10, -0.35);
    this.drawBotanicalFlourish(ctx, cx + 520, cy + 45, 0.32);

    // 3. Main Calligraphic Lettering: Multi-layered colored pencil
    // Layer A: Luminous Golden Saffron Undertone
    ctx.font = 'italic 125px "Pinyon Script", "Caveat", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = 'rgba(212, 172, 13, 0.45)';
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeText('capture the moment', cx - 1.5, cy - 1.5);

    // Layer B: Warm Burnt Sienna & Terracotta Core
    ctx.strokeStyle = 'rgba(160, 64, 0, 0.8)';
    ctx.lineWidth = 3.8;
    ctx.strokeText('capture the moment', cx, cy);

    ctx.fillStyle = 'rgba(115, 45, 12, 0.88)';
    ctx.fillText('capture the moment', cx, cy);

    // Layer C: Dark Umber / Sepia contour & crisp pencil accent lines
    ctx.strokeStyle = 'rgba(55, 32, 20, 0.65)';
    ctx.lineWidth = 1.6;
    ctx.strokeText('capture the moment', cx + 0.5, cy + 0.5);

    // Layer D: Small hand-penciled accent stars & wind swirls
    this.drawWindSwirl(ctx, cx - 440, cy + 75, 75);
    this.drawWindSwirl(ctx, cx + 440, cy - 75, -85);

    ctx.restore();
  }

  private drawBotanicalFlourish(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Stem in sepia colored pencil
    ctx.strokeStyle = 'rgba(100, 60, 35, 0.65)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(40, -25, 80, -10, 120, -35);
    ctx.stroke();

    // Delicate autumn leaf buds along stem
    this.drawMiniLeaf(ctx, 45, -20, -0.6, 'rgba(192, 57, 43, 0.78)');
    this.drawMiniLeaf(ctx, 85, -18, 0.5, 'rgba(214, 137, 16, 0.78)');
    this.drawMiniLeaf(ctx, 120, -35, -0.2, 'rgba(160, 64, 0, 0.82)');

    ctx.restore();
  }

  private drawMiniLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, color: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(12, -14, 24, 0);
    ctx.quadraticCurveTo(12, 14, 0, 0);
    ctx.fill();

    ctx.strokeStyle = 'rgba(50, 25, 10, 0.55)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // Midrib
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(21, 0);
    ctx.stroke();

    ctx.restore();
  }

  private drawWindSwirl(ctx: CanvasRenderingContext2D, x: number, y: number, len: number) {
    ctx.save();
    ctx.strokeStyle = 'rgba(160, 110, 70, 0.32)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + len * 0.4, y - 18, x + len * 0.7, y + 22, x + len, y);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Extracts ordered stroke waypoints along the actual letters of "capture the moment"
   * for leaf constellation formation
   */
  public extractStrokeWaypoints(numPoints: number = 120): Array<[number, number]> {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const imgData = this.ctx.getImageData(0, 0, w, h).data;

    const yMin = Math.floor(h * 0.30);
    const yMax = Math.floor(h * 0.65);
    const xMin = Math.floor(w * 0.12);
    const xMax = Math.floor(w * 0.88);

    const candidates: Array<{ x: number; y: number }> = [];
    for (let y = yMin; y < yMax; y += 3) {
      for (let x = xMin; x < xMax; x += 3) {
        const idx = (y * w + x) * 4;
        const a = imgData[idx + 3];
        if (a > 150) {
          candidates.push({ x, y });
        }
      }
    }

    if (candidates.length === 0) {
      const fallback: Array<[number, number]> = [];
      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        fallback.push([-0.65 + t * 1.3, 0.02 * Math.sin(t * Math.PI * 6)]);
      }
      return fallback;
    }

    // Sort by X (left to right across "capture the moment")
    candidates.sort((a, b) => a.x - b.x);

    const step = candidates.length / numPoints;
    const waypoints: Array<[number, number]> = [];

    for (let i = 0; i < numPoints; i++) {
      const start = Math.floor(i * step);
      const end = Math.floor((i + 1) * step);
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (let j = start; j < end; j++) {
        sumX += candidates[j].x;
        sumY += candidates[j].y;
        count++;
      }
      const avgX = sumX / count;
      const avgY = sumY / count;

      // NDC coordinates: [-1, 1], centered at (0, 0)
      const ndcX = (avgX / w) * 2.0 - 1.0;
      const ndcY = -((avgY / h) * 2.0 - 1.0);

      waypoints.push([ndcX, ndcY]);
    }

    return waypoints;
  }

  private initTextTexture() {
    this.textTexture = this.device.createTexture({
      size: [2048, 1024, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      label: 'text-inscription-texture'
    });
    this.textTextureView = this.textTexture.createView();

    this.textSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });

    const imgData = this.ctx.getImageData(0, 0, 2048, 1024);
    this.device.queue.writeTexture(
      { texture: this.textTexture },
      imgData.data,
      { bytesPerRow: 2048 * 4, rowsPerImage: 1024 },
      [2048, 1024, 1]
    );
  }

  private initUniforms() {
    this.uniformBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'text-uniforms'
    });
  }

  private initPipeline() {
    const shaderModule = this.device.createShaderModule({
      label: 'text-shader',
      code: `
        struct Uniforms {
          resolution: vec2<f32>,
          mousePos: vec2<f32>,
          hoverDist: f32,
          time: f32,
          padding: vec2<f32>,
        }

        @group(0) @binding(0) var<uniform> uniforms: Uniforms;
        @group(0) @binding(1) var textTex: texture_2d<f32>;
        @group(0) @binding(2) var textSamp: sampler;

        struct VertexOutput {
          @builtin(position) position: vec4<f32>,
          @location(0) uv: vec2<f32>,
        }

        @vertex
        fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
          var out: VertexOutput;
          let x = f32(i32(vertexIndex & 1u) * 4 - 1);
          let y = f32(i32(vertexIndex & 2u) * 2 - 1);
          out.position = vec4<f32>(x, y, 0.0, 1.0);
          out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
          return out;
        }

        fn hash21(p: vec2<f32>) -> f32 {
          var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        @fragment
        fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
          // Aspect Ratio Preservation (Texture is 2048x1024, 2.0 aspect)
          let windowAspect = uniforms.resolution.x / uniforms.resolution.y;
          let targetAspect = 2.0;

          var uv = in.uv;
          if (windowAspect > targetAspect) {
            let scale = targetAspect / windowAspect;
            uv.x = (in.uv.x - 0.5) / scale + 0.5;
          } else {
            let scale = windowAspect / targetAspect;
            uv.y = (in.uv.y - 0.5) / scale + 0.5;
          }

          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            discard;
          }

          let textSample = textureSample(textTex, textSamp, uv);
          if (textSample.a < 0.005) {
            discard;
          }

          // Paper tooth modulation
          let pixelPos = in.uv * uniforms.resolution;
          let toothNoise = hash21(floor(pixelPos * 0.45));
          let toothMultiplier = mix(0.72, 1.18, toothNoise);

          // Interactive hover burnishing
          let normMouse = (uniforms.mousePos + 1.0) * 0.5;
          let dMouse = length((in.uv - normMouse) * vec2<f32>(windowAspect, 1.0));
          let hoverShimmer = smoothstep(0.28, 0.02, dMouse);

          var col = textSample.rgb;
          let goldShimmer = vec3<f32>(0.92, 0.72, 0.22);
          col = mix(col, goldShimmer, hoverShimmer * 0.45);

          let finalAlpha = clamp(textSample.a * toothMultiplier, 0.0, 1.0);
          return vec4<f32>(col, finalAlpha);
        }
      `
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'text-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' }
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' }
        }
      ]
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'text-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout]
    });

    this.pipeline = this.device.createRenderPipeline({
      label: 'text-render-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add'
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add'
              }
            }
          }
        ]
      },
      primitive: {
        topology: 'triangle-list'
      }
    });

    this.bindGroup = this.device.createBindGroup({
      label: 'text-bg',
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer }
        },
        {
          binding: 1,
          resource: this.textTextureView
        },
        {
          binding: 2,
          resource: this.textSampler
        }
      ]
    });
  }

  public updateUniforms(width: number, height: number, mouseX: number, mouseY: number, time: number) {
    const data = new Float32Array([
      width, height,
      mouseX, mouseY,
      0.0, time,
      0, 0
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  public render(pass: GPURenderPassEncoder) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3, 1, 0, 0);
  }
}

import { GPUContextState } from './gpu-context';

/**
 * TextRenderer: Colored Pencil Inscription of "capture the moment"
 * - Renders hand-lettered calligraphy with botanical flourishes
 * - Colored pencil tooth and graphite line simulation in WGSL
 * - Interactive hover burnishing / luminescence
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
    this.ctx = this.canvas.getContext('2d')!;

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

    // Center coordinates
    const cx = w * 0.5;
    const cy = h * 0.48;

    ctx.save();

    // 1. Under-sketch: Light 2H graphite pencil guide lines & construction marks
    ctx.strokeStyle = 'rgba(120, 100, 85, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 650, cy + 85);
    ctx.lineTo(cx + 650, cy + 85);
    ctx.stroke();

    // 2. Botanical flourishes & sketched autumn sprigs entwined with the words
    this.drawBotanicalFlourish(ctx, cx - 480, cy - 20, -0.4);
    this.drawBotanicalFlourish(ctx, cx + 480, cy + 50, 0.35);

    // 3. Main Calligraphic Lettering: Multi-layered colored pencil
    // Layer A: Golden Amber Undertone (#d4ac0d / #b7950b)
    ctx.font = 'italic 130px "Pinyon Script", "Caveat", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = 'rgba(212, 172, 13, 0.4)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeText('capture the moment', cx - 1.5, cy - 1.5);

    // Layer B: Burnt Sienna & Terracotta Core (#a04000 / #784212)
    ctx.strokeStyle = 'rgba(160, 64, 0, 0.75)';
    ctx.lineWidth = 4;
    ctx.strokeText('capture the moment', cx, cy);

    ctx.fillStyle = 'rgba(120, 50, 10, 0.85)';
    ctx.fillText('capture the moment', cx, cy);

    // Layer C: Dark Umber / Sepia contour & crisp pencil accent lines
    ctx.strokeStyle = 'rgba(50, 30, 20, 0.6)';
    ctx.lineWidth = 1.8;
    ctx.strokeText('capture the moment', cx + 0.5, cy + 0.5);

    // Layer D: Small hand-penciled accent stars & wind swirls
    this.drawWindSwirl(ctx, cx - 420, cy + 90, 80);
    this.drawWindSwirl(ctx, cx + 420, cy - 80, -90);

    ctx.restore();
  }

  private drawBotanicalFlourish(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Stem in sepia colored pencil
    ctx.strokeStyle = 'rgba(100, 60, 35, 0.65)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(40, -25, 80, -10, 120, -35);
    ctx.stroke();

    // Delicate little maple/oak leaf buds along stem
    this.drawMiniLeaf(ctx, 45, -20, -0.6, 'rgba(192, 57, 43, 0.75)');
    this.drawMiniLeaf(ctx, 85, -18, 0.5, 'rgba(214, 137, 16, 0.75)');
    this.drawMiniLeaf(ctx, 120, -35, -0.2, 'rgba(160, 64, 0, 0.8)');

    ctx.restore();
  }

  private drawMiniLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, color: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(12, -15, 25, 0);
    ctx.quadraticCurveTo(12, 15, 0, 0);
    ctx.fill();

    ctx.strokeStyle = 'rgba(50, 25, 10, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Midrib
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(22, 0);
    ctx.stroke();

    ctx.restore();
  }

  private drawWindSwirl(ctx: CanvasRenderingContext2D, x: number, y: number, len: number) {
    ctx.save();
    ctx.strokeStyle = 'rgba(160, 110, 70, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + len * 0.4, y - 20, x + len * 0.7, y + 25, x + len, y);
    ctx.stroke();
    ctx.restore();
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
    // Uniforms:
    // resolution: vec2<f32>, mousePos: vec2<f32>, hoverDist: f32, time: f32, padding: vec2<f32>
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

        // Pseudo-random noise for tooth catch
        fn hash21(p: vec2<f32>) -> f32 {
          var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        @fragment
        fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
          let uv = in.uv;
          let textSample = textureSample(textTex, textSamp, uv);

          if (textSample.a < 0.005) {
            discard;
          }

          // Paper tooth modulation
          let pixelPos = uv * uniforms.resolution;
          let toothNoise = hash21(floor(pixelPos * 0.45));
          let toothMultiplier = mix(0.72, 1.18, toothNoise);

          // Interactive hover burnishing:
          // If mouse is near the inscription, add warm golden colored pencil shimmer
          let aspect = uniforms.resolution.x / uniforms.resolution.y;
          let normMouse = (uniforms.mousePos + 1.0) * 0.5;
          let dMouse = length((uv - normMouse) * vec2<f32>(aspect, 1.0));
          let hoverShimmer = smoothstep(0.28, 0.02, dMouse);

          var col = textSample.rgb;
          // Burnish with warm amber/gold when hovered
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

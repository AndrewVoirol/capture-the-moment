import { GPUContextState } from './gpu-context';

export class PaperSubstrate {
  private device: GPUDevice;
  private format: GPUTextureFormat;
  private pipeline!: GPURenderPipeline;
  private bindGroup!: GPUBindGroup;
  private uniformBuffer!: GPUBuffer;

  // Pencil canvas texture (for user drawing marks)
  private pencilTexture!: GPUTexture;
  private pencilTextureView!: GPUTextureView;
  private pencilSampler!: GPUSampler;

  // CPU canvas for capturing smooth pencil strokes and uploading
  private pencilCanvas!: HTMLCanvasElement;
  private pencilCtx!: CanvasRenderingContext2D;
  private pencilDirty: boolean = false;

  constructor(gpu: GPUContextState) {
    this.device = gpu.device;
    this.format = gpu.format;

    this.initPencilCanvas();
    this.initPencilTexture();
    this.initUniforms();
    this.initPipeline();
  }

  private initPencilCanvas() {
    this.pencilCanvas = document.createElement('canvas');
    this.pencilCanvas.width = 1024;
    this.pencilCanvas.height = 1024;
    this.pencilCtx = this.pencilCanvas.getContext('2d')!;
    // Clear to transparent
    this.pencilCtx.clearRect(0, 0, 1024, 1024);
  }

  private initPencilTexture() {
    this.pencilTexture = this.device.createTexture({
      size: [1024, 1024, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      label: 'pencil-drawing-texture'
    });
    this.pencilTextureView = this.pencilTexture.createView();

    this.pencilSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });

    this.uploadPencilTexture();
  }

  private uploadPencilTexture() {
    const imgData = this.pencilCtx.getImageData(0, 0, 1024, 1024);
    this.device.queue.writeTexture(
      { texture: this.pencilTexture },
      imgData.data,
      { bytesPerRow: 1024 * 4, rowsPerImage: 1024 },
      [1024, 1024, 1]
    );
    this.pencilDirty = false;
  }

  private initUniforms() {
    // Uniforms: resolution: vec2<f32>, time: f32, paperWarmth: f32 (16 bytes aligned)
    this.uniformBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'paper-uniforms'
    });
  }

  private initPipeline() {
    const shaderModule = this.device.createShaderModule({
      label: 'paper-substrate-shader',
      code: `
        struct Uniforms {
          resolution: vec2<f32>,
          time: f32,
          paperWarmth: f32,
          padding: vec4<f32>,
        }

        @group(0) @binding(0) var<uniform> uniforms: Uniforms;
        @group(0) @binding(1) var pencilTex: texture_2d<f32>;
        @group(0) @binding(2) var pencilSamp: sampler;

        struct VertexOutput {
          @builtin(position) position: vec4<f32>,
          @location(0) uv: vec2<f32>,
        }

        @vertex
        fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
          var out: VertexOutput;
          // Full-screen triangle covering [-1, 1]
          let x = f32(i32(vertexIndex & 1u) * 4 - 1);
          let y = f32(i32(vertexIndex & 2u) * 2 - 1);
          out.position = vec4<f32>(x, y, 0.0, 1.0);
          out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
          return out;
        }

        // Procedural Hash & Simplex Noise for cold-press paper fibers
        fn hash21(p: vec2<f32>) -> f32 {
          var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        fn hash22(p: vec2<f32>) -> vec2<f32> {
          let n = sin(dot(p, vec2<f32>(41.0, 289.0)));
          return fract(vec2<f32>(262144.0, 32768.0) * n);
        }

        fn noise(p: vec2<f32>) -> f32 {
          let i = floor(p);
          let f = fract(p);
          let u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i + vec2<f32>(0.0, 0.0)), hash21(i + vec2<f32>(1.0, 0.0)), u.x),
            mix(hash21(i + vec2<f32>(0.0, 1.0)), hash21(i + vec2<f32>(1.0, 1.0)), u.x),
            u.y
          );
        }

        fn fbm(p: vec2<f32>) -> f32 {
          var v = 0.0;
          var a = 0.5;
          var shift = vec2<f32>(100.0);
          let rot = mat2x2<f32>(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
          var q = p;
          for (var i = 0; i < 4; i++) {
            v += a * noise(q);
            q = rot * q * 2.0 + shift;
            a *= 0.5;
          }
          return v;
        }

        // Cold-press paper tooth & cellulose fiber distribution
        fn paperTooth(uv: vec2<f32>, res: vec2<f32>) -> vec4<f32> {
          let pixelCoord = uv * res;
          // High-frequency tooth
          let toothCoord = pixelCoord * 0.45;
          let n1 = noise(toothCoord);
          let n2 = noise(toothCoord * 2.1 + vec2<f32>(13.7, 7.3));
          let microTooth = (n1 * 0.65 + n2 * 0.35);

          // Sinuous cellulose fibers
          let fiberCoord = pixelCoord * 0.08;
          let fiberNoise = fbm(fiberCoord + vec2<f32>(noise(fiberCoord * 1.5) * 1.8, 0.0));
          let fiberStrands = smoothstep(0.72, 0.88, noise(pixelCoord * vec2<f32>(0.6, 0.15)));

          let toothHeight = clamp(microTooth * 0.75 + fiberNoise * 0.25 - fiberStrands * 0.08, 0.0, 1.0);
          return vec4<f32>(toothHeight, fiberNoise, fiberStrands, microTooth);
        }

        @fragment
        fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
          let uv = in.uv;
          let tooth = paperTooth(uv, uniforms.resolution);

          // Warm archival cold-press paper base color (#f9f5ec to #f4ede0)
          let paperBase = vec3<f32>(0.976, 0.957, 0.925);
          let paperWarm = vec3<f32>(0.952, 0.925, 0.878);
          let paperShadow = vec3<f32>(0.910, 0.875, 0.820);

          // Modulate base tone with organic fiber density
          var col = mix(paperBase, paperWarm, tooth.y * 0.35);
          // Micro-tooth grazing light variation
          col = mix(col, paperShadow, (1.0 - tooth.x) * 0.06);

          // Subtle organic cellulose fiber specks (genuine unbleached cotton pulp)
          let speck = hash21(floor(in.uv * uniforms.resolution * 0.5));
          if (speck > 0.9985) {
            col *= 0.91; // tiny dark speck
          } else if (speck > 0.997) {
            col = mix(col, vec3<f32>(0.82, 0.75, 0.65), 0.25);
          }

          // Gentle vignette towards borders (like sketchbook lighting)
          let distFromCenter = length(uv - vec2<f32>(0.5));
          let vignette = smoothstep(0.9, 0.35, distFromCenter);
          col *= mix(0.93, 1.0, vignette);

          // Composite user pencil marks if any
          let userPencil = textureSample(pencilTex, pencilSamp, uv);
          if (userPencil.a > 0.001) {
            // Pencil catches on tooth peaks, skips in valleys
            let toothCatch = mix(0.55, 1.15, tooth.x);
            let pencilAlpha = clamp(userPencil.a * toothCatch, 0.0, 1.0);
            col = mix(col, userPencil.rgb, pencilAlpha);
          }

          return vec4<f32>(col, 1.0);
        }
      `
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'paper-bgl',
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
      label: 'paper-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout]
    });

    this.pipeline = this.device.createRenderPipeline({
      label: 'paper-render-pipeline',
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
            format: this.format
          }
        ]
      },
      primitive: {
        topology: 'triangle-list'
      }
    });

    this.bindGroup = this.device.createBindGroup({
      label: 'paper-bg',
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer }
        },
        {
          binding: 1,
          resource: this.pencilTextureView
        },
        {
          binding: 2,
          resource: this.pencilSampler
        }
      ]
    });
  }

  public updateUniforms(width: number, height: number, time: number) {
    const data = new Float32Array([
      width, height,
      time, 1.0,
      0, 0, 0, 0 // padding
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);

    if (this.pencilDirty) {
      this.uploadPencilTexture();
    }
  }

  /**
   * Draw an interactive colored pencil stroke onto the paper substrate
   */
  public drawPencilStroke(x0: number, y0: number, x1: number, y1: number, color: string, radius: number = 3.5) {
    this.pencilCtx.save();
    this.pencilCtx.strokeStyle = color;
    this.pencilCtx.lineWidth = radius * 2;
    this.pencilCtx.lineCap = 'round';
    this.pencilCtx.lineJoin = 'round';
    this.pencilCtx.globalAlpha = 0.55; // Layered translucent wax pencil

    this.pencilCtx.beginPath();
    this.pencilCtx.moveTo(x0 * 1024, y0 * 1024);
    this.pencilCtx.lineTo(x1 * 1024, y1 * 1024);
    this.pencilCtx.stroke();

    // Secondary parallel hatch mark for authentic pencil feel
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len > 0.005) {
      const nx = -dy / len * (radius * 0.4);
      const ny = dx / len * (radius * 0.4);
      this.pencilCtx.lineWidth = radius * 0.7;
      this.pencilCtx.globalAlpha = 0.35;
      this.pencilCtx.beginPath();
      this.pencilCtx.moveTo((x0 + nx / 1024) * 1024, (y0 + ny / 1024) * 1024);
      this.pencilCtx.lineTo((x1 + nx / 1024) * 1024, (y1 + ny / 1024) * 1024);
      this.pencilCtx.stroke();
    }

    this.pencilCtx.restore();
    this.pencilDirty = true;
  }

  public clearPencilStrokes() {
    this.pencilCtx.clearRect(0, 0, 1024, 1024);
    this.pencilDirty = true;
  }

  public render(pass: GPURenderPassEncoder) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3, 1, 0, 0);
  }
}

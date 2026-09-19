import { GPUContextState } from './gpu-context';
import { LeafGeometryGenerator } from './leaf-geometry';
import { PackResult } from './simulation';

export class LeafRenderer {
  private device: GPUDevice;
  private format: GPUTextureFormat;

  // Geometry buffers
  private vertexBuffer!: GPUBuffer;
  private indexBuffer!: GPUBuffer;
  private speciesOffsets: Array<{ indexOffset: number; indexCount: number }> = [];

  // Instancing buffers
  private instanceBuffer!: GPUBuffer;
  public instanceData!: Float32Array;
  public maxInstances: number = 400;

  // Render pipelines
  private leafPipeline!: GPURenderPipeline;
  private shadowPipeline!: GPURenderPipeline;

  private uniformBuffer!: GPUBuffer;
  private bindGroup!: GPUBindGroup;

  constructor(gpu: GPUContextState) {
    this.device = gpu.device;
    this.format = gpu.format;

    this.initGeometry();
    this.initInstanceBuffer();
    this.initUniforms();
    this.initPipelines();
  }

  private initGeometry() {
    const { combinedVertices, combinedIndices, speciesOffsets } = LeafGeometryGenerator.buildAllMeshes();
    this.speciesOffsets = speciesOffsets;

    this.vertexBuffer = this.device.createBuffer({
      size: combinedVertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label: 'leaf-vertices'
    });
    this.device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      combinedVertices.buffer as ArrayBuffer,
      combinedVertices.byteOffset,
      combinedVertices.byteLength
    );

    this.indexBuffer = this.device.createBuffer({
      size: combinedIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      label: 'leaf-indices'
    });
    this.device.queue.writeBuffer(
      this.indexBuffer,
      0,
      combinedIndices.buffer as ArrayBuffer,
      combinedIndices.byteOffset,
      combinedIndices.byteLength
    );
  }

  private initInstanceBuffer() {
    // 16 floats (64 bytes) per instance
    this.instanceData = new Float32Array(this.maxInstances * 16);

    this.instanceBuffer = this.device.createBuffer({
      size: this.instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label: 'leaf-instances'
    });
  }

  private initUniforms() {
    this.uniformBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'leaf-uniforms'
    });
  }

  private initPipelines() {
    const leafShader = this.device.createShaderModule({
      label: 'leaf-colored-pencil-shader',
      code: `
        struct Uniforms {
          resolution: vec2<f32>,
          time: f32,
          aspect: f32,
          lightDir: vec4<f32>,
        }

        @group(0) @binding(0) var<uniform> uniforms: Uniforms;

        struct VertexInput {
          // Mesh attributes (Buffer 0)
          @location(0) pos: vec3<f32>,
          @location(1) norm: vec3<f32>,
          @location(2) uv: vec2<f32>,
          @location(3) feature: vec4<f32>, // [edgeDist, veinDist, veinAngle, speciesId]

          // Instance attributes (Buffer 1, stepMode: instance)
          @location(4) instPos: vec4<f32>,   // x, y, z, scale
          @location(5) instRot: vec4<f32>,   // pitch, yaw, roll, species
          @location(6) colorData: vec4<f32>, // paletteId, colorVar, groundRest, status
          @location(7) hatchData: vec4<f32>, // hatchAngle, shadowDist, flutterPhase, time
        }

        struct VertexOutput {
          @builtin(position) clipPos: vec4<f32>,
          @location(0) worldPos: vec3<f32>,
          @location(1) normal: vec3<f32>,
          @location(2) uv: vec2<f32>,
          @location(3) feature: vec4<f32>,
          @location(4) colorData: vec4<f32>,
          @location(5) hatchData: vec4<f32>,
        }

        // 3D Euler rotation matrix
        fn eulerRotation(pitch: f32, yaw: f32, roll: f32) -> mat3x3<f32> {
          let cp = cos(pitch);
          let sp = sin(pitch);
          let cy = cos(yaw);
          let sy = sin(yaw);
          let cr = cos(roll);
          let sr = sin(roll);

          return mat3x3<f32>(
            vec3<f32>(cy * cr, cy * sr, -sy),
            vec3<f32>(sp * sy * cr - cp * sr, sp * sy * sr + cp * cr, sp * cy),
            vec3<f32>(cp * sy * cr + sp * sr, cp * sy * sr - sp * cr, cp * cy)
          );
        }

        @vertex
        fn vs_leaf(in: VertexInput) -> VertexOutput {
          var out: VertexOutput;

          let rotMat = eulerRotation(in.instRot.x, in.instRot.y, in.instRot.z);
          let scale = in.instPos.w;

          let rotPos = rotMat * in.pos;
          let worldPos = vec3<f32>(
            in.instPos.x + rotPos.x * scale,
            in.instPos.y + rotPos.y * scale,
            in.instPos.z + rotPos.z * scale
          );

          let worldNorm = normalize(rotMat * in.norm);

          let invAspect = 1.0 / uniforms.aspect;
          out.clipPos = vec4<f32>(worldPos.x * invAspect, worldPos.y, worldPos.z * 0.5 + 0.5, 1.0);
          out.worldPos = worldPos;
          out.normal = worldNorm;
          out.uv = in.uv;
          out.feature = in.feature;
          out.colorData = in.colorData;
          out.hatchData = in.hatchData;

          return out;
        }

        fn hash21(p: vec2<f32>) -> f32 {
          var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        struct PaletteColors {
          under: vec3<f32>,
          mid: vec3<f32>,
          shadow: vec3<f32>,
          vein: vec3<f32>,
          backSide: vec3<f32>,
        }

        // Color palettes (3-stage colored pencil wax layering + botanical underside)
        fn getPaletteColors(paletteId: f32, seed: f32) -> PaletteColors {
          var res: PaletteColors;
          let pal = i32(paletteId + 0.5);

          if (pal == 1) {
            // Autumn Gold: Saffron Amber, Warm Ochre, Raw Umber, Sepia
            res.under = mix(vec3<f32>(0.94, 0.78, 0.28), vec3<f32>(0.96, 0.82, 0.32), seed);
            res.mid = mix(vec3<f32>(0.86, 0.58, 0.14), vec3<f32>(0.78, 0.50, 0.10), seed);
            res.shadow = vec3<f32>(0.58, 0.36, 0.08);
            res.vein = vec3<f32>(0.36, 0.22, 0.05);
            res.backSide = vec3<f32>(0.84, 0.75, 0.48); // Warm buff underside
          } else if (pal == 2) {
            // Deep Woodland: Ochre, Terracotta, Burnt Sienna, Sepia
            res.under = mix(vec3<f32>(0.88, 0.68, 0.35), vec3<f32>(0.82, 0.55, 0.28), seed);
            res.mid = mix(vec3<f32>(0.68, 0.35, 0.15), vec3<f32>(0.58, 0.28, 0.12), seed);
            res.shadow = vec3<f32>(0.45, 0.22, 0.10);
            res.vein = vec3<f32>(0.28, 0.15, 0.08);
            res.backSide = vec3<f32>(0.82, 0.75, 0.62); // Pale buff underside
          } else if (pal == 3) {
            // Twilight Frost: Rose Ochre, Plum, Wine Violet, Dark Indigo
            res.under = mix(vec3<f32>(0.85, 0.60, 0.62), vec3<f32>(0.78, 0.52, 0.58), seed);
            res.mid = mix(vec3<f32>(0.58, 0.25, 0.38), vec3<f32>(0.48, 0.18, 0.32), seed);
            res.shadow = vec3<f32>(0.35, 0.12, 0.25);
            res.vein = vec3<f32>(0.22, 0.08, 0.18);
            res.backSide = vec3<f32>(0.78, 0.70, 0.72); // Dusty mauve underside
          } else {
            // October Maple: Cadmium Yellow undertone, Vermilion midtone, Crimson shadow, Dark Sepia vein
            res.under = mix(vec3<f32>(0.96, 0.76, 0.18), vec3<f32>(0.95, 0.58, 0.12), seed);
            res.mid = mix(vec3<f32>(0.85, 0.25, 0.12), vec3<f32>(0.78, 0.18, 0.10), seed);
            res.shadow = vec3<f32>(0.55, 0.10, 0.08);
            res.vein = vec3<f32>(0.32, 0.12, 0.08);
            res.backSide = vec3<f32>(0.88, 0.75, 0.58); // Pale apricot underside
          }
          return res;
        }

        @fragment
        fn fs_leaf(
          in: VertexOutput,
          @builtin(front_facing) isFront: bool
        ) -> @location(0) vec4<f32> {
          let screenCoord = in.clipPos.xy;
          let palette = getPaletteColors(in.colorData.x, in.colorData.y);

          // 1. Authentically Oriented Colored Pencil Hatching
          // Calculated in object/UV space so strokes roll & tumble WITH the 3D leaf blade
          let hatchAngle = in.hatchData.x;
          let cosA = cos(hatchAngle);
          let sinA = sin(hatchAngle);
          let objHatchCoord = (in.uv.x * cosA + in.uv.y * sinA) * 42.0;

          // Modulate hatching with primary vein direction (botanical hatching follows leaf structure)
          let veinFlow = sin(in.feature.z * 1.5 + in.uv.y * 25.0) * 0.15;
          let h1 = sin(objHatchCoord);
          let h2 = sin(objHatchCoord * 1.65 + 1.2);
          let hatchPattern = clamp((h1 * 0.26 + h2 * 0.16 + veinFlow) + 0.84, 0.45, 1.0);

          // 2. Micro-Tooth Stochastic Skipping on Paper
          // Screen-space texture representing physical cold-press paper grain catching wax pigment
          let toothNoise = hash21(floor(screenCoord * 0.35));
          let toothSkip = mix(0.85, 1.15, toothNoise);

          // 3. Diffuse Shading with Grazing Light
          let light = normalize(vec3<f32>(0.35, 0.75, 0.55));
          var effectiveNormal = in.normal;
          if (!isFront) {
            effectiveNormal = -in.normal;
          }
          let NdotL = clamp(dot(effectiveNormal, light) * 0.5 + 0.5, 0.25, 1.0);

          // 4. Botanical 2-Sided Color Modeling
          var leafColor: vec3<f32>;
          if (isFront) {
            // Front-side: Rich layered wax pencil (undertone -> midtone -> shadow)
            leafColor = mix(palette.under, palette.mid, smoothstep(0.15, 0.85, 1.0 - in.feature.x));
            leafColor = mix(leafColor, palette.shadow, (1.0 - NdotL) * 0.55);
          } else {
            // Underside: Characteristic botanical pale, matte, chalky tone
            leafColor = mix(palette.backSide, palette.under, 0.35);
            leafColor = mix(leafColor, palette.shadow * 1.2, (1.0 - NdotL) * 0.4);
          }

          // Modulate with colored pencil hatching & paper tooth skipping
          leafColor *= hatchPattern * toothSkip;

          // 5. Botanical Vein Network (Penciled rib lines)
          let veinIntensity = smoothstep(0.055, 0.0, in.feature.y);
          let veinTone = select(palette.vein * 0.9, palette.vein, isFront);
          leafColor = mix(leafColor, veinTone, veinIntensity * 0.7);

          // 6. Crisp Hand-Sketched Colored Pencil Contour Line
          let edgeDist = in.feature.x;
          let edgeOutline = smoothstep(0.065, 0.0, edgeDist);
          leafColor = mix(leafColor, palette.vein * 0.75, edgeOutline * 0.8);

          return vec4<f32>(leafColor, 1.0);
        }
      `
    });

    const shadowShader = this.device.createShaderModule({
      label: 'leaf-shadow-shader',
      code: `
        struct Uniforms {
          resolution: vec2<f32>,
          time: f32,
          aspect: f32,
          lightDir: vec4<f32>,
        }

        @group(0) @binding(0) var<uniform> uniforms: Uniforms;

        struct VertexInput {
          @location(0) pos: vec3<f32>,
          @location(1) norm: vec3<f32>,
          @location(2) uv: vec2<f32>,
          @location(3) feature: vec4<f32>,
          @location(4) instPos: vec4<f32>,
          @location(5) instRot: vec4<f32>,
          @location(6) colorData: vec4<f32>,
          @location(7) hatchData: vec4<f32>,
        }

        struct ShadowVertexOutput {
          @builtin(position) clipPos: vec4<f32>,
          @location(0) shadowParams: vec3<f32>, // [shadowDist, edgeDist, restFactor]
        }

        fn eulerRotation(pitch: f32, yaw: f32, roll: f32) -> mat3x3<f32> {
          let cp = cos(pitch);
          let sp = sin(pitch);
          let cy = cos(yaw);
          let sy = sin(yaw);
          let cr = cos(roll);
          let sr = sin(roll);

          return mat3x3<f32>(
            vec3<f32>(cy * cr, cy * sr, -sy),
            vec3<f32>(sp * sy * cr - cp * sr, sp * sy * sr + cp * cr, sp * cy),
            vec3<f32>(cp * sy * cr + sp * sr, cp * sy * sr - sp * cr, cp * cy)
          );
        }

        @vertex
        fn vs_shadow(in: VertexInput) -> ShadowVertexOutput {
          var out: ShadowVertexOutput;

          let rotMat = eulerRotation(in.instRot.x, in.instRot.y, in.instRot.z);
          let scale = in.instPos.w;
          let shadowDist = in.hatchData.y; // altitude above ground
          let restFactor = in.colorData.z; // 1.0 = resting on paper

          // Soft graphite pencil offset on paper
          let shadowOffset = vec2<f32>(0.02, -0.028) * (1.0 + clamp(shadowDist * 1.5, 0.0, 1.2));

          let rotPos = rotMat * in.pos;
          let worldX = in.instPos.x + rotPos.x * scale + shadowOffset.x;
          let worldY = in.instPos.y + rotPos.y * scale + shadowOffset.y;

          let invAspect = 1.0 / uniforms.aspect;
          out.clipPos = vec4<f32>(worldX * invAspect, worldY, 0.1, 1.0);
          out.shadowParams = vec3<f32>(shadowDist, in.feature.x, restFactor);

          return out;
        }

        @fragment
        fn fs_shadow(in: ShadowVertexOutput) -> @location(0) vec4<f32> {
          let shadowDist = in.shadowParams.x;
          let edgeDist   = in.shadowParams.y;
          let restFactor = in.shadowParams.z;

          // Exponential altitude falloff: Airborne leaves high in the sky do NOT cast ghost shadows
          let heightFade = exp(-shadowDist * 5.5);
          if (heightFade < 0.01) {
            discard;
          }

          // Edge softness expands with distance
          let softness = 0.04 + shadowDist * 0.22;
          let alpha = smoothstep(0.0, softness, edgeDist);

          // Authentic soft graphite / warm umber pencil shadow tone
          let shadowColor = vec3<f32>(0.28, 0.22, 0.16);
          let maxOpacity = mix(0.20, 0.58, restFactor) * heightFade;

          return vec4<f32>(shadowColor, alpha * maxOpacity);
        }
      `
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'leaf-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' }
        }
      ]
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'leaf-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout]
    });

    const geometryBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 12 * 4,
      stepMode: 'vertex',
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },  // pos
        { shaderLocation: 1, offset: 12, format: 'float32x3' }, // norm
        { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv
        { shaderLocation: 3, offset: 32, format: 'float32x4' }  // feature
      ]
    };

    const instanceBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 16 * 4,
      stepMode: 'instance',
      attributes: [
        { shaderLocation: 4, offset: 0, format: 'float32x4' },  // instPos (x, y, z, scale)
        { shaderLocation: 5, offset: 16, format: 'float32x4' }, // instRot (pitch, yaw, roll, species)
        { shaderLocation: 6, offset: 32, format: 'float32x4' }, // colorData (palette, var, rest, status)
        { shaderLocation: 7, offset: 48, format: 'float32x4' }  // hatchData (hatchAngle, shadowDist, flutter, time)
      ]
    };

    // Shadow Pipeline
    this.shadowPipeline = this.device.createRenderPipeline({
      label: 'leaf-shadow-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shadowShader,
        entryPoint: 'vs_shadow',
        buffers: [geometryBufferLayout, instanceBufferLayout]
      },
      fragment: {
        module: shadowShader,
        entryPoint: 'fs_shadow',
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
        topology: 'triangle-list',
        cullMode: 'none'
      }
    });

    // Leaf Render Pipeline
    this.leafPipeline = this.device.createRenderPipeline({
      label: 'leaf-colored-pencil-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: leafShader,
        entryPoint: 'vs_leaf',
        buffers: [geometryBufferLayout, instanceBufferLayout]
      },
      fragment: {
        module: leafShader,
        entryPoint: 'fs_leaf',
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
        topology: 'triangle-list',
        cullMode: 'none'
      }
    });

    this.bindGroup = this.device.createBindGroup({
      label: 'leaf-bg',
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer }
        }
      ]
    });
  }

  public updateUniforms(width: number, height: number, time: number) {
    const aspect = width / height;
    const data = new Float32Array([
      width, height,
      time, aspect,
      0.35, 0.75, 0.55, 0
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  public updateInstances(instanceData: Float32Array, activeCount: number) {
    if (activeCount > 0) {
      this.device.queue.writeBuffer(
        this.instanceBuffer,
        0,
        instanceData.buffer as ArrayBuffer,
        instanceData.byteOffset,
        activeCount * 16 * 4
      );
    }
  }

  public render(pass: GPURenderPassEncoder, pack: PackResult) {
    if (pack.totalCount === 0) return;

    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint16');

    // 1. Draw Cast Shadows
    pass.setPipeline(this.shadowPipeline);
    for (let s = 0; s < this.speciesOffsets.length; s++) {
      const count = pack.speciesCounts[s];
      if (count > 0) {
        const offset = this.speciesOffsets[s];
        pass.drawIndexed(
          offset.indexCount,
          count,
          offset.indexOffset,
          0,
          pack.speciesOffsets[s]
        );
      }
    }

    // 2. Draw Colored Pencil Leaf Bodies
    pass.setPipeline(this.leafPipeline);
    for (let s = 0; s < this.speciesOffsets.length; s++) {
      const count = pack.speciesCounts[s];
      if (count > 0) {
        const offset = this.speciesOffsets[s];
        pass.drawIndexed(
          offset.indexCount,
          count,
          offset.indexOffset,
          0,
          pack.speciesOffsets[s]
        );
      }
    }
  }
}

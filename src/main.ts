import { GPUContext, GPUContextState } from './webgpu/gpu-context';
import { PaperSubstrate } from './webgpu/paper-substrate';
import { LeafSimulation } from './webgpu/simulation';
import { LeafRenderer } from './webgpu/leaf-renderer';
import { TextRenderer } from './webgpu/text-renderer';
import { SketchAudio } from './audio/sketch-audio';
import { UIController } from './ui/controls';

class AutumnSketchbookApp {
  private canvas!: HTMLCanvasElement;
  private gpu!: GPUContextState;
  private paper!: PaperSubstrate;
  private sim!: LeafSimulation;
  private leafRenderer!: LeafRenderer;
  private textRenderer!: TextRenderer;
  private audio!: SketchAudio;
  private ui!: UIController;

  // Frame timing
  private lastTime: number = 0;
  private frameCount: number = 0;
  private fpsTimer: number = 0;
  private currentFps: number = 60;

  // Mouse / Pointer tracking
  private isPointerDown: boolean = false;
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;

  public async start() {
    this.canvas = document.getElementById('webgpu-canvas') as HTMLCanvasElement;
    if (!this.canvas) {
      console.error('Canvas element not found');
      return;
    }

    try {
      this.gpu = await GPUContext.init(this.canvas);
    } catch (err: unknown) {
      console.error('WebGPU Init Failed:', err);
      const fallback = document.getElementById('webgpu-fallback');
      if (fallback) fallback.classList.remove('hidden');
      return;
    }

    // Initialize subsystems
    this.audio = new SketchAudio();
    this.paper = new PaperSubstrate(this.gpu);
    this.sim = new LeafSimulation();
    this.leafRenderer = new LeafRenderer(this.gpu);
    this.textRenderer = new TextRenderer(this.gpu);

    this.ui = new UIController(
      this.sim,
      this.paper,
      this.audio,
      () => this.onCaptureMoment()
    );

    this.setupPointerEvents();
    this.setupResize();

    // Start render loop
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.renderLoop(t));
  }

  private setupPointerEvents() {
    const canvas = this.canvas;

    const getNormCoords = (e: MouseEvent | Touch): { x: number; y: number; u: number; v: number } => {
      const rect = canvas.getBoundingClientRect();
      const u = (e.clientX - rect.left) / rect.width;
      const v = (e.clientY - rect.top) / rect.height;
      // WebGPU clip coordinates: x in [-1, 1], y in [-1, 1] (y inverted: top is +1, bottom is -1)
      const x = (u * 2 - 1);
      const y = -(v * 2 - 1);
      return { x, y, u, v };
    };

    const onPointerDown = (e: MouseEvent) => {
      this.isPointerDown = true;
      const { x, y, u, v } = getNormCoords(e);
      this.sim.mouseX = x;
      this.sim.mouseY = y;
      this.sim.mouseActive = true;
      this.lastPointerX = u;
      this.lastPointerY = v;

      if (this.sim.currentTool === 'pencil') {
        this.audio.playPencilScratch();
        const color = this.getPencilColor();
        this.paper.drawPencilStroke(u, v, u + 0.001, v + 0.001, color, 3.5);
      } else if (this.sim.currentTool === 'gust') {
        this.audio.playLeafRustle(0.7);
      }
    };

    const onPointerMove = (e: MouseEvent) => {
      const { x, y, u, v } = getNormCoords(e);

      // Compute velocity
      const dt = 0.016;
      this.sim.mouseVx = (x - this.sim.mouseX) / dt * 0.05;
      this.sim.mouseVy = (y - this.sim.mouseY) / dt * 0.05;
      this.sim.mouseX = x;
      this.sim.mouseY = y;
      this.sim.mouseActive = true;

      if (this.isPointerDown && this.sim.currentTool === 'pencil') {
        this.audio.playPencilScratch();
        const color = this.getPencilColor();
        this.paper.drawPencilStroke(this.lastPointerX, this.lastPointerY, u, v, color, 3.5);
      }

      this.lastPointerX = u;
      this.lastPointerY = v;
    };

    const onPointerUp = () => {
      this.isPointerDown = false;
      this.sim.mouseActive = false;
      this.sim.mouseVx = 0;
      this.sim.mouseVy = 0;
    };

    canvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    // Touch support
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        onPointerDown(e.touches[0] as unknown as MouseEvent);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        onPointerMove(e.touches[0] as unknown as MouseEvent);
      }
    }, { passive: true });

    window.addEventListener('touchend', onPointerUp);
  }

  private getPencilColor(): string {
    // Return authentic colored pencil hex colors based on active palette
    switch (this.sim.currentPalette) {
      case 1: // Golden Ginkgo
        return 'rgba(212, 172, 13, 0.65)';
      case 2: // Deep Woodland
        return 'rgba(120, 66, 18, 0.7)';
      case 3: // Twilight Frost
        return 'rgba(91, 44, 111, 0.65)';
      default: // October Vermilion
        return 'rgba(192, 57, 43, 0.75)';
    }
  }

  private setupResize() {
    window.addEventListener('resize', () => {
      GPUContext.resize(this.gpu);
    });
  }

  private isCapturing: boolean = false;

  private onCaptureMoment() {
    this.isCapturing = true;
  }

  private renderLoop(timeMs: number) {
    const dt = Math.min((timeMs - this.lastTime) * 0.001, 0.05);
    this.lastTime = timeMs;
    const timeSec = timeMs * 0.001;

    // FPS calculation
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.currentFps = (this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
      this.ui.updateTelemetry(this.sim.leaves.length, this.sim.groundCount, this.currentFps);
    }

    // 1. Simulation step
    const aspect = this.gpu.width / this.gpu.height;
    this.sim.update(dt, aspect);

    // 2. Pack instance buffer partitioned by species
    const packResult = this.sim.packInstanceData(this.leafRenderer.instanceData);

    // 3. GPU Uniform & Instance uploads (Zero dynamic allocations!)
    this.paper.updateUniforms(this.gpu.width, this.gpu.height, timeSec);
    this.textRenderer.updateUniforms(this.gpu.width, this.gpu.height, this.sim.mouseX, this.sim.mouseY, timeSec);
    this.leafRenderer.updateUniforms(this.gpu.width, this.gpu.height, timeSec);
    this.leafRenderer.updateInstances(this.leafRenderer.instanceData, packResult.totalCount);

    // 4. Single-Submission GPU Command Recording
    const commandEncoder = this.gpu.device.createCommandEncoder({
      label: 'autumn-frame-encoder'
    });

    const currentTexture = this.gpu.context.getCurrentTexture();
    const renderPass = commandEncoder.beginRenderPass({
      label: 'autumn-main-render-pass',
      colorAttachments: [
        {
          view: currentTexture.createView(),
          clearValue: { r: 0.976, g: 0.957, b: 0.925, a: 1.0 }, // Warm archival cold-press paper clear
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    });

    // Sub-pass 1: Paper Substrate & Procedural Fibers & User Pencil Marks
    this.paper.render(renderPass);

    // Sub-pass 2: "capture the moment" Colored Pencil Inscription
    this.textRenderer.render(renderPass);

    // Sub-pass 3: Falling & Ground Autumn Leaves (Shadows + Colored Pencil Hatching)
    this.leafRenderer.render(renderPass, packResult);

    renderPass.end();

    if (this.isCapturing) {
      this.isCapturing = false;
      const w = this.gpu.width;
      const h = this.gpu.height;
      const bytesPerRow = Math.ceil((w * 4) / 256) * 256;
      const bufferSize = bytesPerRow * h;

      const readbackBuffer = this.gpu.device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      });

      commandEncoder.copyTextureToBuffer(
        { texture: currentTexture },
        { buffer: readbackBuffer, bytesPerRow, rowsPerImage: h },
        [w, h, 1]
      );

      this.gpu.device.queue.submit([commandEncoder.finish()]);

      readbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const u8 = new Uint8Array(readbackBuffer.getMappedRange());
        const targetCanvas = document.getElementById('captured-canvas') as HTMLCanvasElement;
        targetCanvas.width = w;
        targetCanvas.height = h;
        const ctx = targetCanvas.getContext('2d');
        if (ctx) {
          const imgData = ctx.createImageData(w, h);
          const isBGRA = this.gpu.format === 'bgra8unorm';
          for (let y = 0; y < h; y++) {
            const srcRow = y * bytesPerRow;
            const dstRow = y * w * 4;
            for (let x = 0; x < w; x++) {
              const srcIdx = srcRow + x * 4;
              const dstIdx = dstRow + x * 4;
              if (isBGRA) {
                imgData.data[dstIdx + 0] = u8[srcIdx + 2];
                imgData.data[dstIdx + 1] = u8[srcIdx + 1];
                imgData.data[dstIdx + 2] = u8[srcIdx + 0];
                imgData.data[dstIdx + 3] = 255;
              } else {
                imgData.data[dstIdx + 0] = u8[srcIdx + 0];
                imgData.data[dstIdx + 1] = u8[srcIdx + 1];
                imgData.data[dstIdx + 2] = u8[srcIdx + 2];
                imgData.data[dstIdx + 3] = 255;
              }
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }
        readbackBuffer.unmap();
        readbackBuffer.destroy();
        this.ui.showCapturedModalDirect();
      });

      requestAnimationFrame((t) => this.renderLoop(t));
      return;
    }

    // 5. Submit commands to GPU queue
    this.gpu.device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame((t) => this.renderLoop(t));
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  const app = new AutumnSketchbookApp();
  app.start().catch(console.error);
});

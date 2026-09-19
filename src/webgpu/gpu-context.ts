/**
 * WebGPU Device Context & Surface Manager
 */
export interface GPUContextState {
  device: GPUDevice;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  dpr: number;
  width: number;
  height: number;
}

export class GPUContext {

  public static async init(canvas: HTMLCanvasElement): Promise<GPUContextState> {
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser. Please use Chrome 113+, Chrome Dev, or Edge.');
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });

    if (!adapter) {
      throw new Error('No appropriate GPUAdapter found.');
    }

    const device = await adapter.requestDevice({
      requiredFeatures: [],
      requiredLimits: {}
    });

    device.lost.then((info) => {
      console.error('WebGPU Device was lost:', info);
    });

    const context = canvas.getContext('webgpu');
    if (!context) {
      throw new Error('Failed to create WebGPU canvas context.');
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // 2x max for high-DPI pencil crispness
    const width = Math.floor(canvas.clientWidth * dpr);
    const height = Math.floor(canvas.clientHeight * dpr);

    canvas.width = width;
    canvas.height = height;

    context.configure({
      device,
      format,
      alphaMode: 'opaque', // Paper substrate is fully opaque
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    });

    const state: GPUContextState = {
      device,
      format,
      canvas,
      context,
      dpr,
      width,
      height
    };

    return state;
  }

  public static resize(state: GPUContextState): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const newWidth = Math.floor(state.canvas.clientWidth * dpr);
    const newHeight = Math.floor(state.canvas.clientHeight * dpr);

    if (newWidth !== state.width || newHeight !== state.height) {
      state.width = Math.max(1, newWidth);
      state.height = Math.max(1, newHeight);
      state.dpr = dpr;
      state.canvas.width = state.width;
      state.canvas.height = state.height;

      state.context.configure({
        device: state.device,
        format: state.format,
        alphaMode: 'opaque',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
      });
      return true;
    }
    return false;
  }
}

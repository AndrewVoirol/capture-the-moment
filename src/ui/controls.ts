import { LeafSimulation } from '../webgpu/simulation';
import { PaperSubstrate } from '../webgpu/paper-substrate';
import { SketchAudio } from '../audio/sketch-audio';

export class UIController {
  private sim: LeafSimulation;
  private paper: PaperSubstrate;
  private audio: SketchAudio;
  private onCaptureTrigger: () => void;

  // Telemetry elements
  private elLeaves!: HTMLElement;
  private elGround!: HTMLElement;
  private elFps!: HTMLElement;

  // Viewfinder
  private elViewfinder!: HTMLElement;
  private viewfinderVisible: boolean = true;

  // Flash
  private elFlash!: HTMLElement;

  // Modal elements
  private elModal!: HTMLElement;
  private elCapturedCanvas!: HTMLCanvasElement;
  private elBtnCloseModal!: HTMLElement;
  private elBtnResume!: HTMLElement;
  private elBtnDownload!: HTMLElement;
  private elArtMetaDate!: HTMLElement;

  // Sound button
  private elBtnSound!: HTMLElement;

  constructor(
    sim: LeafSimulation,
    paper: PaperSubstrate,
    audio: SketchAudio,
    onCapture: () => void
  ) {
    this.sim = sim;
    this.paper = paper;
    this.audio = audio;
    this.onCaptureTrigger = onCapture;

    this.bindElements();
    this.setupEventListeners();
  }

  private bindElements() {
    this.elLeaves = document.getElementById('stat-leaves')!;
    this.elGround = document.getElementById('stat-ground')!;
    this.elFps = document.getElementById('stat-fps')!;
    this.elViewfinder = document.getElementById('viewfinder')!;
    this.elFlash = document.getElementById('shutter-flash')!;

    this.elModal = document.getElementById('capture-modal')!;
    this.elCapturedCanvas = document.getElementById('captured-canvas') as HTMLCanvasElement;
    this.elBtnCloseModal = document.getElementById('btn-modal-close')!;
    this.elBtnResume = document.getElementById('btn-resume')!;
    this.elBtnDownload = document.getElementById('btn-download')!;
    this.elArtMetaDate = document.getElementById('art-meta-date')!;
    this.elBtnSound = document.getElementById('btn-toggle-sound')!;
  }

  private setupEventListeners() {
    // 1. Capture Button & Keybinding
    const btnCapture = document.getElementById('btn-capture')!;
    btnCapture.addEventListener('click', () => this.handleCapture());

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (this.elModal.classList.contains('hidden')) {
          this.handleCapture();
        } else {
          this.closeModal();
        }
      } else if (e.key === 'm' || e.key === 'M') {
        this.sim.triggerEvokeWords();
        this.audio.playLeafRustle(0.9);
      } else if (e.key === 'c' || e.key === 'C') {
        this.paper.clearPencilStrokes();
      } else if (e.code === 'Escape') {
        this.closeModal();
      }
    });

    // 2. Tools
    const toolBtns = document.querySelectorAll('.tool-btn');
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tool = btn.getAttribute('data-tool') as 'breeze' | 'pencil' | 'gust';
        this.sim.currentTool = tool;
      });
    });

    // 3. Palettes
    const swatches = document.querySelectorAll('.swatch');
    const paletteMap: Record<string, number> = {
      'vermilion': 0,
      'ginkgo': 1,
      'woodland': 2,
      'twilight': 3
    };

    swatches.forEach(sw => {
      sw.addEventListener('click', () => {
        swatches.forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        const palName = sw.getAttribute('data-palette')!;
        const palId = paletteMap[palName] ?? 0;
        this.sim.currentPalette = palId;
        // Update airborne leaves palette
        for (const leaf of this.sim.leaves) {
          if (leaf.status === 0 || leaf.status === 3) {
            leaf.paletteId = palId;
          }
        }
      });
    });

    // 4. Action Buttons
    const btnGust = document.getElementById('btn-gust')!;
    btnGust.addEventListener('click', () => {
      this.sim.triggerGust(1.4);
      this.audio.playLeafRustle(1.0);
    });

    const btnShower = document.getElementById('btn-shower')!;
    btnShower.addEventListener('click', () => {
      this.sim.spawnFlurry(45);
      this.audio.playLeafRustle(0.7);
    });

    const btnEvoke = document.getElementById('btn-reveal-words')!;
    btnEvoke.addEventListener('click', () => {
      this.sim.triggerEvokeWords();
      this.audio.playLeafRustle(0.9);
    });

    const btnVf = document.getElementById('btn-toggle-vf')!;
    btnVf.addEventListener('click', () => {
      this.viewfinderVisible = !this.viewfinderVisible;
      if (this.viewfinderVisible) {
        this.elViewfinder.classList.remove('hidden');
      } else {
        this.elViewfinder.classList.add('hidden');
      }
    });

    // Sound toggle
    this.elBtnSound.addEventListener('click', () => {
      const active = this.audio.toggleMute();
      this.elBtnSound.style.opacity = active ? '1.0' : '0.4';
    });

    // Modal controls
    this.elBtnCloseModal.addEventListener('click', () => this.closeModal());
    this.elBtnResume.addEventListener('click', () => this.closeModal());
    this.elBtnDownload.addEventListener('click', () => this.downloadArtwork());
  }

  public handleCapture() {
    this.sim.isPaused = true;
    this.audio.playShutter();

    // Trigger visual flash
    this.elFlash.classList.add('flashing');
    setTimeout(() => {
      this.elFlash.classList.remove('flashing');
      this.elFlash.classList.add('fading');
      setTimeout(() => {
        this.elFlash.classList.remove('fading');
      }, 500);
    }, 60);

    this.onCaptureTrigger();
  }

  public showCapturedModalDirect() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    this.elArtMetaDate.textContent = `Captured Moment • Fabriano Cold Press Archival • ${dateStr}`;
    this.elModal.classList.remove('hidden');
  }

  private closeModal() {
    this.elModal.classList.add('hidden');
    this.sim.isPaused = false;
  }

  private downloadArtwork() {
    const link = document.createElement('a');
    link.download = `capture-the-moment-autumn-${Date.now()}.png`;
    link.href = this.elCapturedCanvas.toDataURL('image/png');
    link.click();
  }

  public updateTelemetry(leavesCount: number, groundCount: number, fps: number) {
    this.elLeaves.textContent = leavesCount.toString();
    this.elGround.textContent = groundCount.toString();
    this.elFps.textContent = Math.round(fps).toString();
  }
}

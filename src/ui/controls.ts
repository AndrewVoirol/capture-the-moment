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

  // Interaction hint
  private elInteractionHint!: HTMLElement;

  // Modal elements
  private elModal!: HTMLElement;
  private elCapturedCanvas!: HTMLCanvasElement;
  private elBtnCloseModal!: HTMLElement;
  private elBtnResume!: HTMLElement;
  private elBtnDownload!: HTMLElement;
  private elArtMetaDate!: HTMLElement;

  // Sound button
  private elBtnSound!: HTMLElement;

  // Co-Star elements
  private elBtnCoStar!: HTMLElement;
  private elCoStarLabel!: HTMLElement;
  private elSelectModel!: HTMLSelectElement;
  private elSelectVoice!: HTMLSelectElement;
  private elBtnMicMute!: HTMLElement;
  private elQuickPrompts!: HTMLElement;

  // Recorder elements
  private elBtnRecord!: HTMLElement;
  private elRecLabel!: HTMLElement;

  // API Key modal
  private elApiKeyModal!: HTMLElement;
  private elBtnApiKey!: HTMLElement;
  private elBtnCloseKeyModal!: HTMLElement;
  private elInputGeminiKey!: HTMLInputElement;
  private elBtnSaveKey!: HTMLElement;

  // Callbacks
  private onToggleCoStarCallback?: () => void;
  private onModelChangeCallback?: (model: string) => void;
  private onVoiceChangeCallback?: (voice: string) => void;
  private onToggleRecordCallback?: () => void;
  private onToggleMicMuteCallback?: () => void;
  private onSendPromptCallback?: (prompt: string) => void;

  constructor(
    sim: LeafSimulation,
    paper: PaperSubstrate,
    audio: SketchAudio,
    onCapture: () => void,
    options?: {
      onToggleCoStar?: () => void;
      onModelChange?: (model: string) => void;
      onVoiceChange?: (voice: string) => void;
      onToggleRecord?: () => void;
      onToggleMicMute?: () => void;
      onSendPrompt?: (prompt: string) => void;
    }
  ) {
    this.sim = sim;
    this.paper = paper;
    this.audio = audio;
    this.onCaptureTrigger = onCapture;
    this.onToggleCoStarCallback = options?.onToggleCoStar;
    this.onModelChangeCallback = options?.onModelChange;
    this.onVoiceChangeCallback = options?.onVoiceChange;
    this.onToggleRecordCallback = options?.onToggleRecord;
    this.onToggleMicMuteCallback = options?.onToggleMicMute;
    this.onSendPromptCallback = options?.onSendPrompt;

    this.bindElements();
    this.setupEventListeners();
  }

  private bindElements() {
    this.elLeaves = document.getElementById('stat-leaves')!;
    this.elGround = document.getElementById('stat-ground')!;
    this.elFps = document.getElementById('stat-fps')!;
    this.elViewfinder = document.getElementById('viewfinder')!;
    this.elFlash = document.getElementById('shutter-flash')!;
    this.elInteractionHint = document.getElementById('interaction-hint')!;

    this.elModal = document.getElementById('capture-modal')!;
    this.elCapturedCanvas = document.getElementById('captured-canvas') as HTMLCanvasElement;
    this.elBtnCloseModal = document.getElementById('btn-modal-close')!;
    this.elBtnResume = document.getElementById('btn-resume')!;
    this.elBtnDownload = document.getElementById('btn-download')!;
    this.elArtMetaDate = document.getElementById('art-meta-date')!;
    this.elBtnSound = document.getElementById('btn-toggle-sound')!;

    // Co-Star
    this.elBtnCoStar = document.getElementById('btn-toggle-costar')!;
    this.elCoStarLabel = document.getElementById('costar-btn-label')!;
    this.elSelectModel = document.getElementById('select-costar-model') as HTMLSelectElement;
    this.elSelectVoice = document.getElementById('select-costar-voice') as HTMLSelectElement;
    this.elBtnMicMute = document.getElementById('btn-mic-mute')!;
    this.elQuickPrompts = document.getElementById('costar-quick-prompts')!;

    // Recorder
    this.elBtnRecord = document.getElementById('btn-record-demo')!;
    this.elRecLabel = document.getElementById('rec-btn-label')!;

    // API Key modal
    this.elApiKeyModal = document.getElementById('api-key-modal')!;
    this.elBtnApiKey = document.getElementById('btn-api-key')!;
    this.elBtnCloseKeyModal = document.getElementById('btn-close-key-modal')!;
    this.elInputGeminiKey = document.getElementById('input-gemini-key') as HTMLInputElement;
    this.elBtnSaveKey = document.getElementById('btn-save-key')!;

    const savedKey = localStorage.getItem('gemini_live_api_key');
    if (savedKey) {
      this.elInputGeminiKey.value = savedKey;
    }
  }

  private setupEventListeners() {
    // 1. Capture Button & Keybinding
    const btnCapture = document.getElementById('btn-capture')!;
    btnCapture.addEventListener('click', () => this.handleCapture());

    window.addEventListener('keydown', (e) => {
      this.dismissHint();
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
        this.dismissHint();
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
      'gold': 1,
      'ginkgo': 1,
      'woodland': 2,
      'twilight': 3
    };

    swatches.forEach(sw => {
      sw.addEventListener('click', () => {
        this.dismissHint();
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
      this.dismissHint();
      this.sim.triggerGust(1.4);
      this.audio.playLeafRustle(1.0);
    });

    const btnShower = document.getElementById('btn-shower')!;
    btnShower.addEventListener('click', () => {
      this.dismissHint();
      this.sim.spawnFlurry(45);
      this.audio.playLeafRustle(0.7);
    });

    const btnEvoke = document.getElementById('btn-reveal-words')!;
    btnEvoke.addEventListener('click', () => {
      this.dismissHint();
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

    // Co-Star controls
    this.elBtnCoStar.addEventListener('click', () => {
      if (this.onToggleCoStarCallback) {
        this.onToggleCoStarCallback();
      }
    });

    this.elSelectModel.addEventListener('change', () => {
      if (this.onModelChangeCallback) {
        this.onModelChangeCallback(this.elSelectModel.value);
      }
    });

    this.elSelectVoice.addEventListener('change', () => {
      if (this.onVoiceChangeCallback) {
        this.onVoiceChangeCallback(this.elSelectVoice.value);
      }
    });

    // Mic mute control
    if (this.elBtnMicMute) {
      this.elBtnMicMute.addEventListener('click', () => {
        if (this.onToggleMicMuteCallback) {
          this.onToggleMicMuteCallback();
        }
      });
    }

    // Quick Command Pills
    if (this.elQuickPrompts) {
      const pills = this.elQuickPrompts.querySelectorAll('.prompt-pill');
      pills.forEach((pill) => {
        pill.addEventListener('click', () => {
          const prompt = pill.getAttribute('data-prompt');
          if (prompt && this.onSendPromptCallback) {
            this.onSendPromptCallback(prompt);
          }
        });
      });
    }

    // Recorder controls
    this.elBtnRecord.addEventListener('click', () => {
      if (this.onToggleRecordCallback) {
        this.onToggleRecordCallback();
      }
    });

    // API Key modal controls
    this.elBtnApiKey.addEventListener('click', () => this.showApiKeyModal());
    this.elBtnCloseKeyModal.addEventListener('click', () => this.hideApiKeyModal());
    this.elInputGeminiKey.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.elBtnSaveKey.click();
      }
    });

    this.elBtnSaveKey.addEventListener('click', () => {
      const key = this.elInputGeminiKey.value.trim().replace(/^["']|["']$/g, '');
      if (key) {
        localStorage.setItem('gemini_live_api_key', key);
      } else {
        localStorage.removeItem('gemini_live_api_key');
      }
      this.hideApiKeyModal();
    });

    // Modal controls
    this.elBtnCloseModal.addEventListener('click', () => this.closeModal());
    this.elBtnResume.addEventListener('click', () => this.closeModal());
    this.elBtnDownload.addEventListener('click', () => this.downloadArtwork());
  }

  public getStoredApiKey(): string {
    const fromStorage = localStorage.getItem('gemini_live_api_key');
    if (fromStorage && fromStorage.trim() !== '') {
      return fromStorage.trim().replace(/^["']|["']$/g, '');
    }
    if (typeof __GEMINI_API_KEY__ !== 'undefined' && __GEMINI_API_KEY__ && __GEMINI_API_KEY__.trim() !== '') {
      return __GEMINI_API_KEY__.trim().replace(/^["']|["']$/g, '');
    }
    return '';
  }

  public getSelectedModel(): string {
    return this.elSelectModel?.value || 'models/gemini-3.8-live';
  }

  public getSelectedVoice(): string {
    return this.elSelectVoice?.value || 'Capella';
  }

  public showApiKeyModal() {
    this.elApiKeyModal.classList.remove('hidden');
    this.elInputGeminiKey.focus();
  }

  public hideApiKeyModal() {
    this.elApiKeyModal.classList.add('hidden');
  }

  public setCoStarButtonState(state: 'disconnected' | 'connecting' | 'connected' | 'error', text?: string) {
    this.elBtnCoStar.classList.remove('connecting', 'connected', 'error');
    if (state === 'connecting') {
      this.elBtnCoStar.classList.add('connecting');
      this.elCoStarLabel.textContent = text || 'Connecting...';
      this.elBtnCoStar.title = 'Establishing Gemini Live WebSocket session...';
      if (this.elBtnMicMute) this.elBtnMicMute.classList.add('hidden');
      if (this.elQuickPrompts) this.elQuickPrompts.classList.add('hidden');
    } else if (state === 'connected') {
      this.elBtnCoStar.classList.add('connected');
      this.elCoStarLabel.textContent = text || 'Disconnect Co-Star';
      this.elBtnCoStar.title = 'Co-Star connected! Speak into your mic or click quick prompt pills.';
      if (this.elBtnMicMute) this.elBtnMicMute.classList.remove('hidden');
      if (this.elQuickPrompts) this.elQuickPrompts.classList.remove('hidden');
    } else if (state === 'error') {
      this.elBtnCoStar.classList.add('error');
      const shortErr = text && text.length > 20 ? text.slice(0, 18) + '...' : (text || 'Error (Retry)');
      this.elCoStarLabel.textContent = shortErr;
      this.elBtnCoStar.title = text ? `Error: ${text} (Click to retry or check API key)` : 'Connection error. Click to retry.';
      if (this.elBtnMicMute) this.elBtnMicMute.classList.add('hidden');
      if (this.elQuickPrompts) this.elQuickPrompts.classList.add('hidden');
    } else {
      this.elCoStarLabel.textContent = text || 'Connect Co-Star';
      this.elBtnCoStar.title = 'Start Gemini Multimodal Live Co-Star';
      if (this.elBtnMicMute) this.elBtnMicMute.classList.add('hidden');
      if (this.elQuickPrompts) this.elQuickPrompts.classList.add('hidden');
    }
  }

  public setMicMuteState(muted: boolean) {
    if (!this.elBtnMicMute) return;
    if (muted) {
      this.elBtnMicMute.classList.add('mic-muted');
      this.elBtnMicMute.title = 'Mic is Muted (Click to Unmute)';
      this.elBtnMicMute.innerHTML = `
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
          <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>
      `;
    } else {
      this.elBtnMicMute.classList.remove('mic-muted');
      this.elBtnMicMute.title = 'Mic is Live (Click to Mute)';
      this.elBtnMicMute.innerHTML = `
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
          <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>
      `;
    }
  }

  public setRecordButtonState(recording: boolean, timerText?: string) {
    if (recording) {
      this.elBtnRecord.classList.add('recording');
      this.elRecLabel.textContent = timerText ? `REC ${timerText}` : 'Recording...';
    } else {
      this.elBtnRecord.classList.remove('recording');
      this.elRecLabel.textContent = 'Record Demo';
    }
  }

  public setPaletteByName(palName: 'vermilion' | 'gold' | 'ginkgo' | 'woodland' | 'twilight'): { success: boolean; active: string } {
    const paletteMap: Record<string, number> = {
      'vermilion': 0,
      'gold': 1,
      'ginkgo': 1,
      'woodland': 2,
      'twilight': 3
    };
    const palId = paletteMap[palName] ?? 0;
    this.sim.currentPalette = palId;

    for (const leaf of this.sim.leaves) {
      if (leaf.status === 0 || leaf.status === 3) {
        leaf.paletteId = palId;
      }
    }

    // Update active swatch in UI
    const swatches = document.querySelectorAll('.swatch');
    swatches.forEach((s) => {
      const p = s.getAttribute('data-palette');
      if (p === palName || (palName === 'gold' && p === 'ginkgo') || (palName === 'ginkgo' && p === 'gold')) {
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    });

    return { success: true, active: palName };
  }

  public triggerGust(strength?: number): { success: boolean; gustForce: number } {
    const force = strength ?? 1.4;
    this.sim.triggerGust(force);
    this.audio.playLeafRustle(1.0);
    return { success: true, gustForce: force };
  }

  public spawnFlurry(count?: number): { success: boolean; spawnedCount: number } {
    const flurryCount = count ?? 45;
    this.sim.spawnFlurry(flurryCount);
    this.audio.playLeafRustle(0.7);
    return { success: true, spawnedCount: flurryCount };
  }

  public triggerEvokeWords(): { success: boolean } {
    this.sim.triggerEvokeWords();
    this.audio.playLeafRustle(0.9);
    return { success: true };
  }

  public sketchShape(
    shape: 'leaf' | 'signature' | 'circle' | 'spiral' = 'leaf',
    color: string = 'rgba(192, 57, 43, 0.75)'
  ): { success: boolean; shape: string } {
    const strokes = this.getShapeStrokes(shape);
    let strokeIdx = 0;
    let ptIdx = 0;

    const step = () => {
      if (strokeIdx >= strokes.length) return;
      const currentStroke = strokes[strokeIdx];
      if (ptIdx + 1 < currentStroke.length) {
        const [x0, y0] = currentStroke[ptIdx];
        const [x1, y1] = currentStroke[ptIdx + 1];
        this.paper.drawPencilStroke(x0, y0, x1, y1, color, 3.2);
        if (ptIdx % 3 === 0) {
          this.audio.playPencilScratch();
        }
        ptIdx++;
        setTimeout(step, 16);
      } else {
        strokeIdx++;
        ptIdx = 0;
        setTimeout(step, 25);
      }
    };

    step();
    return { success: true, shape };
  }

  private getShapeStrokes(shape: 'leaf' | 'signature' | 'circle' | 'spiral'): Array<Array<[number, number]>> {
    switch (shape) {
      case 'signature': {
        // Cursive "Alastair" signature flourish in upper right margin (clear of settled ground leaves)
        return [
          // Capital 'A'
          [
            [0.76, 0.22],
            [0.77, 0.18],
            [0.78, 0.15],
            [0.79, 0.13],
            [0.80, 0.17],
            [0.81, 0.22],
            [0.805, 0.18],
            [0.775, 0.18]
          ],
          // Lowercase cursive 'l-a-s-t-a-i-r'
          [
            [0.81, 0.22],
            [0.818, 0.16],
            [0.824, 0.22], // 'l'
            [0.830, 0.20],
            [0.835, 0.19],
            [0.840, 0.22], // 'a'
            [0.846, 0.19],
            [0.852, 0.22], // 's'
            [0.858, 0.17],
            [0.862, 0.22], // 't'
            [0.868, 0.20],
            [0.874, 0.22], // 'a'
            [0.880, 0.20],
            [0.885, 0.22], // 'i'
            [0.892, 0.20],
            [0.900, 0.22]  // 'r'
          ],
          // Flourished underline
          [
            [0.75, 0.242],
            [0.79, 0.238],
            [0.83, 0.241],
            [0.88, 0.247],
            [0.91, 0.252]
          ],
          // Crossbar on 't'
          [
            [0.854, 0.185],
            [0.868, 0.185]
          ],
          // Accent dot
          [
            [0.885, 0.18],
            [0.887, 0.18]
          ]
        ];
      }
      case 'circle': {
        // Hand-sketched critique circle around center
        const points: [number, number][] = [];
        const steps = 28;
        for (let i = 0; i <= steps; i++) {
          const theta = (i / steps) * Math.PI * 2.25 - Math.PI * 0.5;
          const r = 0.11 + Math.sin(i * 1.8) * 0.006;
          points.push([0.50 + Math.cos(theta) * r, 0.45 + Math.sin(theta) * (r * 0.95)]);
        }
        return [points];
      }
      case 'spiral': {
        // Wind flourish spiral
        const points: [number, number][] = [];
        const steps = 36;
        for (let i = 0; i <= steps; i++) {
          const theta = (i / steps) * Math.PI * 3.4;
          const r = 0.015 + (i / steps) * 0.12;
          points.push([0.50 + Math.cos(theta) * r, 0.45 + Math.sin(theta) * (r * 0.85)]);
        }
        return [points];
      }
      case 'leaf':
      default: {
        // Botanical leaf outline in upper-mid quadrant (clear of settled ground leaves)
        return [
          // Stem & central rib
          [
            [0.68, 0.52],
            [0.681, 0.48],
            [0.683, 0.43],
            [0.684, 0.38],
            [0.683, 0.33],
            [0.68, 0.29],
            [0.675, 0.26]
          ],
          // Left leaf blade contour
          [
            [0.68, 0.50],
            [0.65, 0.47],
            [0.625, 0.41],
            [0.63, 0.35],
            [0.655, 0.30],
            [0.675, 0.26]
          ],
          // Right leaf blade contour
          [
            [0.68, 0.50],
            [0.71, 0.47],
            [0.735, 0.41],
            [0.73, 0.35],
            [0.705, 0.30],
            [0.675, 0.26]
          ],
          // Vein pair 1
          [
            [0.683, 0.43],
            [0.645, 0.40]
          ],
          [
            [0.683, 0.43],
            [0.715, 0.40]
          ],
          // Vein pair 2
          [
            [0.684, 0.36],
            [0.65, 0.32]
          ],
          [
            [0.684, 0.36],
            [0.71, 0.32]
          ]
        ];
      }
    }
  }

  public handleCapture(): { success: boolean } {
    this.dismissHint();
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
    return { success: true };
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

  public dismissHint() {
    if (this.elInteractionHint && !this.elInteractionHint.classList.contains('dismissed')) {
      this.elInteractionHint.classList.add('dismissed');
    }
  }

  public updateTelemetry(leavesCount: number, groundCount: number, fps: number) {
    this.elLeaves.textContent = leavesCount.toString();
    this.elGround.textContent = groundCount.toString();
    this.elFps.textContent = Math.round(fps).toString();
  }
}


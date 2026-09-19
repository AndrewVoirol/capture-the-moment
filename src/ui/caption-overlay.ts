/**
 * Fun Jiggly Autumn-Themed Caption Overlay
 * - High-contrast text with deep umber drop shadow for maximum legibility on cold-press paper
 * - Fall-colored gradients: Crimson-Amber for User, Gold-Plum for Co-Star
 * - Springy jiggly bounce animation on incoming text
 * - Auto-fades after silence
 */

export class CaptionOverlay {
  private container: HTMLElement;
  private userBox: HTMLElement;
  private coStarBox: HTMLElement;
  private userTextEl: HTMLElement;
  private coStarTextEl: HTMLElement;

  private userClearTimer: number | null = null;
  private coStarClearTimer: number | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'live-caption-overlay';
    this.container.className = 'caption-overlay';

    // User Caption Bubble
    this.userBox = document.createElement('div');
    this.userBox.className = 'caption-bubble user-bubble hidden';
    this.userBox.innerHTML = `
      <div class="caption-header">
        <span class="caption-badge user-badge">You</span>
      </div>
      <div class="caption-text-body user-text"></div>
    `;
    this.userTextEl = this.userBox.querySelector('.user-text')!;

    // Co-Star Caption Bubble
    this.coStarBox = document.createElement('div');
    this.coStarBox.className = 'caption-bubble costar-bubble hidden';
    this.coStarBox.innerHTML = `
      <div class="caption-header">
        <span class="caption-badge costar-badge">🎙️ Alastair (Co-Star)</span>
        <span class="costar-wave">
          <i></i><i></i><i></i><i></i>
        </span>
      </div>
      <div class="caption-text-body costar-text"></div>
    `;
    this.coStarTextEl = this.coStarBox.querySelector('.costar-text')!;

    this.container.appendChild(this.userBox);
    this.container.appendChild(this.coStarBox);

    const appContainer = document.getElementById('app-container') || document.body;
    appContainer.appendChild(this.container);
  }

  /**
   * Update or append user speech transcript
   */
  public showUserTranscript(text: string): void {
    if (!text || text.trim() === '') return;

    if (this.userClearTimer !== null) {
      clearTimeout(this.userClearTimer);
    }

    this.userTextEl.textContent = text;
    this.userBox.classList.remove('hidden');
    this.triggerJiggle(this.userBox);

    this.userClearTimer = window.setTimeout(() => {
      this.userBox.classList.add('hidden');
    }, 6000);
  }

  /**
   * Update or append Co-Star speech transcript
   */
  public showCoStarTranscript(text: string): void {
    if (!text || text.trim() === '') return;

    if (this.coStarClearTimer !== null) {
      clearTimeout(this.coStarClearTimer);
    }

    this.coStarTextEl.textContent = text;
    this.coStarBox.classList.remove('hidden');
    this.triggerJiggle(this.coStarBox);

    this.coStarClearTimer = window.setTimeout(() => {
      this.coStarBox.classList.add('hidden');
    }, 7000);
  }

  /**
   * Incrementally append streaming tokens/words to Co-Star transcript
   */
  public appendCoStarTranscript(chunk: string): void {
    if (!chunk) return;

    if (this.coStarClearTimer !== null) {
      clearTimeout(this.coStarClearTimer);
    }

    const existing = this.coStarTextEl.textContent || '';
    const needsSpace = existing.length > 0 && !existing.endsWith(' ') && !existing.endsWith('\n') && !chunk.startsWith(' ') && !chunk.startsWith(',') && !chunk.startsWith('.') && !chunk.startsWith('!') && !chunk.startsWith('?');
    this.coStarTextEl.textContent = existing + (needsSpace ? ' ' : '') + chunk;
    this.coStarBox.classList.remove('hidden');
    this.triggerJiggle(this.coStarBox);

    this.coStarClearTimer = window.setTimeout(() => {
      this.coStarBox.classList.add('hidden');
      this.coStarTextEl.textContent = '';
    }, 8000);
  }

  public resetCoStarTurn(): void {
    this.coStarTextEl.textContent = '';
  }

  /**
   * Set speaking indicator state for co-star
   */
  public setCoStarSpeaking(speaking: boolean): void {
    const wave = this.coStarBox.querySelector('.costar-wave');
    if (wave) {
      if (speaking) {
        wave.classList.add('active');
        this.coStarBox.classList.remove('hidden');
      } else {
        wave.classList.remove('active');
      }
    }
  }

  /**
   * Display a floating autumn action toast when a tool call executes
   */
  public showActionToast(toolName: string, detail: string): void {
    const toast = document.createElement('div');
    toast.className = 'caption-action-toast jiggle-bounce';

    let icon = '⚡';
    if (toolName === 'changePalette') icon = '🍁';
    else if (toolName === 'triggerWindGust') icon = '💨';
    else if (toolName === 'spawnFlurry') icon = '🍂';
    else if (toolName === 'drawPencilStroke') icon = '✏️';
    else if (toolName === 'evokeInscription') icon = '✍️';
    else if (toolName === 'captureArtwork') icon = '📷';

    toast.innerHTML = `
      <span class="action-toast-icon">${icon}</span>
      <span class="action-toast-tag">Co-Star Action</span>
      <span class="action-toast-text">${detail}</span>
    `;

    this.container.appendChild(toast);

    window.setTimeout(() => {
      toast.classList.add('toast-fade');
      window.setTimeout(() => {
        toast.remove();
      }, 500);
    }, 4000);
  }

  private triggerJiggle(element: HTMLElement): void {
    element.classList.remove('jiggle-bounce');
    // Force reflow
    void element.offsetWidth;
    element.classList.add('jiggle-bounce');
  }

  public clear(): void {
    if (this.userClearTimer) clearTimeout(this.userClearTimer);
    if (this.coStarClearTimer) clearTimeout(this.coStarClearTimer);
    this.userBox.classList.add('hidden');
    this.coStarBox.classList.add('hidden');
    this.userTextEl.textContent = '';
    this.coStarTextEl.textContent = '';
  }
}

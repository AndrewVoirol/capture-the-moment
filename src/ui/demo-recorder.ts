/**
 * Demo Recorder for 30-Second Stage Performance
 * - Mixes 60fps WebGPU Canvas stream with multi-track mixed audio (User Mic + Co-Star Voice)
 * - Records directly to WebM/MP4
 * - Automatic download upon stop
 */

export class DemoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording: boolean = false;
  private timerId: number | null = null;
  private startTime: number = 0;
  private onTickCallback: ((formattedTime: string, seconds: number) => void) | null = null;

  constructor() {}

  public get recording(): boolean {
    return this.isRecording;
  }

  /**
   * Start recording canvas + mixed audio
   */
  public start(
    canvas: HTMLCanvasElement,
    mixedAudioStream: MediaStream | null,
    onTick: (formattedTime: string, seconds: number) => void
  ): boolean {
    if (this.isRecording) return false;

    this.onTickCallback = onTick;
    this.recordedChunks = [];

    try {
      // 1. Capture WebGPU canvas stream at 60fps
      const canvasStream = canvas.captureStream(60);

      // 2. Mix with audio tracks if available
      const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
      if (mixedAudioStream) {
        const audioTracks = mixedAudioStream.getAudioTracks();
        combinedTracks.push(...audioTracks);
      }

      const combinedStream = new MediaStream(combinedTracks);

      // 3. Determine best supported mime type
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
      ];
      let selectedMime = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      const options: MediaRecorderOptions = selectedMime ? { mimeType: selectedMime } : {};
      this.mediaRecorder = new MediaRecorder(combinedStream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.finishDownload(selectedMime);
      };

      this.mediaRecorder.start(250); // Emit slice every 250ms
      this.isRecording = true;
      this.startTime = Date.now();

      this.timerId = window.setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
        const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const secs = String(elapsedSec % 60).padStart(2, '0');
        if (this.onTickCallback) {
          this.onTickCallback(`${mins}:${secs}`, elapsedSec);
        }
      }, 1000);

      return true;
    } catch (err) {
      console.error('[DemoRecorder] Failed to start recording:', err);
      return false;
    }
  }

  /**
   * Stop recording and download file
   */
  public stop(): void {
    if (!this.isRecording || !this.mediaRecorder) return;

    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    this.isRecording = false;
    this.mediaRecorder.stop();
  }

  private finishDownload(mimeType: string): void {
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(this.recordedChunks, { type: mimeType || 'video/webm' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `autumn-sketchbook-demo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 1000);
  }
}

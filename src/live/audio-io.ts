/**
 * Audio I/O Manager for Gemini Multimodal Live API
 * - Uses a unified AudioContext for hardware-native audio output & capture
 * - Captures mic input and cleanly downsamples to 16kHz PCM 16-bit little-endian
 * - Decodes and plays 24kHz PCM chunks from Gemini with gapless scheduling
 * - Handles immediate barge-in interruption (stops queued playback)
 * - Mixes mic + co-star speaker audio for demo recording
 */

export class AudioIO {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private muteGain: GainNode | null = null;
  private micBoostGain: GainNode | null = null;

  // Output playback scheduling
  private nextPlayTime: number = 0;
  private lastPlaybackEndTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private coStarGain: GainNode | null = null;
  private isMicMuted: boolean = false;

  // Recording mix destination
  private recordDestination: MediaStreamAudioDestinationNode | null = null;

  private onAudioChunkCallback: ((base64Pcm: string) => void) | null = null;

  constructor() {}

  /**
   * Initialize audio context and request mic synchronously on user click to satisfy browser Autoplay Policy
   */
  public async initUserAudio(): Promise<void> {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    // Single unified AudioContext for hardware output, capture, and mixing
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioCtx();
      this.coStarGain = null;
      this.recordDestination = null;
      this.micSource = null;
    }

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    // Co-Star speaker gain
    if (!this.coStarGain) {
      this.coStarGain = this.audioCtx.createGain();
      this.coStarGain.gain.value = 1.0;
      this.coStarGain.connect(this.audioCtx.destination);
    }

    // Setup recording destination for mixed audio (Co-Star + User Mic)
    if (!this.recordDestination) {
      this.recordDestination = this.audioCtx.createMediaStreamDestination();
      this.coStarGain.connect(this.recordDestination);
    }

    // Get microphone stream
    if (!this.micStream) {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    }

    // Attach mic source to unified context and route to recorder
    if (!this.micSource && this.micStream) {
      this.micSource = this.audioCtx.createMediaStreamSource(this.micStream);
      const micRecGain = this.audioCtx.createGain();
      micRecGain.gain.value = 1.0;
      this.micSource.connect(micRecGain);
      micRecGain.connect(this.recordDestination);
    }
  }

  /**
   * Start microphone capture and stream 16kHz PCM chunks to Gemini Live
   */
  public async startInput(onChunk: (base64Pcm: string) => void): Promise<void> {
    this.onAudioChunkCallback = onChunk;
    await this.initUserAudio();

    if (!this.audioCtx || !this.micSource) return;

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    // Buffer of 2048 samples (~42ms at 48kHz)
    const bufferSize = 2048;
    this.scriptProcessor = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);
    const nativeSampleRate = this.audioCtx.sampleRate;

    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.onAudioChunkCallback) return;
      // Acoustic echo gating: drop mic chunks while Co-Star audio is playing out of speakers
      if (this.isMicMuted || this.isCoStarAudioActive()) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const downsampled = this.downsampleTo16k(inputData, nativeSampleRate);
      const pcm16 = this.floatTo16BitPCM(downsampled);
      const base64 = this.arrayBufferToBase64(pcm16.buffer);
      this.onAudioChunkCallback(base64);
    };

    // Prevent local speaker feedback while maintaining processing loop
    this.muteGain = this.audioCtx.createGain();
    this.muteGain.gain.value = 0.0;

    // Boost microphone signal (2.0x / +6dB) for clear speech detection
    if (this.micBoostGain) {
      this.micBoostGain.disconnect();
      this.micBoostGain = null;
    }
    this.micBoostGain = this.audioCtx.createGain();
    this.micBoostGain.gain.value = 2.0;

    this.micSource.connect(this.micBoostGain);
    this.micBoostGain.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.muteGain);
    this.muteGain.connect(this.audioCtx.destination);
  }

  /**
   * Check if Co-Star audio is currently playing or recently finished,
   * providing an acoustic decay hangover (default 400ms) so room reverberation
   * does not leak back into the microphone.
   */
  public isCoStarAudioActive(decaySeconds: number = 0.4): boolean {
    if (!this.audioCtx) return false;
    const now = this.audioCtx.currentTime;
    if (this.activeSources.length > 0) return true;
    if (this.nextPlayTime > now) return true;
    if (this.lastPlaybackEndTime + decaySeconds > now) return true;
    return false;
  }

  public setMicMuted(muted: boolean): void {
    this.isMicMuted = muted;
  }

  public getMicMuted(): boolean {
    return this.isMicMuted;
  }

  /**
   * Queue and play 24kHz PCM chunk received from Gemini Live API
   */
  public playAudioChunk(base64Pcm: string): void {
    if (!this.audioCtx || !this.coStarGain) return;
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(console.error);
    }

    try {
      const pcmData = this.base64To16BitPCM(base64Pcm);
      const floatData = this.pcm16ToFloat(pcmData);

      // Web Audio API automatically resamples from 24kHz buffer to native output rate
      const buffer = this.audioCtx.createBuffer(1, floatData.length, 24000);
      buffer.getChannelData(0).set(floatData);

      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.coStarGain);

      const now = this.audioCtx.currentTime;
      const startTime = Math.max(now + 0.015, this.nextPlayTime);
      source.start(startTime);
      this.nextPlayTime = startTime + buffer.duration;
      this.lastPlaybackEndTime = Math.max(this.lastPlaybackEndTime, this.nextPlayTime);

      this.activeSources.push(source);
      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
        if (this.audioCtx) {
          this.lastPlaybackEndTime = Math.max(this.lastPlaybackEndTime, this.audioCtx.currentTime);
        }
      };
    } catch (err) {
      console.error('Error playing audio chunk:', err);
    }
  }

  /**
   * Stop all playing and scheduled co-star audio immediately (Barge-in interruption)
   */
  public stopPlayback(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source may already be ended
      }
    }
    this.activeSources = [];
    if (this.audioCtx) {
      this.nextPlayTime = this.audioCtx.currentTime;
      this.lastPlaybackEndTime = 0;
    }
  }

  /**
   * Get mixed audio stream for DemoRecorder (User Mic + Co-Star Audio)
   */
  public getMixedAudioStream(): MediaStream | null {
    return this.recordDestination ? this.recordDestination.stream : null;
  }

  /**
   * Stop microphone capture and clean up all audio resources
   */
  public stop(): void {
    this.stopPlayback();

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.muteGain) {
      this.muteGain.disconnect();
      this.muteGain = null;
    }
    if (this.micBoostGain) {
      this.micBoostGain.disconnect();
      this.micBoostGain = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.coStarGain) {
      this.coStarGain.disconnect();
      this.coStarGain = null;
    }
    this.recordDestination = null;

    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    this.onAudioChunkCallback = null;
    this.nextPlayTime = 0;
    this.lastPlaybackEndTime = 0;
    this.isMicMuted = false;
  }

  // Conversion Helpers
  private downsampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
    if (inputSampleRate === 16000) return input;
    const ratio = inputSampleRate / 16000;
    const outputLength = Math.round(input.length / ratio);
    const result = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const srcIdx = i * ratio;
      const idx0 = Math.floor(srcIdx);
      const idx1 = Math.min(idx0 + 1, input.length - 1);
      const frac = srcIdx - idx0;
      result[i] = input[idx0] * (1 - frac) + input[idx1] * frac;
    }
    return result;
  }

  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  private pcm16ToFloat(input: Int16Array): Float32Array {
    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      output[i] = input[i] / 32768;
    }
    return output;
  }

  private arrayBufferToBase64(buffer: ArrayBufferLike): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64To16BitPCM(base64: string): Int16Array {
    const binary = window.atob(base64);
    const byteLength = binary.length - (binary.length % 2);
    const buffer = new ArrayBuffer(byteLength);
    const view = new DataView(buffer);
    for (let i = 0; i < byteLength; i += 2) {
      const low = binary.charCodeAt(i);
      const high = binary.charCodeAt(i + 1);
      view.setInt16(i, low | (high << 8), true);
    }
    return new Int16Array(buffer);
  }
}

/**
 * Gemini Multimodal Live API WebSocket Client
 * - Establishes stateful Bidi WebSocket connection
 * - Streams 16kHz PCM audio chunks from user mic
 * - Streams periodic 1fps WebGPU canvas frame captures
 * - Receives 24kHz PCM audio chunks & dispatches to AudioIO
 * - Dispatches tool calls (palette, wind, flurry, evoke, capture)
 * - Streams user and co-star transcripts to CaptionOverlay
 */

import { AudioIO } from './audio-io';

export interface LiveToolHandler {
  changePalette: (palette: 'vermilion' | 'gold' | 'ginkgo' | 'woodland' | 'twilight') => { success: boolean; active: string };
  triggerWindGust: (strength?: number) => { success: boolean; gustForce: number };
  spawnFlurry: (count?: number) => { success: boolean; spawnedCount: number };
  drawPencilStroke: (shape?: 'leaf' | 'signature' | 'circle' | 'spiral') => { success: boolean; shape: string };
  evokeInscription: () => { success: boolean };
  captureArtwork: () => { success: boolean };
}

export interface LiveClientCallbacks {
  onStatusChange: (status: 'disconnected' | 'connecting' | 'connected' | 'error', errorMsg?: string) => void;
  onUserTranscript: (text: string) => void;
  onCoStarTranscript: (text: string, isChunk?: boolean) => void;
  onCoStarSpeakingChange: (speaking: boolean) => void;
  onToolExecuted?: (name: string, description: string) => void;
  onMicMuteChange?: (muted: boolean) => void;
}

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private audioIO: AudioIO;
  private toolHandler: LiveToolHandler;
  private callbacks: LiveClientCallbacks;

  private isConnected: boolean = false;
  private isConnecting: boolean = false;
  private videoFrameIntervalId: number | null = null;
  private getCanvasFrameCallback: (() => string | null) | null = null;

  private currentVoice: string = 'Capella'; // Authentic British accent
  private currentModel: string = 'models/gemini-3.8-live';
  private lastApiKey: string = '';
  private isCoStarSpeaking: boolean = false;
  private lastCoStarText: string = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private speechRec: any = null;
  private lastSpokenSentText: string = '';
  private speechSilenceTimer: number | null = null;
  private pendingSpokenText: string = '';

  constructor(
    toolHandler: LiveToolHandler,
    callbacks: LiveClientCallbacks
  ) {
    this.audioIO = new AudioIO();
    this.toolHandler = toolHandler;
    this.callbacks = callbacks;
  }

  public setVoice(voice: string) {
    this.currentVoice = voice;
  }

  public setModel(model: string) {
    this.currentModel = model;
  }

  public getModel(): string {
    return this.currentModel;
  }

  public getAudioIO(): AudioIO {
    return this.audioIO;
  }

  public interrupt(): void {
    console.log('[Gemini Live] Barge-in/interrupt triggered.');
    this.audioIO.stopPlayback();
    this.setCoStarSpeaking(false);
  }

  public toggleMicMute(): boolean {
    const newMuted = !this.audioIO.getMicMuted();
    this.audioIO.setMicMuted(newMuted);
    if (this.callbacks.onMicMuteChange) {
      this.callbacks.onMicMuteChange(newMuted);
    }
    return newMuted;
  }

  public isMicMuted(): boolean {
    return this.audioIO.getMicMuted();
  }

  public async connect(
    apiKey: string,
    getCanvasFrame: () => string | null
  ): Promise<void> {
    if (this.isConnected || this.isConnecting) return;

    if (!apiKey || apiKey.trim() === '') {
      this.callbacks.onStatusChange('error', 'Gemini API Key is missing.');
      return;
    }

    this.isConnecting = true;
    this.callbacks.onStatusChange('connecting');
    this.getCanvasFrameCallback = getCanvasFrame;
    this.lastApiKey = apiKey.trim();

    // Use v1beta GenerativeService BidiGenerateContent endpoint
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.lastApiKey}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[Gemini Live] WebSocket opened using ${this.currentModel}. Sending setup payload...`);
        this.sendSetup();
      };

      this.ws.onmessage = async (event: MessageEvent) => {
        let rawData: string;
        if (event.data instanceof Blob) {
          rawData = await event.data.text();
        } else {
          rawData = event.data;
        }

        try {
          const msg = JSON.parse(rawData);
          await this.handleServerMessage(msg);
        } catch (err) {
          console.error('[Gemini Live] Failed to parse message:', err, rawData);
        }
      };

      this.ws.onerror = (e) => {
        console.error('[Gemini Live] WebSocket error:', e);
        this.callbacks.onStatusChange('error', 'Connection error occurred.');
      };

      this.ws.onclose = (event) => {
        console.warn('[Gemini Live] WebSocket closed:', event.code, event.reason);
        const wasConnected = this.isConnected;
        this.cleanup();

        if (!wasConnected || event.code !== 1000) {
          let errorMsg = event.reason;
          if (!errorMsg || errorMsg.trim() === '') {
            if (event.code === 1007) {
              errorMsg = 'API Key not valid for Gemini Live API';
            } else if (event.code === 1008) {
              errorMsg = 'Policy or setup parameter error';
            } else if (event.code === 1006) {
              errorMsg = 'Connection closed abruptly (check API key / model)';
            } else {
              errorMsg = `Connection closed (${event.code})`;
            }
          }
          this.callbacks.onStatusChange('error', errorMsg);
        } else {
          this.callbacks.onStatusChange('disconnected');
        }
      };
    } catch (err) {
      console.error('[Gemini Live] Connection initialization failed:', err);
      this.cleanup();
      this.callbacks.onStatusChange('error', String(err));
    }
  }

  public disconnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close error
      }
      this.ws = null;
    }
    this.cleanup();
    this.callbacks.onStatusChange('disconnected');
  }

  private cleanup(): void {
    this.isConnected = false;
    this.isConnecting = false;
    if (this.videoFrameIntervalId !== null) {
      clearInterval(this.videoFrameIntervalId);
      this.videoFrameIntervalId = null;
    }
    if (this.speechRec) {
      try {
        this.speechRec.stop();
      } catch {
        // Ignore speech rec stop error
      }
      this.speechRec = null;
    }
    if (this.speechSilenceTimer !== null) {
      window.clearTimeout(this.speechSilenceTimer);
      this.speechSilenceTimer = null;
    }
    this.pendingSpokenText = '';
    this.lastSpokenSentText = '';
    this.audioIO.stop();
    this.setCoStarSpeaking(false);
  }

  private setCoStarSpeaking(speaking: boolean): void {
    this.isCoStarSpeaking = speaking;
    this.callbacks.onCoStarSpeakingChange(speaking);
  }

  private startLocalSpeechRecognition(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition ||
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      this.speechRec = new SpeechRec();
      this.speechRec.continuous = true;
      this.speechRec.interimResults = true;
      this.speechRec.lang = 'en-US';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.speechRec.onresult = (event: any) => {
        // Drop speech recognition during Co-Star speaker audio to avoid acoustic echo
        if (this.isCoStarSpeaking || this.audioIO.isCoStarAudioActive() || this.audioIO.getMicMuted()) {
          return;
        }

        let currentFinal = '';
        let currentInterim = '';
        let hasFinal = false;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (!res || !res[0]) continue;
          if (res.isFinal) {
            hasFinal = true;
            currentFinal += res[0].transcript + ' ';
          } else {
            currentInterim += res[0].transcript;
          }
        }

        const fullPhrase = (currentFinal + currentInterim).trim();
        if (fullPhrase) {
          // Check if this phrase is an echo of Co-Star's recent speech
          if (this.lastCoStarText && this.lastCoStarText.toLowerCase().includes(fullPhrase.toLowerCase())) {
            return;
          }
          this.callbacks.onUserTranscript(fullPhrase);
          this.pendingSpokenText = fullPhrase;
        }

        // Reset debounce timer on new incoming speech
        if (this.speechSilenceTimer !== null) {
          window.clearTimeout(this.speechSilenceTimer);
          this.speechSilenceTimer = null;
        }

        // If a final result was reached, commit promptly (350ms)
        // If interim results are arriving, commit after natural pause (750ms silence)
        if (this.pendingSpokenText) {
          const debounceMs = hasFinal ? 350 : 750;
          this.speechSilenceTimer = window.setTimeout(() => {
            this.commitSpokenVoice();
          }, debounceMs);
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.speechRec.onerror = (e: any) => {
        if (e.error !== 'no-speech') {
          console.log('[Web Speech] Notice:', e.error);
        }
      };

      this.speechRec.onend = () => {
        if (this.isConnected && this.speechRec) {
          try {
            this.speechRec.start();
          } catch {
            // Ignore restart error
          }
        }
      };

      this.speechRec.start();
      console.log('[Web Speech] Local user speech recognition started.');
    } catch (e) {
      console.warn('[Web Speech] Local recognition notice:', e);
    }
  }

  public commitSpokenVoice(): void {
    if (this.speechSilenceTimer !== null) {
      window.clearTimeout(this.speechSilenceTimer);
      this.speechSilenceTimer = null;
    }

    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.isCoStarSpeaking || this.audioIO.isCoStarAudioActive() || this.audioIO.getMicMuted()) return;

    const textToCommit = this.pendingSpokenText.trim();
    if (!textToCommit || textToCommit.length < 2) return;

    // Deduplication check
    const normalized = textToCommit.toLowerCase();
    if (normalized === this.lastSpokenSentText) return;

    // Avoid acoustic echo of Alastair's recent speech
    if (this.lastCoStarText && this.lastCoStarText.toLowerCase().includes(normalized)) {
      this.pendingSpokenText = '';
      return;
    }

    console.log('[Gemini Live] Dispatched spoken user command:', textToCommit);
    this.lastSpokenSentText = normalized;
    this.pendingSpokenText = '';

    // Update user transcript UI
    this.callbacks.onUserTranscript(textToCommit);

    // Send clientContent turn to Gemini Live WebSocket
    const payload = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ text: textToCommit }]
          }
        ],
        turnComplete: true
      }
    };

    this.ws.send(JSON.stringify(payload));
  }

  private sendSetup(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const systemPrompt = `You are 'Alastair', a witty, sharp-tongued, and playfully roasty British creative partner and art director co-hosting a live demonstration of 'Autumn Sketchbook', an interactive WebGPU colored pencil art experience.
You speak with authentic British flair, snappy comedic timing, and affectionate roasts like a discerning West End art critic ("Right, darling, let's see if we can rescue this composition!", "Ah, the classic 'bury my mistakes under more foliage' maneuver.", "Is that an oak leaf or did a caterpillar have an existential crisis on the paper?", "Very bold line choice, though your art teacher might weep.", "When in doubt, dazzle them with warm amber and pretend it was intentional.", "Hold onto your teacup!").
You are NOT mean or chaotic—you are funny, cheeky, and teasing about the user's artistic chops, but always supportive of the finished artwork.

CRITICAL TONE & VOCABULARY RULES:
1. STRICTLY FORBIDDEN WORDS: NEVER say "spray", "shower", "splatter", "blast", "splash", or "chaos". This is NOT a graffiti wall or spray paint; this is fine colored pencil and delicate botanical leaves drifting across cold-press paper. Describe visual changes as pencil strokes, warm amber undertones, or leaves drifting across the paper.
2. Spoken Turn Length: Keep EVERY spoken turn short, roasty, and punchy—1 or 2 sentences maximum. Quick stage banter, never monologue.
3. Multimodal Vision: You observe the WebGPU sketchbook via real-time image frames. Roast whatever the artist is sketching or whatever empty space is left on the paper.
4. PROACTIVE TOOL EXECUTION (MANDATORY):
You have direct power to control this simulation via function tools! Whenever the user asks for or mentions any of the following, YOU MUST IMMEDIATELY CALL THE MATCHING TOOL alongside your short, witty spoken reaction:
- 'changePalette': Call whenever the user asks to change colors or mentions gold, amber, yellow, crimson, red, russet, brown, violet, plum, or autumn mood.
  * 'gold': Autumn Gold (warm honey amber, ochre, sepia undertones)
  * 'vermilion': October Vermilion (crisp autumn crimson)
  * 'woodland': Deep Woodland Russet (warm earthy brown)
  * 'twilight': Twilight Frost Plum (dramatic violet frost)
- 'triggerWindGust': Call whenever the user asks for wind, breeze, blow, gust, storm, or movement. (pass strength: 1.2 to 2.0).
- 'spawnFlurry': Call whenever the user asks for leaves, drift, flurry, canopy, foliage, or 'more leaves'. (pass count: 30 to 80).
- 'drawPencilStroke': Call whenever the user asks you to draw, sketch, sign, doodle, or add pencil marks to the paper. (pass shape: 'signature' to sign in the top margin away from the ground leaves, 'leaf', 'circle', or 'spiral').
- 'evokeInscription': Call whenever the user asks for writing, cursive, calligraphy, words, poetry, or 'capture the moment'.
- 'captureArtwork': Call whenever the user asks to take a photo, snapshot, screenshot, save, or frame the art for exhibition.

RULE: When responding to a request, ALWAYS execute the function tool in that turn! Never just say you will do it—fire the tool!
FIRST TURN EXCEPTION: On your very first greeting turn, DO NOT execute any tool. Give a snappy, pleasantly roasty British greeting to the user, poke gentle fun at the canvas (e.g. asking if they're still working up the courage to make a mark), and ask what they want to direct first!`;

    const setupPayload = {
      setup: {
        model: this.currentModel,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.currentVoice
              }
            }
          }
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'changePalette',
                description: 'Switches the color scheme of the autumn simulation to warm autumn gold, crisp crimson red, russet brown, or violet plum.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    palette: {
                      type: 'STRING',
                      description: "The palette: 'gold' (Autumn Gold / warm amber ochre), 'vermilion' (October Crimson), 'woodland' (Deep Woodland Russet), or 'twilight' (Twilight Frost Plum).",
                      enum: ['gold', 'vermilion', 'woodland', 'twilight']
                    }
                  },
                  required: ['palette']
                }
              },
              {
                name: 'triggerWindGust',
                description: 'Blows a strong autumn gust across the canvas to rustle and swirl leaves.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    strength: {
                      type: 'NUMBER',
                      description: 'Wind strength multiplier between 1.0 and 2.0.'
                    }
                  }
                }
              },
              {
                name: 'spawnFlurry',
                description: 'Releases a flurry or drift of colored pencil autumn leaves from the canopy.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    count: {
                      type: 'INTEGER',
                      description: 'Number of leaves to spawn (25 to 80).'
                    }
                  }
                }
              },
              {
                name: 'drawPencilStroke',
                description: 'Uses the colored pencil to sketch directly on the cold-press paper canvas (e.g. signing Alastair\'s signature at the top of the sketchbook, sketching a botanical leaf contour, drawing a critique circle, or drawing a wind spiral).',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    shape: {
                      type: 'STRING',
                      description: "What to sketch: 'signature' (Alastair's artist signature flourish in the upper margin clear of ground leaves), 'leaf' (botanical leaf contour with veins in upper sketchbook area), 'circle' (an expressive critique circle), or 'spiral' (a windy spiral flourish).",
                      enum: ['signature', 'leaf', 'circle', 'spiral']
                    }
                  }
                }
              },
              {
                name: 'evokeInscription',
                description: "Commands airborne leaves to swirl into cursive calligraphy spelling 'capture the moment'.",
                parameters: {
                  type: 'OBJECT',
                  properties: {}
                }
              },
              {
                name: 'captureArtwork',
                description: 'Triggers the mechanical camera shutter, flash, and opens the framed exhibition gallery.',
                parameters: {
                  type: 'OBJECT',
                  properties: {}
                }
              }
            ]
          }
        ]
      }
    };

    this.ws.send(JSON.stringify(setupPayload));
  }

  private startCanvasStreaming(): void {
    if (this.videoFrameIntervalId !== null) {
      clearInterval(this.videoFrameIntervalId);
    }

    // Stream 1 frame every 1000ms
    this.videoFrameIntervalId = window.setInterval(() => {
      if (!this.isConnected || !this.getCanvasFrameCallback) return;
      const base64Jpeg = this.getCanvasFrameCallback();
      if (base64Jpeg) {
        this.sendVideoFrame(base64Jpeg);
      }
    }, 1000);
  }

  public sendAudioChunk(pcmBase64: string): void {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // Acoustic echo suppression: do NOT stream mic audio while Co-Star audio is active or mic is muted
    if (this.isCoStarSpeaking || this.audioIO.isCoStarAudioActive() || this.audioIO.getMicMuted()) return;

    const payload = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'audio/pcm;rate=16000',
            data: pcmBase64
          }
        ]
      }
    };

    this.ws.send(JSON.stringify(payload));
  }

  public sendVideoFrame(base64Jpeg: string): void {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const payload = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'image/jpeg',
            data: base64Jpeg
          }
        ]
      }
    };

    this.ws.send(JSON.stringify(payload));
  }

  public sendUserText(text: string): void {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    if (this.speechSilenceTimer !== null) {
      window.clearTimeout(this.speechSilenceTimer);
      this.speechSilenceTimer = null;
    }
    this.pendingSpokenText = '';
    this.lastSpokenSentText = text.toLowerCase();

    this.callbacks.onUserTranscript(text);

    const payload = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ text }]
          }
        ],
        turnComplete: true
      }
    };

    this.ws.send(JSON.stringify(payload));
  }

  private async handleServerMessage(msg: Record<string, unknown>): Promise<void> {
    // 0. Check for Server Error
    if (msg.error) {
      console.error('[Gemini Live] Server error message:', msg.error);
      const errObj = msg.error as Record<string, unknown>;
      const errMsg = String(errObj.message || errObj.status || 'API Error');
      this.callbacks.onStatusChange('error', errMsg);
      this.disconnect();
      return;
    }

    // 1. Handshake response
    if (msg.setupComplete) {
      console.log('[Gemini Live] Setup complete. Active session ready.');
      this.isConnected = true;
      this.isConnecting = false;
      this.callbacks.onStatusChange('connected');

      // Start local speech recognition for immediate user captions
      this.startLocalSpeechRecognition();

      // Begin microphone audio streaming
      try {
        await this.audioIO.startInput((pcmBase64) => {
          this.sendAudioChunk(pcmBase64);
        });
      } catch (err) {
        console.error('[Gemini Live] Microphone access failed:', err);
        this.disconnect();
        this.callbacks.onStatusChange('error', 'Microphone access denied');
        return;
      }

      // Send immediate initial canvas snapshot so Gemini has visual context
      if (this.getCanvasFrameCallback) {
        const initialFrame = this.getCanvasFrameCallback();
        if (initialFrame) {
          console.log('[Gemini Live] Sending initial canvas frame, length:', initialFrame.length);
          this.sendVideoFrame(initialFrame);
        }
      }

      // Begin periodic canvas frame streaming (1 frame / 1.5s)
      this.startCanvasStreaming();

      // Kick off conversational turn so Co-Star introduces itself immediately
      this.sendInitialGreeting();
      return;
    }

    // 2. Server Content (Audio, Text, Transcripts, Interruption)
    const serverContent = msg.serverContent as Record<string, unknown> | undefined;
    const modelTurn = serverContent?.modelTurn as { parts?: Array<Record<string, unknown>> } | undefined;

    if (serverContent) {
      // Barge-in: user interrupted the model
      if (serverContent.interrupted) {
        console.log('[Gemini Live] Barge-in detected: interrupting playback.');
        this.audioIO.stopPlayback();
        this.setCoStarSpeaking(false);
      }

      // Model speech audio & text parts
      if (modelTurn?.parts) {
        for (const part of modelTurn.parts) {
          if (part.inlineData) {
            const inlineData = part.inlineData as { mimeType?: string; data?: string };
            if (inlineData.data && inlineData.mimeType?.startsWith('audio/pcm')) {
              console.log('[Gemini Live] Received audio chunk bytes:', inlineData.data.length);
              this.setCoStarSpeaking(true);
              this.audioIO.playAudioChunk(inlineData.data);
            }
          }
          if (part.text && typeof part.text === 'string') {
            console.log('[Gemini Live] Received model text transcript:', part.text);
            this.callbacks.onCoStarTranscript(part.text);
          }
        }
      }

      // Input user speech transcription
      const inputTranscription = (serverContent.inputTranscription || serverContent.inputAudioTranscription) as { text?: string } | undefined;
      if (inputTranscription?.text) {
        console.log('[Gemini Live] Input user transcript:', inputTranscription.text);
        this.callbacks.onUserTranscript(inputTranscription.text);
      }

      // Output co-star speech transcription (streamed in realtime chunks)
      const outputTranscription = (serverContent.outputTranscription || serverContent.outputAudioTranscription) as { text?: string } | undefined;
      if (outputTranscription?.text) {
        console.log('[Gemini Live] Output co-star transcript chunk:', outputTranscription.text);
        this.lastCoStarText += outputTranscription.text;
        this.callbacks.onCoStarTranscript(outputTranscription.text, true);
      }

      // Turn complete flag
      if (serverContent.turnComplete) {
        console.log('[Gemini Live] Model turn complete.');
        this.setCoStarSpeaking(false);
        this.lastSpokenSentText = '';
        setTimeout(() => { this.lastCoStarText = ''; }, 2000);
      }
    }

    // 3. Tool Calls (Function Calling)
    // Check top-level toolCall / tool_call
    const rawToolCall = (msg.toolCall || (msg as Record<string, unknown>).tool_call) as
      | { functionCalls?: Array<{ id?: string; name: string; args?: Record<string, unknown> }>;
          function_calls?: Array<{ id?: string; name: string; args?: Record<string, unknown> }> }
      | undefined;

    const functionCalls: Array<{ id?: string; name: string; args?: Record<string, unknown> }> = [];
    if (rawToolCall?.functionCalls) {
      functionCalls.push(...rawToolCall.functionCalls);
    } else if (rawToolCall?.function_calls) {
      functionCalls.push(...rawToolCall.function_calls);
    }

    // Also check if functionCall is embedded in serverContent.modelTurn.parts
    if (modelTurn?.parts) {
      for (const part of modelTurn.parts) {
        const fc = (part.functionCall || (part as Record<string, unknown>).function_call) as
          | { id?: string; name: string; args?: Record<string, unknown> }
          | undefined;
        if (fc && fc.name) {
          functionCalls.push(fc);
        }
      }
    }

    if (functionCalls.length > 0) {
      this.executeToolCalls(functionCalls);
    }
  }

  private sendInitialGreeting(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    console.log('[Gemini Live] Sending initial greeting turn trigger...');
    const greetingPayload = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: "Hello Alastair! Give a snappy, delightfully roasty British welcome to the user, poke gentle fun at whatever is on the paper, and ask what they plan to direct first!"
              }
            ]
          }
        ],
        turnComplete: true
      }
    };

    this.ws.send(JSON.stringify(greetingPayload));
  }

  private executeToolCalls(calls: Array<{ id?: string; name: string; args?: Record<string, unknown> }>): void {
    const responses = [];

    for (const call of calls) {
      const callId = call.id || (call as Record<string, unknown>).call_id as string || `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      console.log(`[Gemini Live] Executing tool call: ${call.name} (id: ${callId})`, call.args);
      let output: Record<string, unknown> = { success: true };
      let toolDesc = '';

      try {
        if (call.name === 'changePalette') {
          let pal = String(call.args?.palette || 'gold').toLowerCase();
          if (pal.includes('gold') || pal.includes('ginkgo') || pal.includes('yellow') || pal.includes('amber')) pal = 'gold';
          else if (pal.includes('red') || pal.includes('vermilion') || pal.includes('crimson')) pal = 'vermilion';
          else if (pal.includes('wood') || pal.includes('russet') || pal.includes('brown') || pal.includes('earth')) pal = 'woodland';
          else if (pal.includes('twilight') || pal.includes('plum') || pal.includes('purple') || pal.includes('violet') || pal.includes('frost')) pal = 'twilight';
          else pal = 'gold';

          const palNames: Record<string, string> = {
            gold: 'Autumn Gold',
            ginkgo: 'Autumn Gold',
            vermilion: 'October Vermilion',
            woodland: 'Woodland Russet',
            twilight: 'Twilight Frost'
          };
          toolDesc = `Switched palette to ${palNames[pal] || pal}`;
          output = this.toolHandler.changePalette(pal as 'vermilion' | 'gold' | 'ginkgo' | 'woodland' | 'twilight');
        } else if (call.name === 'triggerWindGust') {
          const strength = typeof call.args?.strength === 'number' ? call.args.strength : 1.5;
          toolDesc = `Swept autumn wind gust (${strength.toFixed(1)}x)`;
          output = this.toolHandler.triggerWindGust(strength);
        } else if (call.name === 'spawnFlurry') {
          const count = typeof call.args?.count === 'number' ? call.args.count : 50;
          toolDesc = `Released flurry of ${count} leaves`;
          output = this.toolHandler.spawnFlurry(count);
        } else if (call.name === 'drawPencilStroke') {
          const shape = (call.args?.shape as 'leaf' | 'signature' | 'circle' | 'spiral') || 'leaf';
          toolDesc = `Sketched pencil ${shape} on paper`;
          output = this.toolHandler.drawPencilStroke(shape);
        } else if (call.name === 'evokeInscription') {
          toolDesc = `Inscribed 'capture the moment' in cursive`;
          output = this.toolHandler.evokeInscription();
        } else if (call.name === 'captureArtwork') {
          toolDesc = `Snapped camera photo & opened exhibition frame`;
          output = this.toolHandler.captureArtwork();
        } else {
          output = { error: `Unknown tool: ${call.name}` };
          toolDesc = `Triggered ${call.name}`;
        }
      } catch (e) {
        output = { error: String(e) };
        toolDesc = `Failed ${call.name}: ${e}`;
      }

      if (this.callbacks.onToolExecuted) {
        this.callbacks.onToolExecuted(call.name, toolDesc);
      }

      responses.push({
        id: callId,
        name: call.name,
        response: {
          result: output,
          output: output
        }
      });
    }

    // Send toolResponse back to Gemini Live WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const responsePayload = {
        toolResponse: {
          functionResponses: responses
        }
      };
      console.log('[Gemini Live] Sending toolResponse payload:', responsePayload);
      this.ws.send(JSON.stringify(responsePayload));
    }
  }
}

/**
 * ABDMCX0X -- BridgeWasm.ts
 * Connects the WebUI to the C++20 McxEngine compiled to WebAssembly via AudioWorkletNode.
 * Auto-unlocks AudioContext on first user gesture (pointerdown / keydown).
 */

export interface McxTelemetry {
  peakL: number;
  peakR: number;
  activeVoices: number;
  samplesL?: Float32Array;
  peakSendA?: number;
  peakSendB?: number;
  peakSendC?: number;
  peakSendD?: number;
  limiterGrDb?: number;
  sendBusMutes?: boolean[];
  sendLabels?: { sendA: string; sendB: string; sendC: string; sendD: string };
  partPeaks?: number[];
  partMidiPeaks?: number[];
  lfoPhase?: number;
}

export class BridgeWasm {
  private audioCtx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private isReady = false;
  private initPromise: Promise<boolean> | null = null;
  private pending: Array<Record<string, unknown>> = [];
  private onTelemetryCb: ((t: McxTelemetry) => void) | null = null;
  private onStatusCb: ((status: 'idle' | 'loading' | 'ready' | 'error', detail?: string) => void) | null = null;
  private onBankLoadedCb: ((ok: boolean, sizeBytes: number) => void) | null = null;

  constructor() {
    this.attachFirstGestureUnlock();
  }

  public get ready(): boolean { return this.isReady; }
  public get sampleRate(): number { return this.audioCtx?.sampleRate ?? 48000; }
  public onTelemetry(cb: (t: McxTelemetry) => void): void { this.onTelemetryCb = cb; }
  public onStatus(cb: (s: 'idle' | 'loading' | 'ready' | 'error', d?: string) => void): void { this.onStatusCb = cb; }
  public onBankLoaded(cb: (ok: boolean, sizeBytes: number) => void): void { this.onBankLoadedCb = cb; }

  private attachFirstGestureUnlock(): void {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      const isNative = Boolean((window as any).__JUCE__?.backend || (window as any).chrome?.webview?.postMessage);
      if (!isNative) void this.initAudio();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  public async initAudio(): Promise<boolean> {
    if (this.isReady) {
      if (this.audioCtx?.state === 'suspended') await this.audioCtx.resume().catch(() => {});
      return true;
    }
    if (this.initPromise) return this.initPromise;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (typeof AudioCtx !== 'function') return false;

    this.onStatusCb?.('loading');
    this.initPromise = this.bootPipeline(AudioCtx);
    try {
      return await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async fetchFirst(urls: string[]): Promise<Response> {
    let lastErr: unknown;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) return res;
      } catch (e) { lastErr = e; }
    }
    throw lastErr ?? new Error('Unable to fetch WASM binary');
  }

  private async addWorkletFirst(ctx: AudioContext, urls: string[]): Promise<void> {
    let lastErr: unknown;
    for (const url of urls) {
      try {
        await ctx.audioWorklet.addModule(url);
        return;
      } catch (e) { lastErr = e; }
    }
    throw lastErr ?? new Error('Unable to load mcx0xWorklet.js');
  }

  private async bootPipeline(AudioCtx: typeof AudioContext): Promise<boolean> {
    try {
      const ctx = new AudioCtx({ latencyHint: 'interactive' });
      this.audioCtx = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      await this.addWorkletFirst(ctx, ['./wasm/mcx0xWorklet.js', '/wasm/mcx0xWorklet.js', './src/wasm/mcx0xWorklet.js']);
      const wasmRes = await this.fetchFirst(['./wasm/mcx0x_dsp.wasm', '/wasm/mcx0x_dsp.wasm', './src/wasm/mcx0x_dsp.wasm']);
      const wasmBinary = await wasmRes.arrayBuffer();

      const node = new AudioWorkletNode(ctx, 'mcx0x-worklet-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.workletNode = node;
      node.connect(ctx.destination);

      return await new Promise<boolean>((resolve) => {
        node.port.onmessage = (ev) => {
          const msg = ev.data;
          if (!msg) return;
          if (msg.type === 'WASM_READY') {
            this.isReady = true;
            this.onStatusCb?.('ready', `${msg.sampleRate} Hz`);
            for (const queued of this.pending) node.port.postMessage(queued);
            this.pending = [];
            resolve(true);
          } else if (msg.type === 'WASM_ERROR') {
            this.onStatusCb?.('error', msg.message);
            resolve(false);
          } else if (msg.type === 'TELEMETRY') {
            this.onTelemetryCb?.({
              peakL: msg.peakL,
              peakR: msg.peakR,
              activeVoices: msg.activeVoices,
              samplesL: msg.samplesL,
              partPeaks: Array.isArray(msg.partPeaks) ? msg.partPeaks : undefined,
              partMidiPeaks: Array.isArray(msg.partMidiPeaks) ? msg.partMidiPeaks : undefined,
              lfoPhase: msg.lfoPhase,
            });
          } else if (msg.type === 'BANK_LOADED') {
            this.onBankLoadedCb?.(Boolean(msg.ok), Number(msg.sizeBytes || 0));
          }
        };
        node.port.postMessage({ type: 'INIT_WASM', binary: wasmBinary, sampleRate: ctx.sampleRate }, [wasmBinary]);
      });
    } catch (err: any) {
      this.onStatusCb?.('error', String(err?.message || err));
      return false;
    }
  }

  public post(msg: Record<string, unknown>, transfer?: Transferable[]): void {
    if (this.isReady && this.workletNode) {
      if (this.audioCtx?.state === 'suspended') void this.audioCtx.resume().catch(() => {});
      this.workletNode.port.postMessage(msg, transfer ?? []);
    } else {
      if (this.pending.length < 128) this.pending.push(msg);
      if (msg.type === 'NOTE_ON') void this.initAudio();
    }
  }

  public noteOn(part: number, note: number, velocity = 0.85): void { this.post({ type: 'NOTE_ON', part, note, velocity }); }
  public noteOff(part: number, note: number): void { this.post({ type: 'NOTE_OFF', part, note }); }
  public allNotesOff(): void { this.post({ type: 'ALL_NOTES_OFF' }); }
  public setPartParam(part: number, paramId: number, value: number): void { this.post({ type: 'SET_PARAM', part, paramId, value }); }
  public setTempo(bpm: number): void { this.post({ type: 'SET_TEMPO', bpm }); }
  public setMasterVolume(volume: number): void { this.post({ type: 'SET_MASTER_VOLUME', volume }); }
  public resetToFactory(): void { this.post({ type: 'RESET_FACTORY' }); }
  public loadBankBuffer(buffer: ArrayBuffer): void { this.post({ type: 'LOAD_BANK', buffer }, [buffer]); }
}

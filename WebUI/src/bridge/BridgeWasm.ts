/**
 * ABDMCX0X -- BridgeWasm.ts
 * Connects the WebUI to the C++20 McxEngine compiled to WebAssembly via AudioWorkletNode.
 */

import { parseTelemetryPayload, type McxPartEngineStateDto, type McxTelemetry } from './BridgeWasmTypes';

export type {
  McxTelemetry,
  McxEngineDescriptorDto,
  McxPartPresetsDto,
  McxPartEngineStateDto,
  McxSceneSlotDto,
  McxSongBlockDto,
  McxSongScenesStateDto,
} from './BridgeWasmTypes';

export class BridgeWasm {
  private audioCtx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private isReady = false;
  private initPromise: Promise<boolean> | null = null;
  private pending: Array<{ msg: Record<string, unknown>; transfer?: Transferable[] }> = [];
  private onTelemetryCb: ((t: McxTelemetry) => void) | null = null;
  private onStatusCb: ((status: 'idle' | 'loading' | 'ready' | 'error', detail?: string) => void) | null = null;
  private onBankLoadedCb: ((ok: boolean, sizeBytes: number) => void) | null = null;
  private onPartEngineStateCb: ((dto: McxPartEngineStateDto) => void) | null = null;
  private onSongScenesStateCb: ((stateJson: string) => void) | null = null;
  private onMidiOutCb: ((bytes: Uint8Array) => void) | null = null;
  private onWorkletEventCb: ((msg: any) => void) | null = null;

  constructor() { this.attachFirstGestureUnlock(); }

  public get ready(): boolean { return this.isReady; }
  public get sampleRate(): number { return this.audioCtx?.sampleRate ?? 48000; }
  public onTelemetry(cb: (t: McxTelemetry) => void): void { this.onTelemetryCb = cb; }
  public onStatus(cb: (s: 'idle' | 'loading' | 'ready' | 'error', d?: string) => void): void { this.onStatusCb = cb; }
  public onBankLoaded(cb: (ok: boolean, sizeBytes: number) => void): void { this.onBankLoadedCb = cb; }
  public onPartEngineState(cb: (dto: McxPartEngineStateDto) => void): void { this.onPartEngineStateCb = cb; }
  public onSongScenesState(cb: (stateJson: string) => void): void { this.onSongScenesStateCb = cb; }
  public onMidiOut(cb: (bytes: Uint8Array) => void): void { this.onMidiOutCb = cb; }
  public onWorkletEvent(cb: (msg: any) => void): void { this.onWorkletEventCb = cb; }

  private attachFirstGestureUnlock(): void {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      const isNative = Boolean((window as any).__JUCE__?.backend || (window as any).chrome?.webview?.postMessage);
      if (isNative) {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
        return;
      }
      if (this.audioCtx?.state === 'suspended') void this.audioCtx.resume().catch(() => {});
      if (!this.isReady && !this.initPromise) void this.initAudio();
      if (this.isReady && this.audioCtx?.state === 'running') {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  public async initAudio(): Promise<boolean> {
    if (this.audioCtx?.state === 'suspended') void this.audioCtx.resume().catch(() => {});
    if (this.isReady) return true;
    if (this.initPromise) return this.initPromise;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (typeof AudioCtx !== 'function') return false;
    this.onStatusCb?.('loading');
    this.initPromise = this.bootPipeline(AudioCtx);
    try { return await this.initPromise; } finally { this.initPromise = null; }
  }

  private async fetchFirst(urls: string[]): Promise<Response> {
    let lastErr: unknown;
    for (const url of urls) {
      try { const res = await fetch(url); if (res.ok) return res; } catch (e) { lastErr = e; }
    }
    throw lastErr ?? new Error('Unable to fetch WASM binary');
  }

  private async addWorkletFirst(ctx: AudioContext, urls: string[]): Promise<void> {
    let lastErr: unknown;
    for (const url of urls) {
      try { await ctx.audioWorklet.addModule(url); return; } catch (e) { lastErr = e; }
    }
    throw lastErr ?? new Error('Unable to load mcx0xWorklet.js');
  }

  private async bootPipeline(AudioCtx: typeof AudioContext): Promise<boolean> {
    try {
      const ctx = new AudioCtx({ latencyHint: 'interactive' });
      this.audioCtx = ctx;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

      await this.addWorkletFirst(ctx, ['./wasm/mcx0xWorklet.js', '/wasm/mcx0xWorklet.js', './src/wasm/mcx0xWorklet.js']);
      const wasmRes = await this.fetchFirst(['./wasm/mcx0x_dsp.wasm', '/wasm/mcx0x_dsp.wasm', './src/wasm/mcx0x_dsp.wasm']);
      const wasmBinary = await wasmRes.arrayBuffer();

      const node = new AudioWorkletNode(ctx, 'mcx0x-worklet-processor', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      });
      this.workletNode = node;
      node.connect(ctx.destination);

      return await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          if (this.isReady) return;
          this.onStatusCb?.('error', 'WASM init timeout');
          resolve(false);
        }, 10000);
        node.port.onmessage = (ev) => {
          const msg = ev.data;
          if (!msg) return;
          if (msg.type === 'WASM_READY') {
            clearTimeout(timer);
            this.isReady = true;
            this.onStatusCb?.('ready', `${msg.sampleRate} Hz`);
            for (const q of this.pending) node.port.postMessage(q.msg, q.transfer ?? []);
            this.pending = [];
            resolve(true);
          } else if (msg.type === 'WASM_ERROR') {
            clearTimeout(timer);
            this.onStatusCb?.('error', msg.message); resolve(false);
          } else if (msg.type === 'TELEMETRY') {
            this.onTelemetryCb?.(parseTelemetryPayload(msg));
          } else if (msg.type === 'BANK_LOADED') {
            this.onBankLoadedCb?.(Boolean(msg.ok), Number(msg.sizeBytes || 0));
          } else if (msg.type === 'PART_ENGINE_STATE') {
            this.onPartEngineStateCb?.({
              part: Number(msg.part ?? 0), engineTypeId: String(msg.engineTypeId ?? ''),
              presetName: String(msg.presetName ?? ''), stateJson: String(msg.stateJson ?? ''),
            });
          } else if (msg.type === 'SONG_SCENES_STATE') {
            this.onSongScenesStateCb?.(String(msg.stateJson ?? ''));
          } else if (msg.type === 'MIDI_OUT' && msg.bytes) {
            this.onMidiOutCb?.(msg.bytes);
          } else {
            this.onWorkletEventCb?.(msg);
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
      if (this.pending.length < 128) this.pending.push({ msg, transfer });
      if (
        msg.type === 'NOTE_ON' || msg.type === 'INDEX_BANK' || msg.type === 'LOAD_BANK'
        || msg.type === 'LOAD_FACTORY_PRESET' || msg.type === 'SELECT_ENGINE'
        || msg.type === 'SET_ENGINE_PARAM' || msg.type === 'GET_ENGINE_STATE'
      ) void this.initAudio();
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
  public indexBankBuffer(buffer: ArrayBuffer): void { this.post({ type: 'INDEX_BANK', buffer }, [buffer]); }
  public setTransportPlaying(playing: boolean, resetOnStop = true): void { this.post({ type: 'SET_TRANSPORT', playing, resetOnStop }); }
  public setSequencerBars(bars: number): void { this.post({ type: 'SET_SEQ_BARS', bars }); }
  public selectPartEngineType(part: number, typeIndex: number): void { this.post({ type: 'SELECT_ENGINE', part, typeIndex }); }
  public loadFactoryPreset(part: number, presetIndex: number): void { this.post({ type: 'LOAD_FACTORY_PRESET', part, presetIndex }); }
  public setPartEngineParam(part: number, key: string, value: number): void { this.post({ type: 'SET_ENGINE_PARAM', part, key, value }); }
  public requestPartEngineState(part: number): void { this.post({ type: 'GET_ENGINE_STATE', part }); }
  public setPartEngineStateJson(part: number, stateJson: string): void { this.post({ type: 'SET_ENGINE_STATE_JSON', part, stateJson }); }
  public loadBankItemOnDemand(
    part: number, bankSlot: number, kind: 'tone' | 'drum_kit' | 'partial_wave' | 'drum_wave', itemIndex: number, targetIndex = 0
  ): void {
    this.post({ type: 'LOAD_BANK_ITEM', part, bankSlot, kind, itemIndex, targetIndex });
  }
  public collectUnusedWaves(): void { this.post({ type: 'COLLECT_WAVES' }); }
  public setGroove(part: number, cfg: { mode: string; algorithm: string; resolution: string; amount: number }): void {
    const modes: Record<string, number> = { global: 0, custom: 1, off: 2 };
    const algos: Record<string, number> = { mpc: 0, tr909: 1, sp1200: 2, triplet: 3, dilla: 4 };
    this.post({
      type: 'SET_GROOVE', part, mode: modes[cfg.mode] ?? 0, algorithm: algos[cfg.algorithm] ?? 0,
      resolution: cfg.resolution === '1/8' ? 1 : 0, amount: cfg.amount,
    });
  }
  public setPartPattern(part: number, seq: { bars?: number; ppq?: number; mode?: string; notes?: any[]; motion?: Record<string, any[]> }): void {
    this.post({ type: 'SET_PATTERN', part, bars: seq.bars ?? 1, ppq: seq.ppq ?? 96, notes: seq.notes ?? [], motion: seq.motion ?? {} });
  }
}

/**
 * ABDMCX0X -- McxHostBridge.ts (Slice 1)
 * Dual-mode bridge: routes transparently to JUCE 9 WebView2 IPC (`window.__JUCE__.backend`)
 * when hosted in DAW/Standalone, or to BridgeWasm (AudioWorklet + mcx0x_dsp.wasm) in a browser.
 */

import { BridgeWasm, type McxTelemetry } from './BridgeWasm';

export const WASM_PARAM_ID = {
  filterCutoff: 0, filterResonance: 1, ampAttack: 2, ampDecay: 3, ampSustain: 4, ampRelease: 5,
  partLevel: 6, partPan: 7, reverbSend: 8, chorusSend: 9, routeMode: 10, persona: 11,
  dacCharacter: 12, filterModel: 13, structureMode: 14, vectorX: 15, vectorY: 16,
  reverbMacro: 17, chorusMacro: 18, reverbTime: 19, chorusRate: 20,
  diagProbePoint: 21, diagProbeFreq: 22, diagProbeLevel: 23, diagProbeWave: 24,
  partKind: 25, partMidiChannel: 26, partMute: 27, partSolo: 28, partFollowTranspose: 29,
  globalMaxPolyphony: 30, globalMasterTuneHz: 31, globalStandaloneBpm: 32,
  globalTranspose: 33, globalScale: 34, globalScaleRoot: 35, globalScaleQuantize: 36,
  eqEnabled: 37, eqLowGain: 38, eqLowFreq: 39, eqMidGain: 40, eqMidFreq: 41, eqMidQ: 42,
  eqHighGain: 43, eqHighFreq: 44, driveEnabled: 45, driveAmount: 46,
  delaySend: 47, auxSend: 48, sendAPre: 49, sendBPre: 50, sendCPre: 51, sendDPre: 52,
} as const;

export type McxParamKey = keyof typeof WASM_PARAM_ID;

export interface McxSystemSettingsDto {
  workingDirectory: string;
  maxPolyphony: number;
  masterTuneHz: number;
  standaloneBpm: number;
  themeFamily?: string;
  colorScheme?: string;
  locale?: string;
}

const STORAGE_SETTINGS = 'abdmcx0x.systemSettings';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export class McxHostBridge {
  public readonly isNative: boolean;
  private wasm: BridgeWasm | null = null;
  private nativeSampleRate = 48000;
  private telemetryCb: ((t: McxTelemetry) => void) | null = null;
  private statusCb: ((s: 'idle' | 'loading' | 'ready' | 'error', detail?: string) => void) | null = null;
  private bankLoadedCb: ((ok: boolean, sizeBytes: number) => void) | null = null;
  private settingsCb: ((s: McxSystemSettingsDto) => void) | null = null;

  constructor() {
    const juceBackend = (window as any).__JUCE__?.backend;
    this.isNative = Boolean(juceBackend?.emitEvent || (window as any).chrome?.webview?.postMessage);

    if (this.isNative) {
      const handleNative = (ev: any) => {
        const data = ev?.data ?? ev;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'telemetry') {
          if (Number(data.sampleRate) > 1000) {
            const sr = Math.round(Number(data.sampleRate));
            if (sr !== this.nativeSampleRate) {
              this.nativeSampleRate = sr;
              this.statusCb?.('ready', `JUCE ${sr} Hz`);
            }
          }
          const samplesL = Array.isArray(data.samplesL) ? Float32Array.from(data.samplesL) : undefined;
          this.telemetryCb?.({
            peakL: Number(data.peakL ?? 0),
            peakR: Number(data.peakR ?? 0),
            activeVoices: Number(data.activeVoices ?? 0),
            samplesL,
          });
        } else if (data.type === 'bankLoaded') {
          this.bankLoadedCb?.(Boolean(data.ok), Number(data.sizeBytes ?? 0));
        } else if (data.type === 'systemSettings') {
          this.settingsCb?.({
            workingDirectory: String(data.workingDirectory ?? ''),
            maxPolyphony: Number(data.maxPolyphony ?? 64),
            masterTuneHz: Number(data.masterTuneHz ?? 440),
            standaloneBpm: Number(data.standaloneBpm ?? 120),
            themeFamily: data.themeFamily,
            colorScheme: data.colorScheme,
            locale: data.locale,
          });
        }
      };

      juceBackend?.addEventListener?.('onNativeTelemetry', handleNative);
      (window as any).chrome?.webview?.addEventListener?.('message', handleNative);
    } else {
      this.wasm = new BridgeWasm();
      this.wasm.onTelemetry((t) => this.telemetryCb?.(t));
    }
  }

  public getSampleRate(): number { return this.isNative ? this.nativeSampleRate : (this.wasm?.sampleRate ?? 48000); }
  public onTelemetry(cb: (t: McxTelemetry) => void): void { this.telemetryCb = cb; }
  public onSystemSettings(cb: (s: McxSystemSettingsDto) => void): void { this.settingsCb = cb; }

  public onAudioStatus(cb: (s: 'idle' | 'loading' | 'ready' | 'error', detail?: string) => void): void {
    this.statusCb = cb;
    if (this.isNative) cb('ready', `JUCE ${this.nativeSampleRate} Hz`);
    else this.wasm?.onStatus(cb);
  }

  public onBankLoaded(cb: (ok: boolean, sizeBytes: number) => void): void {
    this.bankLoadedCb = cb;
    if (!this.isNative) this.wasm?.onBankLoaded(cb);
  }

  public async enableAudio(): Promise<boolean> {
    if (this.isNative) return true;
    return (await this.wasm?.initAudio()) ?? false;
  }

  public noteOn(part: number, note: number, velocity = 0.85): void {
    if (this.isNative) this.postNative({ type: 'noteOn', part, note, velocity });
    else this.wasm?.noteOn(part, note, velocity);
  }

  public noteOff(part: number, note: number): void {
    if (this.isNative) this.postNative({ type: 'noteOff', part, note });
    else this.wasm?.noteOff(part, note);
  }

  public allNotesOff(): void {
    if (this.isNative) this.postNative({ type: 'allNotesOff' });
    else this.wasm?.allNotesOff();
  }

  public setParam(part: number, key: McxParamKey, value: number): void {
    const paramId = WASM_PARAM_ID[key];
    if (this.isNative) this.postNative({ type: 'setParam', part, id: key, paramId, value });
    else this.wasm?.setPartParam(part, paramId, value);
  }

  public setTempo(bpm: number): void {
    if (this.isNative) this.postNative({ type: 'setTempo', bpm });
    else this.wasm?.setTempo(bpm);
  }

  public setMasterVolume(volume: number): void {
    if (this.isNative) this.postNative({ type: 'setMasterVolume', volume });
    else this.wasm?.setMasterVolume(volume);
  }

  public loadBankBuffer(buffer: ArrayBuffer): void {
    if (this.isNative) this.postNative({ type: 'loadBankBase64', base64: arrayBufferToBase64(buffer) });
    else this.wasm?.loadBankBuffer(buffer);
  }

  public resetToFactory(): void {
    if (this.isNative) this.postNative({ type: 'resetToFactory' });
    else this.wasm?.resetToFactory();
  }

  public loadLocalSettingsFallback(): McxSystemSettingsDto {
    try {
      const raw = localStorage.getItem(STORAGE_SETTINGS);
      if (raw) return { workingDirectory: '', maxPolyphony: 64, masterTuneHz: 440, standaloneBpm: 120, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { workingDirectory: '', maxPolyphony: 64, masterTuneHz: 440, standaloneBpm: 120 };
  }

  public updateSystemSettings(next: McxSystemSettingsDto): void {
    try { localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(next)); } catch { /* ignore */ }
    this.setParam(0, 'globalMaxPolyphony', next.maxPolyphony);
    this.setParam(0, 'globalMasterTuneHz', next.masterTuneHz);
    this.setParam(0, 'globalStandaloneBpm', next.standaloneBpm);
    if (this.isNative) this.postNative({ type: 'updateSystemSettings', ...next });
  }

  public chooseWorkingDir(): void {
    if (this.isNative) this.postNative({ type: 'chooseWorkingDir' });
  }

  public notifyReady(): void {
    if (this.isNative) {
      this.postNative({ type: 'uiReady' });
      (window as any).__JUCE__?.backend?.emitEvent?.('pageLoaded', {});
    }
  }

  private postNative(msg: Record<string, unknown>): void {
    const juceBackend = (window as any).__JUCE__?.backend;
    if (juceBackend?.emitEvent) juceBackend.emitEvent('mcxEvent', msg);
    else (window as any).chrome?.webview?.postMessage?.(msg);
  }
}

/**
 * ABDMCX0X -- McxHostBridge.ts
 * Dual-mode bridge: JUCE 9 WebView2 IPC or AudioWorklet WASM.
 */

import { BridgeWasm } from './BridgeWasm';
import { webMidiService } from '../midi/McxWebMidiService';
import {
  parseTelemetryPayload,
  type McxEngineDescriptorDto,
  type McxPartEngineStateDto,
  type McxPartPresetsDto,
  type McxTelemetry,
} from './BridgeWasmTypes';
import { arrayBufferToBase64, routeNativeBridgeEvent } from './McxHostBridgeHelpers';
import { WASM_PARAM_ID, type McxParamKey } from './mcxParamIds';

export { WASM_PARAM_ID, type McxParamKey };
export type { McxTelemetry, McxEngineDescriptorDto, McxPartPresetsDto, McxPartEngineStateDto };

export interface McxSystemSettingsDto {
  workingDirectory: string; maxPolyphony: number; masterTuneHz: number; standaloneBpm: number;
  themeFamily?: string; colorScheme?: string; locale?: string;
}

const STORAGE_SETTINGS = 'abdmcx0x.systemSettings';

export class McxHostBridge {
  public readonly isNative: boolean;
  private wasm: BridgeWasm | null = null;
  private nativeSampleRate = 48000;
  private telemetryCb: ((t: McxTelemetry) => void) | null = null;
  private statusCb: ((s: 'idle' | 'loading' | 'ready' | 'error', detail?: string) => void) | null = null;
  private bankLoadedCb: ((ok: boolean, sizeBytes: number) => void) | null = null;
  private settingsCb: ((s: McxSystemSettingsDto) => void) | null = null;
  private engineCatalogCb: ((engines: McxEngineDescriptorDto[]) => void) | null = null;
  private partPresetsCb: ((dto: McxPartPresetsDto) => void) | null = null;
  private partEngineStateCb: ((dto: McxPartEngineStateDto) => void) | null = null;
  private songScenesStateCb: ((stateJson: string) => void) | null = null;

  constructor() {
    const juceBackend = (window as any).__JUCE__?.backend;
    this.isNative = Boolean(juceBackend?.emitEvent || (window as any).chrome?.webview?.postMessage);
    if (this.isNative) {
      const handleNative = (ev: any) => routeNativeBridgeEvent(ev?.data ?? ev, {
        dispatchTelemetry: (data) => this.dispatchNativeTelemetry(data),
        onBankLoaded: (ok, sizeBytes) => this.bankLoadedCb?.(ok, sizeBytes),
        onEngineCatalog: (engines) => this.engineCatalogCb?.(engines),
        onPartPresets: (dto) => this.partPresetsCb?.(dto),
        onPartEngineState: (dto) => this.partEngineStateCb?.(dto),
        onSongScenesState: (json) => this.songScenesStateCb?.(json),
        onSystemSettings: (s) => this.settingsCb?.(s),
      });
      juceBackend?.addEventListener?.('onNativeTelemetry', handleNative);
      (window as any).chrome?.webview?.addEventListener?.('message', handleNative);
    } else {
      this.wasm = new BridgeWasm();
      this.wasm.onTelemetry((t) => this.telemetryCb?.(t));
      this.wasm.onPartEngineState((dto) => this.partEngineStateCb?.(dto));
      this.wasm.onSongScenesState((json) => this.songScenesStateCb?.(json));
      this.wasm.onMidiOut((bytes) => webMidiService.sendRawBytes(bytes));
    }
  }

  private dispatchNativeTelemetry(data: any): void {
    if (Number(data.sampleRate) > 1000) {
      const sr = Math.round(Number(data.sampleRate));
      if (sr !== this.nativeSampleRate) { this.nativeSampleRate = sr; this.statusCb?.('ready', `JUCE ${sr} Hz`); }
    }
    this.telemetryCb?.(parseTelemetryPayload(data));
  }

  public getSampleRate(): number { return this.isNative ? this.nativeSampleRate : (this.wasm?.sampleRate ?? 48000); }
  public onTelemetry(cb: (t: McxTelemetry) => void): void { this.telemetryCb = cb; }
  public onSystemSettings(cb: (s: McxSystemSettingsDto) => void): void { this.settingsCb = cb; }
  public onEngineCatalog(cb: (engines: McxEngineDescriptorDto[]) => void): void { this.engineCatalogCb = cb; }
  public onPartPresets(cb: (dto: McxPartPresetsDto) => void): void { this.partPresetsCb = cb; }
  public onPartEngineState(cb: (dto: McxPartEngineStateDto) => void): void { this.partEngineStateCb = cb; }
  public onSongScenesState(cb: (stateJson: string) => void): void { this.songScenesStateCb = cb; }
  public onAudioStatus(cb: (s: 'idle' | 'loading' | 'ready' | 'error', detail?: string) => void): void {
    this.statusCb = cb; if (this.isNative) cb('ready', `JUCE ${this.nativeSampleRate} Hz`); else this.wasm?.onStatus(cb);
  }
  public onBankLoaded(cb: (ok: boolean, sizeBytes: number) => void): void {
    this.bankLoadedCb = cb; if (!this.isNative) this.wasm?.onBankLoaded(cb);
  }
  public async enableAudio(): Promise<boolean> {
    void webMidiService.init();
    return this.isNative ? true : ((await this.wasm?.initAudio()) ?? false);
  }
  public sendCommand(nativeMsg: Record<string, unknown>, wasmMsg: Record<string, unknown>): void {
    if (this.isNative) this.postNative(nativeMsg); else this.wasm?.post(wasmMsg);
  }
  public noteOn(part: number, note: number, velocity = 0.85): void { this.isNative ? this.postNative({ type: 'noteOn', part, note, velocity }) : this.wasm?.noteOn(part, note, velocity); }
  public noteOff(part: number, note: number): void { this.isNative ? this.postNative({ type: 'noteOff', part, note }) : this.wasm?.noteOff(part, note); }
  public allNotesOff(): void { this.isNative ? this.postNative({ type: 'allNotesOff' }) : this.wasm?.allNotesOff(); }
  public setParam(part: number, key: McxParamKey, value: number): void {
    const paramId = WASM_PARAM_ID[key];
    if (paramId === undefined) return;
    if (this.isNative) this.postNative({ type: 'setParam', part, id: key, paramId, value });
    else this.wasm?.setPartParam(part, paramId, value);
  }
  public setTempo(bpm: number): void { this.isNative ? this.postNative({ type: 'setTempo', bpm }) : this.wasm?.setTempo(bpm); }
  public setMasterVolume(volume: number): void { this.isNative ? this.postNative({ type: 'setMasterVolume', volume }) : this.wasm?.setMasterVolume(volume); }
  public loadBankBuffer(buffer: ArrayBuffer): void {
    if (this.isNative) this.postNative({ type: 'loadBankBase64', base64: arrayBufferToBase64(buffer) });
    else this.wasm?.loadBankBuffer(buffer);
  }
  public resetToFactory(): void { this.isNative ? this.postNative({ type: 'resetToFactory' }) : this.wasm?.resetToFactory(); }
  public setTransportPlaying(playing: boolean, resetOnStop = true): void {
    if (this.isNative) this.postNative({ type: 'setTransport', playing, reset: resetOnStop });
    else this.wasm?.setTransportPlaying(playing, resetOnStop);
  }
  public setSequencerBars(bars: number): void {
    if (this.isNative) this.postNative({ type: 'setSequencerBars', bars });
    else this.wasm?.setSequencerBars(bars);
  }
  public setGroove(part: number, cfg: { mode: string; algorithm: string; resolution: string; amount: number }): void {
    if (this.isNative) this.postNative({ type: 'setGroove', part, ...cfg });
    else this.wasm?.setGroove(part, cfg);
  }
  public setPartPattern(part: number, seq: { bars?: number; ppq?: number; notes?: any[]; motion?: Record<string, any[]> }): void {
    if (this.isNative) this.postNative({ type: 'setPattern', part, bars: seq.bars ?? 1, ppq: seq.ppq ?? 96, notes: seq.notes ?? [], motion: seq.motion ?? {} });
    else this.wasm?.setPartPattern(part, seq);
  }
  public requestEngineCatalog(): void { if (this.isNative) this.postNative({ type: 'getEngineCatalog' }); }
  public requestPartPresets(part: number): void { if (this.isNative) this.postNative({ type: 'getPartPresets', part }); }
  public selectPartEngineType(part: number, typeIndex: number): void {
    if (this.isNative) this.postNative({ type: 'setPartEngine', part, typeIndex });
    else this.wasm?.selectPartEngineType(part, typeIndex);
  }
  public loadFactoryPreset(part: number, presetIndex: number): void {
    if (this.isNative) this.postNative({ type: 'loadFactoryPreset', part, presetIndex });
    else this.wasm?.loadFactoryPreset(part, presetIndex);
  }
  public setEngineParam(part: number, key: string, value: number): void {
    if (this.isNative) this.postNative({ type: 'setPartEngineParam', part, key, value });
    else this.wasm?.setPartEngineParam(part, key, value);
  }
  public requestPartEngineState(part: number): void { this.isNative ? this.postNative({ type: 'getPartEngineState', part }) : this.wasm?.requestPartEngineState(part); }
  public loadBankItemOnDemand(part: number, bankSlot: number, kind: 'tone' | 'drum_kit', itemIndex: number): void { this.isNative ? this.postNative({ type: 'loadBankItemOnDemand', part, bankSlot, kind, itemIndex }) : this.wasm?.loadBankItemOnDemand(part, bankSlot, kind, itemIndex); }
  public setSendBusMute(bus: number, mute: boolean): void { if (this.isNative) this.postNative({ type: 'setSendBusMute', bus, mute }); }
  public setRackSlotEngine(slot: number, engine: number, name = ''): void { this.sendCommand({ type: 'setRackSlot', slot, engine, name }, { type: 'SET_RACK_SLOT', slot, engine, name }); }
  public setRackSlotName(slot: number, name: string): void { this.sendCommand({ type: 'setRackSlotName', slot, name }, { type: 'SET_RACK_NAME', slot, name }); }
  public removeRackSlot(slot: number): void { this.sendCommand({ type: 'removeRackSlot', slot }, { type: 'REMOVE_RACK_SLOT', slot }); }
  public moveRackSlot(from: number, to: number): void { this.sendCommand({ type: 'moveRackSlot', from, to }, { type: 'MOVE_RACK_SLOT', from, to }); }
  public setRackSlotBypass(slot: number, bypass: boolean): void { this.sendCommand({ type: 'setRackBypass', slot, bypass }, { type: 'SET_RACK_BYPASS', slot, bypass }); }
  public setRackSlotParams(slot: number, p1: number, p2: number, mix = 1.0): void { this.sendCommand({ type: 'setRackParams', slot, p1, p2, mix }, { type: 'SET_RACK_PARAMS', slot, p1, p2, mix }); }
  public setRackSlotParamByKey(slot: number, key: string, value: number): void { this.sendCommand({ type: 'setRackParamByKey', slot, key, value }, { type: 'SET_RACK_PARAM_KEY', slot, key, value }); }
  public setRackSlotPreset(slot: number, preset: number): void { this.sendCommand({ type: 'setRackPreset', slot, preset }, { type: 'SET_RACK_PRESET', slot, preset }); }
  public setRackSlotDucking(slot: number, enabled: boolean, amount = 0.6): void { this.sendCommand({ type: 'setRackDucking', slot, enabled, amount }, { type: 'SET_RACK_DUCKING', slot, enabled, amount }); }
  public setPartInsertSlot(part: number, slot: number): void { this.sendCommand({ type: 'setPartInsert', part, slot }, { type: 'SET_PART_INSERT', part, slot }); }
  public setSendSlotTarget(bus: number, slot: number): void { this.sendCommand({ type: 'setSendSlotTarget', bus, slot }, { type: 'SET_SEND_SLOT_TARGET', bus, slot }); }
  public setSlotChainTarget(slot: number, target: number): void { this.sendCommand({ type: 'setSlotChainTarget', slot, target }, { type: 'SET_SLOT_CHAIN_TARGET', slot, target }); }

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
  public chooseWorkingDir(): void { if (this.isNative) this.postNative({ type: 'chooseWorkingDir' }); }
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

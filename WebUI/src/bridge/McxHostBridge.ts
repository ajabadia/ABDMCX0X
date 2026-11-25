/**
 * ABDMCX0X -- McxHostBridge.ts
 * Dual-mode bridge: JUCE 9 WebView2 IPC or AudioWorklet WASM.
 * Strict line limit: < 200 lines.
 */

import { BridgeWasm } from './BridgeWasm';
import { webMidiService } from '../midi/McxWebMidiService';
import {
  parseTelemetryPayload, type McxEngineDescriptorDto, type McxExportCompleteDto, type McxMidiDeviceInfoDto,
  type McxMidiDevicesDto, type McxPartEngineStateDto, type McxPartPresetsDto, type McxSessionPartDto,
  type McxSessionStateDto, type McxSidechainConfigDto, type McxTelemetry, type McxWavRenderOptionsDto, type McxWavRenderedDto,
} from './BridgeWasmTypes';
import {
  STORAGE_BANK_LAYOUT, STORAGE_SETTINGS, STORAGE_SIDECHAIN,
  arrayBufferToBase64, readLocalSettingsJson, readLocalSidechain, routeNativeBridgeEvent, routeWasmWorkletEvent,
  writeLocalStr, nativeSequenceEvents, type NativeBridgeCallbacks,
} from './McxHostBridgeHelpers';
import { WASM_PARAM_ID, type McxParamKey } from './mcxParamIds';

export { WASM_PARAM_ID, type McxParamKey };
export type {
  McxTelemetry, McxEngineDescriptorDto, McxMidiDeviceInfoDto, McxMidiDevicesDto,
  McxPartPresetsDto, McxPartEngineStateDto, McxSessionStateDto, McxSessionPartDto,
  McxSidechainConfigDto, McxWavRenderOptionsDto, McxWavRenderedDto, McxExportCompleteDto,
};

export interface McxSystemSettingsDto {
  workingDirectory: string; maxPolyphony: number; masterTuneHz: number; standaloneBpm: number;
  themeFamily?: string; colorScheme?: string; locale?: string;
}
type AudioStatusCb = (s: 'idle' | 'loading' | 'ready' | 'error', detail?: string) => void;

export class McxHostBridge {
  public readonly isNative: boolean;
  private wasm: BridgeWasm | null = null;
  private nativeSampleRate = 48000;
  private wavReqSeq = 1;
  private wavPending = new Map<number, (res: McxWavRenderedDto) => void>();
  private telemetryCb: ((t: McxTelemetry) => void) | null = null;
  private statusCbs = new Set<AudioStatusCb>();
  private lastStatus: ['idle' | 'loading' | 'ready' | 'error', string?] | null = null;
  private bankLoadedCb: ((ok: boolean, sizeBytes: number) => void) | null = null;
  private bankIndexQueue: Array<(slot: number) => void> = [];
  private settingsCb: ((s: McxSystemSettingsDto) => void) | null = null;
  private engineCatalogCb: ((engines: McxEngineDescriptorDto[]) => void) | null = null;
  private partPresetsCb: ((dto: McxPartPresetsDto) => void) | null = null;
  private partEngineStateCb: ((dto: McxPartEngineStateDto) => void) | null = null;
  private songScenesStateCb: ((stateJson: string) => void) | null = null;
  private sessionStateCb: ((dto: McxSessionStateDto) => void) | null = null;
  private libraryCatalogCb: ((catalogJson: string) => void) | null = null;
  private rackStateCb: ((rackJson: string) => void) | null = null;
  private midiDevicesCb: ((dto: McxMidiDevicesDto) => void) | null = null;
  private partPatternCb: ((part: number, patternJson: string) => void) | null = null; private exportCompleteCb: ((dto: McxExportCompleteDto) => void) | null = null;
  private midiLearnProfilesCb: ((catalogJson: string) => void) | null = null; private midiLearnAutoDetectCb: ((ev: { device: string; displayName: string; reason: string; portName: string; profileJson: string }) => void) | null = null;

  constructor() {
    const juceBackend = (window as any).__JUCE__?.backend;
    this.isNative = Boolean(juceBackend?.emitEvent || (window as any).chrome?.webview?.postMessage);
    const cbs: NativeBridgeCallbacks = {
      dispatchTelemetry: (data) => this.dispatchNativeTelemetry(data),
      onBankLoaded: (ok, sz) => this.bankLoadedCb?.(ok, sz), onBankIndexed: (ok, slot) => this.bankIndexQueue.shift()?.(ok ? slot : -1), onEngineCatalog: (e) => this.engineCatalogCb?.(e),
      onPartPresets: (dto) => this.partPresetsCb?.(dto), onPartEngineState: (dto) => this.partEngineStateCb?.(dto),
      onSongScenesState: (j) => this.songScenesStateCb?.(j), onSessionState: (dto) => this.sessionStateCb?.(dto),
      onLibraryCatalog: (j) => this.libraryCatalogCb?.(j), onRackState: (j) => this.rackStateCb?.(j),
      onSystemSettings: (s) => this.settingsCb?.(s), onMidiDevices: (dto) => this.midiDevicesCb?.(dto),
      onMidiLearnProfiles: (j) => this.midiLearnProfilesCb?.(j), onMidiLearnAutoDetect: (ev) => this.midiLearnAutoDetectCb?.(ev),
      onPartPatternState: (p, j) => this.partPatternCb?.(p, j), onExportComplete: (dto) => this.exportCompleteCb?.(dto),
      onSequenceList: (j) => nativeSequenceEvents.emit({ type: 'sequenceList', catalogJson: j }), onSequenceSaved: (e) => nativeSequenceEvents.emit({ type: 'sequenceSaved', ...e }), onSequenceLoaded: (e) => nativeSequenceEvents.emit({ type: 'sequenceLoaded', ...e }),
      onWavRendered: (dto) => { const r = dto.requestId !== undefined ? this.wavPending.get(dto.requestId) : undefined; if (r && dto.requestId !== undefined) { this.wavPending.delete(dto.requestId); r(dto); } },
    };
    if (this.isNative) {
      this.lastStatus = ['ready', `JUCE ${this.nativeSampleRate} Hz`];
      const handleNative = (ev: any) => routeNativeBridgeEvent(ev?.data ?? ev, cbs);
      juceBackend?.addEventListener?.('onNativeTelemetry', handleNative); (window as any).chrome?.webview?.addEventListener?.('message', handleNative);
    } else {
      this.wasm = new BridgeWasm();
      this.wasm.onStatus((s, d) => { this.lastStatus = [s, d]; this.statusCbs.forEach((cb) => cb(s, d)); });
      this.wasm.onTelemetry((t) => this.telemetryCb?.(t)); this.wasm.onPartEngineState((dto) => this.partEngineStateCb?.(dto));
      this.wasm.onSongScenesState((j) => this.songScenesStateCb?.(j)); this.wasm.onWorkletEvent((msg) => routeWasmWorkletEvent(msg, cbs));
      this.wasm.onMidiOut((b) => webMidiService.sendRawBytes(b));
      webMidiService.onMidiInput((p, b) => this.sendMidiIn(p, b)); webMidiService.onDeviceChange(() => this.emitWebMidiDevices());
    }
  }

  private dispatchNativeTelemetry(data: any): void {
    const sr = Number(data.sampleRate);
    if (sr > 1000 && Math.round(sr) !== this.nativeSampleRate) {
      this.nativeSampleRate = Math.round(sr); this.lastStatus = ['ready', `JUCE ${this.nativeSampleRate} Hz`];
      this.statusCbs.forEach((cb) => cb('ready', `JUCE ${this.nativeSampleRate} Hz`));
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
  public onSessionState(cb: (dto: McxSessionStateDto) => void): void { this.sessionStateCb = cb; } public onLibraryCatalog(cb: (catalogJson: string) => void): void { this.libraryCatalogCb = cb; }
  public onRackState(cb: (rackJson: string) => void): void { this.rackStateCb = cb; } public onMidiDevices(cb: (dto: McxMidiDevicesDto) => void): void { this.midiDevicesCb = cb; }
  public onPartPatternState(cb: (part: number, patternJson: string) => void): void { this.partPatternCb = cb; } public onExportComplete(cb: (dto: McxExportCompleteDto) => void): void { this.exportCompleteCb = cb; }
  public onMidiLearnProfiles(cb: (catalogJson: string) => void): void { this.midiLearnProfilesCb = cb; }
  public onMidiLearnAutoDetect(cb: (ev: { device: string; displayName: string; reason: string; portName: string; profileJson: string }) => void): void { this.midiLearnAutoDetectCb = cb; }
  public refreshMidiDevices(): void { if (this.isNative) this.postNative({ type: 'refreshMidiDevices' }); else void webMidiService.init().then(() => this.emitWebMidiDevices()); }
  public setMidiDeviceEnabled(direction: 'input' | 'output', id: string, enabled: boolean): void { if (this.isNative) this.postNative({ type: 'setMidiDeviceEnabled', direction, id, enabled }); }
  public setPartMidiDevice(part: number, direction: 'input' | 'output', portIndex: number, deviceName = ''): void {
    if (this.isNative) this.postNative({ type: 'setPartMidiDevice', part, direction, portIndex, deviceName }); else this.setParam(part, direction === 'output' ? 'partMidiPort' : 'partMidiInPort', portIndex);
  }
  public setBankLayout(layoutJson: string): void { if (!this.isNative) writeLocalStr(STORAGE_BANK_LAYOUT, layoutJson); this.sendCommand({ type: 'setBankLayout', layoutJson }, { type: 'SET_BANK_LAYOUT', layoutJson }); }
  public loadLocalBankLayoutFallback(): string | null { try { return localStorage.getItem(STORAGE_BANK_LAYOUT); } catch { return null; } }
  public clearLocalBankLayoutFallback(): void { try { localStorage.removeItem(STORAGE_BANK_LAYOUT); } catch { /* ignore */ } }
  public sendMidiIn(portIndex: number, bytes: Uint8Array): void { if (!this.isNative && bytes.length >= 2) this.wasm?.post({ type: 'MIDI_IN', portIndex, status: bytes[0] ?? 0, data1: bytes[1] ?? 0, data2: bytes[2] ?? 0 }); }
  private emitWebMidiDevices(): void {
    this.midiDevicesCb?.({ isStandalone: true, inputs: webMidiService.getInputs().map((d) => ({ portIndex: d.portIndex, id: d.id, name: d.name, enabled: d.state === 'connected' })), outputs: webMidiService.getOutputs().map((d) => ({ portIndex: d.portIndex, id: d.id, name: d.name, enabled: d.state === 'connected' })) });
  }
  public onAudioStatus(cb: AudioStatusCb): void { this.statusCbs.add(cb); if (this.lastStatus) cb(this.lastStatus[0], this.lastStatus[1]); }
  public onBankLoaded(cb: (ok: boolean, sizeBytes: number) => void): void { this.bankLoadedCb = cb; if (!this.isNative) this.wasm?.onBankLoaded(cb); }
  public async enableAudio(): Promise<boolean> { void webMidiService.init(); return this.isNative ? true : ((await this.wasm?.initAudio()) ?? false); }
  public sendCommand(nativeMsg: Record<string, unknown>, wasmMsg: Record<string, unknown>): void { if (this.isNative) this.postNative(nativeMsg); else this.wasm?.post(wasmMsg); }
  private noteCbs = new Set<(part: number, note: number, isNoteOn: boolean, vel: number) => void>();
  public onNoteEvent(cb: (part: number, note: number, isNoteOn: boolean, vel: number) => void): () => void { this.noteCbs.add(cb); return () => { this.noteCbs.delete(cb); }; }
  public noteOn(part: number, note: number, velocity = 0.85): void { if (this.isNative) this.postNative({ type: 'noteOn', part, note, velocity }); else this.wasm?.noteOn(part, note, velocity); this.noteCbs.forEach((cb) => cb(part, note, true, velocity)); }
  public noteOff(part: number, note: number): void { if (this.isNative) this.postNative({ type: 'noteOff', part, note }); else this.wasm?.noteOff(part, note); this.noteCbs.forEach((cb) => cb(part, note, false, 0)); }
  public allNotesOff(): void { this.isNative ? this.postNative({ type: 'allNotesOff' }) : this.wasm?.allNotesOff(); }
  public setParam(part: number, key: McxParamKey, value: number): void { const pid = WASM_PARAM_ID[key]; if (pid !== undefined) { if (this.isNative) this.postNative({ type: 'setParam', part, id: key, paramId: pid, value }); else this.wasm?.setPartParam(part, pid, value); } }
  public setTempo(bpm: number): void { this.isNative ? this.postNative({ type: 'setTempo', bpm }) : this.wasm?.setTempo(bpm); }
  public setMasterVolume(volume: number): void { this.isNative ? this.postNative({ type: 'setMasterVolume', volume }) : this.wasm?.setMasterVolume(volume); }
  public loadBankBuffer(buffer: ArrayBuffer): void { if (this.isNative) this.postNative({ type: 'loadBankBase64', base64: arrayBufferToBase64(buffer) }); else this.wasm?.loadBankBuffer(buffer); }
  public indexBankBuffer(buffer: ArrayBuffer): Promise<number> { return new Promise((res) => { this.bankIndexQueue.push(res); if (this.isNative) this.postNative({ type: 'indexBankBase64', base64: arrayBufferToBase64(buffer) }); else this.wasm ? this.wasm.indexBankBuffer(buffer) : (this.bankIndexQueue.pop(), res(-1)); }); }
  public resetToFactory(): void { this.clearLocalBankLayoutFallback(); try { localStorage.removeItem(STORAGE_SIDECHAIN); } catch { /* ignore */ } this.isNative ? this.postNative({ type: 'resetToFactory' }) : this.wasm?.resetToFactory(); }
  public setTransportPlaying(playing: boolean, resetOnStop = true): void { if (this.isNative) this.postNative({ type: 'setTransport', playing, reset: resetOnStop }); else this.wasm?.setTransportPlaying(playing, resetOnStop); }
  public pauseSequencer(): void { this.setTransportPlaying(false, false); }
  public seekSequencerBars(deltaBars: number): void { this.sendCommand({ type: 'seqSeekBars', deltaBars }, { type: 'SEQ_SEEK_BARS', deltaBars }); }
  public returnSequencerToZero(): void { this.sendCommand({ type: 'seqReturnToZero' }, { type: 'SEQ_RETURN_TO_ZERO' }); }
  public setSequencerRecordConfig(mode: 0 | 1, countInBars: number, quantizeSteps: number): void { this.sendCommand({ type: 'setSeqRecordConfig', mode, countInBars, quantizeSteps }, { type: 'SET_SEQ_RECORD_CONFIG', mode, countInBars, quantizeSteps }); }
  public requestPartPattern(part: number): void { this.sendCommand({ type: 'getPartPattern', part }, { type: 'GET_PART_PATTERN', part }); }
  public setSequencerBars(bars: number): void { this.sendCommand({ type: 'setSequencerBars', bars }, { type: 'SET_SEQ_BARS', bars }); }
  public setSequencerLoop(loop: boolean): void { this.sendCommand({ type: 'setSeqLoop', loop }, { type: 'SET_SEQ_LOOP', loop }); }
  public setGroove(part: number, cfg: { mode: string; algorithm: string; resolution: string; amount: number }): void { if (this.isNative) this.postNative({ type: 'setGroove', part, ...cfg }); else this.wasm?.setGroove(part, cfg); }
  public setPartPattern(part: number, seq: { bars?: number; ppq?: number; mode?: string; notes?: any[]; motion?: Record<string, any[]> }): void { if (this.isNative) this.postNative({ type: 'setPattern', part, bars: seq.bars ?? 1, ppq: seq.ppq ?? 96, notes: seq.notes ?? [], motion: seq.motion ?? {} }); else this.wasm?.setPartPattern(part, seq); }
  public requestEngineCatalog(): void { this.sendCommand({ type: 'getEngineCatalog' }, { type: 'GET_ENGINE_CATALOG' }); }
  public requestPartPresets(part: number): void { this.sendCommand({ type: 'getPartPresets', part }, { type: 'GET_PART_PRESETS', part }); }
  public requestSessionState(): void { if (this.isNative) this.postNative({ type: 'getSessionState' }); }
  public requestLibraryCatalog(): void { if (this.isNative) this.postNative({ type: 'getLibraryCatalog' }); }
  public requestRackState(): void { if (!this.isNative) this.wasm?.post({ type: 'GET_RACK_STATE' }); }
  public selectPartEngineType(part: number, typeIndex: number): void { this.isNative ? this.postNative({ type: 'setPartEngine', part, typeIndex }) : this.wasm?.selectPartEngineType(part, typeIndex); }
  public loadFactoryPreset(part: number, presetIndex: number): void { this.isNative ? this.postNative({ type: 'loadFactoryPreset', part, presetIndex }) : this.wasm?.loadFactoryPreset(part, presetIndex); }
  public setPartPresetName(part: number, name: string): void { this.sendCommand({ type: 'setPartPresetName', part, name }, { type: 'SET_PART_PRESET_NAME', part, name }); }
  public setEngineParam(part: number, key: string, value: number): void { this.isNative ? this.postNative({ type: 'setPartEngineParam', part, key, value }) : this.wasm?.setPartEngineParam(part, key, value); }
  public requestPartEngineState(part: number): void { this.isNative ? this.postNative({ type: 'getPartEngineState', part }) : this.wasm?.requestPartEngineState(part); }
  public setPartEngineStateJson(part: number, stateJson: string): void { if (!this.isNative) this.wasm?.setPartEngineStateJson(part, stateJson); else this.postNative({ type: 'setPartEngineStateJson', part, stateJson }); }
  public loadBankItemOnDemand(part: number, bankSlot: number, kind: 'tone' | 'drum_kit' | 'partial_wave' | 'drum_wave', itemIndex: number, targetIndex = 0): void { this.isNative ? this.postNative({ type: 'loadBankItemOnDemand', part, bankSlot, kind, itemIndex, targetIndex }) : this.wasm?.loadBankItemOnDemand(part, bankSlot, kind, itemIndex, targetIndex); }
  public savePartPreset(part: number, name: string, sublibrary: string, categoryId: number): void { if (this.isNative) this.postNative({ type: 'savePartPreset', part, name, sublibrary, categoryId }); else this.setPartPresetName(part, name); }
  public saveMultiPreset(name: string, sublibrary: string, categoryId: number): void { if (this.isNative) this.postNative({ type: 'saveMultiPreset', name, sublibrary, categoryId }); }
  public loadCatalogItem(part: number, itemId: string, filePath = ''): void { if (this.isNative) this.postNative({ type: 'loadCatalogItem', part, itemId, filePath }); }
  public setSendBusMute(bus: number, mute: boolean): void { this.sendCommand({ type: 'setSendBusMute', bus, mute }, { type: 'SET_SEND_BUS_MUTE', bus, mute }); }
  public setFxTopology(topology: number): void { this.sendCommand({ type: 'setFxTopology', topology }, { type: 'SET_FX_TOPOLOGY', topology }); }
  public setFxCascade(cho: number, del: number): void { this.sendCommand({ type: 'setFxCascade', cho, del }, { type: 'SET_FX_CASCADE', cho, del }); }
  public setFxGate(gate: number, value: number): void { this.sendCommand({ type: 'setFxGate', gate, value }, { type: 'SET_FX_GATE', gate, value }); }
  public setFxTempoSync(enabled: boolean): void { this.sendCommand({ type: 'setFxTempoSync', enabled }, { type: 'SET_FX_TEMPO_SYNC', enabled }); }
  public setLimiterEnabled(enabled: boolean): void { this.sendCommand({ type: 'setLimiterEnabled', enabled }, { type: 'SET_LIMITER_ENABLED', enabled }); }
  public setLimiterCeilingDb(db: number): void { this.sendCommand({ type: 'setLimiterCeilingDb', db }, { type: 'SET_LIMITER_CEILING', db }); }
  public setDuckMode(kind: 0 | 1 | 2, enabled: boolean): void { this.sendCommand({ type: 'setDuckMode', kind, enabled }, { type: 'SET_DUCK_MODE', kind, enabled }); }
  public setSidechainConfig(cfg: McxSidechainConfigDto): void { if (!this.isNative) writeLocalStr(STORAGE_SIDECHAIN, JSON.stringify(cfg)); this.sendCommand({ type: 'setSidechainConfig', ...cfg }, { type: 'SET_SIDECHAIN_CONFIG', ...cfg }); }
  public loadLocalSidechainFallback(): McxSidechainConfigDto | null { return readLocalSidechain(); }
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
  public saveExportFileBase64(kind: string, extension: string, bytes: Uint8Array): void {
    if (!this.isNative) return;
    this.postNative({ type: 'saveExportFileBase64', kind, extension, base64: arrayBufferToBase64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer) });
  }
  public async renderWavOffline(opts: McxWavRenderOptionsDto): Promise<McxWavRenderedDto | null> {
    if (this.isNative) { this.postNative({ type: 'renderWavOffline', ...opts }); return null; }
    if (!this.wasm) return null;
    const requestId = this.wavReqSeq++, isolatePart = opts.scope === 'part' ? (opts.part ?? 0) : -1, isolateBank = opts.scope === 'bank' ? (opts.bank ?? 0) : -1;
    return await new Promise<McxWavRenderedDto>((resolve) => {
      this.wavPending.set(requestId, resolve);
      this.wasm!.post({ type: 'RENDER_WAV_OFFLINE', requestId, bars: opts.bars ?? 4, tailSec: opts.tailSec ?? 1.5, isolatePart, isolateBank, useSongMode: Boolean(opts.useSongMode) });
    });
  }
  public loadLocalSettingsFallback(): McxSystemSettingsDto { return readLocalSettingsJson(STORAGE_SETTINGS); }
  public updateSystemSettings(next: McxSystemSettingsDto): void { writeLocalStr(STORAGE_SETTINGS, JSON.stringify(next)); this.setParam(0, 'globalMaxPolyphony', next.maxPolyphony); this.setParam(0, 'globalMasterTuneHz', next.masterTuneHz); this.setParam(0, 'globalStandaloneBpm', next.standaloneBpm); if (this.isNative) this.postNative({ type: 'updateSystemSettings', ...next }); }
  public chooseWorkingDir(): void { if (this.isNative) this.postNative({ type: 'chooseWorkingDir' }); }
  public notifyReady(): void { if (this.isNative) { this.postNative({ type: 'uiReady' }); (window as any).__JUCE__?.backend?.emitEvent?.('pageLoaded', {}); } }
  private postNative(msg: Record<string, unknown>): void { const b = (window as any).__JUCE__?.backend; if (b?.emitEvent) b.emitEvent('mcxEvent', msg); else (window as any).chrome?.webview?.postMessage?.(msg); }
}

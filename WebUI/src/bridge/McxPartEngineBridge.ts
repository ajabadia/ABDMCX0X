/**
 * ABDMCX0X -- McxPartEngineBridge.ts
 * Adapter implementing @abdsynths/shared EnginePanelBridge for an individual Groovebox part.
 * Strictly < 200 lines.
 */

import type { EngineBrowserItem, EnginePanelBridge, EnginePanelDescriptor, EnginePatchMeta, EnginePresetSaveMeta } from '@abdsynths/shared/contracts';
import type { McxEngineDescriptorDto, McxHostBridge, McxPartPresetsDto } from './McxHostBridge';
import { getFallbackPresetsForEngine } from '../ui/McxEngineCatalogDefaults';
import type { McxPartUiState } from '../ui/McxMixerConsole';
import type { McxAppState } from '../app/McxAppState';
import { ENGINE_DEFAULT_COVERS, buildInitialEngineFlatState, getEngineFactoryPresetSnapshot, resolveFallbackParamValue } from './McxRomplerStateFlatten';
import { McxPartBankAdapter } from './McxPartBankAdapter';
import { applyRemotePartStateSync } from './McxPartBankWaveOps';
import { ensureEngineWaveDependencies, soundBankRegistry } from '../app/McxSoundBankManager';

export interface McxPartEngineBridgeOptions {
  partIndex: number; hostBridge: McxHostBridge; getPartState: () => McxPartUiState;
  getCatalog: () => McxEngineDescriptorDto[]; getPartPresets: () => McxPartPresetsDto | undefined;
  appState?: McxAppState; onRequestBank?: () => void; onHostStateChanged?: () => void;
}

export class McxPartEngineBridge implements EnginePanelBridge {
  private readonly opts: McxPartEngineBridgeOptions;
  private readonly bankAdapter: McxPartBankAdapter;
  private flatState: Record<string, number> = {};
  private listeners = new Set<(state: Record<string, number>) => void>();
  private hasRemoteState = false;
  private remotePresetName = '';
  private presetEngineId = '';
  private lastStateJson = '';

  constructor(opts: McxPartEngineBridgeOptions) {
    this.opts = opts;
    this.presetEngineId = this.getDescriptor().typeId;
    this.flatState = buildInitialEngineFlatState(this.presetEngineId, opts.getPartState());
    this.bankAdapter = new McxPartBankAdapter({
      partIndex: opts.partIndex, hostBridge: opts.hostBridge,
      getPartState: opts.getPartState, getPartPresets: opts.getPartPresets,
      getDescriptor: () => this.getDescriptor(), appState: opts.appState, onHostStateChanged: opts.onHostStateChanged,
    });
    opts.hostBridge.onNoteEvent?.((p, note, isNoteOn, vel) => {
      if (p !== this.opts.partIndex) return;
      if (isNoteOn) {
        this.flatState['activeNote'] = note; this.flatState['gate'] = 1;
        this.flatState['sounding'] = 1; this.flatState['frequency'] = 440.0 * Math.pow(2.0, (note - 69) / 12.0);
        this.flatState['level'] = Math.max(0.4, vel);
      } else this.flatState['gate'] = 0;
      this.emitState();
    });
    ensureEngineWaveDependencies(this.getDescriptor().typeId, opts.hostBridge, opts.appState);
  }

  public getDescriptor(): EnginePanelDescriptor {
    const ps = this.opts.getPartState(), engIdx = ps.engineTypeIndex ?? ((ps.routeMode ?? 0) === 1 ? 1 : 0), catalog = this.opts.getCatalog();
    const f = catalog.find((e) => e.index === engIdx) ?? (ps.engineTypeId ? catalog.find((e) => e.typeId === ps.engineTypeId) : undefined);
    if (f) return { typeId: f.typeId, displayName: f.displayName, supportsDrumMode: f.supportsDrumMode, supportsBankArchives: f.supportsBankArchives, maxRecommendedInstances: f.maxRecommendedInstances };
    return { typeId: ps.engineTypeId || 'structured_rompler', displayName: 'ABD Structured Rompler', supportsDrumMode: true, supportsBankArchives: true, maxRecommendedInstances: 16 };
  }

  public setParam(key: string, value: number): void {
    this.flatState[key] = value; this.opts.hostBridge.setEngineParam(this.opts.partIndex, key, value);
    if (key === 'mode.drum') { const ps = this.opts.getPartState(); ps.kind = value >= 0.5 ? 'drum_map' : 'chromatic'; ps.followTranspose = ps.kind !== 'drum_map'; this.opts.onHostStateChanged?.(); }
  }
  public setMatrixRow(rowIndex: number, row: Record<string, unknown>): void {
    const p = `matrix.row.${rowIndex}`, t = row.target === 'latch_write' ? 1 : 0;
    this.setParam(`${p}.enabled`, row.enabled ? 1 : 0); this.setParam(`${p}.note`, Number(row.note ?? 48));
    this.setParam(`${p}.target`, t); this.setParam(`${p}.value`, Number(row.value ?? 1));
  }

  public getParam(key: string): number {
    if (Object.prototype.hasOwnProperty.call(this.flatState, key)) return this.flatState[key];
    return resolveFallbackParamValue(this.getDescriptor().typeId, this.opts.getPartState(), key);
  }

  public getState(): Record<string, number> {
    const tid = this.getDescriptor().typeId;
    if (this.presetEngineId && this.presetEngineId !== tid) { this.presetEngineId = tid; this.hasRemoteState = false; this.flatState = buildInitialEngineFlatState(tid, this.opts.getPartState()); }
    if (!this.hasRemoteState) return { ...buildInitialEngineFlatState(tid, this.opts.getPartState()), ...this.flatState };
    return { ...this.flatState };
  }

  public onStateChange(listener: (state: Record<string, number>) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  public getPresetName(): string {
    const curType = this.getDescriptor().typeId, ps = this.opts.getPartState(), dto = this.opts.getPartPresets?.();
    const remote = this.presetEngineId === curType ? this.remotePresetName : '';
    const dtoPreset = dto && dto.engineTypeId === curType ? dto.currentPreset : '';
    const psName = this.presetEngineId && this.presetEngineId !== curType ? '' : ps.name;
    return remote || dtoPreset || psName || this.listFactoryPresets()[ps.factoryPresetIndex ?? (ps.kind === 'drum_map' ? 16 : this.opts.partIndex)] || '';
  }

  public listFactoryPresets(): readonly string[] {
    const dto = this.opts.getPartPresets();
    if (dto && dto.presets.length > 0) return dto.presets.map((p) => p.name);
    const engIdx = this.getDescriptor().typeId === 'structured_rompler' ? 0 : (this.opts.getPartState().engineTypeIndex ?? 0);
    return getFallbackPresetsForEngine(engIdx).map((p) => p.name);
  }

  public loadFactoryPreset(index: number): boolean {
    if (index < 0) return false;
    const tid = this.getDescriptor().typeId, ps = this.opts.getPartState(), names = this.listFactoryPresets();
    this.opts.hostBridge.loadFactoryPreset(this.opts.partIndex, index);
    ps.factoryPresetIndex = index; ps.coverUrl = undefined; ps.soundBankId = undefined;
    if (names[index]) { ps.name = names[index]; this.remotePresetName = names[index]; this.presetEngineId = tid; }
    if (tid === 'structured_rompler') {
      const isDrum = index >= 16;
      ps.kind = isDrum ? 'drum_map' : 'chromatic'; ps.followTranspose = !isDrum; this.flatState['mode.drum'] = isDrum ? 1 : 0;
    } else {
      const snap = getEngineFactoryPresetSnapshot(tid, index);
      if (snap) { this.flatState = { ...snap }; this.hasRemoteState = true; }
    }
    this.opts.hostBridge.requestPartPresets(this.opts.partIndex); this.opts.hostBridge.requestPartEngineState(this.opts.partIndex);
    this.opts.onHostStateChanged?.(); this.emitState(); return true;
  }

  public onRequestBankBrowser(): void { if (this.getDescriptor().typeId === 'structured_rompler') this.opts.onRequestBank?.(); }
  public allNotesOff(): void { this.opts.hostBridge.allNotesOff(); }
  public resetCpu(): void { this.opts.hostBridge.allNotesOff(); const ps = this.opts.getPartState(); if (ps.factoryPresetIndex !== undefined) this.loadFactoryPreset(ps.factoryPresetIndex); }

  public savePreset(name: string, meta?: EnginePresetSaveMeta): void {
    const ps = this.opts.getPartState();
    ps.name = name; this.remotePresetName = name; this.presetEngineId = this.getDescriptor().typeId;
    if (typeof meta?.categoryId === 'number') ps.categoryId = meta.categoryId;
    if (meta?.playMode) { ps.kind = meta.playMode; ps.followTranspose = meta.playMode !== 'drum_map'; }
    const cat = ps.categoryId ?? (ps.kind === 'drum_map' ? 8 : 0);
    if (typeof this.opts.hostBridge.savePartPreset === 'function') this.opts.hostBridge.savePartPreset(this.opts.partIndex, name, ps.soundBankName || 'User', cat);
    else this.opts.hostBridge.setPartPresetName(this.opts.partIndex, name);
    this.opts.onHostStateChanged?.(); this.emitState();
  }

  public setPresetName(name: string): void { this.savePreset(name); }
  public setEngineStateJson(stateJson: string): void {
    this.opts.hostBridge.setPartEngineStateJson?.(this.opts.partIndex, stateJson);
    let presetName: string | undefined;
    try { presetName = JSON.parse(stateJson)?.presetName; } catch { /* ignore */ }
    if (presetName) { this.opts.getPartState().name = presetName; this.opts.hostBridge.setPartPresetName(this.opts.partIndex, presetName); }
    this.applyRemoteState(this.getDescriptor().typeId, stateJson, presetName);
  }
  public ensureWaveBankLoaded(bankIdOrName: string) { return this.bankAdapter.ensureWaveBankLoaded(bankIdOrName); }
  public getCoverUrl(): string | undefined {
    const ps = this.opts.getPartState(), tid = this.getDescriptor().typeId;
    if (tid !== 'structured_rompler') return ps.coverUrl || ENGINE_DEFAULT_COVERS[tid];
    return ps.coverUrl || (ps.soundBankId ? soundBankRegistry.getBankById(ps.soundBankId)?.coverUrl : undefined);
  }
  public getStateJson(): string { return this.lastStateJson; }
  public getPatchMeta(): EnginePatchMeta { return this.bankAdapter.getPatchMeta(this.lastStateJson, this.getPresetName(), this.opts.getPartState().kind === 'drum_map'); }
  public listBrowserSources() { return this.bankAdapter.listBrowserSources(); }
  public listBrowserItems(sourceId?: string) { return this.bankAdapter.listBrowserItems(sourceId); }
  public selectBrowserItem(item: EngineBrowserItem) { return this.bankAdapter.selectBrowserItem(item, (i) => this.loadFactoryPreset(i)); }
  public auditionBrowserItem(item: EngineBrowserItem, note?: number) { return this.bankAdapter.auditionBrowserItem(item, (i) => this.loadFactoryPreset(i), note); }
  public importBankArchive(fileName: string, buf: ArrayBuffer) { return this.bankAdapter.importBankArchive(fileName, buf); }
  public listWaveBanks() { return this.bankAdapter.listWaveBanks(); }
  public listWavesInBank(bankIdOrName: string) { return this.bankAdapter.listWavesInBank(bankIdOrName); }
  public assignWaveToTarget(b: string, w: number, k: 'partial_wave' | 'drum_wave', t: number) { return this.bankAdapter.assignWaveToTarget(b, w, k, t); }
  public auditionNote(note: number, vel?: number, ms?: number) { this.bankAdapter.auditionNote(note, vel, ms); }
  public initPatch(mode?: 'chromatic' | 'drum_map') { this.bankAdapter.initPatch(mode, (i) => this.loadFactoryPreset(i), (k, v) => this.setParam(k, v), (n) => this.savePreset(n)); }
  public hasRemoteEngineState(): boolean { return this.hasRemoteState; }

  public applyPresetSnapshot(params: Record<string, number>, presetName?: string, categoryId?: number, playMode?: 'chromatic' | 'drum_map'): void {
    const ps = this.opts.getPartState(); ps.factoryPresetIndex = undefined;
    if (presetName) { ps.name = presetName; this.remotePresetName = presetName; this.presetEngineId = this.getDescriptor().typeId; }
    if (typeof categoryId === 'number') ps.categoryId = categoryId;
    if (playMode) { ps.kind = playMode; ps.followTranspose = playMode !== 'drum_map'; }
    Object.entries(params).forEach(([k, v]) => { if (typeof v === 'number' && Number.isFinite(v)) this.setParam(k, v); });
    if (presetName) this.opts.hostBridge.setPartPresetName(this.opts.partIndex, presetName);
    this.opts.onHostStateChanged?.(); this.emitState();
  }

  public updateTelemetry(peak: number, midiPeak: number): void {
    const on = peak > 0.005 || midiPeak > 0.005, was = (this.flatState['sounding'] ?? 0) > 0, prev = this.flatState['level'] ?? 0;
    this.flatState['level'] = peak; this.flatState['sounding'] = on ? 1 : 0;
    if (midiPeak <= 0.005 && this.flatState['gate'] === 1) this.flatState['gate'] = 0;
    if (on || was || Math.abs(peak - prev) > 0.02) this.emitState();
  }
  public applyRemoteState(engineTypeId: string, stateJson: string, presetName?: string, coverUrl?: string): void {
    const curType = engineTypeId || this.getDescriptor().typeId; ensureEngineWaveDependencies(curType, this.opts.hostBridge, this.opts.appState);
    if (this.presetEngineId && this.presetEngineId !== curType) this.remotePresetName = '';
    const res = applyRemotePartStateSync(this.opts.getPartState(), this.getDescriptor().typeId, engineTypeId, stateJson, presetName, coverUrl);
    this.presetEngineId = curType; if (res.resolvedPresetName !== undefined) this.remotePresetName = res.resolvedPresetName;
    if (stateJson && res.flatState) { this.lastStateJson = stateJson; this.flatState = res.flatState; this.hasRemoteState = true; }
    if (res.metadataChanged) this.opts.onHostStateChanged?.(); this.emitState();
  }
  private emitState(): void { this.listeners.forEach((fn) => fn(this.getState())); }
}

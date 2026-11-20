/**
 * ABDMCX0X -- McxPartEngineBridge.ts
 * Adapter implementing @abdsynths/shared EnginePanelBridge for an individual Groovebox part.
 * Strict line limit: < 180 lines.
 */

import type { EnginePanelBridge, EnginePanelDescriptor } from '@abdsynths/shared/contracts';
import type { McxEngineDescriptorDto, McxHostBridge, McxPartPresetsDto } from './McxHostBridge';
import { getFallbackPresetsForEngine } from '../ui/McxEngineCatalogDefaults';
import type { McxPartUiState } from '../ui/McxMixerConsole';
import { buildDefaultRomplerFlatState, flattenEngineStateJson } from './McxRomplerStateFlatten';

const DRUM_SLOT_DEFAULTS: Record<string, number> = {
  level: 1, pan: 0, cutoffHz: 14000, resonance: 0.1, decayMs: 280, muteGroup: 0, triggerMode: 0, pitchKeyTrack: 0,
};

export interface McxPartEngineBridgeOptions {
  partIndex: number;
  hostBridge: McxHostBridge;
  getPartState: () => McxPartUiState;
  getCatalog: () => McxEngineDescriptorDto[];
  getPartPresets: () => McxPartPresetsDto | undefined;
  onRequestBank?: () => void;
  onHostStateChanged?: () => void;
}

export class McxPartEngineBridge implements EnginePanelBridge {
  private readonly opts: McxPartEngineBridgeOptions;
  private flatState: Record<string, number> = {};
  private listeners = new Set<(state: Record<string, number>) => void>();
  private hasRemoteState = false;
  private remotePresetName = '';

  constructor(opts: McxPartEngineBridgeOptions) {
    this.opts = opts;
    this.flatState = buildDefaultRomplerFlatState(opts.getPartState());
  }

  public getDescriptor(): EnginePanelDescriptor {
    const ps = this.opts.getPartState();
    const engIdx = ps.engineTypeIndex ?? ((ps.routeMode ?? 0) === 1 ? 1 : 0);
    const catalog = this.opts.getCatalog();
    const found = catalog.find((e) => e.index === engIdx)
      ?? (ps.engineTypeId ? catalog.find((e) => e.typeId === ps.engineTypeId) : undefined);
    if (found) {
      return {
        typeId: found.typeId,
        displayName: found.displayName,
        supportsDrumMode: found.supportsDrumMode,
        supportsBankArchives: found.supportsBankArchives,
        maxRecommendedInstances: found.maxRecommendedInstances,
      };
    }
    return {
      typeId: ps.engineTypeId || 'structured_rompler',
      displayName: 'ABD Structured Rompler',
      supportsDrumMode: true,
      supportsBankArchives: true,
      maxRecommendedInstances: 16,
    };
  }

  public setParam(key: string, value: number): void {
    this.flatState[key] = value;
    this.opts.hostBridge.setEngineParam(this.opts.partIndex, key, value);
    if (key === 'mode.drum') {
      const ps = this.opts.getPartState();
      ps.kind = value >= 0.5 ? 'drum_map' : 'chromatic';
      ps.followTranspose = ps.kind !== 'drum_map';
      this.opts.onHostStateChanged?.();
    }
  }

  public getParam(key: string): number {
    if (Object.prototype.hasOwnProperty.call(this.flatState, key)) return this.flatState[key];
    if (key.startsWith('drum.')) {
      const parts = key.split('.');
      const sub = parts[2];
      if (sub === 'coarseKey') return Number(parts[1]) || 60;
      if (sub && sub in DRUM_SLOT_DEFAULTS) return DRUM_SLOT_DEFAULTS[sub];
    }
    return 0;
  }

  public getState(): Record<string, number> {
    if (!this.hasRemoteState && this.getDescriptor().typeId === 'structured_rompler') {
      return { ...buildDefaultRomplerFlatState(this.opts.getPartState()), ...this.flatState };
    }
    return { ...this.flatState };
  }

  public onStateChange(listener: (state: Record<string, number>) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  public getPresetName(): string {
    const ps = this.opts.getPartState();
    const dto = this.opts.getPartPresets?.();
    return this.remotePresetName || ps.name || dto?.currentPreset || this.listFactoryPresets()[ps.factoryPresetIndex ?? (ps.kind === 'drum_map' ? 16 : this.opts.partIndex)] || '';
  }

  public listFactoryPresets(): readonly string[] {
    const dto = this.opts.getPartPresets();
    if (dto && dto.presets.length > 0) return dto.presets.map((p) => p.name);
    const engIdx = this.getDescriptor().typeId === 'structured_rompler' ? 0 : (this.opts.getPartState().engineTypeIndex ?? 0);
    return getFallbackPresetsForEngine(engIdx).map((p) => p.name);
  }

  public loadFactoryPreset(index: number): boolean {
    if (index < 0) return false;
    const ps = this.opts.getPartState();
    const names = this.listFactoryPresets();
    this.opts.hostBridge.loadFactoryPreset(this.opts.partIndex, index);
    ps.factoryPresetIndex = index;
    if (names[index]) {
      ps.name = names[index];
      this.remotePresetName = names[index];
    }
    if (this.getDescriptor().typeId === 'structured_rompler') {
      const isDrum = index >= 16;
      ps.kind = isDrum ? 'drum_map' : 'chromatic';
      ps.followTranspose = !isDrum;
      this.flatState['mode.drum'] = isDrum ? 1 : 0;
    }
    this.opts.hostBridge.requestPartPresets(this.opts.partIndex);
    this.opts.hostBridge.requestPartEngineState(this.opts.partIndex);
    this.opts.onHostStateChanged?.();
    this.emitState();
    return true;
  }

  public onRequestBankBrowser(): void {
    this.opts.onRequestBank?.();
  }

  public getCoverUrl(): string | undefined {
    return this.opts.getPartState().coverUrl;
  }

  public applyRemoteState(engineTypeId: string, stateJson: string, presetName?: string, coverUrl?: string): void {
    const ps = this.opts.getPartState();
    let metadataChanged = false;
    if (engineTypeId && engineTypeId !== ps.engineTypeId) { ps.engineTypeId = engineTypeId; metadataChanged = true; }
    if (presetName) {
      if (presetName !== ps.name) { ps.name = presetName; metadataChanged = true; }
      this.remotePresetName = presetName;
    }
    if (coverUrl && coverUrl !== ps.coverUrl) { ps.coverUrl = coverUrl; metadataChanged = true; }
    if (stateJson) {
      this.flatState = flattenEngineStateJson(engineTypeId || this.getDescriptor().typeId, stateJson);
      this.hasRemoteState = true;
      if (Object.prototype.hasOwnProperty.call(this.flatState, 'mode.drum')) {
        const isDrum = this.flatState['mode.drum'] >= 0.5;
        const nextKind = isDrum ? 'drum_map' : 'chromatic';
        if (ps.kind !== nextKind) metadataChanged = true;
        ps.kind = nextKind;
        ps.followTranspose = !isDrum;
      }
    }
    if (metadataChanged) this.opts.onHostStateChanged?.();
    this.emitState();
  }

  private emitState(): void {
    const snap = this.getState();
    this.listeners.forEach((fn) => fn(snap));
  }
}

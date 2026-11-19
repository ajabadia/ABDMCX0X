/**
 * ABDMCX0X -- McxRackSlotBridge.ts
 * Implements FxFaceplateBridge to connect FxFaceplateModal with C++ McxRackChassis.
 * Strict line limit: < 200 lines.
 */

import { getFxDescriptor } from '@abdsynths/shared/components';
import type { FxFaceplateBridge, FxDescriptor } from '@abdsynths/shared/contracts';
import type { McxHostBridge } from './McxHostBridge';

export interface McxRackSlotPatch {
  p1?: number;
  p2?: number;
  mix?: number;
  bypass?: boolean;
  duck?: boolean;
  presetIdx?: number;
  params?: Record<string, number>;
}

export interface McxRackSlotInitialState {
  slotIdx: number;
  algoId: string;
  name: string;
  p1?: number;
  p2?: number;
  mix?: number;
  bypass?: boolean;
  duck?: boolean;
  presetIdx?: number;
  params?: Record<string, number>;
  onStateSync?: (slotIdx: number, patch: McxRackSlotPatch) => void;
}

export class McxRackSlotBridge implements FxFaceplateBridge {
  private host: McxHostBridge;
  private slotIdx: number;
  private algoId: string;
  private desc: FxDescriptor;
  private state: Record<string, number> = {};
  private bypassed = false;
  private ducking = { enabled: true, amount: 0.6 };
  private presetIdx = 0;
  private curPresetName = '';
  private onStateSync?: (slotIdx: number, patch: McxRackSlotPatch) => void;
  private listeners = new Set<(s: Record<string, number>) => void>();

  constructor(host: McxHostBridge, init: McxRackSlotInitialState) {
    this.host = host;
    this.slotIdx = init.slotIdx;
    this.algoId = init.algoId;
    this.onStateSync = init.onStateSync;
    this.desc = getFxDescriptor(init.algoId);
    this.bypassed = init.bypass ?? false;
    this.ducking = { enabled: init.duck ?? this.desc.canDuck, amount: 0.6 };
    this.presetIdx = init.presetIdx ?? 0;
    this.curPresetName = this.desc.presets[this.presetIdx] || this.desc.presets[0] || '';

    for (const p of this.desc.params) this.state[p.key] = p.defaultValue ?? 0.5;
    this.state.p1 = init.p1 ?? 0.5;
    this.state.p2 = init.p2 ?? 0.5;
    this.state.mix = init.mix ?? 1.0;
    if (init.p1 !== undefined) {
      this.state.rate = init.p1; this.state.decay = init.p1;
      this.state.time = init.p1; this.state.drive = init.p1;
    }
    if (init.p2 !== undefined) {
      this.state.intensity = init.p2; this.state.fb = init.p2; this.state.tone = init.p2;
      if (this.algoId !== 'stereo_delay') this.state.damp = init.p2;
      if (this.algoId !== 'mood_filter') this.state.depth = init.p2;
    }
    if (init.params) Object.assign(this.state, init.params);
  }

  getDescriptor(): FxDescriptor { return this.desc; }

  setParam(key: string, value: number): void {
    this.state[key] = value;
    if (['rate', 'decay', 'time', 'drive', 'p1'].includes(key)) this.state.p1 = value;
    if (['intensity', 'fb', 'tone', 'p2'].includes(key) || (key === 'damp' && this.algoId !== 'stereo_delay') || (key === 'depth' && this.algoId !== 'mood_filter')) this.state.p2 = value;
    if (key === 'mix') this.state.mix = value;

    this.host.setRackSlotParamByKey(this.slotIdx, key, value);
    this.onStateSync?.(this.slotIdx, {
      p1: this.state.p1,
      p2: this.state.p2,
      mix: this.state.mix,
      params: { ...this.state },
    });
    this.listeners.forEach((fn) => fn({ ...this.state }));
  }

  getParam(key: string): number { return this.state[key] ?? 0.5; }
  getState(): Record<string, number> { return { ...this.state }; }

  onStateChange(listener: (state: Record<string, number>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getPresetName(): string { return this.curPresetName; }
  getPresetIndex(): number { return this.presetIdx; }
  listFactoryPresets(): readonly string[] { return this.desc.presets; }

  loadFactoryPreset(index: number): boolean {
    if (index < 0 || index >= this.desc.presets.length) return false;
    this.presetIdx = index;
    this.curPresetName = this.desc.presets[index];
    this.host.setRackSlotPreset(this.slotIdx, index);
    this.onStateSync?.(this.slotIdx, { presetIdx: index });
    this.listeners.forEach((fn) => fn({ ...this.state }));
    return true;
  }

  setDucking(enabled: boolean, amount = 0.6): void {
    this.ducking = { enabled, amount };
    this.host.setRackSlotDucking(this.slotIdx, enabled, amount);
    this.onStateSync?.(this.slotIdx, { duck: enabled });
  }

  getDucking(): { enabled: boolean; amount: number } { return { ...this.ducking }; }

  setBypass(bypassed: boolean): void {
    this.bypassed = bypassed;
    this.host.setRackSlotBypass(this.slotIdx, bypassed);
    this.onStateSync?.(this.slotIdx, { bypass: bypassed });
  }

  isBypassed(): boolean { return this.bypassed; }

  setCustomName(name: string): void {
    this.host.setRackSlotName(this.slotIdx, name);
  }
}

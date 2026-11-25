/**
 * ABDMCX0X -- McxPartBankWaveOps.ts
 * Helper operations for PCM wave banks, audition, patch init, and remote state sync.
 * Strictly < 200 lines.
 */

import type { EnginePanelDescriptor, EnginePatchMeta, EngineWaveBank, EngineWaveItem } from '@abdsynths/shared/contracts';
import type { McxHostBridge } from './McxHostBridge';
import type { McxPartUiState } from '../ui/McxMixerConsole';
import type { McxAppState } from '../app/McxAppState';
import { assignWaveIntoPart, ensureBankLoaded, soundBankRegistry } from '../app/McxSoundBankManager';
import { extractRomplerPatchMeta, flattenEngineStateJson } from './McxRomplerStateFlatten';

export interface McxWaveOpsCtx {
  partIndex: number;
  hostBridge: McxHostBridge;
  getPartState: () => McxPartUiState;
  getDescriptor: () => EnginePanelDescriptor;
  appState?: McxAppState;
  onHostStateChanged?: () => void;
}

export function readPatchMeta(lastStateJson: string, fallbackName: string, isDrum: boolean): EnginePatchMeta {
  const meta = extractRomplerPatchMeta(lastStateJson);
  return {
    presetName: meta.presetName || fallbackName,
    isDrumKit: lastStateJson ? meta.isDrumKit : isDrum,
    partials: meta.partials,
    populatedDrumNotes: meta.populatedDrumNotes,
  };
}

export async function listAvailableWaveBanks(): Promise<EngineWaveBank[]> {
  return soundBankRegistry.getBanks().map((b) => ({
    id: b.id, name: b.name, slotIndex: b.slotIndex,
    waveCount: b.waves?.length ?? 0, isLoaded: Boolean(b.isLoaded), coverUrl: b.coverUrl,
  }));
}

export async function listWavesInWaveBank(ctx: McxWaveOpsCtx, bankIdOrName: string): Promise<EngineWaveItem[]> {
  const bank = await ensureBankLoaded(bankIdOrName, ctx.hostBridge, ctx.appState);
  return (bank?.waves || []).map((w) => ({
    index: w.index, id: w.id, name: w.name, rootKey: w.rootKey, oneShot: w.oneShot,
  }));
}

export async function assignWaveToPartTarget(
  ctx: McxWaveOpsCtx,
  bankIdOrName: string,
  waveIndex: number,
  targetKind: 'partial_wave' | 'drum_wave',
  targetIndex: number
): Promise<boolean> {
  const ok = await assignWaveIntoPart(ctx.hostBridge, ctx.appState, ctx.partIndex, bankIdOrName, waveIndex, targetKind, targetIndex);
  if (ok) {
    const ps = ctx.getPartState();
    ps.kind = targetKind === 'drum_wave' ? 'drum_map' : 'chromatic';
    ps.followTranspose = targetKind !== 'drum_wave';
    ctx.onHostStateChanged?.();
  }
  return ok;
}

export function triggerPartAuditionNote(
  ctx: McxWaveOpsCtx,
  note: number,
  velocity: number,
  durationMs: number,
  prevTimer: ReturnType<typeof setTimeout> | null
): ReturnType<typeof setTimeout> | null {
  if (prevTimer !== null) clearTimeout(prevTimer);
  void ctx.hostBridge.enableAudio?.();
  ctx.hostBridge.noteOn(ctx.partIndex, note, velocity);
  if (durationMs <= 0) return null;
  return setTimeout(() => { ctx.hostBridge.noteOff(ctx.partIndex, note); }, durationMs);
}

export function runPartPatchInit(
  ctx: McxWaveOpsCtx,
  mode: 'chromatic' | 'drum_map' | undefined,
  loadFactoryFn: (idx: number) => boolean,
  setParamFn: (key: string, value: number) => void,
  savePresetFn: (name: string) => void
): void {
  const ps = ctx.getPartState();
  ps.coverUrl = undefined;
  ps.soundBankId = undefined;
  if (ctx.getDescriptor().typeId !== 'structured_rompler') {
    loadFactoryFn(0);
    savePresetFn('Init Patch');
    return;
  }
  const isDrum = mode === 'drum_map';
  loadFactoryFn(isDrum ? 16 : 0);
  if (!isDrum) {
    setParamFn('structure', 0);
    setParamFn('p1.enabled', 1); setParamFn('p1.source', 2); setParamFn('p1.wave', 0); setParamFn('p1.level', 0.85);
    setParamFn('p2.enabled', 0); setParamFn('p3.enabled', 0); setParamFn('p4.enabled', 0);
  }
  savePresetFn(isDrum ? 'Init Drum Kit' : 'Init Chromatic');
}

export function applyRemotePartStateSync(
  ps: McxPartUiState,
  defaultEngineTypeId: string,
  engineTypeId: string,
  stateJson: string,
  presetName?: string,
  coverUrl?: string
): { flatState?: Record<string, number>; metadataChanged: boolean; resolvedPresetName?: string } {
  let metadataChanged = false;
  const hadOtherEngine = Boolean(ps.engineTypeId && engineTypeId && engineTypeId !== ps.engineTypeId);
  const engineChanged = Boolean(engineTypeId && engineTypeId !== ps.engineTypeId);
  if (engineChanged) { ps.engineTypeId = engineTypeId; ps.name = presetName || ''; if (hadOtherEngine && !coverUrl) ps.coverUrl = undefined; metadataChanged = true; }
  else if (presetName && presetName !== ps.name) { ps.name = presetName; metadataChanged = true; }
  if (coverUrl && coverUrl !== ps.coverUrl) { ps.coverUrl = coverUrl; metadataChanged = true; }
  let flatState: Record<string, number> | undefined;
  if (stateJson) {
    flatState = flattenEngineStateJson(engineTypeId || defaultEngineTypeId, stateJson);
    if (Object.prototype.hasOwnProperty.call(flatState, 'mode.drum')) {
      const isDrum = flatState['mode.drum'] >= 0.5;
      const nextKind = isDrum ? 'drum_map' : 'chromatic';
      if (ps.kind !== nextKind) metadataChanged = true;
      ps.kind = nextKind;
      ps.followTranspose = !isDrum;
    }
  }
  return { flatState, metadataChanged, resolvedPresetName: presetName };
}

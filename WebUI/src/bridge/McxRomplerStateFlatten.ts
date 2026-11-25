/**
 * ABDMCX0X -- McxRomplerStateFlatten.ts
 * Canonical flat state builders, drum defaults & covers from @abdsynths/shared. Strictly < 80 lines.
 */

import {
  EMAX_FACTORY_PRESETS,
  TB303_FACTORY_PRESETS,
  buildDefaultRomplerFlatState,
  extractRomplerPatchMeta,
  flattenRomplerStateJson,
} from '@abdsynths/shared/components/synth-engines';

export { buildDefaultRomplerFlatState, extractRomplerPatchMeta, flattenRomplerStateJson };

export const DRUM_SLOT_DEFAULTS: Record<string, number> = {
  level: 1, pan: 0, cutoffHz: 14000, resonance: 0.1, decayMs: 280, muteGroup: 0, triggerMode: 0, pitchKeyTrack: 0, reverbSend: 0.25, chorusSend: 0, delaySend: 0,
};

export const ENGINE_DEFAULT_COVERS: Record<string, string> = {
  la50_synth: '/assets/models/roland-d50.webp',
  cm32_synth: '/assets/models/roland-cm32.webp',
  jv880_synth: '/assets/models/roland-jv880.webp',
  tb303_synth: '/assets/models/roland-tb303.webp',
  emax_synth: '/assets/models/emu-emax2.webp',
};

function extractNumericMap(obj: Record<string, any> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!obj) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export function getEngineFactoryPresetSnapshot(typeId: string, presetIndex: number): Record<string, number> | null {
  if (typeId === 'tb303_synth') {
    const p = TB303_FACTORY_PRESETS[presetIndex] ?? TB303_FACTORY_PRESETS[0];
    return p ? extractNumericMap(p) : null;
  }
  if (typeId === 'emax_synth') {
    const p = EMAX_FACTORY_PRESETS[presetIndex] ?? EMAX_FACTORY_PRESETS[0];
    return p ? extractNumericMap(p) : null;
  }
  return null;
}

export function buildInitialEngineFlatState(typeId: string, partState: Record<string, any> = {}): Record<string, number> {
  if (typeId === 'tb303_synth' || typeId === 'emax_synth') {
    return getEngineFactoryPresetSnapshot(typeId, partState.factoryPresetIndex ?? 0) ?? {};
  }
  return buildDefaultRomplerFlatState(partState);
}

export function resolveFallbackParamValue(typeId: string, partState: Record<string, any>, key: string): number {
  if (key.startsWith('drum.')) {
    const [, noteStr, sub] = key.split('.');
    if (sub === 'coarseKey') return Number(noteStr) || 60;
    if (sub && sub in DRUM_SLOT_DEFAULTS) return DRUM_SLOT_DEFAULTS[sub];
  }
  const fb = buildInitialEngineFlatState(typeId, partState)[key];
  return Number.isFinite(fb) ? fb : 0;
}

export function flattenEngineStateJson(engineTypeId: string, stateJson: string): Record<string, number> {
  return flattenRomplerStateJson(stateJson, engineTypeId);
}

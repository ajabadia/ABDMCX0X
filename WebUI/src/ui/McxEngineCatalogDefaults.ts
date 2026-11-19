/**
 * ABDMCX0X -- McxEngineCatalogDefaults.ts
 * Fallback descriptors for multi-engine slots, factory Rompler patches, and mixer route badges.
 * Strict line limit: < 200 lines.
 */

import type { McxEngineDescriptorDto } from '../bridge/McxHostBridge';
import type { McxPartUiState } from './McxMixerConsole';

export const DEFAULT_ENGINE_CATALOG: McxEngineDescriptorDto[] = [
  {
    index: 0,
    typeId: 'structured_rompler',
    displayName: 'ABD Structured Rompler',
    supportsDrumMode: true,
    supportsChromaticMode: true,
    supportsBankArchives: true,
    maxRecommendedInstances: 16,
  },
  {
    index: 1,
    typeId: 'external_midi',
    displayName: 'Hardware Externo (MIDI Out)',
    supportsDrumMode: true,
    supportsChromaticMode: true,
    supportsBankArchives: false,
    maxRecommendedInstances: 16,
  },
];

export const DEFAULT_ROMPLER_PRESETS: ReadonlyArray<{ index: number; name: string; isDrum: boolean }> = [
  { index: 0, name: 'TB-303 Acid Bass', isDrum: false },
  { index: 1, name: 'SuperSaw Rave Lead', isDrum: false },
  { index: 2, name: 'Juno Poly Pad', isDrum: false },
  { index: 3, name: 'Reso Sweep Synth', isDrum: false },
  { index: 4, name: 'Pizzicato Pluck', isDrum: false },
  { index: 5, name: 'FM Digital Bell', isDrum: false },
  { index: 6, name: 'Sub Techno Bass', isDrum: false },
  { index: 7, name: 'Noise Sweep FX', isDrum: false },
  { index: 8, name: 'Square Lead 80s', isDrum: false },
  { index: 9, name: 'Eurodance Bass', isDrum: false },
  { index: 10, name: 'Warm Brass Ensemble', isDrum: false },
  { index: 11, name: 'Sine Arp Staccato', isDrum: false },
  { index: 12, name: 'Detuned Saw Chord', isDrum: false },
  { index: 13, name: 'Electro Slap Bass', isDrum: false },
  { index: 14, name: 'Ambient Crystal Pad', isDrum: false },
  { index: 15, name: 'RingMod Percussion', isDrum: false },
  { index: 16, name: '90s Groove Kit', isDrum: true },
  { index: 17, name: 'HipHop / LoFi Kit', isDrum: true },
  { index: 18, name: 'SynthPop 80s Kit', isDrum: true },
  { index: 19, name: 'Industrial Acid Kit', isDrum: true },
];

export function getFallbackPresetsForEngine(engineTypeIndex: number): Array<{ index: number; name: string }> {
  if (engineTypeIndex !== 0) return [];
  return DEFAULT_ROMPLER_PRESETS.map((p) => ({ index: p.index, name: p.name }));
}

export interface McxRouteBadgeInfo {
  routeTag: string;
  engineTag: string;
  variant: 'int' | 'drum' | 'ext' | 'both';
  tooltip: string;
}

export function getShortEngineBadge(
  ps: McxPartUiState,
  catalog?: McxEngineDescriptorDto[]
): McxRouteBadgeInfo {
  const routeMode = ps.routeMode ?? 0;
  const engIdx = ps.engineTypeIndex ?? 0;
  const isDrum = ps.kind === 'drum_map';
  const chTag = `C${String(ps.midiChannel || 1).padStart(2, '0')}`;

  if (routeMode === 1 || engIdx === 1) {
    return {
      routeTag: 'EXT',
      engineTag: chTag,
      variant: 'ext',
      tooltip: `Ruta Externa MIDI (${chTag}) — Clic para configurar motor y ruta`,
    };
  }

  const desc = catalog?.find((e) => e.index === engIdx);
  const typeId = desc?.typeId || ps.engineTypeId || 'structured_rompler';
  const engineTag = typeId === 'structured_rompler'
    ? (isDrum ? 'DRM' : 'ROM')
    : typeId.slice(0, 3).toUpperCase();

  if (routeMode === 2) {
    return {
      routeTag: 'A+B',
      engineTag,
      variant: 'both',
      tooltip: `Capa Interna + MIDI Externo (${chTag}) — Clic para configurar`,
    };
  }

  return {
    routeTag: 'INT',
    engineTag,
    variant: isDrum ? 'drum' : 'int',
    tooltip: `Motor Interno (${engineTag}) — Clic para cambiar motor, formato o ruta MIDI`,
  };
}

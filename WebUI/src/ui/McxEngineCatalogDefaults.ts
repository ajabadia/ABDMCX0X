/**
 * ABDMCX0X -- McxEngineCatalogDefaults.ts
 * Fallback descriptors for multi-engine slots, factory Rompler patches, and mixer route badges.
 * Strict line limit: < 200 lines.
 */

import { JV880_FACTORY_NAMES } from '@abdsynths/shared/components/synth-engines';
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
  {
    index: 2,
    typeId: 'mcs48_synth',
    displayName: 'MCS-48 Vintage Micro-Synth',
    supportsDrumMode: false,
    supportsChromaticMode: true,
    supportsBankArchives: false,
    maxRecommendedInstances: 16,
  },
  {
    index: 3,
    typeId: 'la50_synth',
    displayName: 'ABD Linear LA-50',
    supportsDrumMode: false,
    supportsChromaticMode: true,
    supportsBankArchives: false,
    maxRecommendedInstances: 8,
  },
  {
    index: 4,
    typeId: 'cm32_synth',
    displayName: 'ABD Linear CM-32L',
    supportsDrumMode: false,
    supportsChromaticMode: true,
    supportsBankArchives: false,
    maxRecommendedInstances: 8,
  },
  {
    index: 5,
    typeId: 'jv880_synth',
    displayName: 'ABD Super JV-880',
    supportsDrumMode: false,
    supportsChromaticMode: true,
    supportsBankArchives: true,
    maxRecommendedInstances: 16,
  },
  {
    index: 6,
    typeId: 'tb303_synth',
    displayName: 'ABD TB-303 Acid Bassline',
    supportsDrumMode: false,
    supportsChromaticMode: true,
    supportsBankArchives: false,
    maxRecommendedInstances: 16,
  },
  {
    index: 7,
    typeId: 'emax_synth',
    displayName: 'E-mu Emax II Player',
    supportsDrumMode: false,
    supportsChromaticMode: true,
    supportsBankArchives: true,
    maxRecommendedInstances: 16,
  },
  {
    index: 8,
    typeId: 'abyssmind_synth',
    displayName: 'AbyssMind Analog Synthesizer',
    supportsDrumMode: false,
    supportsChromaticMode: true,
    supportsBankArchives: true,
    maxRecommendedInstances: 8,
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
  if (engineTypeIndex === 0) return DEFAULT_ROMPLER_PRESETS.map((p) => ({ index: p.index, name: p.name }));
  if (engineTypeIndex === 2) return ['Classic Square (MonoVoice)', 'Enhanced Wave (EnhancedVoice)', 'Tight Chiptune Lead'].map((name, index) => ({ index, name }));
  if (engineTypeIndex === 3) {
    return [
      'Fantasia', 'Metal Harp', 'Jazz Guitar Duo', 'Arco Strings', 'Horn Section', 'Living Calliope', 'D-50 Voices', 'Slow Rotor',
      'DigitalNativeDance', 'Bass Marimba', 'Flute-Piano Duo', 'Combie Strings', 'Harpsichord Stabs', 'Griitttarr', 'Nylon Atmosphere', 'Synthetic Electric',
      'Breathy Chiffer', 'Gamelan Bell', 'Slap Brass', 'PressureMe Strings', 'Rich Brass', 'Pipe Solo', 'Soundtrack', 'Cathedral Organ',
      'Shamus Theme', 'Vibraphone', 'Basin Strat Blues', 'Pizzagogo', 'Flutish Brass', 'Pressure Me Lead', 'Spacious Sweep', 'Piano-Fifty',
      'Glass Voices', 'Hollowed Harp', 'Ethnic Session', 'Jete Strings', 'Stereo Polysynth', 'Tine Wave', 'Syn-Harmonium', 'Rock Organ',
      'Staccato Heaven', 'Oriental Bells', 'E-Bass and E-Piano', 'Legato Strings', 'JX Horns-Strings', 'Shakuhachi', 'Choir', 'Picked Guitar Duo',
      'Nightmare', 'Syn Marimba', 'Slap Bass n Brass', 'String Ensemble', 'Velo-Brass', 'Digital Cello', 'O K  Chorale', 'Pianissimo',
      'Intruder FX', 'Steel Pick', 'Synth Bass', 'Afterthought', 'Bones', 'Bottle Blower', 'Future Pad', 'PCM E-Piano',
    ].map((name, index) => ({ index, name }));
  }
  if (engineTypeIndex === 5) return JV880_FACTORY_NAMES.map((name, index) => ({ index, name }));
  if (engineTypeIndex === 6) {
    return [
      'Classic Silver 303', 'Hard Acid Squelch', 'Devilfish RAT Lead', 'Sub Square Dub',
      'Phuture 1987', 'Tokyo Resonant Saw', 'Liquid Bubble 303', 'Industrial Overdrive',
      'Plastic Square Pluck', 'Slow Filter Sweep', 'Detroit Rubber Bass', 'Screaming Diode',
      'Warm Analog Sub', 'Fast Decay Perc 303', 'Cyber Acid Slide', 'Clean Init 303',
    ].map((name, index) => ({ index, name }));
  }
  if (engineTypeIndex === 7) {
    return ['Init Piano', 'Init Strings', 'Init Brass', 'Init Bass', 'Init Pad', 'Init Pluck', 'Init Organ', 'Init FX'].map((name, index) => ({ index, name }));
  }
  return [];
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
    : (typeId === 'mcs48_synth' ? 'M48' : (typeId === 'la50_synth' ? 'LA50' : (typeId === 'cm32_synth' ? 'CM32' : (typeId === 'jv880_synth' ? 'JV88' : (typeId === 'tb303_synth' ? '303' : (typeId === 'emax_synth' ? 'EMAX' : typeId.slice(0, 3).toUpperCase()))))));

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

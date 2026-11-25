/**
 * ABDMCX0X -- McxPartState.ts
 * Per-part UI state contract and default factory for the 16-part mixer and drawers.
 */

import { DEFAULT_ROMPLER_PRESETS } from './McxEngineCatalogDefaults';

export interface McxPartUiState {
  enabled?: boolean;
  kind: 'chromatic' | 'drum_map'; midiChannel: number; mute: boolean; solo: boolean;
  followTranspose?: boolean; name?: string; categoryId?: number; thumbnailUri?: string;
  engineTypeIndex?: number; engineTypeId?: string; factoryPresetIndex?: number; arpEnabled?: boolean;
  arpMotif?: number; arpRate?: string; arpOctaves?: number; arpGate?: number; arpLatch?: number;
  cutoffOffset?: number; resonanceOffset?: number; envAttackOffset?: number; envDecayOffset?: number;
  envSustainOffset?: number; envReleaseOffset?: number; vibratoOffset?: number;
  portaEnabled?: boolean; portaTimeMs?: number; portaLegatoOnly?: boolean; routeMode?: number;
  midiPortIndex?: number; midiInPortIndex?: number; midiOutDeviceName?: string; midiInDeviceName?: string;
  patternSwing?: number; vectorX?: number; vectorY?: number;
  partLevel?: number; partPan?: number; reverbSend?: number; chorusSend?: number; delaySend?: number; auxSend?: number;
  sendAPre?: boolean; sendBPre?: boolean; sendCPre?: boolean; sendDPre?: boolean; insertSlot?: number;
  filterCutoff?: number; filterResonance?: number; filterModel?: number; filterMode?: number;
  filter2Enabled?: boolean; filter2Model?: number; filter2Mode?: number; filter2Cutoff?: number; filter2Resonance?: number;
  pitchCoarse?: number; pitchFine?: number; structureMode?: number; dacCharacter?: number; driveType?: number;
  ampAttack?: number; ampDecay?: number; ampSustain?: number; ampRelease?: number;
  driveAmount?: number; eqLowGain?: number; eqMidGain?: number; eqHighGain?: number;
  lfo1Shape?: number; lfo1Sync?: boolean; lfo1Trigger?: number; lfo1Rate?: number; lfo1Delay?: number; lfo1Depth?: number; lfo1Target?: number;
  lfo2Shape?: number; lfo2Sync?: boolean; lfo2Trigger?: number; lfo2Rate?: number; lfo2Delay?: number; lfo2Depth?: number; lfo2Target?: number;
  sliceMap?: Record<number, string>; coverUrl?: string;
  soundBankId?: string; soundBankName?: string; soundBankSlotIndex?: number;
  soundBankItemIndex?: number; soundBankKind?: 'tone' | 'drum_kit';
  sequence?: { bars: number; ppq: number; mode?: 'chromatic' | 'drum'; notes: Array<{ midiNote: number; startTick: number; durationTicks: number; velocity: number }>; motion?: Record<string, any[]> };
}

export function createDefaultPartState(i: number): McxPartUiState {
  const isClean = i >= 16;
  const isDrum = !isClean && i === 9;
  const presetIdx = isClean ? 0 : (isDrum ? 16 : i);
  const presetName = isClean ? 'Init Tone' : (isDrum ? 'TR-909 Kit' : (DEFAULT_ROMPLER_PRESETS[i]?.name ?? `Sound P${i + 1}`));
  return {
    enabled: !isClean,
    kind: isDrum ? 'drum_map' : 'chromatic', midiChannel: (i % 16) + 1, mute: false, solo: false,
    followTranspose: !isDrum, name: presetName, categoryId: isDrum ? 8 : 3,
    engineTypeIndex: 0, engineTypeId: 'structured_rompler', factoryPresetIndex: presetIdx, arpEnabled: false,
    cutoffOffset: 0, resonanceOffset: 0, envAttackOffset: 0, envDecayOffset: 0,
    envSustainOffset: 0, envReleaseOffset: 0, vibratoOffset: 0,
    portaEnabled: false, portaTimeMs: 60, portaLegatoOnly: true, routeMode: 0,
    midiPortIndex: 0, midiInPortIndex: isClean ? -1 : 0, midiOutDeviceName: '', midiInDeviceName: '',
    patternSwing: 0.50, vectorX: 0, vectorY: 0, partLevel: 0.85, partPan: 0,
    reverbSend: 0.28, chorusSend: 0.20, delaySend: 0.0, auxSend: 0.0,
    sendAPre: false, sendBPre: false, sendCPre: false, sendDPre: false,
    filterCutoff: 0.72, filterResonance: 0.18, filterModel: 0, filterMode: 0,
    filter2Enabled: false, filter2Model: 0, filter2Mode: 1, filter2Cutoff: 0.85, filter2Resonance: 0.10,
    pitchCoarse: 0, pitchFine: 0, structureMode: 0, dacCharacter: 0, driveType: 0,
    ampAttack: 0.04, ampDecay: 0.25, ampSustain: 0.75, ampRelease: 0.18,
    driveAmount: 0.0, eqLowGain: 0.0, eqMidGain: 0.0, eqHighGain: 0.0,
    lfo1Shape: 0, lfo1Sync: false, lfo1Trigger: 0, lfo1Rate: 2.4, lfo1Delay: 0, lfo1Depth: 0.0, lfo1Target: 0,
    lfo2Shape: 1, lfo2Sync: false, lfo2Trigger: 0, lfo2Rate: 1.2, lfo2Delay: 0, lfo2Depth: 0.0, lfo2Target: 0,
    sequence: isDrum ? {
      bars: 1, ppq: 96, mode: 'drum',
      notes: [
        { midiNote: 36, startTick: 0, durationTicks: 24, velocity: 110 },
        { midiNote: 42, startTick: 24, durationTicks: 24, velocity: 90 },
        { midiNote: 38, startTick: 96, durationTicks: 24, velocity: 115 },
        { midiNote: 42, startTick: 120, durationTicks: 24, velocity: 90 },
        { midiNote: 36, startTick: 192, durationTicks: 24, velocity: 105 },
        { midiNote: 42, startTick: 216, durationTicks: 24, velocity: 90 },
        { midiNote: 38, startTick: 288, durationTicks: 24, velocity: 115 },
        { midiNote: 46, startTick: 360, durationTicks: 24, velocity: 100 },
      ],
      motion: {},
    } : undefined,
  };
}

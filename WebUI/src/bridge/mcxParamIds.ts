/**
 * ABDMCX0X -- mcxParamIds.ts
 * Canonical WASM / Native WebView2 parameter ID map (0..89).
 * Aligned with Source/Core/McxParamRouter.h.
 */

export const WASM_PARAM_ID = {
  filterCutoff: 0, filterResonance: 1, ampAttack: 2, ampDecay: 3, ampSustain: 4, ampRelease: 5,
  partLevel: 6, partPan: 7, reverbSend: 8, chorusSend: 9, routeMode: 10, persona: 11,
  dacCharacter: 12, filterModel: 13, structureMode: 14, vectorX: 15, vectorY: 16,
  reverbMacro: 17, chorusMacro: 18, reverbTime: 19, chorusRate: 20,
  diagProbePoint: 21, diagProbeFreq: 22, diagProbeLevel: 23, diagProbeWave: 24,
  partKind: 25, partMidiChannel: 26, partMute: 27, partSolo: 28, partFollowTranspose: 29,
  globalMaxPolyphony: 30, globalMasterTuneHz: 31, globalStandaloneBpm: 32,
  globalTranspose: 33, globalScale: 34, globalScaleRoot: 35, globalScaleQuantize: 36,
  eqEnabled: 37, eqLowGain: 38, eqLowFreq: 39, eqMidGain: 40, eqMidFreq: 41, eqMidQ: 42,
  eqHighGain: 43, eqHighFreq: 44, driveEnabled: 45, driveAmount: 46,
  delaySend: 47, auxSend: 48, sendAPre: 49, sendBPre: 50, sendCPre: 51, sendDPre: 52,
  pitchCoarse: 53, pitchFine: 54, portaEnabled: 55, portaTimeMs: 56, portaLegatoOnly: 57,
  arpEnabled: 58, stepMute: 59, stepAccent: 60, stepSlide: 61,
  filter2Enabled: 62, filter2Model: 63, filter2Mode: 64, filter2Cutoff: 65, filter2Resonance: 66,
  filterMode: 67,
  lfo1Shape: 68, lfo1Sync: 69, lfo1Trigger: 70, lfo1Rate: 71, lfo1Delay: 72, lfo1Depth: 73, lfo1Target: 74,
  lfo2Shape: 75, lfo2Sync: 76, lfo2Trigger: 77, lfo2Rate: 78, lfo2Delay: 79, lfo2Depth: 80, lfo2Target: 81,
  cutoffOffset: 82, resonanceOffset: 83, envAttackOffset: 84, envDecayOffset: 85,
  envSustainOffset: 86, envReleaseOffset: 87, vibratoOffset: 88, partMidiPort: 89,
} as const;

export type McxParamKey = keyof typeof WASM_PARAM_ID;

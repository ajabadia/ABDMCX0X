/**
 * ABDMCX0X — parameters.gen.ts
 * AUTOGENERADO POR Scripts/registry_generator.js — NO EDITAR MANUALMENTE
 */

export interface ParameterDef {
  index: number;
  id: string;
  name: string;
  group: string;
  scope: string;
  semanticRole: string;
  type: string;
  min: number;
  max: number;
  defaultValue: number;
  unit: string;
  choices?: string[];
  wire: string;
  cc?: number;
  nrpnMsb?: number;
  nrpnLsb?: number;
}

export const PARAM_DEFINITIONS: ParameterDef[] = [
  {
    "index": 0,
    "id": "masterVolumeDb",
    "name": "Master Volume",
    "group": "Master",
    "scope": "global",
    "semanticRole": "MasterVolume",
    "type": "continuous",
    "min": 0,
    "max": 127,
    "defaultValue": 100,
    "unit": "dB",
    "wire": "CC",
    "cc": 7
  },
  {
    "index": 1,
    "id": "outputCharacter",
    "name": "Output DAC Character",
    "group": "Master",
    "scope": "global",
    "semanticRole": "OutputDacCharacter",
    "type": "choice",
    "min": 0,
    "max": 2,
    "defaultValue": 1,
    "unit": "enum",
    "choices": [
      "HD Studio (32-bit)",
      "90s Rompler (16-bit)",
      "Vintage Sampler (12-bit)"
    ],
    "wire": "None"
  },
  {
    "index": 2,
    "id": "focusedPartIndex",
    "name": "Focused Part Index",
    "group": "PartMixer",
    "scope": "global",
    "semanticRole": "FocusedPartIndex",
    "type": "integer",
    "min": 0,
    "max": 15,
    "defaultValue": 0,
    "unit": "enum",
    "wire": "None"
  },
  {
    "index": 3,
    "id": "partRouteMode",
    "name": "Part Audio/MIDI Route",
    "group": "PartMixer",
    "scope": "part",
    "semanticRole": "PartRouteMode",
    "type": "choice",
    "min": 0,
    "max": 2,
    "defaultValue": 0,
    "unit": "enum",
    "choices": [
      "INT (Internal)",
      "EXT (MIDI Hardware)",
      "BOTH (A/B Mirror)"
    ],
    "wire": "None"
  },
  {
    "index": 4,
    "id": "partLevel",
    "name": "Part Level",
    "group": "PartMixer",
    "scope": "part",
    "semanticRole": "PartLevel",
    "type": "continuous",
    "min": 0,
    "max": 127,
    "defaultValue": 100,
    "unit": "normalized",
    "wire": "CC",
    "cc": 7
  },
  {
    "index": 5,
    "id": "partPan",
    "name": "Part Pan",
    "group": "PartMixer",
    "scope": "part",
    "semanticRole": "MasterPan",
    "type": "bipolar",
    "min": 0,
    "max": 127,
    "defaultValue": 64,
    "unit": "pan",
    "wire": "CC",
    "cc": 10
  },
  {
    "index": 6,
    "id": "partFilterModel",
    "name": "Filter Model",
    "group": "Filter",
    "scope": "part",
    "semanticRole": "FilterModel",
    "type": "choice",
    "min": 0,
    "max": 5,
    "defaultValue": 5,
    "unit": "enum",
    "choices": [
      "SVF Clean",
      "Roland TVF ZDF",
      "MS-20 Acid",
      "Ladder Drive",
      "Z-Plane Morph",
      "Roland TC6116 TVF"
    ],
    "wire": "None"
  },
  {
    "index": 7,
    "id": "tvfCutoffOffset",
    "name": "Filter Cutoff",
    "group": "Filter",
    "scope": "part",
    "semanticRole": "FilterCutoff",
    "type": "bipolar",
    "min": 14,
    "max": 114,
    "defaultValue": 64,
    "unit": "Hz",
    "wire": "Nrpn",
    "nrpnMsb": 1,
    "nrpnLsb": 32
  },
  {
    "index": 8,
    "id": "tvfResonanceOffset",
    "name": "Filter Resonance",
    "group": "Filter",
    "scope": "part",
    "semanticRole": "FilterResonance",
    "type": "bipolar",
    "min": 14,
    "max": 114,
    "defaultValue": 64,
    "unit": "%",
    "wire": "Nrpn",
    "nrpnMsb": 1,
    "nrpnLsb": 33
  },
  {
    "index": 9,
    "id": "zplaneMorph",
    "name": "Z-Plane Frame Morph",
    "group": "Filter",
    "scope": "part",
    "semanticRole": "FilterMorph",
    "type": "continuous",
    "min": 0,
    "max": 127,
    "defaultValue": 0,
    "unit": "normalized",
    "wire": "CC",
    "cc": 70
  },
  {
    "index": 10,
    "id": "envAttackOffset",
    "name": "Env Attack Offset",
    "group": "Envelopes",
    "scope": "part",
    "semanticRole": "AmpEnvAttack",
    "type": "bipolar",
    "min": 14,
    "max": 114,
    "defaultValue": 64,
    "unit": "ms",
    "wire": "Nrpn",
    "nrpnMsb": 1,
    "nrpnLsb": 99
  },
  {
    "index": 11,
    "id": "envDecayOffset",
    "name": "Env Decay Offset",
    "group": "Envelopes",
    "scope": "part",
    "semanticRole": "AmpEnvDecay",
    "type": "bipolar",
    "min": 14,
    "max": 114,
    "defaultValue": 64,
    "unit": "ms",
    "wire": "Nrpn",
    "nrpnMsb": 1,
    "nrpnLsb": 100
  },
  {
    "index": 12,
    "id": "envReleaseOffset",
    "name": "Env Release Offset",
    "group": "Envelopes",
    "scope": "part",
    "semanticRole": "AmpEnvRelease",
    "type": "bipolar",
    "min": 14,
    "max": 114,
    "defaultValue": 64,
    "unit": "ms",
    "wire": "Nrpn",
    "nrpnMsb": 1,
    "nrpnLsb": 102
  },
  {
    "index": 13,
    "id": "partReverbSend",
    "name": "Reverb Send",
    "group": "Effects",
    "scope": "part",
    "semanticRole": "ReverbSend",
    "type": "continuous",
    "min": 0,
    "max": 127,
    "defaultValue": 40,
    "unit": "%",
    "wire": "CC",
    "cc": 91
  },
  {
    "index": 14,
    "id": "partChorusSend",
    "name": "Chorus / Delay Send",
    "group": "Effects",
    "scope": "part",
    "semanticRole": "ChorusSend",
    "type": "continuous",
    "min": 0,
    "max": 127,
    "defaultValue": 0,
    "unit": "%",
    "wire": "CC",
    "cc": 93
  },
  {
    "index": 15,
    "id": "partDrive",
    "name": "Voice Overdrive",
    "group": "Effects",
    "scope": "part",
    "semanticRole": "SaturationDrive",
    "type": "continuous",
    "min": 0,
    "max": 127,
    "defaultValue": 0,
    "unit": "%",
    "wire": "None"
  },
  {
    "index": 16,
    "id": "vectorX",
    "name": "Vector Joystick X",
    "group": "Voice",
    "scope": "part",
    "semanticRole": "VectorX",
    "type": "bipolar",
    "min": -64,
    "max": 63,
    "defaultValue": 0,
    "unit": "normalized",
    "wire": "None"
  },
  {
    "index": 17,
    "id": "vectorY",
    "name": "Vector Joystick Y",
    "group": "Voice",
    "scope": "part",
    "semanticRole": "VectorY",
    "type": "bipolar",
    "min": -64,
    "max": 63,
    "defaultValue": 0,
    "unit": "normalized",
    "wire": "None"
  },
  {
    "index": 18,
    "id": "arpEnabled",
    "name": "Groove Arp Enable",
    "group": "Arpeggiator",
    "scope": "part",
    "semanticRole": "ArpEnable",
    "type": "boolean",
    "min": 0,
    "max": 1,
    "defaultValue": 0,
    "unit": "enum",
    "wire": "None"
  },
  {
    "index": 19,
    "id": "arpMotif",
    "name": "Groove Arp Motif",
    "group": "Arpeggiator",
    "scope": "part",
    "semanticRole": "ArpMotif",
    "type": "choice",
    "min": 0,
    "max": 11,
    "defaultValue": 0,
    "unit": "enum",
    "choices": [
      "Up",
      "Down",
      "Alt1",
      "Alt2",
      "Random",
      "Chord",
      "AsPlayed",
      "UpDownInv",
      "BassPlusChord",
      "OctaveJump",
      "StrumUp",
      "StrumDown"
    ],
    "wire": "None"
  },
  {
    "index": 20,
    "id": "arpResolution",
    "name": "Groove Arp Resolution",
    "group": "Arpeggiator",
    "scope": "part",
    "semanticRole": "ArpResolution",
    "type": "integer",
    "min": 0,
    "max": 15,
    "defaultValue": 3,
    "unit": "enum",
    "wire": "None"
  },
  {
    "index": 21,
    "id": "arpSwing",
    "name": "Groove Arp Swing",
    "group": "Arpeggiator",
    "scope": "part",
    "semanticRole": "ArpSwing",
    "type": "bipolar",
    "min": -100,
    "max": 100,
    "defaultValue": 0,
    "unit": "%",
    "wire": "None"
  },
  {
    "index": 22,
    "id": "machinePersona",
    "name": "Machine Persona Mode",
    "group": "Master",
    "scope": "global",
    "semanticRole": "MachinePersona",
    "type": "choice",
    "min": 0,
    "max": 6,
    "defaultValue": 0,
    "unit": "enum",
    "choices": [
      "Free / Super Mode",
      "Roland MC-303 (28-Partial)",
      "Roland MC-505 / D-2",
      "Yamaha CS2x / XG",
      "Korg N5 / AI2",
      "E-mu Orbit / Carnival",
      "Quasimidi Rave-O-Lution 309"
    ],
    "wire": "None"
  },
  {
    "index": 23,
    "id": "polyphonyVoices",
    "name": "Dynamic Polyphony Voices",
    "group": "Master",
    "scope": "global",
    "semanticRole": "PolyphonyLimit",
    "type": "integer",
    "min": 1,
    "max": 64,
    "defaultValue": 64,
    "unit": "voices",
    "wire": "None"
  },
  {
    "index": 24,
    "id": "partialBudgetMode",
    "name": "Partial Budget Mode",
    "group": "Master",
    "scope": "global",
    "semanticRole": "PartialBudgetMode",
    "type": "choice",
    "min": 0,
    "max": 3,
    "defaultValue": 0,
    "unit": "enum",
    "choices": [
      "Unlimited (Zero-Idle CPU)",
      "MC-303 Authentic (28 Partials)",
      "MC-505 / CS2x (64 Partials)",
      "Vintage 32-Partial"
    ],
    "wire": "None"
  },
  {
    "index": 25,
    "id": "drumMapMode",
    "name": "Drum Map Layout Mode",
    "group": "DrumRack",
    "scope": "part",
    "semanticRole": "DrumMapMode",
    "type": "choice",
    "min": 0,
    "max": 5,
    "defaultValue": 1,
    "unit": "enum",
    "choices": [
      "GM Standard (35..81)",
      "Roland GS / MC-303 (11..127)",
      "Yamaha XG / XS / CS2x (13..100)",
      "Korg AI2 / N5 (24..85)",
      "Hardware Native",
      "Proprietary Custom (0..127)"
    ],
    "wire": "None"
  }
];

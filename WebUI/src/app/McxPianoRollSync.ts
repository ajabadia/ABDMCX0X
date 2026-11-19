/**
 * ABDMCX0X -- McxPianoRollSync.ts
 * Configures PianoRollModal mode, drum map, automation targets, and shared Global LFO destinations.
 */

import type { PianoRollModal } from '@abdsynths/shared/components';
import type { McxHostBridge, McxParamKey } from '../bridge/McxHostBridge';
import type { McxPartUiState } from '../ui/McxMixerConsole';
import type { McxAppState } from './McxAppState';

export const GLOBAL_LFO1_DESTS = [
  { id: 0, label: 'BUS A (REV)', title: 'Bus A Reverb' },
  { id: 1, label: 'BUS B (CHO)', title: 'Bus B Chorus' },
  { id: 2, label: 'BUS C (DEL)', title: 'Bus C Delay' },
  { id: 3, label: 'BUS D (AUX)', title: 'Bus D Aux / Filter' },
  { id: 4, label: 'MASTER VCF', title: 'Filtro Maestro' },
  { id: 5, label: 'ALL PARTS', title: 'Modulación simultánea a 16 partes' },
];

export const GLOBAL_LFO2_DESTS = [
  { id: 0, label: 'FM -> LFO 1', title: 'Modulación cruzada hacia LFO Global 1' },
  { id: 1, label: 'BUS C DELAY', title: 'Flutter / Delay Time' },
  { id: 2, label: 'BUS D DRIVE', title: 'Saturación y Drive Maestro' },
  { id: 3, label: 'MASTER PAN', title: 'Auto-Pan Maestro' },
  { id: 4, label: 'MASTER VOL', title: 'Trémolo / Bombeo Master' },
  { id: 5, label: 'ALL PARTS', title: 'Modulación simultánea a 16 partes' },
];

const DEFAULT_DRUM_MAP: Record<number, string> = {
  35: 'Kick 2', 36: 'Kick 1', 37: 'Rimshot', 38: 'Snare 1',
  39: 'Clap', 40: 'Snare 2', 41: 'Low Tom', 42: 'Closed HH',
  43: 'Mid Tom', 44: 'Pedal HH', 45: 'Hi Tom', 46: 'Open HH',
  49: 'Crash', 51: 'Ride', 54: 'Tambourine', 56: 'Cowbell',
};

const PIANO_ROLL_TARGETS = [
  {
    id: 'velocity', label: 'Velocity / Accent (0-127)', isVelocity: true, min: 1, max: 127,
    colorBands: [
      { max: 100, colorToken: 'var(--color-accent)', label: 'Normal' },
      { max: 115, colorToken: 'var(--color-warning)', label: 'Accent' },
      { max: 127, colorToken: 'var(--color-danger)', label: 'Hard' },
    ],
  },
  {
    id: 'cutoff', label: 'Filter Cutoff (0-100%)', min: 0, max: 1, unit: '%',
    colorBands: [
      { max: 0.65, colorToken: 'var(--color-accent)', label: 'Warm' },
      { max: 0.85, colorToken: 'var(--color-warning)', label: 'Bright' },
      { max: 1.0, colorToken: 'var(--color-danger)', label: 'Open' },
    ],
  },
  { id: 'resonance', label: 'Filter Resonance (0-100%)', min: 0, max: 1, unit: '%' },
  { id: 'pan', label: 'Stereo Pan (L-C-R)', min: -1, max: 1, unit: '%' },
  { id: 'sendA', label: 'Send A - Reverb (0-100%)', min: 0, max: 1, unit: '%' },
  { id: 'sendB', label: 'Send B - Chorus (0-100%)', min: 0, max: 1, unit: '%' },
];

export function createGlobalLfoBridgeAdapter(bridge: McxHostBridge, state: McxAppState) {
  const cachedDepth: Record<number, number> = { 1: 0.5, 2: 0.5 };
  return {
    setParam: (rawKey: string, value: number | boolean) => {
      const m = /^globalLfo([12])_(.+)$/.exec(rawKey);
      if (!m) return;
      const idx = m[1] === '2' ? 2 : 1;
      const field = m[2];
      const part = state.focusedPart;
      const ps = state.partsState[part] as any;
      const pfx = idx === 2 ? 'lfo2' : 'lfo1';
      const numVal = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
      const map: Record<string, McxParamKey> = {
        shape: `${pfx}Shape` as McxParamKey,
        sync: `${pfx}Sync` as McxParamKey,
        trigger: `${pfx}Trigger` as McxParamKey,
        rateHz: `${pfx}Rate` as McxParamKey,
        division: `${pfx}Rate` as McxParamKey,
        delayMs: `${pfx}Delay` as McxParamKey,
        depth: `${pfx}Depth` as McxParamKey,
        target: `${pfx}Target` as McxParamKey,
      };
      if (field === 'depth') cachedDepth[idx] = numVal;
      if (field === 'mute' || field === 'enabled') {
        const effDepth = (field === 'mute' ? numVal > 0.5 : numVal < 0.5) ? 0 : cachedDepth[idx];
        const dk = `${pfx}Depth` as McxParamKey;
        if (ps) ps[dk] = effDepth;
        bridge.setParam(part, dk, effDepth);
        return;
      }
      const targetKey = map[field];
      if (!targetKey) return;
      if (ps) ps[targetKey] = field === 'sync' ? Boolean(numVal) : numVal;
      bridge.setParam(part, targetKey, numVal);
    },
  };
}

export function syncPianoRollPart(modal: PianoRollModal | null | undefined, ps: McxPartUiState, partIdx = 0): void {
  if (!modal) return;
  (modal as any).setPartIndex?.(partIdx);
  const isDrum = ps.kind === 'drum_map';
  modal.setMode(isDrum ? 'drum' : 'chromatic');
  if (isDrum) {
    const drumMap = ps.sliceMap || DEFAULT_DRUM_MAP;
    modal.setDrumMap(drumMap);
    const keys = Object.keys(drumMap).map(Number);
    modal.setPlayableRange({ min: Math.min(...keys, 35), max: Math.max(...keys, 56) });
  } else {
    modal.setPlayableRange(ps.categoryId === 2 ? { min: 24, max: 60 } : { min: 36, max: 84 });
  }
  modal.setAutomationTargets(PIANO_ROLL_TARGETS);
  if (ps.sequence) modal.loadSequence(ps.sequence);
  else modal.setNotes([]);
}

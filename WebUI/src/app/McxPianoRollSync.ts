/**
 * ABDMCX0X -- McxPianoRollSync.ts
 * Configures PianoRollModal mode, drum map, playable range, and automation targets per part.
 */

import type { PianoRollModal } from '@abdsynths/shared/components';
import type { McxPartUiState } from '../ui/McxMixerConsole';

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

export function syncPianoRollPart(modal: PianoRollModal | null | undefined, ps: McxPartUiState): void {
  if (!modal) return;
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

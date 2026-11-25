/**
 * ABDMCX0X -- McxStepStripHelpers.ts
 * Helper types, drum instruments, pitch utilities and pad state builders for McxStepStrip.
 * Strict line limit: < 200 lines. 100% tokenized.
 */

import {
  BANK_COLOR_VARS,
  formatSlotLabel,
  getTopStripPair,
  isBankMuted,
  isBankSoloed,
  type McxBankLayoutData,
} from './McxBankLayout';
import type { McxPartUiState } from './McxPartState';
import { t } from '../i18n/mcxI18n';

export type StepStripMode = 'part-select' | 'part-mute' | 'part-solo' | 'tr-rec' | 'step-mute' | 'step-accent' | 'step-slide';

export interface PadMapping {
  bankIdx: number | null;
  slotIdx: number;
  partId: number | null;
}

export interface DrumInstrumentDef {
  note: number;
  code: string;
  name: string;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const octave = Math.floor(clamped / 12) - 1;
  const name = NOTE_NAMES[clamped % 12];
  return `${name}${octave}`;
}

export const DRUM_INSTRUMENTS: readonly DrumInstrumentDef[] = [
  { note: 36, code: 'BD', name: 'Bass Drum / Kick' },
  { note: 38, code: 'SD', name: 'Snare Drum 1' },
  { note: 42, code: 'CH', name: 'Closed Hi-Hat' },
  { note: 46, code: 'OH', name: 'Open Hi-Hat' },
  { note: 39, code: 'CP', name: 'Hand Clap' },
  { note: 37, code: 'RS', name: 'Rimshot / Side Stick' },
  { note: 41, code: 'LT', name: 'Low Tom' },
  { note: 45, code: 'MT', name: 'Mid Tom' },
  { note: 48, code: 'HT', name: 'High Tom' },
  { note: 49, code: 'CR', name: 'Crash Cymbal' },
  { note: 51, code: 'RD', name: 'Ride Cymbal' },
];

export function getDrumInstrument(note: number): DrumInstrumentDef {
  const found = DRUM_INSTRUMENTS.find((d) => d.note === note);
  return found || { note, code: `D${note}`, name: `Drum ${note}` };
}

export function resolvePadMapping(layout: McxBankLayoutData, padIdx: number): PadMapping {
  const pair = getTopStripPair(layout.activeBank, layout.bankCount);
  const bankIdx = padIdx < 8 ? pair.leftBank : pair.rightBank;
  const slotIdx = padIdx % 8;
  const partId = bankIdx !== null ? (layout.banks[bankIdx]?.[slotIdx] ?? null) : null;
  return { bankIdx, slotIdx, partId };
}

export function buildPartPadState(
  mode: StepStripMode,
  focused: number,
  parts: McxPartUiState[],
  mapping: PadMapping,
  layout: McxBankLayoutData,
  anySolo: boolean,
) {
  if (mapping.bankIdx === null) {
    return { disabled: true, active: false, muted: false, solo: false, bankColor: null, legend: '---', subval: '---', tooltip: '' };
  }
  const bankColor = BANK_COLOR_VARS[mapping.bankIdx];
  const bankMuted = isBankMuted(layout, mapping.bankIdx);
  const bankSoloed = isBankSoloed(layout, mapping.bankIdx);
  const slotTag = formatSlotLabel(mapping.bankIdx, mapping.slotIdx);
  const p = mapping.partId !== null ? parts[mapping.partId] : undefined;
  if (!p || mapping.partId === null) {
    return { disabled: true, active: false, muted: false, solo: false, bankColor, legend: slotTag, subval: '---', tooltip: '' };
  }
  const trackName = p.name || (p.kind === 'drum_map' ? 'TR-909 Kit' : 'Init Tone');
  const statusTxt = p.solo || bankSoloed ? 'SOLO' : p.mute || bankMuted ? t('mcx.bankMutedStatus') : t('mcx.bankActiveStatus');
  const tooltip = `${slotTag} · ${trackName} — ${statusTxt} (CH${p.midiChannel})`;

  if (mode === 'part-select') {
    return {
      disabled: false,
      bankColor,
      tooltip,
      active: mapping.partId === focused,
      muted: p.mute || (!anySolo && bankMuted),
      solo: p.solo || bankSoloed,
      legend: slotTag,
      subval: p.kind === 'drum_map' ? 'DRM' : `CH${p.midiChannel}`,
    };
  }
  if (mode === 'part-solo') {
    return {
      disabled: false,
      bankColor,
      tooltip,
      active: p.solo || bankSoloed,
      muted: anySolo && !p.solo && !bankSoloed,
      solo: p.solo,
      legend: slotTag,
      subval: p.solo || bankSoloed ? 'SOLO' : '---',
    };
  }
  const effectiveMuted = p.mute || bankMuted;
  return {
    disabled: false,
    bankColor,
    tooltip,
    active: !effectiveMuted,
    muted: effectiveMuted,
    solo: p.solo,
    legend: slotTag,
    subval: effectiveMuted ? 'MUTE' : 'PLAY',
  };
}

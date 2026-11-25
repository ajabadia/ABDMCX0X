/** ABDMCX0X — wires pure Print helpers and 16-Levels previews into the active part. */
import type { McxHostBridge, McxParamKey } from '../bridge/McxHostBridge';
import type { McxAppState } from './McxAppState';
import {
  printArpPatternToPattern, printChordProgressionToPattern,
  type ArpMode, type ArpPrintOptions, type ChordPrintOptions, type PrintedNote,
} from './McxPrintArpToPattern';

export interface PadParamPreview { modKey: string; modNorm: number; note?: number; vel?: number }
export interface SeqNote { startTick: number; durationTicks: number; midiNote: number; velocity: number; slide: boolean }
export interface PartSequence { bars: number; ppq: number; mode: 'chromatic' | 'drum'; notes: SeqNote[]; motion: Record<string, any[]> }

const PREVIEW_TARGETS: Record<string, McxParamKey> = { cutoff: 'filterCutoff', decay: 'ampDecay', attack: 'ampAttack' };
const clamp01 = (v: number): number => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const tag = (idx: number): string => `P${String(idx + 1).padStart(2, '0')}`;

/** 16-Levels CUT/DEC/ATT preview writes the live part parameter. */
export function applyPadParamPreview(partIdx: number, preview: PadParamPreview, state: McxAppState, bridge: McxHostBridge): boolean {
  const key = PREVIEW_TARGETS[preview.modKey];
  const ps = state.partsState[partIdx];
  if (!key || !ps) return false;
  const value = clamp01(preview.modNorm);
  (ps as any)[key] = value;
  bridge.setParam(partIdx, key, value);
  state.refs.toneDrawer?.updateParamLive?.(key, value);
  state.setLcdLine2(`${tag(partIdx)} 16L ${preview.modKey.toUpperCase()} -> ${Math.round(value * 100)}%`);
  return true;
}

export const createPadParamPreviewHandler = (state: McxAppState, bridge: McxHostBridge) =>
  (partIdx: number, preview: PadParamPreview): boolean => applyPadParamPreview(partIdx, preview, state, bridge);

/** PrintedNote -> part sequence note; Roland accent is encoded as slide. */
export const printedToSeqNotes = (printed: readonly PrintedNote[]): SeqNote[] =>
  printed.map((n) => ({ startTick: n.tick, durationTicks: n.durationTicks, midiNote: n.note, velocity: n.velocity, slide: n.accent }));

export function buildPartSequence(printed: readonly PrintedNote[], bars: number, ppq: number,
  mode: 'chromatic' | 'drum' = 'chromatic'): PartSequence {
  return { bars: Math.max(1, bars), ppq: ppq === 480 ? 480 : 96, mode, notes: printedToSeqNotes(printed), motion: {} };
}

/** Single dump path: UI state, host bridge and open editors. */
export function dumpPrintedToPart(partIdx: number, seq: PartSequence, state: McxAppState, bridge: McxHostBridge): PartSequence {
  const ps = state.partsState[partIdx];
  if (ps) ps.sequence = seq as any;
  bridge.setPartPattern(partIdx, seq);
  state.refs.stepStrip?.syncFromSequence(partIdx, seq);
  state.refs.pianoRollModal?.setNotes?.(seq.notes);
  state.setLcdLine2(`${tag(partIdx)} PRINT -> SEQ (${seq.notes.length} NOTAS)`);
  return seq;
}

export function printArpToPart(partIdx: number, opts: ArpPrintOptions, state: McxAppState, bridge: McxHostBridge): PartSequence {
  return dumpPrintedToPart(partIdx, buildPartSequence(printArpPatternToPattern(opts), opts.bars, opts.ppq), state, bridge);
}

export function printChordsToPart(partIdx: number, opts: ChordPrintOptions, state: McxAppState, bridge: McxHostBridge): PartSequence {
  return dumpPrintedToPart(partIdx, buildPartSequence(printChordProgressionToPattern(opts), opts.bars, opts.ppq), state, bridge);
}

/** Arpeggiator motif/rate -> pure printer options. */
export const motifToArpMode = (motif: number): ArpMode =>
  motif === 1 ? 'down' : (motif === 2 || motif === 3 || motif === 7 ? 'updown' : motif === 5 ? 'chord' : 'up');

export function arpRateToStepTicks(rate: string, ppq = 96): number {
  const div: Record<string, number> = { '1/32': 8, '1/16T': 6, '1/16': 4, '1/8T': 3, '1/8': 2, '1/4': 1 };
  return Math.max(1, Math.round(ppq / (div[rate] ?? 4)));
}

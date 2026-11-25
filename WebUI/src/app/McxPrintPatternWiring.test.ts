/** ABDMCX0X — preview + Print -> SEQ wiring tests (no DOM, injected doubles). */
import { describe, expect, it, vi } from 'vitest';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import type { McxAppState } from './McxAppState';
import {
  applyPadParamPreview, arpRateToStepTicks, createPadParamPreviewHandler, motifToArpMode,
  printArpToPart, printChordsToPart, printedToSeqNotes,
} from './McxPrintPatternWiring';

function setup() {
  const setParam = vi.fn();
  const setPartPattern = vi.fn();
  const updateParamLive = vi.fn();
  const syncFromSequence = vi.fn();
  const setNotes = vi.fn();
  const setLcdLine2 = vi.fn();
  const state = {
    partsState: [{ filterCutoff: 0.72, ampDecay: 0.25, ampAttack: 0.04 }],
    focusedPart: 0,
    refs: { toneDrawer: { updateParamLive }, stepStrip: { syncFromSequence }, pianoRollModal: { setNotes } },
    setLcdLine2,
  } as unknown as McxAppState;
  const bridge = { setParam, setPartPattern } as unknown as McxHostBridge;
  return { state, bridge, setParam, setPartPattern, updateParamLive, syncFromSequence, setNotes, setLcdLine2 };
}

describe('onPadParamPreview', () => {
  it.each([
    ['cutoff', 'filterCutoff', 0.35],
    ['decay', 'ampDecay', 0.8],
    ['attack', 'ampAttack', 0.1],
  ])('maps %s to %s and applies it live', (modKey, paramKey, modNorm) => {
    const { state, bridge, setParam, updateParamLive, setLcdLine2 } = setup();
    const onPadParamPreview = createPadParamPreviewHandler(state, bridge);
    expect(onPadParamPreview(0, { modKey, modNorm, note: 60, vel: 100 })).toBe(true);
    expect(setParam).toHaveBeenCalledWith(0, paramKey, modNorm);
    expect((state.partsState[0] as any)[paramKey]).toBe(modNorm);
    expect(updateParamLive).toHaveBeenCalledWith(paramKey, modNorm);
    expect(setLcdLine2).toHaveBeenCalledWith(expect.stringContaining(modKey.toUpperCase()));
  });

  it('ignores velocity/tuning and clamps out-of-range modulation', () => {
    const { state, bridge, setParam } = setup();
    expect(applyPadParamPreview(0, { modKey: 'velocity', modNorm: 0.5 }, state, bridge)).toBe(false);
    expect(applyPadParamPreview(0, { modKey: 'tuning', modNorm: 0.5 }, state, bridge)).toBe(false);
    expect(setParam).not.toHaveBeenCalled();
    expect(applyPadParamPreview(0, { modKey: 'cutoff', modNorm: 2 }, state, bridge)).toBe(true);
    expect(setParam).toHaveBeenCalledWith(0, 'filterCutoff', 1);
  });
});

describe('Print -> SEQ', () => {
  it('converts PrintedNote[] to sequence notes with slide accents', () => {
    expect(printedToSeqNotes([{ tick: 12, durationTicks: 6, note: 61, velocity: 110, accent: true }]))
      .toEqual([{ startTick: 12, durationTicks: 6, midiNote: 61, velocity: 110, slide: true }]);
  });

  it('prints an arpeggio into the part and refreshes the editors', () => {
    const { state, bridge, setPartPattern, syncFromSequence, setNotes, setLcdLine2 } = setup();
    const seq = printArpToPart(0, {
      heldNotes: [60, 64, 67], mode: 'up', octaves: 1, stepTicks: 24, bars: 1, ppq: 96, velocity: 100,
    }, state, bridge);
    expect(setPartPattern).toHaveBeenCalledWith(0, seq);
    expect((state.partsState[0] as any).sequence).toBe(seq);
    expect(seq.bars).toBe(1);
    expect(seq.ppq).toBe(96);
    expect(seq.notes.length).toBeGreaterThan(0);
    expect(Object.keys(seq.notes[0]).sort()).toEqual(['durationTicks', 'midiNote', 'slide', 'startTick', 'velocity']);
    expect(syncFromSequence).toHaveBeenCalledWith(0, seq);
    expect(setNotes).toHaveBeenCalledWith(seq.notes);
    expect(setLcdLine2).toHaveBeenCalledWith(expect.stringContaining('PRINT -> SEQ'));
  });

  it('prints chords with host pattern and UI updates', () => {
    const { state, bridge, setPartPattern, syncFromSequence, setNotes } = setup();
    const seq = printChordsToPart(0, {
      bars: 1, ppq: 96, stepDivisionTicks: 48,
      events: [{ notes: [60, 64, 67], velocity: 120 }, { notes: [62, 65, 69] }],
    }, state, bridge);
    expect(seq.notes).toHaveLength(6);
    expect(seq.notes.filter((n) => n.slide)).toHaveLength(3);
    expect(seq.notes.every((n) => n.durationTicks > 0)).toBe(true);
    expect(setPartPattern).toHaveBeenCalledWith(0, seq);
    expect(syncFromSequence).toHaveBeenCalledWith(0, seq);
    expect(setNotes).toHaveBeenCalledWith(seq.notes);
  });

  it('maps arpeggiator motif and rate into printer options', () => {
    expect(motifToArpMode(0)).toBe('up');
    expect(motifToArpMode(1)).toBe('down');
    expect(motifToArpMode(2)).toBe('updown');
    expect(motifToArpMode(5)).toBe('chord');
    expect(arpRateToStepTicks('1/8', 96)).toBe(48);
    expect(arpRateToStepTicks('1/16', 96)).toBe(24);
    expect(arpRateToStepTicks('unknown')).toBe(24);
  });
});

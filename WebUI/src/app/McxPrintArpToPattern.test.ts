/** ABDMCX0X — Vitest coverage for pure abd_pattern printers. */
import { describe, expect, it } from 'vitest';
import {
  printArpPatternToPattern, printChordProgressionToPattern,
  type ArpPrintOptions, type PrintedNote,
} from './McxPrintArpToPattern';

const arp = (opts: Partial<ArpPrintOptions> = {}): PrintedNote[] => printArpPatternToPattern({
  heldNotes: [60, 64, 67], mode: 'up', octaves: 1,
  stepTicks: 24, bars: 1, ppq: 96, velocity: 100, accentVel: 120, ...opts,
});
const notesOf = (list: PrintedNote[]): number[] => list.map((n) => n.note);

describe('printArpPatternToPattern', () => {
  it('walks held notes upward with a Roland accent on the bar downbeat', () => {
    expect(arp().slice(0, 4)).toEqual([
      { tick: 0, durationTicks: 24, note: 60, velocity: 120, accent: true },
      { tick: 24, durationTicks: 24, note: 64, velocity: 100, accent: false },
      { tick: 48, durationTicks: 24, note: 67, velocity: 100, accent: false },
      { tick: 72, durationTicks: 24, note: 60, velocity: 100, accent: false },
    ]);
  });

  it('walks downward from the highest held note', () => {
    expect(notesOf(arp({ mode: 'down' }).slice(0, 3))).toEqual([67, 64, 60]);
    expect(arp({ mode: 'down' })[0].accent).toBe(true);
  });

  it('plays up-and-down without repeating the turning points', () => {
    expect(notesOf(arp({ mode: 'updown' }).slice(0, 5))).toEqual([60, 64, 67, 64, 60]);
  });

  it('emits the whole chord on every step in chord mode', () => {
    const list = arp({ mode: 'chord' });
    expect(list).toHaveLength(48);
    expect(list.slice(0, 3)).toEqual([
      { tick: 0, durationTicks: 24, note: 60, velocity: 120, accent: true },
      { tick: 0, durationTicks: 24, note: 64, velocity: 120, accent: true },
      { tick: 0, durationTicks: 24, note: 67, velocity: 120, accent: true },
    ]);
  });

  it('wraps octaves above the held chord', () => {
    expect(notesOf(arp({ octaves: 2 }).slice(0, 6))).toEqual([60, 64, 67, 72, 76, 79]);
  });

  it('clamps every note to MIDI 0..127', () => {
    const list = arp({ heldNotes: [-5, 0, 130], octaves: 2 });
    expect(list.every((n) => n.note >= 0 && n.note <= 127)).toBe(true);
    expect(new Set(notesOf(list))).toEqual(new Set([0, 7, 12, 127]));
  });

  it('treats velocity > 100 as an accent', () => {
    expect(arp({ velocity: 101, accentVel: undefined }).every((n) => n.accent && n.velocity === 120)).toBe(true);
    const list = arp({ velocity: 100, accentVel: 101 });
    expect(list[0]).toMatchObject({ velocity: 101, accent: true });
    expect(list[1]).toMatchObject({ velocity: 100, accent: false });
  });

  it('respects a one-note accent velocity across a short pattern', () => {
    const list = arp({ bars: 1, stepTicks: 192, velocity: 100, accentVel: 127 });
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ tick: 0, durationTicks: 192, velocity: 127, accent: true });
    expect(list[1]).toMatchObject({ tick: 192, durationTicks: 192, velocity: 100, accent: false });
  });
});

describe('printChordProgressionToPattern', () => {
  it('sorts unsorted chord events, applies gate and every-N accent', () => {
    const list = printChordProgressionToPattern({
      bars: 1, ppq: 96, stepDivisionTicks: 24, gateRatio: 0.5, accentEvery: 2,
      events: [
        { step: 4, notes: [64, 67, 71] },
        { step: 0, notes: [60, 64, 67], velocity: 100 },
        { step: 2, notes: [62, 65, 69] },
      ],
    });
    expect(list.map((n) => n.tick)).toEqual([0, 0, 0, 48, 48, 48, 96, 96, 96]);
    expect(list[0]).toEqual({ tick: 0, durationTicks: 12, note: 60, velocity: 100, accent: false });
    expect(list[3]).toEqual({ tick: 48, durationTicks: 12, note: 62, velocity: 120, accent: true });
    expect(list[6]).toEqual({ tick: 96, durationTicks: 12, note: 64, velocity: 100, accent: false });
  });

  it('clamps out-of-range chord notes and truncates the final gate', () => {
    const list = printChordProgressionToPattern({
      bars: 1, ppq: 96, stepDivisionTicks: 24, gateRatio: 1,
      events: [{ tick: 380, notes: [-3, 130, 60] }],
    });
    expect(notesOf(list)).toEqual([0, 60, 127]);
    expect(list.every((n) => n.durationTicks === 4)).toBe(true);
  });
});

/** ABDMCX0X — Vitest coverage for McxHistoryManager. */
import { describe, expect, it } from 'vitest';
import { createHistoryManager, type HistoryStatus } from './McxHistoryManager';

type State = { bpm: number; focus: number; bankLayoutJson: string };
const st = (bpm: number, focus = 0): State => ({ bpm, focus, bankLayoutJson: 'layout' });
const make = (maxSteps?: number, coalesceMs = 350) => createHistoryManager<State>({ maxSteps, coalesceMs });
const drift = (s: State, bpm: number) => ({ ...s, bpm });

describe('McxHistoryManager', () => {
  it('ignores a push with no change', () => {
    const h = make();
    h.init(st(100));
    expect(h.push(st(100))).toBe(false);
    expect(h.getStatus().undoCount).toBe(0);
    expect(h.push(st(110), 'tempo')).toBe(true);
    expect(h.push(st(110), 'tempo')).toBe(false);
  });

  it('coalesces one drag into one step and starts a new step after the window', () => {
    const h = make(undefined, 350);
    h.init(st(100));
    expect(h.push(st(110), 'fader', { coalesceKey: 'fader', nowMs: 0 })).toBe(true);
    expect(h.push(st(120), 'fader', { coalesceKey: 'fader', nowMs: 100 })).toBe(true);
    expect(h.push(st(130), 'fader', { coalesceKey: 'fader', nowMs: 500 })).toBe(true);
    expect(h.getStatus().undoCount).toBe(2);
    expect(h.undo()?.state.bpm).toBe(120);
    expect(h.undo()?.state.bpm).toBe(100);
    expect(h.undo()).toBeNull();
  });

  it('keeps chained undo/redo with labels', () => {
    const h = make();
    h.init(st(100));
    h.push(st(110), 'a');
    h.push(st(120), 'b');
    expect(h.undo()).toEqual({ state: st(110), label: 'b' });
    expect(h.undo()).toEqual({ state: st(100), label: 'a' });
    expect(h.redo()).toEqual({ state: st(110), label: 'a' });
    expect(h.redo()).toEqual({ state: st(120), label: 'b' });
    expect(h.redo()).toBeNull();
  });

  it('invalidates redo after a new push', () => {
    const h = make();
    h.init(st(100));
    h.push(st(110), 'old');
    expect(h.undo()?.state.bpm).toBe(100);
    expect(h.getStatus().canRedo).toBe(true);
    expect(h.push(st(120), 'new')).toBe(true);
    const status: HistoryStatus = h.getStatus();
    expect(status.canRedo).toBe(false);
    expect(status.redoCount).toBe(0);
    expect(status.undoLabel).toBe('new');
    expect(h.redo()).toBeNull();
  });

  it('trims history to maxSteps', () => {
    const h = make(2);
    h.init(st(100));
    h.push(st(110), '1');
    h.push(st(120), '2');
    h.push(st(130), '3');
    h.push(st(140), '4');
    expect(h.getStatus().undoCount).toBe(2);
    expect(h.undo()?.state.bpm).toBe(130);
    expect(h.undo()?.state.bpm).toBe(120);
    expect(h.undo()).toBeNull();
  });

  it('toggles A/B without losing edits made in either slot', () => {
    const h = make();
    const base = st(100, 0);
    expect(h.toggleCompare(base)).toBeNull();
    h.init(base);
    h.captureCompareBaseline(base);
    expect(h.getStatus().hasBaseline).toBe(true);
    expect(h.getStatus().compareMode).toBe('A');

    expect(h.toggleCompare(base)).toEqual({ mode: 'B', state: base });
    h.push(st(110, 1), 'B edit'); // consolidated into slot B
    expect(h.getStatus().compareMode).toBe('B');

    expect(h.toggleCompare(st(110, 1))).toEqual({ mode: 'A', state: base });
    h.push(st(120, 0), 'A edit');
    expect(h.toggleCompare(st(120, 0))).toEqual({ mode: 'B', state: st(110, 1) });
    expect(h.toggleCompare(st(110, 1))).toEqual({ mode: 'A', state: st(120, 0) });
  });

  it('captures a new baseline and clears history while keeping Compare', () => {
    const h = make();
    h.init(st(100));
    h.push(st(110), '1');
    h.captureCompareBaseline(st(90));
    expect(h.getStatus().compareMode).toBe('A');
    h.clear();
    expect(h.getStatus()).toMatchObject({ undoCount: 0, redoCount: 0, hasBaseline: true });
    expect(h.undo()).toBeNull();
    expect(h.toggleCompare(st(90))).toEqual({ mode: 'B', state: st(90) });
  });

  it('supports custom serializers and string snapshots', () => {
    const h = createHistoryManager<State>({
      serialize: (s) => JSON.stringify({ ...s, bankLayoutJson: s.bankLayoutJson }),
      deserialize: (raw) => JSON.parse(raw) as State,
    });
    h.init(st(100));
    expect(h.push(drift(st(100), 130))).toBe(true);
    expect(h.undo()?.state.bpm).toBe(100);
  });
});

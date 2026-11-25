/**
 * ABDMCX0X -- McxHistoryWiring.test.ts
 * Vitest integration tests for Undo/Redo (Ctrl+Z / Ctrl+Y) and Compare A/B wiring.
 * Strict line limit: < 120 lines.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultBankLayout } from '../ui/McxBankLayout';
import { createDefaultPartState } from '../ui/McxPartState';
import { mountHistoryWiring } from './McxHistoryWiring';

function createHarness() {
  const partsState = [createDefaultPartState(0), createDefaultPartState(1)];
  const origSetParam = vi.fn();
  const bridge = {
    setParam: origSetParam,
    setPartPattern: vi.fn(),
    setTempo: vi.fn(),
    setBankLayout: vi.fn(),
  };
  const state: any = {
    focusedPart: 0,
    partsState,
    bankLayout: createDefaultBankLayout(),
    globalSettings: { standaloneBpm: 120 },
    setLcdLine2: vi.fn(),
    updateLcdLine1: vi.fn(),
    refreshPartList: vi.fn(),
    syncBankLayoutToHost: vi.fn(),
    refs: { masterPanel: { setBpm: vi.fn() }, toneDrawer: { isOpen: () => false }, stepStrip: { syncFromSequence: vi.fn() } },
  };
  const onStatusChange = vi.fn();
  const history = mountHistoryWiring({ state, bridge: bridge as never, onStatusChange });
  return { state, bridge, history, onStatusChange, origSetParam };
}

describe('McxHistoryWiring', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('captura cambios de parte/BPM y ejecuta undo y redo sincronizando con el bridge', async () => {
    const { state, bridge, history, origSetParam } = createHarness();

    state.partsState[0].partLevel = 0.42;
    bridge.setParam(0, 'partLevel', 0.42);
    await Promise.resolve();

    expect(history.getStatus().canUndo).toBe(true);
    expect(history.undo()).toBe(true);
    expect(state.partsState[0].partLevel).toBe(0.85);
    expect(origSetParam).toHaveBeenLastCalledWith(0, 'partLevel', 0.85);
    expect(state.setLcdLine2).toHaveBeenCalledWith('UNDO: partLevel');

    expect(history.redo()).toBe(true);
    expect(state.partsState[0].partLevel).toBe(0.42);
    expect(origSetParam).toHaveBeenLastCalledWith(0, 'partLevel', 0.42);
    expect(state.setLcdLine2).toHaveBeenCalledWith('REDO: partLevel');

    history.destroy();
  });

  it('alterna Compare A/B preservando ediciones en B sin perder la referencia A', async () => {
    const { state, bridge, history } = createHarness();

    state.partsState[0].filterCutoff = 0.25;
    bridge.setParam(0, 'filterCutoff', 0.25);
    await Promise.resolve();

    // Baseline inicial quedó en A (0.72); el cambio actual se guarda al cambiar A <-> B
    expect(history.toggleCompare()).toBe(true);
    expect(history.getStatus().compareMode).toBe('B');

    expect(history.toggleCompare()).toBe(true);
    expect(history.getStatus().compareMode).toBe('A');
    expect(state.partsState[0].filterCutoff).toBe(0.25);

    history.captureBaseline();
    expect(history.getStatus().compareMode).toBe('A');
    expect(state.setLcdLine2).toHaveBeenCalledWith('COMPARE: REFERENCIA A CAPTURADA');

    history.destroy();
  });
});

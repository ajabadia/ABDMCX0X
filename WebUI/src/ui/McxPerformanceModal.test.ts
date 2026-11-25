import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { McxAppState } from '../app/McxAppState';
import { DEFAULT_ENGINE_CATALOG } from './McxEngineCatalogDefaults';
import { McxPerformanceModal } from './McxPerformanceModal';
import { exportProjectJson, importProjectJson } from '../app/McxProjectManager';

function makeMockBridge() {
  return {
    isNative: false,
    setParam: vi.fn(),
    setEngineParam: vi.fn(),
    setTempo: vi.fn(),
    setPartPattern: vi.fn(),
    setBankLayout: vi.fn(),
    requestPartEngineState: vi.fn(),
    requestPartPresets: vi.fn(),
    sendCommand: vi.fn(),
    loadLocalSettingsFallback: () => ({ workingDirectory: '', maxPolyphony: 64, masterTuneHz: 440, standaloneBpm: 120 }),
    loadLocalBankLayoutFallback: () => null,
    saveLocalBankLayoutFallback: vi.fn(),
    onNoteEvent: () => () => {},
  } as unknown as McxHostBridge;
}

describe('McxPerformanceModal (Bloque D integration)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('morphs live across engines and banks, honors FOLLOW/PIN and exposes fixed track strip', () => {
    const bridge = makeMockBridge();
    const state = new McxAppState(bridge);
    state.partsState[0].engineTypeId = 'structured_rompler';
    state.partsState[0].name = 'Lead Rompler';
    state.partsState[1].engineTypeId = 'tb303_synth';
    state.partsState[1].name = 'Acid 303';
    state.partsState[2].engineTypeId = 'mcs48_synth';
    state.partsState[2].name = 'Chip 48';

    const modal = new McxPerformanceModal({ bridge, state, getCatalog: () => DEFAULT_ENGINE_CATALOG });
    state.refs.performanceModal = modal;
    modal.open();
    expect(modal.isOpen()).toBe(true);
    expect(modal.deck.el.querySelectorAll('[data-slot-card]:not(.is-disabled)')).toHaveLength(10);
    expect(modal.deck.el.querySelector('.mcx-perf-track-strip')).not.toBeNull();

    state.focusPart(1);
    expect(modal.deck.el.querySelectorAll('[data-slot-card]:not(.is-disabled)')).toHaveLength(8);
    expect(modal.deck.el.querySelector('.abd-perf-deck-badge')?.textContent).toContain('TB303');

    (modal.deck.el.querySelector('[data-act="toggle-pin"]') as HTMLElement)?.click();
    expect(modal.getTargetPart()).toBe(1);
    state.focusPart(2);
    expect(modal.getTargetPart()).toBe(1);
    expect(modal.deck.el.querySelectorAll('[data-slot-card]:not(.is-disabled)')).toHaveLength(8);

    (modal.deck.el.querySelector('[data-act="toggle-pin"]') as HTMLElement)?.click();
    state.focusPart(2);
    expect(modal.getTargetPart()).toBe(2);
    expect(modal.deck.el.querySelectorAll('[data-slot-card]:not(.is-disabled)')).toHaveLength(6);
    expect(modal.deck.centralStick).toBeNull();
  });

  it('supports side-by-side LEARN, universal MIDI Learn and .mcxprj round-trip', () => {
    const bridge = makeMockBridge();
    const state = new McxAppState(bridge);
    state.partsState[1].engineTypeId = 'tb303_synth';
    state.partsState[1].name = 'Bass 303';
    state.focusPart(1);

    const modal = new McxPerformanceModal({ bridge, state, getCatalog: () => DEFAULT_ENGINE_CATALOG });
    modal.open();
    modal.deck.setEditMode(true);
    (modal.deck.el.querySelector('[data-act="learn-slot"][data-slot="8"]') as HTMLElement)?.click();
    expect(modal.handleExternalParamTouched(1, 'drive')).toBe(true);
    expect(modal.deck.el.querySelector('[data-sub-slot="8"]')?.textContent).toBe('Overdrive Gain');

    expect(modal.applyExternalMidiTarget('perf.macro.9', 0.7)).toBe(true);
    const val = modal.applyExternalMidiTarget('perf.macro.9', 0.9);
    expect(val).toBe(true);
    expect(bridge.setEngineParam).toHaveBeenCalledWith(1, 'drive', expect.any(Number));

    const saved = exportProjectJson(state, 'PerfTest');
    expect(saved).toContain('"performanceMaps"');

    const bridge2 = makeMockBridge();
    const state2 = new McxAppState(bridge2);
    expect(importProjectJson(state2, bridge2, saved)).toBe(true);
    expect(state2.performanceMaps['1:roland_tb303']?.macros[8].targets[0].paramId).toBe('drive');
  });
});

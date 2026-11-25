import { describe, expect, it, vi } from 'vitest';
import { McxAppState } from './McxAppState';
import {
  applyStarterTemplate,
  exportProjectJson,
  getRecentProjectsList,
  importProjectJson,
  recordRecentProject,
  resetToEmptyProject,
} from './McxProjectManager';

function createMockBridge(): any {
  return {
    isNative: false,
    loadLocalSettingsFallback: () => ({ masterTuneHz: 440, standaloneBpm: 120, maxPolyphony: 64 }),
    setParam: vi.fn(),
    setTempo: vi.fn(),
    allNotesOff: vi.fn(),
    setPartPattern: vi.fn(),
    resetToFactory: vi.fn(),
    syncBankLayout: vi.fn(),
    setBankLayout: vi.fn(),
    setTransportPlaying: vi.fn(),
    removeRackSlot: vi.fn(),
    setRackSlotBypass: vi.fn(),
    setSendSlotTarget: vi.fn(),
    setSendBusMute: vi.fn(),
    updateSceneSlot: vi.fn(),
    setSongModeEnabled: vi.fn(),
    setSongLoopEnabled: vi.fn(),
    clearLocalBankLayoutFallback: vi.fn(),
    setPartPresetName: vi.fn(),
    sendCommand: vi.fn(),
  };
}

describe('McxProjectManager', () => {
  it('resetToEmptyProject clears all parts, patterns, and sets clean state', () => {
    const bridge = createMockBridge();
    const state = new McxAppState(bridge);

    // Modify a part with a custom name and sequence
    state.partsState[0].name = 'Modified Lead';
    state.partsState[0].sequence = { bars: 2, ppq: 96, mode: 'chromatic', notes: [{ midiNote: 60, startTick: 0, durationTicks: 24, velocity: 100 }] };
    state.partsState[9].name = 'Modified Drum';

    resetToEmptyProject(state, bridge);

    // Part 0 should be Init Tone without sequence
    expect(state.partsState[0].name).toBe('Init Tone');
    expect(state.partsState[0].sequence).toBeUndefined();
    expect(state.partsState[0].kind).toBe('chromatic');
    expect(state.partsState[0].enabled).toBe(true);

    // Part 9 should be clean Part 10 without sequence
    expect(state.partsState[9].sequence).toBeUndefined();
    expect(state.partsState[9].enabled).toBe(false);

    // Pattern cleared on bridge
    expect(bridge.setPartPattern).toHaveBeenCalledWith(0, expect.objectContaining({ notes: [] }));
    expect(bridge.allNotesOff).toHaveBeenCalled();
  });

  it('applyStarterTemplate starter8 configures Bank A tracks', () => {
    const bridge = createMockBridge();
    const state = new McxAppState(bridge);

    applyStarterTemplate('starter8', state, bridge);

    expect(state.partsState[0].name).toBe('Kick Drum');
    expect(state.partsState[0].kind).toBe('drum_map');
    expect(state.partsState[4].name).toBe('Sub Bass');
    expect(state.partsState[4].kind).toBe('chromatic');
    expect(state.partsState[6].name).toBe('Lead Synth');
  });

  it('applyStarterTemplate electronic creates kick and hat sequences', () => {
    const bridge = createMockBridge();
    const state = new McxAppState(bridge);

    applyStarterTemplate('electronic', state, bridge);

    expect(state.partsState[0].name).toBe('TR-Kick');
    expect(state.partsState[0].sequence?.notes?.length).toBe(4);
    expect(state.partsState[2].name).toBe('TR-OpenHat');
    expect(state.partsState[2].sequence?.notes?.length).toBe(4);
  });

  it('applyStarterTemplate live64 enables all 64 parts with external MIDI routeMode', () => {
    const bridge = createMockBridge();
    const state = new McxAppState(bridge);

    applyStarterTemplate('live64', state, bridge);

    for (let i = 0; i < 64; ++i) {
      expect(state.partsState[i].enabled).toBe(true);
      expect(state.partsState[i].routeMode).toBe(1);
    }
  });

  it('exportProjectJson and importProjectJson serialize and restore project', () => {
    const bridge = createMockBridge();
    const state = new McxAppState(bridge);

    state.globalSettings.standaloneBpm = 135;
    state.partsState[0].name = 'Custom Bass';
    state.partsState[0].filterCutoff = 0.45;

    const json = exportProjectJson(state, 'TestProject');
    expect(json).toContain('Custom Bass');
    expect(json).toContain('"bpm": 135');

    // Mutate state
    state.partsState[0].name = 'Other';
    state.globalSettings.standaloneBpm = 100;

    // Restore
    const ok = importProjectJson(state, bridge, json);
    expect(ok).toBe(true);
    expect(state.partsState[0].name).toBe('Custom Bass');
    expect(state.globalSettings.standaloneBpm).toBe(135);
  });

  it('recordRecentProject updates recent list in localStorage', () => {
    recordRecentProject('SuperTrack', 128);
    const recents = getRecentProjectsList();
    expect(recents.some((r) => r.name === 'SuperTrack' && r.bpm === 128)).toBe(true);
  });
});

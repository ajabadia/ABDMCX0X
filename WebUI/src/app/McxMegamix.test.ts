import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McxAppState } from './McxAppState';
import { McxMegamixController } from './McxMegamixController';
import { exportProjectJson } from './McxProjectManager';
import type { McxHostBridge } from '../bridge/McxHostBridge';

function makeBridge() {
  return {
    isNative: false,
    setParam: vi.fn(),
    setTempo: vi.fn(),
    setPartPattern: vi.fn(),
    setBankLayout: vi.fn(),
    loadLocalSettingsFallback: () => ({ workingDirectory: '', maxPolyphony: 64, masterTuneHz: 440, standaloneBpm: 120 }),
    loadLocalBankLayoutFallback: () => null,
    saveLocalBankLayoutFallback: vi.fn(),
    onNoteEvent: () => () => {},
  } as unknown as McxHostBridge;
}

describe('McxMegamixController (Bar-quantized transitions)', () => {
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

  it('queues .mcxprj mid-bar, switches cleanly at bar boundary and preserves BPM when locked', () => {
    const bridge = makeBridge();
    const state = new McxAppState(bridge);
    state.globalSettings.standaloneBpm = 128;
    const altProject = exportProjectJson({ ...state, partsState: state.partsState.map((p, i) => i === 0 ? { ...p, name: 'Drop Lead' } : p), globalSettings: { ...state.globalSettings, standaloneBpm: 145 } } as any, 'DropSet');

    const ctrl = new McxMegamixController(state, bridge);
    expect(ctrl.captureCurrent(0, 'IntroSet')).toBe(true);
    expect(ctrl.loadProjectJson(1, 'DropSet', altProject)).toBe(true);

    expect(ctrl.queueSlot(1, true)).toBe('queued');
    expect(ctrl.queuedIndex).toBe(1);
    expect(ctrl.onTelemetryTick(96, true, 96)).toBe(false);
    expect(ctrl.onTelemetryTick(240, true, 96)).toBe(false);
    expect(ctrl.onTelemetryTick(384, true, 96)).toBe(true);
    expect(ctrl.activeIndex).toBe(1);
    expect(ctrl.queuedIndex).toBe(-1);
    expect(state.partsState[0].name).toBe('Drop Lead');
    expect(state.globalSettings.standaloneBpm).toBe(128);

    ctrl.setKeepTempo(false);
    expect(ctrl.queueSlot(0, false)).toBe('applied');
    expect(ctrl.activeIndex).toBe(0);
    expect(state.globalSettings.standaloneBpm).toBe(128);
  });
});
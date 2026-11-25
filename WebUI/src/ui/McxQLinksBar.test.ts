import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McxAppState } from '../app/McxAppState';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { McxQLinksBar } from './McxQLinksBar';

function makeBridge() {
  return {
    isNative: false,
    setParam: vi.fn(),
    setMasterVolume: vi.fn(),
    setTempo: vi.fn(),
    setLimiterCeilingDb: vi.fn(),
    setRackSlotParamByKey: vi.fn(),
    setBankLayout: vi.fn(),
    loadLocalSettingsFallback: () => ({ workingDirectory: '', maxPolyphony: 64, masterTuneHz: 440, standaloneBpm: 120 }),
    loadLocalBankLayoutFallback: () => null,
    saveLocalBankLayoutFallback: vi.fn(),
    onNoteEvent: () => () => {},
  } as unknown as McxHostBridge;
}

describe('McxQLinksBar (Contextual Q-Links UI)', () => {
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

  it('toggles visibility, renders 4 knobs per context and switches context automatically', () => {
    const bridge = makeBridge();
    const state = new McxAppState(bridge);
    const toggleBtn = document.createElement('button');
    const hostEl = document.createElement('div');
    document.body.append(toggleBtn, hostEl);

    const bar = new McxQLinksBar({ hostEl, bridge, state, toggleBtn });
    expect(bar.isOpen()).toBe(false);
    expect(hostEl.hidden).toBe(true);

    toggleBtn.click();
    expect(bar.isOpen()).toBe(true);
    expect(hostEl.hidden).toBe(false);
    expect(hostEl.querySelectorAll('[data-ql-slot]')).toHaveLength(4);
    expect(hostEl.querySelector('[data-ql-val="0"]')?.textContent).toBe('85%');

    state.refs.toneDrawer = { isOpen: () => true } as any;
    bar.syncAutoContextFromUi();
    expect(bar.getContext()).toBe('tone');
    expect(hostEl.querySelector('.mcx-qlinks-label')?.textContent).toBe('Cutoff');

    hostEl.querySelector<HTMLElement>('[data-ql-ctx="master"]')?.click();
    expect(bar.getContext()).toBe('master');
    const labels = Array.from(hostEl.querySelectorAll('.mcx-qlinks-label')).map((e) => e.textContent);
    expect(labels).toEqual(['Master Volume', 'Tempo', 'Master Reverb', 'Limiter Ceiling']);
    bar.destroy();
  });
});
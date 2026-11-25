/**
 * ABDMCX0X -- McxNavbarAndSideCols.test.ts
 * Vitest unit tests for navbar center transport mount & independent Rack/Master column collapse.
 * Strict line limit: < 160 lines.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McxNavbar } from './McxNavbar';
import { McxRackColumn } from './McxRackColumn';
import { McxMasterPanel } from './McxMasterPanel';

const mockThemeMgr = () => ({ getFamily: () => 'ms2000', toggleScheme: vi.fn(), setFamily: vi.fn() }) as never;

function makeBridgeMock() {
  return {
    isNative: false,
    onAudioStatus: vi.fn(),
    setMasterVolume: vi.fn(),
    setLimiterEnabled: vi.fn(),
    setTempo: vi.fn(),
    setTransportPlaying: vi.fn(),
    setSequencerLoop: vi.fn(),
    returnSequencerToZero: vi.fn(),
    seekSequencerBars: vi.fn(),
    pauseSequencer: vi.fn(),
    setRackSlotEngine: vi.fn(),
    setRackSlotParams: vi.fn(),
    setRackSlotParamByKey: vi.fn(),
    setRackSlotBypass: vi.fn(),
    setRackSlotDucking: vi.fn(),
    setSlotChainTarget: vi.fn(),
    setSendSlotTarget: vi.fn(),
    removeRackSlot: vi.fn(),
    moveRackSlot: vi.fn(),
  };
}

describe('McxNavbar transport slot & independent Rack/Master collapse', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('monta #mcx-transport-mount en .nav-center y conserva la instancia tras re-montar (cambio de idioma)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const nav = new McxNavbar(host, {
      themeMgr: mockThemeMgr(),
      onConfigureFolder: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenBankManager: vi.fn(),
      onSavePartPreset: vi.fn(),
      onSaveMultiPreset: vi.fn(),
      onLoadBank: vi.fn(),
      onFactoryReset: vi.fn(),
      onPanic: vi.fn(),
      onEnableAudio: vi.fn(),
      onToggleProbe: vi.fn(),
    });

    const mount1 = host.querySelector('.nav-center #mcx-transport-mount');
    expect(mount1).toBe(nav.getTransportMount());
    expect(mount1).not.toBeNull();

    nav.mount();
    const mount2 = host.querySelector('.nav-center #mcx-transport-mount');
    expect(mount2).toBe(mount1);
  });

  it('permite colapsar Rack y Master independientemente y monta el transporte estilo MPC en la Navbar', () => {
    document.body.innerHTML = `
      <div id="nav-host"></div>
      <div id="rack-host" class="mcx-rack-column"></div>
      <div id="master-host" class="mcx-master-panel"></div>
    `;
    const bridge = makeBridgeMock();
    new McxNavbar(document.getElementById('nav-host')!, {
      themeMgr: mockThemeMgr(),
      onConfigureFolder: vi.fn(), onOpenSettings: vi.fn(), onOpenBankManager: vi.fn(),
      onSavePartPreset: vi.fn(), onSaveMultiPreset: vi.fn(), onLoadBank: vi.fn(),
      onFactoryReset: vi.fn(), onPanic: vi.fn(), onEnableAudio: vi.fn(), onToggleProbe: vi.fn(),
    });

    const rackEl = document.getElementById('rack-host')!;
    const masterEl = document.getElementById('master-host')!;
    const onRackToggle = vi.fn(() => rackEl.classList.toggle('is-collapsed'));
    const onMasterToggle = vi.fn(() => masterEl.classList.toggle('is-collapsed'));
    const onQuantizeChange = vi.fn();
    const onSwingChange = vi.fn();

    new McxRackColumn(rackEl, { bridge: bridge as never, onToggleCollapse: onRackToggle });
    const master = new McxMasterPanel(masterEl, {
      bridge: bridge as never,
      initialQuantizeSteps: 16,
      onToggleCollapseMaster: onMasterToggle,
      onQuantizeChange,
      onSwingChange,
    });

    expect(document.querySelector('#mcx-transport-mount .abd-transport--navbar')).not.toBeNull();
    expect(rackEl.querySelector('#mcx-rack-collapsed-count')?.textContent).toBe('2');

    rackEl.querySelector<HTMLButtonElement>('#mcx-rack-collapse')?.click();
    expect(rackEl.classList.contains('is-collapsed')).toBe(true);
    expect(masterEl.classList.contains('is-collapsed')).toBe(false);

    masterEl.querySelector<HTMLButtonElement>('#mcx-master-collapse')?.click();
    expect(masterEl.classList.contains('is-collapsed')).toBe(true);
    expect(rackEl.classList.contains('is-collapsed')).toBe(true);

    rackEl.querySelector<HTMLButtonElement>('#mcx-rack-expand')?.click();
    expect(rackEl.classList.contains('is-collapsed')).toBe(false);
    expect(masterEl.classList.contains('is-collapsed')).toBe(true);

    master.setTransportPosition(384 + 96 + 24, 96);
    expect(document.querySelector('[data-role="clock-bar"]')?.textContent).toBe('02');
    expect(document.querySelector('[data-role="clock-beat"]')?.textContent).toBe('2');
    expect(document.querySelector('[data-role="clock-tick"]')?.textContent).toBe('24');

    document.querySelector<HTMLButtonElement>('[data-act="tc"]')?.click();
    expect(onQuantizeChange).toHaveBeenCalledWith(32);

    master.destroy();
  });
});

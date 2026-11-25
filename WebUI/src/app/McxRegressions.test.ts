/**
 * ABDMCX0X -- McxRegressions.test.ts
 * Vitest unit regressions for CR-04, CR-05, CR-06, and P4-A rack/routing wiring.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultPartState, type McxPartUiState } from '../ui/McxPartState';
import { McxRackColumn } from '../ui/McxRackColumn';
import { McxSynthModal } from '../ui/McxSynthModal';
import { createMidiModals } from './McxMidiModalsFactory';

function installDialogPolyfill() {
  const openDesc = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'open');
  if (!openDesc || openDesc.configurable) {
    Object.defineProperty(HTMLDialogElement.prototype, 'open', {
      configurable: true,
      get(this: HTMLDialogElement) { return this.hasAttribute('open'); },
      set(this: HTMLDialogElement, v: boolean) { if (v) this.setAttribute('open', ''); else this.removeAttribute('open'); },
    });
  }
  const showSpy = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  const showModalSpy = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.show = showSpy; HTMLDialogElement.prototype.showModal = showModalSpy;
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn() })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  return { showSpy, showModalSpy };
}

function makeMockBridge(isNative = false) {
  return {
    isNative,
    enableAudio: vi.fn(async () => undefined),
    noteOn: vi.fn(), noteOff: vi.fn(), setParam: vi.fn(),
    requestPartPresets: vi.fn(), requestPartEngineState: vi.fn(),
    setPartEngineParamByKey: vi.fn(), loadPartFactoryPreset: vi.fn(),
    setRackSlotEngine: vi.fn(), setRackSlotParams: vi.fn(), setRackSlotParamByKey: vi.fn(),
    setRackSlotBypass: vi.fn(), setRackSlotDucking: vi.fn(), setSendSlotTarget: vi.fn(),
    removeRackSlot: vi.fn(), moveRackSlot: vi.fn(),
    onAudioStatus: vi.fn(),
  };
}

describe('ABDMCX0X P0-P1 Regression Suite', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('normaliza velocidades 8..127 y 0..1 sin multiplicar por 127 ni usar claves arp indefinidas (CR-04/CR-05)', () => {
    installDialogPolyfill();
    const bridge = makeMockBridge();
    const recordNoteOn = vi.fn();
    const recordNoteOff = vi.fn();
    const setLcdLine2 = vi.fn();
    const partsState = Array.from({ length: 16 }, (_, i) => createDefaultPartState(i));
    const state = {
      focusedPart: 0,
      partsState,
      setLcdLine2,
      syncArpModalForPart: vi.fn(),
      refs: {
        pianoRollModal: { isOpen: () => true, isRecording: () => true, recordNoteOn, recordNoteOff },
        toneDrawer: { syncPart: vi.fn() },
        stepStrip: { setSwing: vi.fn() },
      },
    };

    const { padModal, arpModal } = createMidiModals(bridge as never, state as never);
    const padOpts = (padModal as unknown as { opts: { onPadTrigger: (...a: unknown[]) => void } }).opts;

    padOpts.onPadTrigger(0, 4, 60, 100, {}, '1/16');
    expect(bridge.noteOn).toHaveBeenCalledWith(0, 60, expect.closeTo(100 / 127, 4));
    expect(recordNoteOn).toHaveBeenCalledWith(60, 100, '1/16');
    expect(setLcdLine2).toHaveBeenCalledWith('PAD 05 -> NOTE 60 (VEL 100 · 79%)');

    padOpts.onPadTrigger(0, 1, 36, 0.5, {}, 'off');
    expect(bridge.noteOn).toHaveBeenCalledWith(0, 36, 0.5);
    expect(recordNoteOn).toHaveBeenCalledWith(36, 64, 'off');

    const padEl = (padModal as unknown as { el: HTMLElement }).el;
    const firstPad = padEl.querySelector('.abd-mpc-pad[data-pad-index="0"]');
    firstPad?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(bridge.noteOn).toHaveBeenCalledTimes(3);

    const arpEl = (arpModal as unknown as { el: HTMLElement }).el;
    arpEl.querySelector<HTMLElement>('[data-act="toggle-power"]')?.click();
    expect(bridge.setParam).toHaveBeenCalledWith(0, 'arpEnabled', 1);

    arpEl.querySelector<HTMLElement>('[data-act="motif"][data-motif-id="2"]')?.click();
    expect(bridge.setParam).toHaveBeenCalledWith(0, 'arpMotif', 2);

    const rateSel = arpEl.querySelector<HTMLSelectElement>('[data-act="rate"]');
    if (rateSel) { rateSel.value = '1/8'; rateSel.dispatchEvent(new Event('change', { bubbles: true })); }
    expect(bridge.setParam).toHaveBeenCalledWith(0, 'arpRate', 5);

    const gateIn = arpEl.querySelector<HTMLInputElement>('[data-act="gate"]');
    if (gateIn) { gateIn.value = '60'; gateIn.dispatchEvent(new Event('input', { bubbles: true })); }
    expect(bridge.setParam).toHaveBeenCalledWith(0, 'arpGate', 0.6);

    const swingIn = arpEl.querySelector<HTMLInputElement>('[data-act="swing"]');
    if (swingIn) { swingIn.value = '62'; swingIn.dispatchEvent(new Event('input', { bubbles: true })); }
    expect(bridge.setParam).toHaveBeenCalledWith(0, 'arpSwing', 0.62);
    expect(bridge.setParam).toHaveBeenCalledWith(0, 'patternSwing', 0.62);

    padModal.destroy();
    arpModal.destroy();
  });

  it('reabre McxSynthModal sin pantalla en blanco, con open-route vivo y en modo modeless show() (CR-06)', () => {
    const { showSpy, showModalSpy } = installDialogPolyfill();
    const bridge = makeMockBridge();
    const parts: McxPartUiState[] = [createDefaultPartState(0), createDefaultPartState(1)];
    parts[1].routeMode = 1;
    parts[1].engineTypeIndex = 1;
    parts[1].engineTypeId = 'external_midi';

    const onOpenRouteModal = vi.fn();
    const modal = new McxSynthModal({
      bridge: bridge as never,
      getPartState: (idx) => parts[idx],
      onPartUpdated: vi.fn(),
      onOpenRouteModal,
      onOpenBank: vi.fn(),
      setLcdLine2: vi.fn(),
    });

    modal.open(0);
    expect(showSpy).toHaveBeenCalledTimes(1);
    expect(showModalSpy).not.toHaveBeenCalled();
    expect(document.querySelector('#mcx-synth-slot')?.innerHTML.trim().length).toBeGreaterThan(0);
    expect(document.querySelector('.mcx-rompler-picker-bar')).toBeNull();
    expect(document.querySelector('#mcx-synth-slot .abd-ehb')).toBeTruthy();

    modal.close();
    modal.open(0);
    expect(document.querySelector('#mcx-synth-slot')?.innerHTML.trim().length).toBeGreaterThan(0);

    document.querySelector<HTMLElement>('.mcx-synth-head [data-act="open-route"]')?.click();
    expect(onOpenRouteModal).toHaveBeenCalledWith(0);
    expect(modal.isOpen()).toBe(false);

    modal.open(1);
    const extBtn = document.querySelector<HTMLElement>('.mcx-motor-external [data-act="open-route"]');
    expect(extBtn).toBeTruthy();
    extBtn?.click();
    expect(onOpenRouteModal).toHaveBeenCalledWith(1);
    expect(modal.isOpen()).toBe(false);

    modal.destroy();
  });

  it('mantiene sincronizados envíos y slots al reordenar y desmontar bahías en McxRackColumn (CR-09/P4-A)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const bridge = makeMockBridge(true);
    const onSlotMoved = vi.fn();
    const onSlotRemoved = vi.fn();
    const rack = new McxRackColumn(host, {
      bridge: bridge as never,
      onSlotMoved,
      onSlotRemoved,
      setLcdLine2: vi.fn(),
    });

    host.querySelector<HTMLElement>('.mcx-rack-slot-card[data-slot="0"] .btn-dn')?.click();
    expect(bridge.moveRackSlot).toHaveBeenCalledWith(0, 1);
    expect(onSlotMoved).toHaveBeenCalledWith(0, 1);
    expect(rack.getSendTargets().slice(0, 2)).toEqual([1, 0]);

    host.querySelector<HTMLElement>('.mcx-rack-slot-card[data-slot="1"] .btn-del')?.click();
    expect(bridge.removeRackSlot).toHaveBeenCalledWith(1);
    expect(onSlotRemoved).toHaveBeenCalledWith(1);
    expect(rack.getSendTargets()[0]).toBe(-1);
  });

  it('permite grabar notas desde MPC Pads incluso cuando PianoRollModal está cerrado', () => {
    installDialogPolyfill();
    const bridge = makeMockBridge();
    const recordNoteOn = vi.fn();
    const recordNoteOff = vi.fn();
    const partsState = Array.from({ length: 4 }, (_, i) => createDefaultPartState(i));
    const state = {
      focusedPart: 0, partsState, setLcdLine2: vi.fn(), syncArpModalForPart: vi.fn(), setRecordConfig: vi.fn(),
      refs: { pianoRollModal: { isOpen: () => false, isRecording: () => true, recordNoteOn, recordNoteOff } },
    };
    const { padModal } = createMidiModals(bridge as never, state as never);
    const padOpts = (padModal as unknown as { opts: { onPadTrigger: (...a: unknown[]) => void; onPadRelease: (...a: unknown[]) => void } }).opts;
    padOpts.onPadTrigger(0, 2, 62, 112, {}, '1/16');
    expect(recordNoteOn).toHaveBeenCalledWith(62, 112, '1/16');
    padOpts.onPadRelease(0, 2, 62);
    expect(recordNoteOff).toHaveBeenCalledWith(62);
  });
});

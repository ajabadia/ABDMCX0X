/**
 * ABDMCX0X -- McxLiveTranspose.test.ts
 * Integration tests wiring transversal @abdsynths/midi-keyb Live Transpose to ABDMCX0X bridge/UI.
 * Strict line limit: < 140 lines.
 */

import { createKeyboard } from '@abdsynths/midi-keyb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultPartState } from '../ui/McxPartState';
import {
  computeEffectiveKeyboardScaleRoot,
  computeTransposeFromNote,
  mountLiveTranspose,
} from './McxLiveTranspose';

function createHarness() {
  document.body.innerHTML = `
    <div id="piano-keyboard"></div>
    <button id="kbd-transpose-btn" aria-pressed="false">
      <span>TR</span><span id="kbd-transpose-val">0</span><div id="led-transpose"></div>
    </button>
  `;
  const bridge = { setParam: vi.fn() };
  const partsState = [createDefaultPartState(0), createDefaultPartState(1)];
  partsState[1].kind = 'drum_map';
  partsState[1].followTranspose = false;

  const globalDrawer = { setGlobalTranspose: vi.fn() };
  const settingsModal = { syncGlobalTranspose: vi.fn(), syncScale: vi.fn() };
  const setLcdLine2 = vi.fn();
  const onNoteOn = vi.fn();

  let midiCb: ((portIdx: number, bytes: Uint8Array) => void) | null = null;
  const midiService = {
    onMidiInput: (cb: (portIdx: number, bytes: Uint8Array) => void) => {
      midiCb = cb;
      return () => { midiCb = null; };
    },
  };

  const state: any = { focusedPart: 0, partsState, setLcdLine2, refs: { keyboard: null, globalDrawer, settingsModal } };
  const handle = mountLiveTranspose({ bridge: bridge as never, state, midiService });
  const kbd = createKeyboard({
    containerId: 'piano-keyboard',
    transposeBtnId: 'kbd-transpose-btn',
    transposeValId: 'kbd-transpose-val',
    transposeLedId: 'led-transpose',
    onTransposeChange: (st: number, cap: any) => handle.handleKeyboardTranspose(st, cap),
    onTransposeNotice: (msg: string) => setLcdLine2(msg),
    onNoteOn,
    config: { numOctaves: 2, startNote: 60, enableWheels: false, enableResizeObserver: false, scaleSnapMode: 'highlight' },
  });
  state.refs.keyboard = kbd;

  return {
    handle, bridge, state, kbd, globalDrawer, settingsModal, setLcdLine2, onNoteOn,
    btn: document.getElementById('kbd-transpose-btn')!,
    valEl: document.getElementById('kbd-transpose-val')!,
    emitMidiNoteOn: (note: number, vel = 100) => midiCb?.(1, new Uint8Array([0x90, note, vel])),
  };
}

describe('McxLiveTranspose + @abdsynths/midi-keyb', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { document.body.innerHTML = ''; });

  it('reexporta helpers compartidos de @abdsynths/midi-keyb', () => {
    expect(computeTransposeFromNote(65)).toEqual({ semitones: 5, pitchClass: 5, noteName: 'F' });
    expect(computeEffectiveKeyboardScaleRoot(0, 2)).toBe(10);
  });

  it('sincroniza hold/latch del componente compartido con bridge, drawers y modales', () => {
    const h = createHarness();
    h.btn.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('pointerup'));
    expect(h.handle.isArmed()).toBe(true);

    document.querySelector('#piano-keyboard [data-note="65"]')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(h.onNoteOn).not.toHaveBeenCalled();
    expect(h.bridge.setParam).toHaveBeenCalledWith(0, 'globalTranspose', 5);
    expect(h.globalDrawer.setGlobalTranspose).toHaveBeenCalledWith(5);
    expect(h.settingsModal.syncGlobalTranspose).toHaveBeenCalledWith(5);
    expect(h.valEl.textContent).toBe('+5');

    h.btn.dispatchEvent(new Event('dblclick'));
    expect(h.handle.getState().semitones).toBe(0);
    expect(h.bridge.setParam).toHaveBeenLastCalledWith(0, 'globalTranspose', 0);
    h.kbd.destroy();
    h.handle.destroy();
  });

  it('captura MIDI físico entrante y desactiva escala en drum_map o followTranspose=false', () => {
    const h = createHarness();
    h.handle.setScale(0, 14, { emitBridge: false }); // diminished
    expect(h.kbd.getScaleFilter()?.type).toBe('diminished');

    h.handle.toggleArmed();
    h.emitMidiNoteOn(67, 100);
    expect(h.handle.getState().semitones).toBe(7);
    expect(h.handle.getState().scaleRoot).toBe(7);
    expect(h.bridge.setParam).toHaveBeenCalledWith(0, 'globalScaleRoot', 7);

    h.state.focusedPart = 1; // drum_map
    h.handle.syncKeyboardScaleVisuals();
    expect(h.kbd.getScaleFilter()).toBeNull();

    h.state.focusedPart = 0;
    h.state.partsState[0].followTranspose = false;
    h.handle.syncKeyboardScaleVisuals();
    expect(h.kbd.getScaleFilter()).toBeNull();
    h.kbd.destroy();
    h.handle.destroy();
  });
});

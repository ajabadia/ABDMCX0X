/**
 * ABDMCX0X -- McxLiveTranspose.ts
 * Adapter bridging @abdsynths/midi-keyb transversal live transpose & scale highlight
 * to McxHostBridge, WebMIDI input, McxGlobalDrawer and McxSettingsModal.
 * Strict line limit: < 120 lines. 0 hardcoded colors.
 */

import {
  computeEffectiveScaleRoot as computeEffectiveKeyboardScaleRoot,
  computeTransposeFromNote,
  type LiveTransposeCapture,
} from '@abdsynths/midi-keyb';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { webMidiService } from '../midi/McxWebMidiService';
import type { McxAppState } from './McxAppState';

export { computeTransposeFromNote, computeEffectiveKeyboardScaleRoot };

export const MUSICAL_SCALE_TO_KBD_KEY: ReadonlyArray<string | null> = [
  null, 'major', 'minor', 'harmonicMinor', 'melodicMinor', 'dorian', 'phrygian',
  'lydian', 'mixolydian', 'locrian', 'pentatonicMajor', 'pentatonicMinor',
  'blues', 'wholeTone', 'diminished',
];

export interface McxLiveTransposeOptions {
  bridge: McxHostBridge;
  state: McxAppState;
  midiService?: { onMidiInput: (cb: (portIdx: number, bytes: Uint8Array) => void) => () => void };
}

export interface McxLiveTransposeHandle {
  handleKeyboardTranspose(semitones: number, capture?: LiveTransposeCapture): void;
  interceptNoteOn(note: number): boolean;
  setGlobalTranspose(st: number, opts?: { emitBridge?: boolean }): void;
  setScale(root: number, type: number, opts?: { emitBridge?: boolean }): void;
  syncKeyboardScaleVisuals(): void;
  toggleArmed(): void;
  isArmed(): boolean;
  getState(): { semitones: number; scaleRoot: number; scaleType: number; armed: boolean };
  destroy(): void;
}

export function mountLiveTranspose(opts: McxLiveTransposeOptions): McxLiveTransposeHandle {
  const { bridge, state } = opts;
  const midiSrc = opts.midiService ?? webMidiService;
  let semitones = 0, scaleRoot = 0, scaleType = 0;

  const syncKeyboardScaleVisuals = (): void => {
    const kbd = state.refs.keyboard;
    if (!kbd) return;
    const ps = state.partsState[state.focusedPart];
    if (!ps || ps.kind === 'drum_map' || ps.followTranspose === false || scaleType <= 0) {
      kbd.disableScaleFilter?.();
      return;
    }
    const key = MUSICAL_SCALE_TO_KBD_KEY[scaleType] ?? null;
    if (!key) { kbd.disableScaleFilter?.(); return; }
    kbd.setScaleSnapMode?.('highlight');
    kbd.setScaleFilter?.(key, computeEffectiveKeyboardScaleRoot(scaleRoot, semitones));
  };

  const applyTranspose = (st: number, emitBridge: boolean, syncKbd: boolean): void => {
    semitones = Math.max(-24, Math.min(24, Math.round(st)));
    if (syncKbd) state.refs.keyboard?.setTranspose?.(semitones, false);
    state.refs.globalDrawer?.setGlobalTranspose(semitones);
    state.refs.settingsModal?.syncGlobalTranspose(semitones);
    if (emitBridge) bridge.setParam(0, 'globalTranspose', semitones);
    syncKeyboardScaleVisuals();
  };

  const setScale = (root: number, type: number, { emitBridge = false } = {}): void => {
    scaleRoot = ((Math.round(root) % 12) + 12) % 12;
    scaleType = Math.max(0, Math.min(MUSICAL_SCALE_TO_KBD_KEY.length - 1, Math.round(type)));
    state.refs.settingsModal?.syncScale?.(scaleRoot, scaleType);
    if (emitBridge) {
      bridge.setParam(0, 'globalScaleRoot', scaleRoot);
      bridge.setParam(0, 'globalScale', scaleType);
      bridge.setParam(0, 'globalScaleQuantize', scaleType > 0 ? 1 : 0);
    }
    syncKeyboardScaleVisuals();
  };

  const handleKeyboardTranspose = (st: number, capture?: LiveTransposeCapture): void => {
    applyTranspose(st, true, false);
    const cap = capture ?? computeTransposeFromNote(60 + st);
    if (scaleType > 0) setScale(cap.pitchClass, scaleType, { emitBridge: true });
    const sign = semitones > 0 ? '+' : '';
    const scaleTag = scaleType > 0 ? ` · ${MUSICAL_SCALE_TO_KBD_KEY[scaleType] ?? ''}` : '';
    state.setLcdLine2(`LIVE TRANSPOSE: ${sign}${semitones} st (${cap.noteName}${scaleTag})`);
  };

  const interceptNoteOn = (note: number): boolean => state.refs.keyboard?.interceptTransposeNoteOn?.(note) ?? false;
  const toggleArmed = (): void => { state.refs.keyboard?.toggleTransposeArm?.(); };
  const isArmed = (): boolean => Boolean(state.refs.keyboard?.isTransposeArmed?.());

  const unsubMidi = midiSrc.onMidiInput((_port, bytes) => {
    if (!isArmed() || !bytes || bytes.length < 3) return;
    if ((bytes[0] & 0xf0) === 0x90 && (bytes[2] & 0x7f) > 0) interceptNoteOn(bytes[1] & 0x7f);
  });

  return {
    handleKeyboardTranspose,
    interceptNoteOn,
    setGlobalTranspose: (st, { emitBridge = false } = {}) => applyTranspose(st, emitBridge, true),
    setScale,
    syncKeyboardScaleVisuals,
    toggleArmed,
    isArmed,
    getState: () => ({ semitones, scaleRoot, scaleType, armed: isArmed() }),
    destroy: () => { unsubMidi(); },
  };
}

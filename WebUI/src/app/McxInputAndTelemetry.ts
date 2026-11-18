/**
 * ABDMCX0X -- McxInputAndTelemetry.ts
 * Binds global keyboard shortcuts, @abdsynths/midi-keyb dock, and dual Audio/MIDI VU telemetry.
 */

import { createKeyboard } from '@abdsynths/midi-keyb';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { updatePartMeter } from '../ui/McxMixerConsole';
import type { McxScopeCanvas } from '../ui/McxScopeCanvas';
import type { McxAppState } from './McxAppState';

function isEditableTarget(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function bindGlobalShortcuts(state: McxAppState): void {
  window.addEventListener('keydown', (ev) => {
    if (isEditableTarget(ev.target)) return;
    const key = ev.key.toLowerCase();
    const mod = ev.ctrlKey || ev.metaKey;
    if (!mod && key === 'b') {
      ev.preventDefault();
      state.refs.bankDrawer?.toggle(state.focusedPart);
      return;
    }
    if (!mod) return;
    const actions: Record<string, (() => void) | undefined> = {
      f: () => state.refs.fxRackModal?.toggle(),
      l: () => state.refs.globalLfoModal?.toggle(),
      p: () => { state.syncPianoRollForPart(state.focusedPart); state.refs.pianoRollModal?.toggle(); },
      g: () => state.refs.grooveModal?.open(-1),
    };
    const fn = actions[key];
    if (fn) { ev.preventDefault(); fn(); }
  });
}

export function mountKeyboardDock(bridge: McxHostBridge, state: McxAppState): void {
  createKeyboard({
    containerId: 'piano-keyboard',
    wheelPitchId: 'pitch-wheel-container',
    wheelModId: 'mod-wheel-container',
    octUpId: 'oct-up',
    octDownId: 'oct-down',
    ledUpId: 'led-up',
    ledDownId: 'led-down',
    onNoteOn: (note: number, vel: number) => {
      bridge.noteOn(state.focusedPart, note, Math.max(0.05, Math.min(1, vel > 1 ? vel / 127 : vel)));
      if (state.refs.pianoRollModal?.isOpen() && state.refs.pianoRollModal.isRecording()) {
        state.refs.pianoRollModal.recordNoteOn(note, Math.round(vel > 1 ? vel : vel * 127));
      }
    },
    onNoteOff: (note: number) => {
      bridge.noteOff(state.focusedPart, note);
      if (state.refs.pianoRollModal?.isOpen() && state.refs.pianoRollModal.isRecording()) {
        state.refs.pianoRollModal.recordNoteOff(note);
      }
    },
    onPanic: () => bridge.allNotesOff(),
    onCollapseChange: (collapsed: boolean) => {
      document.querySelector('.mcx-keyboard-dock')?.classList.toggle('is-collapsed', collapsed);
    },
    config: {
      numOctaves: 4, startNote: 36, maxOctaveShift: 3, enableWheels: true, enablePanic: true,
      enableIvoryTexture: true, enableQwerty: true, showQwertyLabels: true,
      enableHold: true, enableRetrig: true, enableSustain: true, enableTouch: true, enableResizeObserver: true,
      enableCollapse: true,
    },
  });
}

export function bindTelemetry(bridge: McxHostBridge, state: McxAppState, scopeView: McxScopeCanvas | null): void {
  bridge.onTelemetry((tel) => {
    state.updateLcdLine1(tel.activeVoices);
    scopeView?.pushTelemetry(tel);
    state.refs.masterPanel?.updateMeter(tel.peakL, tel.peakR);

    const strips = document.getElementById('part-list');
    if (strips && (tel.partPeaks || tel.partMidiPeaks)) {
      for (let i = 0; i < 16; ++i) {
        const routeMode = state.partsState[i]?.routeMode ?? 0;
        const audioPk = tel.partPeaks?.[i] ?? 0;
        const midiPk = tel.partMidiPeaks?.[i] ?? 0;
        if (routeMode === 1) {
          updatePartMeter(strips, i, midiPk, true);
        } else if (routeMode === 2) {
          const showMidi = audioPk < 0.01 && midiPk >= 0.01;
          updatePartMeter(strips, i, showMidi ? midiPk : audioPk, showMidi);
        } else {
          updatePartMeter(strips, i, audioPk, false);
        }
      }
    }

    if (state.refs.toneDrawer?.isOpen()) {
      state.refs.toneDrawer.updateSendLabels(tel.sendLabels);
      const sendPeaks = [tel.peakSendA ?? 0, tel.peakSendB ?? 0, tel.peakSendC ?? 0, tel.peakSendD ?? 0];
      state.refs.toneDrawer.updateSendTelemetry(sendPeaks, tel.sendBusMutes);
      state.refs.toneDrawer.updateLfoPhase(tel.lfoPhase ?? (Date.now() % 500 < 250 ? 1 : 0));
    }
  });
}

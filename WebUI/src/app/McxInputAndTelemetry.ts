/**
 * ABDMCX0X -- McxInputAndTelemetry.ts
 * Binds global keyboard shortcuts, @abdsynths/midi-keyb dock, and dual Audio/MIDI VU telemetry.
 */

import { createKeyboard } from '@abdsynths/midi-keyb';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { updatePartMeter } from '../ui/McxMixerConsole';
import type { McxScopeCanvas } from '../ui/McxScopeCanvas';
import type { McxAppState } from './McxAppState';
import { mountLiveTranspose } from './McxLiveTranspose';

function isEditableTarget(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function bindGlobalShortcuts(state: McxAppState): void {
  window.addEventListener('keydown', (ev) => {
    if (isEditableTarget(ev.target)) return;
    const key = ev.key.toLowerCase();
    const mod = ev.ctrlKey || ev.metaKey;
    if (ev.altKey && !mod) {
      const code = ev.code || '';
      if (code === 'KeyT' || key === 't') { ev.preventDefault(); state.refs.liveTranspose?.toggleArmed(); return; }
      const scNum = code.startsWith('Digit') ? Number(code.slice(5)) : Number(ev.key);
      if (scNum >= 1 && scNum <= 8) {
        ev.preventDefault();
        state.refs.triggerLiveScene?.(scNum - 1, ev.shiftKey);
        return;
      }
      const bankChar = code.startsWith('Key') && code.length === 4 ? code.charCodeAt(3) : key.toUpperCase().charCodeAt(0);
      if (bankChar >= 65 && bankChar <= 72) {
        const bankIdx = bankChar - 65;
        if (bankIdx < state.bankLayout.bankCount) {
          ev.preventDefault();
          if (ev.shiftKey) state.toggleLiveMuteBank(bankIdx);
          else state.selectBank(bankIdx);
        }
      }
      return;
    }
    if (!mod && !ev.altKey && ev.key === 'Escape') {
      if (!document.querySelector('dialog[open], .is-open, [popover]:popover-open')) { ev.preventDefault(); state.refs.onPanic?.(); }
      return;
    }
    if (!mod && key === 'b') { ev.preventDefault(); state.refs.bankDrawer?.toggle(state.focusedPart); return; }
    if (!mod) return;
    const actions: Record<string, (() => void) | undefined> = {
      n: () => state.refs.onNewProject?.(),
      f: () => state.refs.fxRackModal?.toggle(), l: () => state.refs.globalLfoModal?.toggle(),
      p: () => { state.syncPianoRollForPart(state.focusedPart); state.refs.pianoRollModal?.toggle(); },
      k: () => state.refs.performanceModal?.toggle(),
      g: () => state.refs.grooveModal?.open(-1), m: () => state.refs.toggleSongDrawer?.(),
      e: () => state.refs.onOpenExport?.(),
      s: () => state.refs.onSavePreset?.(ev.shiftKey), o: () => state.refs.onOpenBankFile?.(),
      z: () => (ev.shiftKey ? state.refs.onRedo?.() : state.refs.onUndo?.()),
      y: () => state.refs.onRedo?.(),
      b: () => (ev.shiftKey ? state.refs.onToggleCompare?.() : undefined),
      ',': () => state.refs.settingsModal?.toggle(), '4': () => state.refs.onToggleProbe?.(),
    };
    const fn = actions[key];
    if (fn) { ev.preventDefault(); fn(); }
  });
}

export function mountKeyboardDock(bridge: McxHostBridge, state: McxAppState): void {
  state.refs.liveTranspose = mountLiveTranspose({ bridge, state });
  state.refs.keyboard = createKeyboard({
    containerId: 'piano-keyboard', wheelPitchId: 'pitch-wheel-container', wheelModId: 'mod-wheel-container',
    octUpId: 'oct-up', octDownId: 'oct-down', ledUpId: 'led-up', ledDownId: 'led-down',
    transposeBtnId: 'kbd-transpose-btn', transposeValId: 'kbd-transpose-val', transposeLedId: 'led-transpose',
    onTransposeChange: (st: number, cap: any) => state.refs.liveTranspose?.handleKeyboardTranspose(st, cap),
    onTransposeNotice: (msg: string) => state.setLcdLine2(msg),
    onNoteOn: (note: number, vel: number) => {
      bridge.noteOn(state.focusedPart, note, Math.max(0.05, Math.min(1, vel > 1 ? vel / 127 : vel)));
      if (state.refs.padModal?.isOpen()) state.refs.padModal.highlightNote(note, true);
      if (state.refs.pianoRollModal?.isRecording?.()) state.refs.pianoRollModal.recordNoteOn(note, Math.round(vel > 1 ? vel : vel * 127));
    },
    onNoteOff: (note: number) => {
      bridge.noteOff(state.focusedPart, note);
      if (state.refs.padModal?.isOpen()) state.refs.padModal.highlightNote(note, false);
      if (state.refs.pianoRollModal?.isRecording?.()) state.refs.pianoRollModal.recordNoteOff(note);
    },
    onPanic: () => bridge.allNotesOff(),
    onCollapseChange: (collapsed: boolean) => document.querySelector('.mcx-keyboard-dock')?.classList.toggle('is-collapsed', collapsed),
    config: {
      numOctaves: 4, startNote: 36, maxOctaveShift: 3, enableWheels: true, enablePanic: true,
      enableIvoryTexture: true, enableQwerty: true, showQwertyLabels: true,
      enableHold: true, enableRetrig: true, enableSustain: true, enableTouch: true, enableResizeObserver: true,
      enableCollapse: true, scaleSnapMode: 'highlight',
    },
  });
  state.syncFocusedKeyboardPlayableNotes();
}

export function bindTelemetry(bridge: McxHostBridge, state: McxAppState, scopeView: McxScopeCanvas | null): void {
  let lastSeqPlaying: boolean | null = null;
  let lastSeqPaused: boolean | null = null;
  let lastSeqRecRev = 0;
  let lastBpm = 0;

  bridge.onTelemetry((tel) => {
    state.updateLcdLine1(tel.activeVoices);
    scopeView?.pushTelemetry(tel);
    state.refs.onSongTelemetry?.(tel);
    state.refs.masterPanel?.updateMeter(tel.peakL, tel.peakR);
    state.refs.synthModal?.updateTelemetry?.(tel);
    state.refs.performanceModal?.onTelemetryTick(tel.seqTick ?? 0, Boolean(tel.seqPlaying), tel.seqTotalTicks ?? 384);

    if (tel.seqPlaying !== undefined) {
      const playing = Boolean(tel.seqPlaying);
      const paused = Boolean(tel.seqPaused);
      state.refs.stepStrip?.setChaserStep(playing ? ((tel.seqStep ?? 0) % 16) : -1);
      if (tel.seqTick !== undefined) state.refs.masterPanel?.setTransportPosition?.(tel.seqTick);
      if (state.refs.pianoRollModal?.isOpen() || state.refs.pianoRollModal?.isRecording?.()) {
        if (tel.seqTick !== undefined) state.refs.pianoRollModal?.setPlayhead?.(tel.seqTick);
        state.refs.pianoRollModal?.setPlaying?.(playing);
      }
      if (lastSeqPlaying !== playing) {
        lastSeqPlaying = playing;
        if (state.refs.masterPanel?.getTransportState()?.playing !== playing) state.refs.masterPanel?.setPlaying(playing);
      }
      if (lastSeqPaused !== paused) {
        lastSeqPaused = paused;
        state.refs.masterPanel?.setPaused?.(paused);
      }
    }
    if ((tel.seqCountInTicks ?? 0) > 0) {
      const beat = Math.ceil((tel.seqCountInTicks ?? 0) / 24);
      state.setLcdLine2(`COUNT-IN: ${beat}`);
    }
    if (tel.seqRecRev && tel.seqRecRev !== lastSeqRecRev) {
      lastSeqRecRev = tel.seqRecRev;
      bridge.requestPartPattern(state.focusedPart);
    }
    if (tel.bpm && tel.bpm >= 20 && Math.abs(tel.bpm - lastBpm) > 0.05) {
      lastBpm = tel.bpm;
      state.refs.fxRackModal?.setBpm?.(tel.bpm);
      state.refs.globalLfoModal?.setBpm?.(tel.bpm);
      state.refs.padModal?.setBpm?.(tel.bpm);
      if (Math.abs(state.globalSettings.standaloneBpm - tel.bpm) > 0.05) {
        state.globalSettings.standaloneBpm = tel.bpm;
        state.refs.masterPanel?.setBpm(tel.bpm);
      }
    }

    const strips = document.getElementById('part-list');
    if (strips && (tel.partPeaks || tel.partMidiPeaks)) {
      const activeRow = state.bankLayout.banks[state.bankLayout.activeBank] ?? [];
      for (const i of activeRow) {
        if (i === null) continue;
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
    state.refs.bankRail?.updateActivity(state.bankLayout, tel.partPeaks, tel.partMidiPeaks);

    const lfo1 = tel.lfoPhase ?? 0, lfo2 = tel.lfo2Phase ?? 0;
    if (state.refs.toneDrawer?.isOpen()) {
      state.refs.toneDrawer.updateSendLabels(tel.sendLabels);
      const sendPeaks = [tel.peakSendA ?? 0, tel.peakSendB ?? 0, tel.peakSendC ?? 0, tel.peakSendD ?? 0];
      state.refs.toneDrawer.updateSendTelemetry(sendPeaks, tel.sendBusMutes);
      state.refs.toneDrawer.updateLfoPhase(lfo1);
    }
    state.refs.masterPanel?.updateGlobalLfoPhase(Math.abs(lfo1));
    state.refs.globalLfoModal?.updatePhase(1, Math.abs(lfo1));
    state.refs.globalLfoModal?.updatePhase(2, Math.abs(lfo2));
    state.refs.fxRackModal?.updateTelemetry?.({
      peakSendA: tel.peakSendA, peakSendB: tel.peakSendB, peakSendC: tel.peakSendC, peakSendD: tel.peakSendD,
      peakMasterL: tel.peakL, peakMasterR: tel.peakR, limiterGainReductionDb: tel.limiterGrDb ?? 0, lfoMod: [lfo1, lfo2, 0, 0],
    });

    if (tel.rackPeakIn && tel.rackPeakOut) {
      for (let i = 0; i < 8; ++i) {
        state.refs.rackColumn?.updateMeter(i, tel.rackPeakIn[i] ?? 0, tel.rackPeakOut[i] ?? 0, tel.rackClipIn?.[i] ?? false, tel.rackClipOut?.[i] ?? false);
      }
    }
  });
}

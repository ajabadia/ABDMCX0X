/**
 * ABDMCX0X -- McxMidiLearnWiring.ts
 * Integrates @abdsynths/shared MIDI Learn N:M Store, Context Menu & Matrix Drawer with WebMIDI + Engine.
 * Strict line limit: < 180 lines. 100% tokenized.
 */

import {
  MIDI_SOURCE_TYPES, attachMidiLearnUI, createMidiLearnDrawerContent, createMidiLearnStore,
} from '@abdsynths/shared/components/midiLearn.js';
import { bringToFront } from '@abdsynths/shared/diagnostic-probe/DiagnosticProbeI18n.js';
import type { McxHostBridge, McxParamKey } from '../bridge/McxHostBridge';
import { webMidiService } from '../midi/McxWebMidiService';
import type { McxAppState } from './McxAppState';

interface LearnParamDef { index: number; key: McxParamKey | 'masterVolume'; name: string; group: string; min: number; max: number; }

const LEARNABLE_PARAMS: LearnParamDef[] = [
  { index: 6, key: 'partLevel', name: 'Part Level', group: 'Mixer', min: 0, max: 1 },
  { index: 7, key: 'partPan', name: 'Part Pan', group: 'Mixer', min: -1, max: 1 },
  { index: 8, key: 'reverbSend', name: 'Send A (Reverb)', group: 'Mixer', min: 0, max: 1 },
  { index: 9, key: 'chorusSend', name: 'Send B (Chorus)', group: 'Mixer', min: 0, max: 1 },
  { index: 47, key: 'delaySend', name: 'Send C (Delay)', group: 'Mixer', min: 0, max: 1 },
  { index: 48, key: 'auxSend', name: 'Send D (Aux)', group: 'Mixer', min: 0, max: 1 },
  { index: 0, key: 'filterCutoff', name: 'Filter Cutoff', group: 'Filter', min: 0, max: 1 },
  { index: 1, key: 'filterResonance', name: 'Filter Resonance', group: 'Filter', min: 0, max: 1 },
  { index: 2, key: 'ampAttack', name: 'Amp Attack', group: 'Envelope', min: 0, max: 1 },
  { index: 3, key: 'ampDecay', name: 'Amp Decay', group: 'Envelope', min: 0, max: 1 },
  { index: 4, key: 'ampSustain', name: 'Amp Sustain', group: 'Envelope', min: 0, max: 1 },
  { index: 5, key: 'ampRelease', name: 'Amp Release', group: 'Envelope', min: 0, max: 1 },
  { index: 46, key: 'driveAmount', name: 'Drive Amount', group: 'Channel FX', min: 0, max: 1 },
  { index: 38, key: 'eqLowGain', name: 'EQ Low Gain', group: 'Channel FX', min: -12, max: 12 },
  { index: 40, key: 'eqMidGain', name: 'EQ Mid Gain', group: 'Channel FX', min: -12, max: 12 },
  { index: 43, key: 'eqHighGain', name: 'EQ High Gain', group: 'Channel FX', min: -12, max: 12 },
  { index: 71, key: 'lfo1Rate', name: 'LFO 1 Rate', group: 'LFO', min: 0, max: 1 },
  { index: 73, key: 'lfo1Depth', name: 'LFO 1 Depth', group: 'LFO', min: 0, max: 1 },
  { index: 78, key: 'lfo2Rate', name: 'LFO 2 Rate', group: 'LFO', min: 0, max: 1 },
  { index: 80, key: 'lfo2Depth', name: 'LFO 2 Depth', group: 'LFO', min: 0, max: 1 },
  { index: 900, key: 'masterVolume', name: 'Master Volume', group: 'Master', min: 0, max: 1 },
];

export function mountMidiLearnWiring(bridge: McxHostBridge, state: McxAppState) {
  let dialogEl: HTMLDialogElement | null = null;
  const byIdx = new Map(LEARNABLE_PARAMS.map((p) => [p.index, p]));
  const byKey = new Map<string, LearnParamDef>(LEARNABLE_PARAMS.map((p) => [p.key, p]));

  const store = createMidiLearnStore({
    storageKey: 'abdmcx0x.midiLearn.v1',
    persist: true,
    onApplyParam: (targetIndex: number, targetKey: string, normValue: number) => {
      if (targetIndex === 900 || targetKey === 'masterVolume') {
        bridge.setMasterVolume(normValue);
        state.refs.masterPanel?.setVolume(normValue);
        return;
      }
      const p = byIdx.get(targetIndex) || byKey.get(targetKey);
      if (!p || p.key === 'masterVolume') return;
      const val = p.min + normValue * (p.max - p.min);
      const partIdx = state.focusedPart;
      if (state.partsState[partIdx]) (state.partsState[partIdx] as any)[p.key] = val;
      bridge.setParam(partIdx, p.key, val);
      state.refs.toneDrawer?.updateParamLive?.(p.key, val);
    },
  });

  const openDrawer = (focusParamIndex = -1) => {
    if (!dialogEl) {
      dialogEl = document.createElement('dialog');
      dialogEl.className = 'mcx-export-dialog mcx-midilearn-dialog';
      dialogEl.setAttribute('aria-label', 'MIDI Learn Matrix');
      document.body.appendChild(dialogEl);
    }
    dialogEl.innerHTML = '';
    const content = createMidiLearnDrawerContent({
      store,
      parameters: LEARNABLE_PARAMS,
      focusParamIndex,
      synthName: 'ABDMCX0X',
      onClose: () => { if (dialogEl?.open) dialogEl.close?.(); dialogEl?.removeAttribute('open'); },
    });
    dialogEl.appendChild(content);
    if (!dialogEl.open) { if (typeof dialogEl.show === 'function') dialogEl.show(); else dialogEl.setAttribute('open', ''); }
    bringToFront(dialogEl);
  };

  const ui = attachMidiLearnUI({
    store,
    root: document.body,
    getParamMeta: (idx: number) => {
      const p = byIdx.get(Number(idx));
      return p ? { name: p.name, group: p.group, key: p.key, min: p.min, max: p.max }
        : { name: `Param #${idx}`, group: 'Part', key: `param_${idx}`, min: 0, max: 1 };
    },
    onOpenDrawer: (focusIdx?: number) => openDrawer(focusIdx ?? -1),
  });

  const unsubMidi = webMidiService.onMidiInput((_port, bytes) => {
    if (!bytes || bytes.length < 2) return;
    const status = bytes[0] ?? 0, hi = status & 0xF0, ch = (status & 0x0F) + 1;
    const d1 = (bytes[1] ?? 0) & 0x7F, d2 = (bytes[2] ?? 0) & 0x7F;
    if (hi === 0xB0 && bytes.length >= 3) {
      store.handleIncomingMidi({ sourceType: MIDI_SOURCE_TYPES.CC, channel: ch, number: d1, rawValue: d2 });
    } else if (hi === 0xD0) {
      store.handleIncomingMidi({ sourceType: MIDI_SOURCE_TYPES.AFTERTOUCH, channel: ch, number: 0, rawValue: d1 });
    } else if (hi === 0xE0 && bytes.length >= 3) {
      const pb = (d2 << 7) | d1;
      store.handleIncomingMidi({ sourceType: MIDI_SOURCE_TYPES.PITCH_BEND, channel: ch, number: 0, rawValue: pb, normalizedValue: pb / 16383 });
    }
  });

  return {
    store,
    openDrawer,
    refreshUi: () => ui.refresh(),
    destroy: () => { unsubMidi(); ui.destroy(); dialogEl?.remove(); },
  };
}

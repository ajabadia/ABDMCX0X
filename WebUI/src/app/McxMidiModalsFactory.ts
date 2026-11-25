/**
 * ABDMCX0X -- McxMidiModalsFactory.ts
 * Constructs floating MIDI & Performance Modals (MPC 16-Pads & Groove Arpeggiator).
 * Strictly < 200 lines. 100% tokenized.
 */

import { MpcPadModal, GrooveArpeggiatorModal } from '@abdsynths/shared/components';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import type { McxAppState } from './McxAppState';
import { getLocale } from '../i18n/mcxI18n';

const ARP_RATE_TO_IDX: Record<string, number> = {
  '1/32': 1,
  '1/16T': 2,
  '1/16': 3,
  '1/8T': 4,
  '1/8': 5,
  '1/4': 7,
};

const REC_Q_STEPS: Record<string, number> = {
  off: 0, '1/8': 8, '1/8T': 12, '1/16': 16, '1/16T': 24, '1/32': 32, '1/64': 64,
};

export function createMidiModals(bridge: McxHostBridge, state: McxAppState) {
  const padModal = new MpcPadModal({
    locale: getLocale() === 'en' ? 'en' : 'es',
    partIndex: state.focusedPart,
    bpm: state.globalSettings?.standaloneBpm || 120,
    mode: state.partsState[state.focusedPart].kind === 'drum_map' ? 'drum' : 'chromatic',
    onPadTrigger: (partIdx, padIdx, note, vel, _meta, quantize) => {
      const velNorm = vel > 1 ? Math.max(0.05, Math.min(1, vel / 127)) : Math.max(0.05, Math.min(1, vel));
      const velMidi = vel > 1 ? Math.max(1, Math.min(127, Math.round(vel))) : Math.max(1, Math.min(127, Math.round(vel * 127)));
      void bridge.enableAudio();
      bridge.noteOn(partIdx, note, velNorm);
      const pr = state.refs.pianoRollModal;
      if (pr?.isRecording?.()) {
        const q = quantize || padModal.getInputQuantize?.() || 'off';
        (pr as any).recordNoteOn?.(note, velMidi, q);
      }
      state.setLcdLine2(`PAD ${String(padIdx + 1).padStart(2, '0')} -> NOTE ${note} (VEL ${velMidi} · ${Math.round(velNorm * 100)}%)`);
    },
    onPadRelease: (partIdx, _padIdx, note) => {
      bridge.noteOff(partIdx, note);
      const pr = state.refs.pianoRollModal;
      if (pr?.isRecording?.()) pr.recordNoteOff?.(note);
    },
    onInputQuantizeChange: (q) => state.setRecordConfig({ quantizeSteps: REC_Q_STEPS[q] ?? 16 }),
    onOpen: (partIdx) => {
      padModal.syncPart(partIdx, state.partsState[partIdx]);
    },
  });

  const fp = state.partsState[state.focusedPart];
  const arpModal = new GrooveArpeggiatorModal({
    locale: getLocale() === 'en' ? 'en' : 'es',
    partIndex: state.focusedPart,
    initialState: {
      enabled: Boolean(fp.arpEnabled),
      motif: fp.arpMotif ?? 0,
      rate: fp.arpRate ?? '1/16',
      octaves: fp.arpOctaves ?? 1,
      gate: fp.arpGate ?? 80,
      swing: Math.round((fp.patternSwing ?? 0.5) * 100),
      latch: fp.arpLatch ?? 0,
    },
    onParamChange: (partIdx, key, val) => {
      const ps = state.partsState[partIdx];
      const tag = `P${String(partIdx + 1).padStart(2, '0')}`;
      if (key === 'enabled') {
        ps.arpEnabled = Boolean(val);
        bridge.setParam(partIdx, 'arpEnabled', ps.arpEnabled ? 1 : 0);
        state.refs.toneDrawer?.syncPart(partIdx, ps);
        state.setLcdLine2(`${tag} ARP: ${ps.arpEnabled ? 'ACTIVO' : 'APAGADO'}`);
      } else if (key === 'motif') {
        ps.arpMotif = Number(val);
        bridge.setParam(partIdx, 'arpMotif', ps.arpMotif);
        state.setLcdLine2(`${tag} ARP MOTIF: #${ps.arpMotif}`);
      } else if (key === 'rate') {
        ps.arpRate = String(val);
        bridge.setParam(partIdx, 'arpRate', ARP_RATE_TO_IDX[ps.arpRate] ?? 3);
        state.setLcdLine2(`${tag} ARP RATE: ${ps.arpRate}`);
      } else if (key === 'octaves') {
        ps.arpOctaves = Number(val);
        bridge.setParam(partIdx, 'arpOctaves', ps.arpOctaves);
        state.setLcdLine2(`${tag} ARP OCTAVES: ${ps.arpOctaves}`);
      } else if (key === 'gate') {
        ps.arpGate = Number(val);
        bridge.setParam(partIdx, 'arpGate', ps.arpGate / 100);
        state.setLcdLine2(`${tag} ARP GATE: ${ps.arpGate}%`);
      } else if (key === 'swing') {
        const sw = Number(val) / 100;
        ps.patternSwing = sw;
        bridge.setParam(partIdx, 'arpSwing', sw);
        bridge.setParam(partIdx, 'patternSwing', sw);
        state.refs.stepStrip?.setSwing(sw);
        state.setLcdLine2(`${tag} ARP SWING: ${val}%`);
      } else if (key === 'latch') {
        ps.arpLatch = Number(val);
        bridge.setParam(partIdx, 'arpLatch', ps.arpLatch);
        state.setLcdLine2(`${tag} ARP LATCH: #${ps.arpLatch}`);
      }
    },
    onOpen: (partIdx) => state.syncArpModalForPart(partIdx),
  });

  return { padModal, arpModal };
}

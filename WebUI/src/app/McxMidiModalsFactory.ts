/**
 * ABDMCX0X -- McxMidiModalsFactory.ts
 * Constructs floating MIDI & Performance Modals (MPC 16-Pads & Groove Arpeggiator).
 * Strictly < 200 lines. 100% tokenized.
 */

import { MpcPadModal, GrooveArpeggiatorModal } from '@abdsynths/shared/components';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import type { McxAppState } from './McxAppState';
import type { ChordEvent } from './McxPrintArpToPattern';
import {
  applyPadParamPreview, arpRateToStepTicks, motifToArpMode,
  printArpToPart, printChordsToPart, type PadParamPreview,
} from './McxPrintPatternWiring';
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

type PadModalCtor = ConstructorParameters<typeof MpcPadModal>[0];
type ArpModalCtor = ConstructorParameters<typeof GrooveArpeggiatorModal>[0];
type PadOptions = PadModalCtor & { onPadParamPreview?: (partIdx: number, preview: PadParamPreview) => void };
type ArpOptions = ArpModalCtor & {
  onPrintToSeq?: (partIdx: number, arpState: { motif?: number; rate?: string; octaves?: number }) => void;
};

export function createMidiModals(bridge: McxHostBridge, state: McxAppState) {
  const chordEvents: ChordEvent[] = [];
  const partPpq = (idx: number): number => state.partsState[idx]?.sequence?.ppq ?? 96;
  const printArp = (partIdx: number, arp?: { motif?: number; rate?: string; octaves?: number }): void => {
    const ps = state.partsState[partIdx];
    const held = [...new Set((ps?.sequence?.notes ?? []).map((n) => n.midiNote))];
    printArpToPart(partIdx, {
      heldNotes: held.length ? held : [60, 64, 67],
      mode: motifToArpMode(arp?.motif ?? ps?.arpMotif ?? 0),
      octaves: arp?.octaves ?? ps?.arpOctaves ?? 1,
      stepTicks: arpRateToStepTicks(arp?.rate ?? ps?.arpRate ?? '1/16', partPpq(partIdx)),
      bars: ps?.sequence?.bars ?? 1, ppq: partPpq(partIdx),
    }, state, bridge);
  };
  const printChords = (partIdx: number): void => {
    const ppq = partPpq(partIdx);
    const events = chordEvents.length ? [...chordEvents] : [{ notes: [60, 64, 67] }];
    printChordsToPart(partIdx, { bars: 1, ppq, stepDivisionTicks: ppq / 2, events }, state, bridge);
    chordEvents.length = 0;
  };

  const padOptions: PadOptions = {
    locale: getLocale() === 'en' ? 'en' : 'es',
    partIndex: state.focusedPart,
    bpm: state.globalSettings?.standaloneBpm || 120,
    mode: state.partsState[state.focusedPart].kind === 'drum_map' ? 'drum' : 'chromatic',
    onPadTrigger: (partIdx, padIdx, note, vel, meta, quantize) => {
      const velNorm = vel > 1 ? Math.max(0.05, Math.min(1, vel / 127)) : Math.max(0.05, Math.min(1, vel));
      const velMidi = vel > 1 ? Math.max(1, Math.min(127, Math.round(vel))) : Math.max(1, Math.min(127, Math.round(vel * 127)));
      void bridge.enableAudio();
      bridge.noteOn(partIdx, note, velNorm);
      if (Array.isArray(meta?.notes)) {
        chordEvents.push({ notes: meta.notes, velocity: velMidi });
        if (chordEvents.length > 16) chordEvents.shift();
      }
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
    onPadParamPreview: (partIdx, preview) => applyPadParamPreview(partIdx, preview, state, bridge),
    onOpen: (partIdx) => {
      padModal.syncPart(partIdx, state.partsState[partIdx]);
      syncPadPrintVisibility();
    },
  };
  const padModal = new MpcPadModal(padOptions as PadModalCtor);
  const padEl = (padModal as any).el as HTMLElement | undefined;
  const syncPadPrintVisibility = (): void => {
    const btn = padEl?.querySelector<HTMLButtonElement>('#abd-pad-print-seq');
    if (btn) btn.hidden = (padModal as any).matrix?.mode !== 'chords';
  };
  const mountPadPrintBtn = (): void => {
    if (!padEl || padEl.querySelector('#abd-pad-print-seq')) return;
    const btn = document.createElement('button');
    btn.id = 'abd-pad-print-seq';
    btn.type = 'button';
    btn.textContent = 'Print -> SEQ';
    btn.title = 'Print chords to sequence';
    btn.style.cssText = 'font-size:10px;padding:2px 6px';
    btn.addEventListener('click', () => printChords(padModal.getPart()));
    padEl.querySelector('.abd-pad-head-right')?.appendChild(btn);
    syncPadPrintVisibility();
  };
  if (padEl) {
    mountPadPrintBtn();
    padEl.addEventListener('click', () => setTimeout(syncPadPrintVisibility, 0));
    const origSetLocale = padModal.setLocale.bind(padModal);
    padModal.setLocale = (locale: 'en' | 'es') => { origSetLocale(locale); mountPadPrintBtn(); };
  }

  const fp = state.partsState[state.focusedPart];
  const arpOptions: ArpOptions = {
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
    onPrintToSeq: (partIdx, arpState) => printArp(partIdx, arpState),
    onOpen: (partIdx) => state.syncArpModalForPart(partIdx),
  };
  const arpModal = new GrooveArpeggiatorModal(arpOptions as ArpModalCtor);

  return { padModal, arpModal };
}

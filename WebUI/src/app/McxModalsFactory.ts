/**
 * ABDMCX0X -- McxModalsFactory.ts
 * Constructs Diagnostic Probe, Save Preset, Bank Drawer, FX Rack, Global LFO, Piano Roll, and Groove Modals.
 */

import { createDiagnosticProbeModal } from '@abdsynths/shared/diagnostic-probe';
import { MultiBusFxRackModal, GlobalLfoModal, PianoRollModal, GrooveShuffleModal } from '@abdsynths/shared/components';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { getLocale, t } from '../i18n/mcxI18n';
import { McxBankDrawer } from '../ui/McxBankDrawer';
import { formatSlotLabel, SLOTS_PER_BANK } from '../ui/McxBankLayout';
import { McxSavePresetModal } from '../ui/McxSavePresetModal';
import type { McxAppState } from './McxAppState';
import { createGlobalLfoBridgeAdapter, GLOBAL_LFO1_DESTS, GLOBAL_LFO2_DESTS } from './McxPianoRollSync';
import { createFxRackBridge, loadBankDrawerItem, loadUserPresetsLocal, persistAndNotifyPresetSave } from './McxSessionHydrator';

export const buildProbeDestinations = () => [
  { id: 1, label: t('mcx.probePostMaster'), hint: t('mcx.probePostMasterHint') },
  { id: 2, label: t('mcx.probePreMaster'), hint: t('mcx.probePreMasterHint') },
  { id: 3, label: t('mcx.probePreFx'), hint: t('mcx.probePreFxHint') },
  { id: 4, label: t('mcx.probePreFilter'), hint: t('mcx.probePreFilterHint') },
  { id: 5, label: t('mcx.probeVoiceDirect'), hint: t('mcx.probeVoiceDirectHint') },
];

export function createProbeModal(bridge: McxHostBridge, state: McxAppState) {
  return createDiagnosticProbeModal({
    locale: getLocale(),
    sampleRate: bridge.getSampleRate(),
    frequencyHz: state.globalSettings.masterTuneHz || 440,
    initialVolume: 0.25,
    selectionMode: 'multi',
    destinations: buildProbeDestinations(),
    onChange: (st: { enabledIds: number[]; enabledMask: number; volume: number; frequencyHz: number; waveform: number }) => {
      if (st.enabledMask > 0) void bridge.enableAudio();
      bridge.setParam(state.focusedPart, 'diagProbeFreq', st.frequencyHz);
      bridge.setParam(state.focusedPart, 'diagProbeLevel', st.volume);
      bridge.setParam(state.focusedPart, 'diagProbeWave', st.waveform);
      bridge.setParam(state.focusedPart, 'diagProbePoint', st.enabledMask);
      state.setLcdLine2(st.enabledMask === 0 ? t('mcx.probeOff') : `${t('mcx.probeOn')} [${st.enabledIds.join(',')}] : ${Math.round(st.frequencyHz)} Hz`);
    },
  });
}

export function openSavePresetModal(bridge: McxHostBridge, state: McxAppState, type: 'part' | 'multi'): void {
  const idx = state.focusedPart;
  new McxSavePresetModal({
    type, partIndex: idx, initialName: state.partsState[idx].name, initialCategory: state.partsState[idx].categoryId,
    onSave: (payload) => persistAndNotifyPresetSave(bridge, state, payload),
  }).open();
}

export function createBankDrawer(bridge: McxHostBridge, state: McxAppState): McxBankDrawer {
  const drawer = new McxBankDrawer(bridge, {
    getTargetPart: () => state.focusedPart,
    setTargetPart: (idx) => state.focusPart(idx),
    getPlacedParts: () => {
      const out: Array<{ partId: number; label: string }> = [];
      for (let b = 0; b < state.bankLayout.bankCount; ++b) {
        for (let s = 0; s < SLOTS_PER_BANK; ++s) {
          const pid = state.bankLayout.banks[b][s];
          if (pid === null) continue;
          const pName = state.partsState[pid]?.name ?? 'Init Tone';
          out.push({ partId: pid, label: `${formatSlotLabel(b, s)} · P${String(pid + 1).padStart(2, '0')} (${pName})` });
        }
      }
      return out;
    },
    onSelectModel: (pIdx, item) => loadBankDrawerItem(bridge, state, pIdx, item),
    onSelectPartPreset: (pIdx, item) => loadBankDrawerItem(bridge, state, pIdx, item),
    onSelectMultiPreset: (item) => loadBankDrawerItem(bridge, state, 0, item),
    onAudition: (pIdx, item) => {
      void bridge.enableAudio();
      const note = item.engineKind?.includes('drum') ? 36 : 60;
      bridge.noteOn(pIdx, note, 0.85);
      setTimeout(() => bridge.noteOff(pIdx, note), 350);
    },
    onOpenSaveModal: (type) => openSavePresetModal(bridge, state, type),
  });
  drawer.setUserItems(loadUserPresetsLocal());
  return drawer;
}

export function createStudioModals(bridge: McxHostBridge, state: McxAppState) {
  let lastSendLabelsKey = '';
  const fxRackModal = new MultiBusFxRackModal({
    bridge: createFxRackBridge(bridge, state),
    bpm: 120,
    locale: getLocale(),
    getRackSlots: () => (state.refs.rackColumn as any)?.getSlots?.() ?? [],
    getSendTargets: () => (state.refs.rackColumn as any)?.getSendTargets?.() ?? [0, 1, -1, -1],
    onSendSlotTargetChange: (bus: number, bay: number) => {
      bridge.setSendSlotTarget(bus, bay);
      (state.refs.rackColumn as any)?.setSendTarget?.(bus, bay);
      state.setLcdLine2(`ENVÍO ${['A', 'B', 'C', 'D'][bus]} RUTEADO A: ${bay >= 0 ? `BAHÍA ${bay + 1}` : 'DESCONECTADO'}`);
    },
    onOpenFaceplate: (bay: number) => {
      (state.refs.rackColumn as any)?.openSlotFaceplate?.(bay);
    },
    onSendLabelsChange: (labels: any) => {
      state.refs.toneDrawer?.updateSendLabels(labels);
      const nextKey = JSON.stringify(labels ?? null);
      if (nextKey !== lastSendLabelsKey) {
        lastSendLabelsKey = nextKey;
        state.refreshPartList();
      }
    },
  });

  const globalLfoModal = new GlobalLfoModal({
    bridge: createGlobalLfoBridgeAdapter(bridge, state),
    bpm: 120,
    locale: getLocale(),
    destinationsLfo1: GLOBAL_LFO1_DESTS,
    destinationsLfo2: GLOBAL_LFO2_DESTS,
    onParamChange: (idx, k, v) => state.setLcdLine2(`GLOBAL LFO ${idx} ${k}: ${v}`),
  });

  const pianoRollModal: PianoRollModal = new PianoRollModal({
    bridge: {
      togglePlay: () => state.setTransportPlaying(!(state.refs.masterPanel?.getTransportState()?.playing ?? false)),
      stop: () => state.setTransportPlaying(false),
      setRecording: (rec: boolean) => bridge.setParam(state.focusedPart, 'seqRecording', rec ? 1 : 0),
      setBars: (b: number) => {
        bridge.setSequencerBars(b);
        state.setLcdLine2(`PATTERN LENGTH: ${b} BARS (${b * 16} STEPS)`);
      },
      setSwing: (sw: number) => {
        state.partsState[state.focusedPart].patternSwing = sw;
        state.refs.stepStrip?.setSwing(sw);
        bridge.setParam(state.focusedPart, 'patternSwing', sw);
        state.setLcdLine2(`SHUFFLE / SWING: ${Math.round(sw * 100)}%`);
      },
      recordMotion: (target: string, tick: number, val: number) => {
        bridge.setParam(state.focusedPart, target === 'cutoff' ? 'filterCutoff' : target === 'resonance' ? 'filterResonance' : 'partPan', val);
        if (target === 'cutoff') state.refs.toneDrawer?.updateParamLive('filterCutoff', val);
        else if (target === 'resonance') state.refs.toneDrawer?.updateParamLive('filterResonance', val);
        const seq = pianoRollModal.getSequence();
        state.partsState[state.focusedPart].sequence = seq;
        bridge.setPartPattern(state.focusedPart, seq);
        state.setLcdLine2(`RECORD MOTION [${target.toUpperCase()}]: ${Math.round(val * 100)}% @ TICK ${tick}`);
      },
    },
    bars: 1,
    ppq: 96,
    swing: 0.50,
    mode: state.partsState[state.focusedPart].kind === 'drum_map' ? 'drum' : 'chromatic',
    locale: getLocale(),
    onNotice: (msg: string) => state.setLcdLine2(msg),
    onNotePreview: (m: number, v: number) => { bridge.noteOn(state.focusedPart, m, Math.max(0.05, Math.min(1, v / 127))); setTimeout(() => bridge.noteOff(state.focusedPart, m), 220); },
    onPatternChange: (pat: any) => {
      state.partsState[state.focusedPart].sequence = pat;
      bridge.setPartPattern(state.focusedPart, pat);
      state.refs.stepStrip?.syncFromSequence(state.focusedPart, pat);
      state.setLcdLine2(`PATTERN P${String(state.focusedPart + 1).padStart(2, '0')}: ${pat.notes?.length || 0} NOTES (${pat.bars} BARS)`);
    },
    onMotionPlayback: (target: string, val: number) => {
      if (target === 'cutoff') state.refs.toneDrawer?.updateParamLive('filterCutoff', val);
      else if (target === 'resonance') state.refs.toneDrawer?.updateParamLive('filterResonance', val);
    },
    onOpenGroove: (partIdx?: number) => state.refs.grooveModal?.open(partIdx ?? state.focusedPart),
  });

  const grooveModal = new GrooveShuffleModal({
    locale: getLocale(),
    partIndex: -1,
    onChange: (cfg) => {
      bridge.setGroove(cfg.partIndex, cfg);
      if (cfg.partIndex === -1) {
        state.setLcdLine2(`MASTER GROOVE: ${cfg.algorithm.toUpperCase()} ${Math.round(cfg.amount * 100)}% [${cfg.resolution}]`);
        state.refs.stepStrip?.setSwing(cfg.amount);
      } else {
        const nextSwing = cfg.mode === 'off' ? 0.50 : cfg.amount;
        state.partsState[cfg.partIndex].patternSwing = nextSwing;
        state.refs.stepStrip?.setSwing(nextSwing);
        state.setLcdLine2(`P${String(cfg.partIndex + 1).padStart(2, '0')} GROOVE [${cfg.mode.toUpperCase()}]: ${cfg.algorithm.toUpperCase()} ${Math.round(cfg.amount * 100)}%`);
      }
    },
  });

  return { fxRackModal, globalLfoModal, pianoRollModal, grooveModal };
}

/**
 * ABDMCX0X -- McxModalsFactory.ts
 * Constructs Diagnostic Probe, Save Preset, Bank Drawer, FX Rack, Global LFO, Piano Roll, and Groove Modals.
 */

import { createDiagnosticProbeModal } from '@abdsynths/shared/diagnostic-probe';
import { MultiBusFxRackModal, GlobalLfoModal, PianoRollModal, GrooveShuffleModal } from '@abdsynths/shared/components';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { getLocale, t } from '../i18n/mcxI18n';
import { McxBankDrawer } from '../ui/McxBankDrawer';
import { McxSavePresetModal } from '../ui/McxSavePresetModal';
import type { McxAppState } from './McxAppState';

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

export function openSavePresetModal(state: McxAppState, type: 'part' | 'multi'): void {
  const idx = state.focusedPart;
  new McxSavePresetModal({
    type,
    partIndex: idx,
    initialName: state.partsState[idx].name,
    initialCategory: state.partsState[idx].categoryId,
    onSave: (payload) => {
      if (payload.type === 'part') {
        state.partsState[idx].name = payload.name;
        state.partsState[idx].categoryId = payload.categoryId;
        state.refreshPartList();
      }
      state.setLcdLine2(`SAVED ${payload.name} [${payload.sublibrary}]`);
    },
  }).open();
}

export function createBankDrawer(bridge: McxHostBridge, state: McxAppState): McxBankDrawer {
  return new McxBankDrawer(bridge, {
    getTargetPart: () => state.focusedPart,
    setTargetPart: (idx) => { state.focusedPart = idx; state.updateLcdLine1(0); state.refreshPartList(); },
    onSelectModel: (pIdx, item) => {
      state.partsState[pIdx].name = item.name;
      state.partsState[pIdx].categoryId = item.categoryId;
      state.refreshPartList();
      state.setLcdLine2(`P${String(pIdx + 1).padStart(2, '0')} LOADED MODEL: ${item.name}`);
    },
    onSelectPartPreset: (pIdx, item) => {
      state.partsState[pIdx].name = item.name;
      state.partsState[pIdx].categoryId = item.categoryId;
      if (item.engineKind?.includes('drum') && state.partsState[pIdx].kind !== 'drum_map') {
        state.partsState[pIdx].kind = 'drum_map';
        bridge.setParam(pIdx, 'partKind', 1);
      }
      state.refreshPartList();
      state.setLcdLine2(`P${String(pIdx + 1).padStart(2, '0')} PRESET: ${item.name}`);
    },
    onSelectMultiPreset: (item) => state.setLcdLine2(`LOADED MULTI: ${item.name}`),
    onAudition: (pIdx, item) => {
      void bridge.enableAudio();
      const note = item.engineKind?.includes('drum') ? 36 : 60;
      bridge.noteOn(pIdx, note, 0.85);
      setTimeout(() => bridge.noteOff(pIdx, note), 350);
    },
    onOpenSaveModal: (type) => openSavePresetModal(state, type),
  });
}

export function createStudioModals(bridge: McxHostBridge, state: McxAppState) {
  const fxRackModal = new MultiBusFxRackModal({
    bridge: {
      setTopology: (topo) => state.setLcdLine2(`FX RACK TOPOLOGY: ${topo}`),
      setMacro: (slot, macro) => {
        if (slot === 0) bridge.setParam(state.focusedPart, 'reverbMacro', macro);
        else if (slot === 1) bridge.setParam(state.focusedPart, 'chorusMacro', macro);
      },
      setCascadeInjections: (cho, del) => state.setLcdLine2(`CASCADE INJECTIONS: CHO ${Math.round(cho * 100)}% | DEL ${Math.round(del * 100)}%`),
      muteSendBus: (bus, muted) => {
        const bNames = ['REV (A)', 'CHO (B)', 'DEL (C)', 'AUX (D)'];
        state.setLcdLine2(`BUS ${bNames[bus]} ${muted ? 'MUTED (0% CPU)' : 'ACTIVE'}`);
      },
      setParam: (p, v) => {
        if (p === 'masterTempoBpm') state.refs.stepStrip?.setBpm(v);
        state.setLcdLine2(`FX RACK ${p}: ${v}`);
      },
      setGate: (g, v) => {
        const gNames = ['DUCKING', 'GATED REV', 'DELAY FREEZE', 'FX KILL'];
        state.setLcdLine2(`FX GATE [${gNames[g]}]: ${v ? 'TRIGGERED' : 'OFF'}`);
      },
    },
    bpm: 120,
    locale: getLocale(),
    onSendLabelsChange: (labels) => {
      state.refs.toneDrawer?.updateSendLabels(labels);
      state.refreshPartList();
    },
  });

  const globalLfoModal = new GlobalLfoModal({
    bridge,
    bpm: 120,
    locale: getLocale(),
    destinationsLfo1: [
      { id: 0, label: 'BUS A (REV)', title: 'Bus A Reverb' },
      { id: 1, label: 'BUS B (CHO)', title: 'Bus B Chorus' },
      { id: 2, label: 'BUS C (DEL)', title: 'Bus C Delay' },
      { id: 3, label: 'BUS D (AUX)', title: 'Bus D Aux / Filter' },
      { id: 4, label: 'MASTER VCF', title: 'Filtro Maestro' },
      { id: 5, label: 'ALL PARTS', title: 'Modulación simultánea a 16 partes' },
    ],
    destinationsLfo2: [
      { id: 0, label: 'FM -> LFO 1', title: 'Modulación cruzada hacia LFO Global 1' },
      { id: 1, label: 'BUS C DELAY', title: 'Flutter / Delay Time' },
      { id: 2, label: 'BUS D DRIVE', title: 'Saturación y Drive Maestro' },
      { id: 3, label: 'MASTER PAN', title: 'Auto-Pan Maestro' },
      { id: 4, label: 'MASTER VOL', title: 'Trémolo / Bombeo Master' },
      { id: 5, label: 'ALL PARTS', title: 'Modulación simultánea a 16 partes' },
    ],
    onParamChange: (idx, k, v) => state.setLcdLine2(`GLOBAL LFO ${idx} ${k}: ${v}`),
  });

  const pianoRollModal = new PianoRollModal({
    bridge: {
      togglePlay: () => state.setTransportPlaying(!(state.refs.masterPanel?.getTransportState()?.playing ?? false)),
      stop: () => state.setTransportPlaying(false),
      setBars: (b: number) => state.setLcdLine2(`PATTERN LENGTH: ${b} BARS (${b * 16} STEPS)`),
      setSwing: (sw: number) => {
        state.partsState[state.focusedPart].patternSwing = sw;
        state.refs.stepStrip?.setSwing(sw);
        // TODO(Phase 2): route patternSwing to C++ PatternSequencerEngine
        state.setLcdLine2(`SHUFFLE / SWING: ${Math.round(sw * 100)}%`);
      },
      recordMotion: (target: string, tick: number, val: number) => {
        bridge.setParam(state.focusedPart, target === 'cutoff' ? 'filterCutoff' : target === 'resonance' ? 'filterResonance' : 'partPan', val);
        if (target === 'cutoff') state.refs.toneDrawer?.updateParamLive('filterCutoff', val);
        else if (target === 'resonance') state.refs.toneDrawer?.updateParamLive('filterResonance', val);
        state.setLcdLine2(`RECORD MOTION [${target.toUpperCase()}]: ${Math.round(val * 100)}% @ TICK ${tick}`);
      },
    },
    bars: 1,
    ppq: 96,
    swing: 0.50,
    mode: state.partsState[state.focusedPart].kind === 'drum_map' ? 'drum' : 'chromatic',
    locale: getLocale(),
    onNotice: (msg: string) => state.setLcdLine2(msg),
    onPatternChange: (pat: any) => {
      state.partsState[state.focusedPart].sequence = pat;
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
      if (cfg.partIndex === -1) {
        state.setLcdLine2(`MASTER GROOVE: ${cfg.algorithm.toUpperCase()} ${Math.round(cfg.amount * 100)}% [${cfg.resolution}]`);
        state.refs.stepStrip?.setSwing(cfg.amount);
      } else {
        const nextSwing = cfg.mode === 'off' ? 0.50 : cfg.amount;
        state.partsState[cfg.partIndex].patternSwing = nextSwing;
        state.refs.stepStrip?.setSwing(nextSwing);
        // TODO(Phase 2): route patternSwing to C++ PatternSequencerEngine
        state.setLcdLine2(`P${String(cfg.partIndex + 1).padStart(2, '0')} GROOVE [${cfg.mode.toUpperCase()}]: ${cfg.algorithm.toUpperCase()} ${Math.round(cfg.amount * 100)}%`);
      }
    },
  });

  return { fxRackModal, globalLfoModal, pianoRollModal, grooveModal };
}

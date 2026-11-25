/**
 * ABDMCX0X -- McxHistoryWiring.ts
 * Connects McxHistoryManager (Undo/Redo + Compare A/B) to McxAppState, McxHostBridge and UI.
 * Strict line limit: < 170 lines.
 */

import type { McxHostBridge, McxParamKey } from '../bridge/McxHostBridge';
import { deserializeBankLayoutJson, serializeBankLayoutJson } from '../ui/McxBankLayout';
import type { McxPartUiState } from '../ui/McxPartState';
import type { McxAppState } from './McxAppState';
import { createHistoryManager, type HistoryStatus } from './McxHistoryManager';

export interface McxHistorySnapshot {
  bpm: number;
  bankLayoutJson: string;
  focusedPart: number;
  parts: McxPartUiState[];
}

export interface McxHistoryWiringOptions {
  state: McxAppState;
  bridge: McxHostBridge;
  onStatusChange?: (status: HistoryStatus) => void;
}

const SYNC_FIELDS: ReadonlyArray<[keyof McxPartUiState, McxParamKey]> = [
  ['partLevel', 'partLevel'], ['partPan', 'partPan'],
  ['reverbSend', 'reverbSend'], ['chorusSend', 'chorusSend'], ['delaySend', 'delaySend'], ['auxSend', 'auxSend'],
  ['filterCutoff', 'filterCutoff'], ['filterResonance', 'filterResonance'], ['filterModel', 'filterModel'], ['filterMode', 'filterMode'],
  ['filter2Enabled', 'filter2Enabled'], ['filter2Model', 'filter2Model'], ['filter2Mode', 'filter2Mode'],
  ['filter2Cutoff', 'filter2Cutoff'], ['filter2Resonance', 'filter2Resonance'],
  ['ampAttack', 'ampAttack'], ['ampDecay', 'ampDecay'], ['ampSustain', 'ampSustain'], ['ampRelease', 'ampRelease'],
  ['pitchCoarse', 'pitchCoarse'], ['pitchFine', 'pitchFine'],
  ['portaEnabled', 'portaEnabled'], ['portaTimeMs', 'portaTimeMs'], ['portaLegatoOnly', 'portaLegatoOnly'],
  ['driveType', 'driveType'], ['driveAmount', 'driveAmount'],
  ['eqLowGain', 'eqLowGain'], ['eqMidGain', 'eqMidGain'], ['eqHighGain', 'eqHighGain'],
  ['lfo1Rate', 'lfo1Rate'], ['lfo1Depth', 'lfo1Depth'], ['lfo2Rate', 'lfo2Rate'], ['lfo2Depth', 'lfo2Depth'],
  ['cutoffOffset', 'cutoffOffset'], ['resonanceOffset', 'resonanceOffset'],
  ['envAttackOffset', 'envAttackOffset'], ['envDecayOffset', 'envDecayOffset'],
  ['envReleaseOffset', 'envReleaseOffset'], ['vibratoOffset', 'vibratoOffset'],
  ['patternSwing', 'patternSwing'], ['routeMode', 'routeMode'], ['structureMode', 'structureMode'],
  ['mute', 'partMute'], ['solo', 'partSolo'], ['followTranspose', 'partFollowTranspose'], ['midiChannel', 'partMidiChannel'],
];

export function mountHistoryWiring(opts: McxHistoryWiringOptions) {
  const { state, bridge, onStatusChange } = opts;
  const mgr = createHistoryManager<McxHistorySnapshot>({ maxSteps: 40, coalesceMs: 350 });
  let isRestoring = false;
  let queued: { label: string; key?: string } | null = null;

  const capture = (): McxHistorySnapshot => ({
    bpm: state.globalSettings.standaloneBpm,
    bankLayoutJson: serializeBankLayoutJson(state.bankLayout),
    focusedPart: state.focusedPart,
    parts: structuredClone(state.partsState),
  });

  const notifyStatus = () => onStatusChange?.(mgr.getStatus());

  const applySnapshot = (next: McxHistorySnapshot): void => {
    const prev = capture();
    isRestoring = true;
    try {
      if (next.bpm !== prev.bpm) {
        state.globalSettings.standaloneBpm = next.bpm;
        bridge.setTempo(next.bpm);
        state.refs.masterPanel?.setBpm(next.bpm);
      }
      if (next.bankLayoutJson !== prev.bankLayoutJson) {
        state.bankLayout = deserializeBankLayoutJson(next.bankLayoutJson);
        state.syncBankLayoutToHost();
      }
      for (let i = 0; i < state.partsState.length && i < next.parts.length; ++i) {
        const np = next.parts[i], pp = prev.parts[i];
        if (!np || !pp) continue;
        Object.assign(state.partsState[i], structuredClone(np));
        if (np.kind !== pp.kind) bridge.setParam(i, 'partKind', np.kind === 'drum_map' ? 1 : 0);
        for (const [field, paramKey] of SYNC_FIELDS) {
          if (np[field] !== pp[field]) {
            const v = typeof np[field] === 'boolean' ? (np[field] ? 1 : 0) : Number(np[field] ?? 0);
            bridge.setParam(i, paramKey, v);
          }
        }
        if (np.sequence && JSON.stringify(np.sequence) !== JSON.stringify(pp.sequence ?? null)) {
          bridge.setPartPattern(i, np.sequence);
        }
      }
      state.focusedPart = Math.max(0, Math.min(state.partsState.length - 1, next.focusedPart ?? 0));
      state.refreshPartList();
      state.updateLcdLine1(0);
      if (state.refs.toneDrawer?.isOpen()) state.refs.toneDrawer.syncPart(state.focusedPart, state.partsState[state.focusedPart]);
      state.refs.stepStrip?.syncFromSequence(state.focusedPart, state.partsState[state.focusedPart]?.sequence);
    } finally {
      isRestoring = false;
    }
  };

  const scheduleCapture = (label: string, key?: string): void => {
    if (isRestoring) return;
    const wasQueued = queued !== null;
    queued = { label, key };
    if (wasQueued) return;
    queueMicrotask(() => {
      const pending = queued;
      queued = null;
      if (!pending || isRestoring) return;
      if (mgr.push(capture(), pending.label, pending.key ? { coalesceKey: pending.key } : undefined)) notifyStatus();
    });
  };

  const origSetParam = bridge.setParam.bind(bridge);
  const origSetPattern = bridge.setPartPattern.bind(bridge);
  const origSetTempo = bridge.setTempo.bind(bridge);
  const origSetBankLayout = bridge.setBankLayout.bind(bridge);

  bridge.setParam = (part, key, val) => { origSetParam(part, key, val); scheduleCapture(String(key), `${part}:${key}`); };
  bridge.setPartPattern = (part, seq) => { origSetPattern(part, seq); scheduleCapture('pattern', `${part}:pattern`); };
  bridge.setTempo = (bpm) => { origSetTempo(bpm); scheduleCapture('tempo', 'bpm'); };
  bridge.setBankLayout = (json) => { origSetBankLayout(json); scheduleCapture('layout', 'layout'); };

  mgr.init(capture());
  notifyStatus();

  return {
    undo: (): boolean => {
      const res = mgr.undo();
      if (!res) { state.setLcdLine2('UNDO: NADA QUE DESHACER'); return false; }
      applySnapshot(res.state); notifyStatus();
      state.setLcdLine2(`UNDO: ${res.label}`);
      return true;
    },
    redo: (): boolean => {
      const res = mgr.redo();
      if (!res) { state.setLcdLine2('REDO: NADA QUE REHACER'); return false; }
      applySnapshot(res.state); notifyStatus();
      state.setLcdLine2(`REDO: ${res.label}`);
      return true;
    },
    toggleCompare: (): boolean => {
      const res = mgr.toggleCompare(capture());
      if (!res) return false;
      applySnapshot(res.state); notifyStatus();
      state.setLcdLine2(`COMPARE: ${res.mode === 'A' ? 'REFERENCIA A' : 'EDICIÓN B'}`);
      return true;
    },
    captureBaseline: (): void => {
      mgr.captureCompareBaseline(capture()); notifyStatus();
      state.setLcdLine2('COMPARE: REFERENCIA A CAPTURADA');
    },
    getStatus: () => mgr.getStatus(),
    destroy: () => {
      bridge.setParam = origSetParam; bridge.setPartPattern = origSetPattern;
      bridge.setTempo = origSetTempo; bridge.setBankLayout = origSetBankLayout;
    },
  };
}

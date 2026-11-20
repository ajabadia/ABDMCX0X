/**
 * ABDMCX0X -- McxMixerCallbacksFactory.ts
 * Factory for the 16-part mixer strip callbacks wired to McxAppState & McxHostBridge.
 */

import type { McxHostBridge } from '../bridge/McxHostBridge';
import { t } from '../i18n/mcxI18n';
import type { McxMixerCallbacks } from '../ui/McxMixerConsole';
import type { McxAppState } from './McxAppState';

export function createMixerCallbacks(state: McxAppState, bridge: McxHostBridge): McxMixerCallbacks {
  return {
    getFocusedPart: () => state.focusedPart,
    setFocusedPart: (idx) => state.focusPart(idx),
    getPartsState: () => state.partsState,
    getBankLayout: () => state.bankLayout,
    getMidiDevices: () => state.midiDevices,
    getEngineCatalog: () => state.refs.routeModal?.getEngineCatalog() ?? [],
    onTogglePin: (partId) => state.togglePartPin(partId),
    onDeletePart: (bankIdx, slotIdx, forceUnpin) => state.requestDeletePart(bankIdx, slotIdx, forceUnpin),
    onMovePart: (fromBank, fromSlot, toBank, toSlot) => state.movePartSlot(fromBank, fromSlot, toBank, toSlot),
    onAddPartInFirstFreeSlot: (bankIdx) => state.addPartAtFirstFreeSlot(bankIdx),
    onOpenRouteForPart: (idx) => { state.focusPart(idx); state.refs.routeModal?.open(idx); },
    onTogglePartKind: (idx) => {
      const next = state.partsState[idx].kind === 'drum_map' ? 'chromatic' : 'drum_map';
      state.partsState[idx].kind = next;
      bridge.setParam(idx, 'partKind', next === 'drum_map' ? 1 : 0);
      bridge.requestPartEngineState(idx);
      state.notifyPartMetadataChanged(idx);
      state.setLcdLine2(`P${String(idx + 1).padStart(2, '0')} -> ${next === 'drum_map' ? t('mcx.partDrumMap') : t('mcx.partChromatic')}`);
    },
    onChangePartChannel: (idx, ch) => {
      state.partsState[idx].midiChannel = ch;
      bridge.setParam(idx, 'partMidiChannel', ch);
      state.updateLcdLine1(0);
      state.setLcdLine2(`P${String(idx + 1).padStart(2, '0')} MIDI CH ${ch}`);
    },
    onToggleFollowTranspose: (idx) => {
      const next = state.partsState[idx].followTranspose === false;
      state.partsState[idx].followTranspose = next;
      bridge.setParam(idx, 'partFollowTranspose', next ? 1 : 0);
      state.refreshPartList();
      state.setLcdLine2(`P${String(idx + 1).padStart(2, '0')} TRANSPOSE: ${next ? 'ON' : 'OFF'}`);
    },
    onToggleMute: (idx) => state.togglePartMute(idx),
    onToggleSolo: (idx) => state.togglePartSolo(idx),
    onOpenSynthForPart: (idx) => { state.focusPart(idx); state.refs.synthModal?.open(idx); },
    onOpenBankForPart: (idx) => { state.focusPart(idx); state.refs.bankDrawer?.open(idx); },
    onOpenToneForPart: (idx, sec) => {
      state.focusPart(idx);
      if (state.refs.songDrawer?.isOpen()) state.refs.songDrawer.close();
      if (sec) state.refs.toneDrawer?.open(idx, sec);
      else state.refs.toneDrawer?.toggle(idx);
    },
    onOpenPadsForPart: (idx) => {
      state.focusPart(idx);
      if (state.refs.padModal) {
        state.refs.padModal.syncPart(idx, state.partsState[idx]);
        state.refs.padModal.toggle(idx);
      }
    },
    onOpenArpForPart: (idx) => {
      state.focusPart(idx);
      if (state.refs.arpModal) {
        state.syncArpModalForPart(idx);
        state.refs.arpModal.toggle(idx);
      }
    },
    onOpenPianoRollForPart: (idx) => {
      state.focusPart(idx);
      if (state.refs.pianoRollModal) {
        state.syncPianoRollForPart(idx);
        state.refs.pianoRollModal.open();
      }
    },
    onChangeGlide: (idx, ms) => state.refs.stepStrip?.setPortaTime(idx, ms),
    onChangeLevel: (idx, lvl) => { state.partsState[idx].partLevel = lvl; bridge.setParam(idx, 'partLevel', lvl); },
    onChangePan: (idx, pan) => { state.partsState[idx].partPan = pan; bridge.setParam(idx, 'partPan', pan); },
    onChangeSendA: (idx, send) => { state.partsState[idx].reverbSend = send; bridge.setParam(idx, 'reverbSend', send); },
    onChangeSendB: (idx, send) => { state.partsState[idx].chorusSend = send; bridge.setParam(idx, 'chorusSend', send); },
    setLcdLine2: state.setLcdLine2,
  };
}

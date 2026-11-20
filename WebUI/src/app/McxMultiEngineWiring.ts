/**
 * ABDMCX0X -- McxMultiEngineWiring.ts
 * Connects McxInstrumentRouteModal, McxToneDrawer engine/preset lists, and native IPC catalog events.
 * Strict line limit: < 200 lines.
 */

import type { McxHostBridge } from '../bridge/McxHostBridge';
import { McxInstrumentRouteModal } from '../ui/McxInstrumentRouteModal';
import { McxSynthModal } from '../ui/McxSynthModal';
import type { ThemeManager } from '../ui/ThemeManager';
import type { McxAppState } from './McxAppState';

export function mountMultiEngineUi(
  bridge: McxHostBridge,
  state: McxAppState,
  themeMgr: ThemeManager
): McxInstrumentRouteModal {
  const routeModal = new McxInstrumentRouteModal({
    bridge,
    getPartState: (idx) => state.partsState[idx],
    getMidiDevices: () => state.midiDevices,
    onPartUpdated: (idx) => state.notifyPartMetadataChanged(idx),
    onOpenToneDrawer: (idx) => { state.focusPart(idx); state.refs.synthModal?.open(idx); },
    setLcdLine2: state.setLcdLine2,
  });

  const synthModal = new McxSynthModal({
    bridge,
    getPartState: (idx) => state.partsState[idx],
    getCatalog: () => routeModal.getEngineCatalog(),
    onPartUpdated: (idx) => state.notifyPartMetadataChanged(idx),
    onOpenRouteModal: (idx) => routeModal.open(idx),
    onOpenBank: (idx) => state.refs.bankDrawer?.open(idx),
    setLcdLine2: state.setLcdLine2,
  });

  state.refs.routeModal = routeModal;
  state.refs.synthModal = synthModal;

  bridge.onEngineCatalog((engines) => {
    routeModal.setEngineCatalog(engines);
    synthModal.setEngineCatalog(engines);
    state.refs.toneDrawer?.setEngineCatalog(engines);
    state.refreshPartList();
  });

  bridge.onPartPresets((dto) => {
    routeModal.setPartPresets(dto);
    synthModal.setPartPresets(dto);
    state.refs.toneDrawer?.setPartPresets(dto);
  });

  bridge.onPartEngineState((dto) => {
    synthModal.applyPartEngineState(dto);
    state.refs.toneDrawer?.applyPartEngineState(dto);
  });

  themeMgr.onChange(() => {
    routeModal.syncTheme();
  });

  bridge.onAudioStatus((st) => {
    if (st === 'ready') {
      bridge.requestEngineCatalog();
      bridge.requestPartPresets(state.focusedPart);
      bridge.requestPartEngineState(state.focusedPart);
    }
  });
  bridge.requestEngineCatalog();
  bridge.requestPartPresets(state.focusedPart);
  bridge.requestPartEngineState(state.focusedPart);

  return routeModal;
}

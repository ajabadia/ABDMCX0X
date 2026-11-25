/**
 * ABDMCX0X -- McxMultiEngineWiring.ts
 * Connects McxInstrumentRouteModal, McxToneDrawer engine/preset lists, and native IPC catalog events.
 * Strict line limit: < 200 lines.
 */

import type { McxHostBridge } from '../bridge/McxHostBridge';
import { McxInstrumentRouteModal } from '../ui/McxInstrumentRouteModal';
import { McxPerformanceModal } from '../ui/McxPerformanceModal';
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
    setLcdLine2: state.setLcdLine2,
    state,
  });

  const performanceModal = new McxPerformanceModal({
    bridge, state, getCatalog: () => routeModal.getEngineCatalog(),
    onToggleOpen: (open) => document.getElementById('mcx-btn-perf')?.classList.toggle('is-active', open),
  });
  const origSetEngineParam = bridge.setEngineParam.bind(bridge);
  bridge.setEngineParam = (part: number, key: string, value: number) => {
    origSetEngineParam(part, key, value);
    performanceModal.handleExternalParamTouched(part, key);
  };

  state.refs.routeModal = routeModal;
  state.refs.synthModal = synthModal;
  state.refs.performanceModal = performanceModal;

  bridge.onEngineCatalog((engines) => {
    routeModal.setEngineCatalog(engines);
    synthModal.setEngineCatalog(engines);
    state.refs.toneDrawer?.setEngineCatalog(engines);
    performanceModal.syncFromAppState();
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
    if (dto.part === state.focusedPart) state.syncFocusedKeyboardPlayableNotes?.();
    if (dto.part === performanceModal.getTargetPart() && performanceModal.isOpen()) performanceModal.syncFromAppState();
  });

  themeMgr.onChange(() => {
    routeModal.syncTheme();
    synthModal.syncTheme();
    performanceModal.syncTheme();
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

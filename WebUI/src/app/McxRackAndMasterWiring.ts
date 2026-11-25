/**
 * ABDMCX0X -- McxRackAndMasterWiring.ts
 * Mounts McxRackColumn (+ FxFaceplateModal) and McxMasterPanel for main.ts.
 */

import { FxFaceplateModal } from '@abdsynths/shared/components';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { McxRackSlotBridge } from '../bridge/McxRackSlotBridge';
import type { McxGlobalDrawer } from '../ui/McxGlobalDrawer';
import { McxMasterPanel } from '../ui/McxMasterPanel';
import { McxRackColumn } from '../ui/McxRackColumn';
import type { McxAppState } from './McxAppState';
import type { createStudioModals } from './McxModalsFactory';

type StudioModals = ReturnType<typeof createStudioModals>;

export function mountRackAndMasterUi(
  bridge: McxHostBridge,
  state: McxAppState,
  modals: StudioModals,
  globalDrawer: McxGlobalDrawer,
): void {
  const byId = (id: string) => document.getElementById(id);

  const rackHost = byId('mcx-rack-column');
  const masterHost = byId('mcx-master-panel');
  const SIDE_COLS_KEY = 'abdmcx0x.sideCols.v1';
  let rackCollapsed = false, masterCollapsed = false;
  try {
    const saved = JSON.parse(localStorage.getItem(SIDE_COLS_KEY) || '{}');
    rackCollapsed = Boolean(saved?.rackCollapsed);
    masterCollapsed = Boolean(saved?.masterCollapsed);
  } catch { /* ignore */ }
  const applySideColStates = () => {
    rackHost?.classList.toggle('is-collapsed', rackCollapsed);
    masterHost?.classList.toggle('is-collapsed', masterCollapsed);
    try { localStorage.setItem(SIDE_COLS_KEY, JSON.stringify({ rackCollapsed, masterCollapsed })); } catch { /* ignore */ }
  };
  const toggleRackCol = () => {
    rackCollapsed = !rackCollapsed; applySideColStates();
    state.setLcdLine2(rackCollapsed ? "RACK 19'': OCULTO" : "RACK 19'': VISIBLE");
  };
  const toggleMasterCol = () => {
    masterCollapsed = !masterCollapsed; applySideColStates();
    state.setLcdLine2(masterCollapsed ? 'MASTER: OCULTO' : 'MASTER: VISIBLE');
  };

  if (rackHost) {
    const fxModal = new FxFaceplateModal({
      onNameChange: (slotIdx: number, newName: string) => {
        state.refs.rackColumn?.setSlotCustomName(slotIdx, newName);
        modals.fxRackModal?.render();
        state.refs.toneDrawer?.updateSendLabels(modals.fxRackModal?.emitLabels?.());
        state.refs.toneDrawer?.updateInsertOptions();
      },
    });
    state.refs.fxRackModal = modals.fxRackModal;
    state.refs.rackColumn = new McxRackColumn(rackHost, {
      bridge,
      setLcdLine2: state.setLcdLine2,
      onOpenTopology: () => modals.fxRackModal.toggle(),
      onToggleCollapse: toggleRackCol,
      onSlotMoved: (from, to) => {
        state.partsState.forEach((ps) => { ps.insertSlot = ps.insertSlot === from ? to : ps.insertSlot === to ? from : ps.insertSlot; });
        state.refs.toneDrawer?.updateInsertOptions();
      },
      onSlotRemoved: (slot) => {
        state.partsState.forEach((ps) => { if (ps.insertSlot === slot) ps.insertSlot = -1; });
        state.refs.toneDrawer?.updateInsertOptions();
      },
      onSlotsChanged: () => {
        modals.fxRackModal.render();
        state.refs.toneDrawer?.updateSendLabels(modals.fxRackModal.emitLabels());
        state.refs.toneDrawer?.updateInsertOptions();
        state.refreshPartList();
      },
      onOpenEffectDetail: (slotIdx, algoId, customName, slot) => {
        state.setLcdLine2(`EDITANDO EFECTO BAHÍA ${slotIdx + 1}: ${customName || algoId}`);
        const slotBridge = new McxRackSlotBridge(bridge, {
          slotIdx, algoId, name: customName, bypass: slot?.bypass, duck: slot?.duck, duckAmount: slot?.duckAmount,
          p1: slot?.p1, p2: slot?.p2, mix: slot?.mix, presetIdx: slot?.presetIdx, params: slot?.params,
          onStateSync: (idx, patch) => state.refs.rackColumn?.updateSlotState(idx, patch, patch.bypass !== undefined),
        });
        fxModal.open(slotIdx, algoId, customName, slotBridge);
      },
    });
  }

  if (masterHost) {
    state.refs.masterPanel = new McxMasterPanel(masterHost, {
      bridge,
      setLcdLine2: state.setLcdLine2,
      initialVolume: 0.85,
      initialBpm: state.globalSettings.standaloneBpm,
      initialQuantizeSteps: state.recordQuantizeSteps,
      getFocusedPart: () => state.focusedPart,
      onVolumeChange: (v) => globalDrawer.setMasterVolume(v),
      onRecordChange: (rec) => state.setSequencerRecording(rec),
      onCountInChange: (bars) => state.setRecordConfig({ countInBars: bars }),
      onRecordModeChange: (mode) => state.setRecordConfig({ mode }),
      onQuantizeChange: (steps) => state.setRecordConfig({ quantizeSteps: steps }),
      onSwingChange: (pct) => {
        const sw = Math.max(0.5, Math.min(0.75, pct / 100));
        const pIdx = state.focusedPart;
        if (state.partsState[pIdx]) state.partsState[pIdx].patternSwing = sw;
        state.refs.stepStrip?.setSwing(sw);
        bridge.setParam(pIdx, 'patternSwing', sw);
      },
      onLimiterChange: (en) => modals.fxRackModal.setLimiterEnabled(en),
      onOpenGlobal: () => { globalDrawer.toggle(); byId('mcx-global-btn')?.classList.toggle('is-active', globalDrawer.isOpen()); },
      onOpenFxRack: () => modals.fxRackModal.toggle(),
      onOpenGlobalLfo: () => modals.globalLfoModal.toggle(),
      onOpenGroove: (partIdx?: number) => modals.grooveModal.open(partIdx ?? -1),
      onOpenSong: () => state.refs.toggleSongDrawer?.(),
      onToggleCollapseMaster: toggleMasterCol,
      onBpmChange: (bpm) => {
        state.globalSettings.standaloneBpm = bpm;
        state.updateLcdLine1(0);
        modals.fxRackModal.setBpm(bpm);
        modals.globalLfoModal.setBpm(bpm);
        state.refs.padModal?.setBpm?.(bpm);
        state.refs.stepStrip?.setTransportRunning(state.refs.masterPanel?.getTransportState()?.playing ?? false, bpm);
      },
      onTransportChange: (st) => {
        modals.pianoRollModal.setPlaying(st.playing);
        state.refs.stepStrip?.setTransportRunning(st.playing, st.bpm);
      },
    });
  }
  applySideColStates();
}

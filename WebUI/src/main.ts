/**
 * ABDMCX0X -- WebUI main.ts
 * Application bootstrap orchestrating @abdsynths/shared styles, bridge, drawers, and telemetry.
 */

import '@abdsynths/shared/styles';
import '@abdsynths/shared/styles/components/wheels.css';
import '@abdsynths/shared/styles/components/kbd-buttons.css';
import '@abdsynths/shared/diagnostic-probe/styles';
import '@abdsynths/midi-keyb/keyboard.css';
import '@abdsynths/shared/styles/components/step-button-strip.css';
import '@abdsynths/shared/styles/components/mpc-pad-matrix.css';
import '@abdsynths/shared/styles/components/multi-bus-fx-rack.css';
import '@abdsynths/shared/styles/components/global-lfo-modal.css';
import '@abdsynths/shared/styles/components/compact-transport-bar.css';
import '@abdsynths/shared/styles/components/compact-stereo-vu.css';
import '@abdsynths/shared/styles/components/piano-roll.css';
import '@abdsynths/shared/styles/components/groove-shuffle.css';
import './styles/mcx0x.css';

import { McxHostBridge } from './bridge/McxHostBridge'; import { McxRackSlotBridge } from './bridge/McxRackSlotBridge';
import { FxFaceplateModal } from '@abdsynths/shared/components'; import { applyI18n, getLocale, onLocaleChange, t } from './i18n/mcxI18n';
import { ThemeManager, type ThemeFamilyKey } from './ui/ThemeManager'; import { McxNavbar } from './ui/McxNavbar';
import { McxSettingsModal } from './ui/McxSettingsModal'; import { wireBankDropZone } from './ui/McxPanels';
import { McxScopeCanvas } from './ui/McxScopeCanvas'; import { McxStepStrip } from './ui/McxStepStrip';
import { McxToneDrawer } from './ui/McxToneDrawer'; import { McxGlobalDrawer } from './ui/McxGlobalDrawer';
import { McxMasterPanel } from './ui/McxMasterPanel'; import { McxRackColumn } from './ui/McxRackColumn';
import { McxAppState } from './app/McxAppState'; import { bindGlobalShortcuts, bindTelemetry, mountKeyboardDock } from './app/McxInputAndTelemetry';
import { buildProbeDestinations, createBankDrawer, createProbeModal, createStudioModals, openSavePresetModal } from './app/McxModalsFactory';
import { createMidiModals } from './app/McxMidiModalsFactory';
import { hydrateSessionState, parseLibraryCatalogJson } from './app/McxSessionHydrator';
import { mountMultiEngineUi } from './app/McxMultiEngineWiring'; import { mountSongAndScenesUi } from './app/McxSongWiring';

const bridge = new McxHostBridge(), themeMgr = new ThemeManager(), state = new McxAppState(bridge);

function initApp(): void {
  applyI18n(document.body); state.syncOctaveTooltips();
  const byId = (id: string) => document.getElementById(id);
  const probeModal = createProbeModal(bridge, state);
  const settingsModal = new McxSettingsModal({
    bridge, onSettingsApplied: (s) => { state.globalSettings = s; state.updateLcdLine1(0); },
    onGlobalTransposeChange: (st) => state.refs.globalDrawer?.setGlobalTranspose(st),
  });
  const bankDrawer = createBankDrawer(bridge, state), modals = createStudioModals(bridge, state), midiModals = createMidiModals(bridge, state);
  const globalDrawer = new McxGlobalDrawer({
    hostEl: document.body, bridge, setLcdLine2: state.setLcdLine2,
    onClose: () => byId('mcx-global-btn')?.classList.remove('is-active'), onOpenFxRack: () => modals.fxRackModal.toggle(),
    onMasterVolumeChange: (v) => state.refs.masterPanel?.setVolume(v), onGlobalTransposeChange: (st) => settingsModal.syncGlobalTranspose(st),
  });
  const fileInput = byId('bank-file-input') as HTMLInputElement | null, navHost = byId('mcx-navbar-host');
  const onPanic = () => { bridge.allNotesOff(); state.setLcdLine2(t('mcx.allNotesOff')); };
  const onToggleProbe = () => probeModal?.toggle({ theme: document.documentElement.getAttribute('data-theme'), locale: getLocale(), sampleRate: bridge.getSampleRate(), frequencyHz: state.globalSettings.masterTuneHz || 440 });
  state.refs = { ...state.refs, bankDrawer, settingsModal, globalDrawer, ...modals, ...midiModals, onPanic, onToggleProbe, onSavePreset: (multi) => openSavePresetModal(bridge, state, multi ? 'multi' : 'part'), onOpenBankFile: () => fileInput?.click() };
  byId('mcx-solo-clear-btn')?.addEventListener('click', () => state.clearAllSolos());
  const navbar = navHost ? new McxNavbar(navHost, {
    themeMgr,
    onConfigureFolder: () => (bridge.isNative ? bridge.chooseWorkingDir() : settingsModal.open()),
    onOpenSettings: () => settingsModal.toggle(),
    onOpenBankManager: () => bankDrawer.toggle(state.focusedPart),
    onSavePartPreset: () => openSavePresetModal(bridge, state, 'part'),
    onSaveMultiPreset: () => openSavePresetModal(bridge, state, 'multi'),
    onLoadBank: () => fileInput?.click(),
    onFactoryReset: () => { bridge.resetToFactory(); bridge.requestPartEngineState(state.focusedPart); bridge.requestPartPresets(state.focusedPart); state.setLcdLine2(t('mcx.factoryReset')); },
    onPanic,
    onEnableAudio: () => { void bridge.enableAudio(); },
    onToggleProbe,
    onOpenFxRack: () => modals.fxRackModal.toggle(), onOpenGlobalLfo: () => modals.globalLfoModal.toggle(),
    onOpenPianoRoll: () => { state.syncPianoRollForPart(state.focusedPart); modals.pianoRollModal.toggle(); },
    onOpenGroove: () => modals.grooveModal.open(-1), onOpenSong: () => state.refs.toggleSongDrawer?.(),
  }) : null;
  const dropZone = byId('mcx-workspace') || document.body;
  if (fileInput) wireBankDropZone(dropZone, fileInput, bridge, state.setLcdLine2);
  const scopeCanvas = byId('mcx-scope-canvas') as HTMLCanvasElement | null;
  const scopeView = scopeCanvas ? new McxScopeCanvas(scopeCanvas) : null;

  const panelCbs = state.getPanelCallbacks();
  const mainCol = document.querySelector<HTMLElement>('.mcx-main-col');
  if (mainCol) {
    state.refs.toneDrawer = new McxToneDrawer({
      hostEl: mainCol, bridge, getPartState: (idx) => state.partsState[idx], setLcdLine2: state.setLcdLine2,
      getRackSlots: () => state.refs.rackColumn?.getSlots() ?? [],
      onClose: () => state.refreshPartList(), onChangePartChannel: (idx, ch) => panelCbs.onChangePartChannel(idx, ch),
      onToggleFollowTranspose: (idx) => panelCbs.onToggleFollowTranspose(idx), onToggleMute: (idx) => panelCbs.onToggleMute(idx),
      onToggleSolo: (idx) => panelCbs.onToggleSolo(idx), onRouteModeChange: () => state.refreshPartList(),
      onOpenRouteModal: (idx) => state.refs.routeModal?.open(idx),
      onOpenPianoRoll: (idx) => panelCbs.onOpenPianoRollForPart?.(idx),
      onOpenGroove: (idx) => modals.grooveModal.open(idx),
      onOpenSynth: (idx) => state.refs.synthModal?.open(idx),
      onOpenArp: (idx) => midiModals.arpModal.toggle(idx), onOpenPads: (idx) => midiModals.padModal.toggle(idx),
      onPartChanged: () => state.notifyPartMetadataChanged(state.focusedPart),
    });
  }

  const rackHost = byId('mcx-rack-column');
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
      bridge, setLcdLine2: state.setLcdLine2,
      onOpenTopology: () => modals.fxRackModal.toggle(),
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
          slotIdx, algoId, name: customName, bypass: slot?.bypass, duck: slot?.duck,
          p1: slot?.p1, p2: slot?.p2, mix: slot?.mix, presetIdx: slot?.presetIdx, params: slot?.params,
          onStateSync: (idx, patch) => state.refs.rackColumn?.updateSlotState(idx, patch, patch.bypass !== undefined),
        });
        fxModal.open(slotIdx, algoId, customName, slotBridge);
      },
    });
  }

  const masterHost = byId('mcx-master-panel');
  if (masterHost) {
    state.refs.masterPanel = new McxMasterPanel(masterHost, {
      bridge, setLcdLine2: state.setLcdLine2, initialVolume: 0.85, initialBpm: state.globalSettings.standaloneBpm,
      getFocusedPart: () => state.focusedPart, onVolumeChange: (v) => globalDrawer.setMasterVolume(v),
      onLimiterChange: (en) => modals.fxRackModal.setLimiterEnabled(en),
      onOpenGlobal: () => { globalDrawer.toggle(); byId('mcx-global-btn')?.classList.toggle('is-active', globalDrawer.isOpen()); },
      onOpenFxRack: () => modals.fxRackModal.toggle(), onOpenGlobalLfo: () => modals.globalLfoModal.toggle(),
      onOpenGroove: (partIdx?: number) => modals.grooveModal.open(partIdx ?? -1), onOpenSong: () => state.refs.toggleSongDrawer?.(),
      onBpmChange: (bpm) => { state.globalSettings.standaloneBpm = bpm; state.updateLcdLine1(0); modals.fxRackModal.setBpm(bpm); modals.globalLfoModal.setBpm(bpm); state.refs.stepStrip?.setTransportRunning(state.refs.masterPanel?.getTransportState()?.playing ?? false, bpm); },
      onTransportChange: (st) => { modals.pianoRollModal.setPlaying(st.playing); state.refs.stepStrip?.setTransportRunning(st.playing, st.bpm); },
    });
  }

  mountMultiEngineUi(bridge, state, themeMgr);
  mountSongAndScenesUi(bridge, state);
  state.refreshPartList();
  const stripHost = byId('mcx-step-strip-host');
  if (stripHost) {
    state.refs.stepStrip = new McxStepStrip(stripHost, bridge, {
      getFocusedPart: () => state.focusedPart,
      setFocusedPart: (idx) => panelCbs.setFocusedPart(idx),
      getPartsState: () => state.partsState,
      onToggleMute: (partIdx) => { panelCbs.onToggleMute(partIdx); state.refs.stepStrip?.refresh(); },
      setLcdNotice: state.setLcdLine2,
    });
  }

  themeMgr.onChange((_f, _sc, themeId) => { probeModal?.setTheme(themeId); settingsModal.syncTheme(); scopeView?.draw(); navbar?.sync(); });
  bridge.onSessionState((dto) => hydrateSessionState(state, dto));
  bridge.onLibraryCatalog((json) => bankDrawer.setLibraryItems(parseLibraryCatalogJson(json)));
  bridge.onSystemSettings((s) => {
    state.globalSettings = s;
    if (s.themeFamily) themeMgr.setFamily(s.themeFamily as ThemeFamilyKey);
    settingsModal.syncFromHost(s);
    if (s.standaloneBpm) { state.refs.masterPanel?.setBpm(s.standaloneBpm); modals.fxRackModal.setBpm(s.standaloneBpm); modals.globalLfoModal.setBpm(s.standaloneBpm); }
    state.updateLcdLine1(0);
  });
  bridge.onAudioStatus((status, detail) => {
    navbar?.setAudioStatus(status, detail);
    if (status === 'ready') probeModal?.setSampleRate(bridge.getSampleRate());
    if (status === 'error' && detail) state.setLcdLine2(`WASM ERR: ${detail}`);
  });
  onLocaleChange(() => {
    const loc = getLocale() === 'en' ? 'en' : 'es';
    applyI18n(document.body); state.syncOctaveTooltips();
    probeModal?.setLocale(getLocale()); probeModal?.setDestinations(buildProbeDestinations());
    settingsModal.refreshLocale(); globalDrawer.refreshLocale(); navbar?.mount(); state.updateLcdLine1(0); state.refreshPartList();
    state.refs.toneDrawer?.setLocale(loc); state.refs.refreshSongLocale?.();
    state.refs.routeModal?.setLocale(); state.refs.synthModal?.setLocale(loc);
    modals.fxRackModal.setLocale(getLocale()); modals.globalLfoModal.setLocale(getLocale());
    modals.pianoRollModal.setLocale(getLocale()); modals.grooveModal.setLocale(getLocale());
    midiModals.padModal.setLocale(loc); midiModals.arpModal.setLocale(loc);
  });
  themeMgr.apply(); if (!bridge.isNative) bridge.updateSystemSettings(state.globalSettings); state.uploadInitialPatterns();
  bindGlobalShortcuts(state); mountKeyboardDock(bridge, state); bindTelemetry(bridge, state, scopeView);
  bridge.notifyReady(); document.body.classList.add('is-ready');
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initApp);
else initApp();

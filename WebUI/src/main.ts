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
import '@abdsynths/shared/styles/components/fx-picker.css';
import '@abdsynths/shared/styles/components/fx-faceplates.css';
import '@abdsynths/shared/styles/components/global-lfo-modal.css';
import '@abdsynths/shared/styles/components/compact-transport-bar.css';
import '@abdsynths/shared/styles/components/compact-stereo-vu.css';
import '@abdsynths/shared/styles/components/piano-roll.css';
import '@abdsynths/shared/styles/components/groove-shuffle.css';
import './styles/mcx0x.css';

import { McxHostBridge } from './bridge/McxHostBridge';
import { applyI18n, getLocale, onLocaleChange, t } from './i18n/mcxI18n';
import { ThemeManager, type ThemeFamilyKey } from './ui/ThemeManager'; import { McxNavbar } from './ui/McxNavbar';
import { McxSettingsModal } from './ui/McxSettingsModal'; import { wireBankDropZone } from './ui/McxPanels';
import { McxScopeCanvas } from './ui/McxScopeCanvas'; import { McxStepStrip } from './ui/McxStepStrip';
import { McxBankRail } from './ui/McxBankRail';
import { defaultChannelForSlot, deserializeBankLayoutJson, findPartLocation, SLOTS_PER_BANK } from './ui/McxBankLayout';
import { McxToneDrawer } from './ui/McxToneDrawer'; import { McxGlobalDrawer } from './ui/McxGlobalDrawer';
import { McxAppState } from './app/McxAppState'; import { bindGlobalShortcuts, bindTelemetry, mountKeyboardDock } from './app/McxInputAndTelemetry';
import { buildProbeDestinations, createBankDrawer, createProbeModal, createStudioModals, openSavePresetModal } from './app/McxModalsFactory';
import { createMidiModals } from './app/McxMidiModalsFactory';
import { hydrateSessionState, parseLibraryCatalogJson } from './app/McxSessionHydrator';
import { bootstrapSoundBanks } from './app/McxSoundBankBootstrap';
import { mountMultiEngineUi } from './app/McxMultiEngineWiring'; import { mountSongAndScenesUi } from './app/McxSongWiring';
import { mountRackAndMasterUi } from './app/McxRackAndMasterWiring';
import { McxExportModal } from './ui/McxExportModal';
import { mountMidiLearnWiring } from './app/McxMidiLearnWiring';
import { mountHistoryWiring } from './app/McxHistoryWiring';
import { applyStarterTemplate, openProjectFromFilePicker, resetToEmptyProject, saveProjectToFile } from './app/McxProjectManager';

const bridge = new McxHostBridge(), themeMgr = new ThemeManager(), state = new McxAppState(bridge);

function initApp(): void {
  applyI18n(document.body); state.syncOctaveTooltips();
  const byId = (id: string) => document.getElementById(id);
  const probeModal = createProbeModal(bridge, state);
  const settingsModal = new McxSettingsModal({
    bridge, onSettingsApplied: (s) => { state.globalSettings = s; state.updateLcdLine1(0); },
    onGlobalTransposeChange: (st) => state.refs.liveTranspose?.setGlobalTranspose(st), onScaleChange: (r, ty) => state.refs.liveTranspose?.setScale(r, ty),
  });
  const bankDrawer = createBankDrawer(bridge, state), modals = createStudioModals(bridge, state), midiModals = createMidiModals(bridge, state);
  const globalDrawer = new McxGlobalDrawer({
    hostEl: document.body, bridge, setLcdLine2: state.setLcdLine2,
    onClose: () => byId('mcx-global-btn')?.classList.remove('is-active'), onOpenFxRack: () => modals.fxRackModal.toggle(),
    onMasterVolumeChange: (v) => state.refs.masterPanel?.setVolume(v), onGlobalTransposeChange: (st) => state.refs.liveTranspose?.setGlobalTranspose(st),
  });
  const fileInput = byId('bank-file-input') as HTMLInputElement | null, navHost = byId('mcx-navbar-host');
  const onPanic = () => { bridge.allNotesOff(); state.setLcdLine2(t('mcx.allNotesOff')); };
  const onToggleProbe = () => probeModal?.toggle({ theme: document.documentElement.getAttribute('data-theme'), locale: getLocale(), sampleRate: bridge.getSampleRate(), frequencyHz: state.globalSettings.masterTuneHz || 440 });
  const exportModal = new McxExportModal({ bridge, state, getSongState: () => state.refs.getSongState?.() ?? null });
  const midiLearn = mountMidiLearnWiring(bridge, state);
  const onOpenExport = () => exportModal.open();
  const onOpenMidiLearn = () => midiLearn.openDrawer(-1);
  let history: ReturnType<typeof mountHistoryWiring> | null = null;
  const onUndo = () => { history?.undo(); }, onRedo = () => { history?.redo(); };
  const onToggleCompare = () => { history?.toggleCompare(); }, onCaptureCompare = () => { history?.captureBaseline(); };
  state.refs = {
    ...state.refs, bankDrawer, settingsModal, globalDrawer, ...modals, ...midiModals,
    onPanic, onToggleProbe, onOpenExport, onOpenMidiLearn, onUndo, onRedo, onToggleCompare, onCaptureCompare,
    onNewProject: () => resetToEmptyProject(state, bridge), onSaveProject: () => saveProjectToFile(state, 'MCX0X_Project'),
    onOpenProject: () => openProjectFromFilePicker(state, bridge), onSavePreset: (multi) => openSavePresetModal(bridge, state, multi ? 'multi' : 'part'),
    onOpenBankFile: () => fileInput?.click(),
  };
  byId('mcx-solo-clear-btn')?.addEventListener('click', () => state.clearAllSolos());
  byId('mcx-unpin-bank-btn')?.addEventListener('click', () => state.togglePinActiveBank());
  byId('mcx-rename-bank-btn')?.addEventListener('click', () => state.openRenameBankDialog(state.bankLayout.activeBank));
  const navbar = navHost ? new McxNavbar(navHost, {
    themeMgr, onNewProject: () => resetToEmptyProject(state, bridge),
    onNewFromTemplate: (tpl) => applyStarterTemplate(tpl, state, bridge),
    onSaveProject: () => saveProjectToFile(state, 'MCX0X_Project'),
    onUndo, onRedo, onToggleCompare, onCaptureCompare,
    onSaveProjectAs: () => {
      const name = window.prompt(getLocale() === 'es' ? 'Nombre del proyecto:' : 'Project name:', 'My_Track');
      if (name) saveProjectToFile(state, name.trim());
    },
    onOpenProject: () => openProjectFromFilePicker(state, bridge),
    onConfigureFolder: () => (bridge.isNative ? bridge.chooseWorkingDir() : settingsModal.open()),
    onOpenSettings: () => settingsModal.toggle(), onOpenBankManager: () => bankDrawer.toggle(state.focusedPart),
    onSavePartPreset: () => openSavePresetModal(bridge, state, 'part'), onSaveMultiPreset: () => openSavePresetModal(bridge, state, 'multi'),
    onLoadBank: () => fileInput?.click(),
    onFactoryReset: () => { state.resetToFactoryLayout(); bridge.resetToFactory(); bridge.requestPartEngineState(state.focusedPart); bridge.requestPartPresets(state.focusedPart); state.setLcdLine2(t('mcx.factoryReset')); },
    onPanic, onEnableAudio: () => { void bridge.enableAudio(); }, onToggleProbe, onOpenExport, onOpenMidiLearn,
    onOpenFxRack: () => modals.fxRackModal.toggle(), onOpenGlobalLfo: () => modals.globalLfoModal.toggle(),
    onOpenPianoRoll: () => { state.syncPianoRollForPart(state.focusedPart); modals.pianoRollModal.toggle(); },
    onOpenGroove: () => modals.grooveModal.open(-1), onOpenSong: () => state.refs.toggleSongDrawer?.(),
    onOpenPerformance: () => state.refs.performanceModal?.toggle(),
  }) : null;
  const dropZone = byId('mcx-workspace') || document.body;
  if (fileInput) wireBankDropZone(dropZone, fileInput, bridge, state.setLcdLine2, (items) => bankDrawer.setLibraryItems(items));
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
      onOpenRouteModal: (idx) => state.refs.routeModal?.open(idx), onOpenPianoRoll: (idx) => panelCbs.onOpenPianoRollForPart?.(idx),
      onOpenGroove: (idx) => modals.grooveModal.open(idx), onOpenSynth: (idx) => state.refs.synthModal?.open(idx),
      onOpenArp: (idx) => midiModals.arpModal.toggle(idx), onOpenPads: (idx) => midiModals.padModal.toggle(idx),
      onPartChanged: () => state.notifyPartMetadataChanged(state.focusedPart),
    });
  }

  mountRackAndMasterUi(bridge, state, modals, globalDrawer);
  mountMultiEngineUi(bridge, state, themeMgr);
  mountSongAndScenesUi(bridge, state);
  if (!bridge.isNative) {
    const savedLayout = bridge.loadLocalBankLayoutFallback();
    if (savedLayout) {
      state.bankLayout = deserializeBankLayoutJson(savedLayout);
      for (let b = 0; b < state.bankLayout.bankCount; ++b) {
        for (let s = 0; s < SLOTS_PER_BANK; ++s) {
          const pid = state.bankLayout.banks[b][s];
          if (pid === null || !state.partsState[pid]) continue;
          state.partsState[pid].enabled = true;
          if (pid >= 16) state.partsState[pid].midiChannel = defaultChannelForSlot(b, s);
        }
      }
      if (!findPartLocation(state.bankLayout, state.focusedPart)) {
        state.focusedPart = state.findFirstPlacedPart(state.bankLayout.activeBank);
      }
    }
  }
  const railHost = byId('mcx-bank-rail');
  if (railHost) {
    state.refs.bankRail = new McxBankRail(railHost, {
      onSelectBank: (bankIdx) => state.selectBank(bankIdx), onAddBank: () => state.addNewBank(),
      onDropPartOnBank: (fromBank, fromSlot, targetBank) => state.movePartSlot(fromBank, fromSlot, targetBank, -1),
      onToggleMuteBank: (bankIdx, immediate) => state.toggleLiveMuteBank(bankIdx, immediate), onToggleSoloBank: (bankIdx) => state.toggleLiveSoloBank(bankIdx),
      onClearAllSolos: () => state.clearAllSolos(), onClearAllBankMutes: () => state.clearAllBankMutes(),
      onRequestRenameBank: (bankIdx) => state.openRenameBankDialog(bankIdx),
      isMuteQuantized: () => Boolean(state.refs.isMuteQuantized?.()),
      onToggleMuteQuantized: () => state.refs.onToggleMuteQuantized?.(),
      getQueuedBankMutes: () => state.refs.getQueuedBankMutes?.() ?? new Set<number>(),
    });
  }
  state.refreshPartList();
  const stripHost = byId('mcx-step-strip-host');
  if (stripHost) {
    state.refs.stepStrip = new McxStepStrip(stripHost, bridge, {
      getFocusedPart: () => state.focusedPart,
      setFocusedPart: (idx) => panelCbs.setFocusedPart(idx),
      getPartsState: () => state.partsState,
      getBankLayout: () => state.bankLayout,
      onToggleMute: (partIdx) => { panelCbs.onToggleMute(partIdx); state.refs.stepStrip?.refresh(); },
      onToggleSolo: (partIdx) => { panelCbs.onToggleSolo(partIdx); state.refs.stepStrip?.refresh(); },
      setLcdNotice: state.setLcdLine2,
    });
  }

  themeMgr.onChange((_f, _sc, themeId) => {
    probeModal?.setTheme(themeId); settingsModal.syncTheme(); scopeView?.draw();
    navbar?.sync(); state.refs.routeModal?.syncTheme(); state.refs.synthModal?.syncTheme();
  });
  bridge.onPartPatternState((part, json) => state.loadRecordedPatternFromHost(part, json));
  bridge.onSessionState((dto) => hydrateSessionState(state, dto));
  bridge.onLibraryCatalog((json) => bankDrawer.setLibraryItems(parseLibraryCatalogJson(json)));
  bridge.onSystemSettings((s) => {
    state.globalSettings = s;
    if (s.themeFamily) themeMgr.setFamily(s.themeFamily as ThemeFamilyKey);
    settingsModal.syncFromHost(s);
    if (s.standaloneBpm) { state.refs.masterPanel?.setBpm(s.standaloneBpm); modals.fxRackModal.setBpm(s.standaloneBpm); modals.globalLfoModal.setBpm(s.standaloneBpm); midiModals.padModal.setBpm(s.standaloneBpm); }
    state.updateLcdLine1(0);
  });
  let lastMidiDevicesKey = '';
  bridge.onMidiDevices((dto) => {
    state.midiDevices = dto; settingsModal.setMidiDevices(dto); state.refs.routeModal?.setMidiDevices(dto);
    midiLearn.onMidiDevices(dto);
    const nextKey = JSON.stringify(dto);
    if (nextKey !== lastMidiDevicesKey) { lastMidiDevicesKey = nextKey; state.refreshPartList(); }
  });
  bridge.onAudioStatus((status, detail) => {
    navbar?.setAudioStatus(status, detail);
    if (status === 'ready') {
      probeModal?.setSampleRate(bridge.getSampleRate()); bridge.refreshMidiDevices();
      if (!bridge.isNative) { state.syncBankLayoutToHost(); const sc = bridge.loadLocalSidechainFallback(); if (sc) bridge.setSidechainConfig(sc); }
    }
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
  history = mountHistoryWiring({ state, bridge, onStatusChange: (st) => navbar?.setHistoryStatus(st) });
  bridge.refreshMidiDevices();

  void bootstrapSoundBanks(bridge, state, bankDrawer);

  bridge.notifyReady(); document.body.classList.add('is-ready');
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initApp);
else initApp();

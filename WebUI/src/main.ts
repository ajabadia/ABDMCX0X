/**
 * ABDMCX0X -- WebUI main.ts
 * Application bootstrap orchestrating @abdsynths/shared styles, bridge, drawers, and telemetry.
 */

import '@abdsynths/shared/styles';
import '@abdsynths/shared/components/SynthNavBar/SynthNavBar.css';
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

import { McxHostBridge } from './bridge/McxHostBridge';
import { applyI18n, getLocale, onLocaleChange, t } from './i18n/mcxI18n';
import { ThemeManager, type ThemeFamilyKey } from './ui/ThemeManager';
import { McxNavbar } from './ui/McxNavbar';
import { McxSettingsModal } from './ui/McxSettingsModal';
import { wireBankDropZone } from './ui/McxPanels';
import { McxScopeCanvas } from './ui/McxScopeCanvas';
import { McxStepStrip } from './ui/McxStepStrip';
import { McxToneDrawer } from './ui/McxToneDrawer';
import { McxGlobalDrawer } from './ui/McxGlobalDrawer';
import { McxPadsDrawer } from './ui/McxPadsDrawer';
import { McxMasterPanel } from './ui/McxMasterPanel';
import { McxAppState } from './app/McxAppState';
import { buildProbeDestinations, createBankDrawer, createProbeModal, createStudioModals, openSavePresetModal } from './app/McxModalsFactory';
import { bindGlobalShortcuts, bindTelemetry, mountKeyboardDock } from './app/McxInputAndTelemetry';

const bridge = new McxHostBridge();
const themeMgr = new ThemeManager();
const state = new McxAppState(bridge);

window.addEventListener('DOMContentLoaded', () => {
  applyI18n(document.body);
  state.syncOctaveTooltips();

  const byId = (id: string) => document.getElementById(id);
  const probeModal = createProbeModal(bridge, state);
  const settingsModal = new McxSettingsModal({
    bridge,
    onSettingsApplied: (s) => { state.globalSettings = s; state.updateLcdLine1(0); },
  });
  const bankDrawer = createBankDrawer(bridge, state);
  const modals = createStudioModals(bridge, state);
  state.refs = { ...state.refs, bankDrawer, ...modals };

  const fileInput = byId('bank-file-input') as HTMLInputElement | null;
  const navHost = byId('mcx-navbar-host');
  const navbar = navHost ? new McxNavbar(navHost, {
    themeMgr,
    onConfigureFolder: () => (bridge.isNative ? bridge.chooseWorkingDir() : settingsModal.open()),
    onOpenSettings: () => settingsModal.toggle(),
    onOpenBankManager: () => bankDrawer.toggle(state.focusedPart),
    onSavePartPreset: () => openSavePresetModal(state, 'part'),
    onSaveMultiPreset: () => openSavePresetModal(state, 'multi'),
    onLoadBank: () => fileInput?.click(),
    onFactoryReset: () => { bridge.resetToFactory(); state.setLcdLine2(t('mcx.factoryReset')); },
    onPanic: () => { bridge.allNotesOff(); state.setLcdLine2(t('mcx.allNotesOff')); },
    onEnableAudio: () => { void bridge.enableAudio(); },
    onToggleProbe: () => probeModal?.toggle({
      theme: document.documentElement.getAttribute('data-theme'),
      locale: getLocale(),
      sampleRate: bridge.getSampleRate(),
      frequencyHz: state.globalSettings.masterTuneHz || 440,
    }),
    onOpenFxRack: () => modals.fxRackModal.toggle(),
    onOpenGlobalLfo: () => modals.globalLfoModal.toggle(),
    onOpenPianoRoll: () => { state.syncPianoRollForPart(state.focusedPart); modals.pianoRollModal.toggle(); },
    onOpenGroove: () => modals.grooveModal.open(-1),
  }) : null;

  const globalDrawer = new McxGlobalDrawer({
    hostEl: document.body,
    bridge,
    setLcdLine2: state.setLcdLine2,
    onClose: () => byId('mcx-global-btn')?.classList.remove('is-active'),
    onOpenFxRack: () => modals.fxRackModal.toggle(),
  });

  const dropZone = byId('mcx-workspace') || document.body;
  if (fileInput) wireBankDropZone(dropZone, fileInput, bridge, state.setLcdLine2);
  const scopeCanvas = byId('mcx-scope-canvas') as HTMLCanvasElement | null;
  const scopeView = scopeCanvas ? new McxScopeCanvas(scopeCanvas) : null;

  const panelCbs = state.getPanelCallbacks();
  const mainCol = document.querySelector<HTMLElement>('.mcx-main-col');
  if (mainCol) {
    state.refs.toneDrawer = new McxToneDrawer({
      hostEl: mainCol,
      bridge,
      getPartState: (idx) => state.partsState[idx],
      setLcdLine2: state.setLcdLine2,
      onClose: () => state.refreshPartList(),
      onChangePartChannel: (idx, ch) => panelCbs.onChangePartChannel(idx, ch),
      onToggleFollowTranspose: (idx) => panelCbs.onToggleFollowTranspose(idx),
      onToggleMute: (idx) => panelCbs.onToggleMute(idx),
      onToggleSolo: (idx) => panelCbs.onToggleSolo(idx),
      onRouteModeChange: () => state.refreshPartList(),
    });
    state.refs.padsDrawer = new McxPadsDrawer({
      hostEl: mainCol,
      bridge,
      getPartState: (idx) => state.partsState[idx],
      setLcdLine2: state.setLcdLine2,
      onClose: () => state.refreshPartList(),
      onPadNote: (note, vel, isRelease) => {
        if (modals.pianoRollModal.isOpen() && modals.pianoRollModal.isRecording()) {
          if (isRelease) modals.pianoRollModal.recordNoteOff(note);
          else modals.pianoRollModal.recordNoteOn(note, vel);
        }
      },
    });
  }

  const masterHost = byId('mcx-master-panel');
  if (masterHost) {
    state.refs.masterPanel = new McxMasterPanel(masterHost, {
      bridge,
      setLcdLine2: state.setLcdLine2,
      initialVolume: 0.85,
      initialBpm: state.globalSettings.standaloneBpm,
      onOpenGlobal: () => {
        globalDrawer.toggle();
        byId('mcx-global-btn')?.classList.toggle('is-active', globalDrawer.isOpen());
      },
      onOpenFxRack: () => modals.fxRackModal.toggle(),
      onOpenGlobalLfo: () => modals.globalLfoModal.toggle(),
      onOpenGroove: (partIdx?: number) => modals.grooveModal.open(partIdx ?? -1),
      onBpmChange: (bpm) => {
        state.globalSettings.standaloneBpm = bpm;
        state.updateLcdLine1(0);
        state.refs.stepStrip?.setTransportRunning(state.refs.masterPanel?.getTransportState()?.playing ?? false, bpm);
      },
      onTransportChange: (st) => {
        modals.pianoRollModal.setPlaying(st.playing);
        state.refs.stepStrip?.setTransportRunning(st.playing, st.bpm);
      },
    });
  }

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
  bridge.onSystemSettings((s) => {
    state.globalSettings = s;
    if (s.themeFamily) themeMgr.setFamily(s.themeFamily as ThemeFamilyKey);
    settingsModal.syncFromHost(s);
    if (s.standaloneBpm) state.refs.masterPanel?.setBpm(s.standaloneBpm);
    state.updateLcdLine1(0);
  });
  bridge.onAudioStatus((status, detail) => {
    navbar?.setAudioStatus(status, detail);
    if (status === 'ready') probeModal?.setSampleRate(bridge.getSampleRate());
    if (status === 'error' && detail) state.setLcdLine2(`WASM ERR: ${detail}`);
  });
  onLocaleChange(() => {
    applyI18n(document.body); state.syncOctaveTooltips();
    probeModal?.setLocale(getLocale()); probeModal?.setDestinations(buildProbeDestinations());
    settingsModal.refreshLocale(); navbar?.mount(); state.updateLcdLine1(0); state.refreshPartList();
    modals.fxRackModal.setLocale(getLocale()); modals.globalLfoModal.setLocale(getLocale());
    modals.pianoRollModal.setLocale(getLocale()); modals.grooveModal.setLocale(getLocale());
  });

  themeMgr.apply();
  bridge.updateSystemSettings(state.globalSettings);
  bindGlobalShortcuts(state);
  mountKeyboardDock(bridge, state);
  bindTelemetry(bridge, state, scopeView);
  bridge.notifyReady();
});

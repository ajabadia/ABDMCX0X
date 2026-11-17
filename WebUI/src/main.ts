/**
 * ABDMCX0X -- WebUI main.ts (Slice 1: Unrestricted 16-Part Groovebox Foundation)
 */

import '@abdsynths/shared/styles';
import '@abdsynths/shared/components/SynthNavBar/SynthNavBar.css';
import '@abdsynths/shared/styles/components/wheels.css';
import '@abdsynths/shared/styles/components/kbd-buttons.css';
import '@abdsynths/shared/diagnostic-probe/styles';
import '@abdsynths/midi-keyb/keyboard.css';
import './styles/mcx0x.css';

import { createKeyboard } from '@abdsynths/midi-keyb';
import { createDiagnosticProbeModal } from '@abdsynths/shared/diagnostic-probe';
import { McxHostBridge, type McxSystemSettingsDto } from './bridge/McxHostBridge';
import { applyI18n, getLocale, onLocaleChange, t } from './i18n/mcxI18n';
import { ThemeManager, type ThemeFamilyKey } from './ui/ThemeManager';
import { McxNavbar } from './ui/McxNavbar';
import { McxSettingsModal } from './ui/McxSettingsModal';
import {
  bindVectorPad, renderFxAndSelectors, renderMacroDeck, renderPartMixer,
  renderVoiceLedStrip, wireBankDropZone, type McxPartUiState,
} from './ui/McxPanels';
import { McxScopeCanvas } from './ui/McxScopeCanvas';
import { renderDrumPads } from './ui/McxDrumPads';

const bridge = new McxHostBridge();
const themeMgr = new ThemeManager();
const partsState: McxPartUiState[] = Array.from({ length: 16 }, (_, i) => ({
  kind: i === 9 ? 'drum_map' : 'chromatic', midiChannel: i + 1, mute: false, solo: false,
}));

let focusedPart = 0;
let globalSettings: McxSystemSettingsDto = bridge.loadLocalSettingsFallback();
let scopeView: McxScopeCanvas | null = null;
let navbar: McxNavbar | null = null;
let settingsModal: McxSettingsModal | null = null;
let probeModal: ReturnType<typeof createDiagnosticProbeModal> | null = null;

const getActiveDrumPart = () => partsState[focusedPart].kind === 'drum_map'
  ? focusedPart : Math.max(0, partsState.findIndex((p) => p.kind === 'drum_map'));

function updateLcdLine1(activeVoices = 0): void {
  const ps = partsState[focusedPart];
  const budget = Math.max(8, Math.min(64, globalSettings.maxPolyphony || 64));
  const el = document.getElementById('lcd-line1');
  if (el) el.textContent = `GROOVEBOX 16P  |  P${String(focusedPart + 1).padStart(2, '0')} (${ps.kind === 'drum_map' ? 'DRM' : 'CHR'}·CH${ps.midiChannel})  |  ${activeVoices}/${budget} ${t('mcx.voices')}  |  ${globalSettings.masterTuneHz.toFixed(1)}Hz  |  ${Math.round(globalSettings.standaloneBpm)} BPM`;
  const cap = document.getElementById('voice-caption');
  if (cap) cap.textContent = `${activeVoices} / ${budget} ${t('mcx.voices')}`;
  const leds = document.getElementById('voice-leds');
  if (leds) renderVoiceLedStrip(leds, budget, activeVoices);
}

function setLcdLine2(text: string): void { const el = document.getElementById('lcd-line2'); if (el) el.textContent = text; }

function selectCenterTab(active: 'tone' | 'drums'): void {
  document.getElementById('center-tabs')?.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === active));
  document.querySelectorAll('.mcx-tab-pane').forEach((p) => p.classList.toggle('is-hidden', (p as HTMLElement).dataset.pane !== active));
}

function refreshPartList(): void { const el = document.getElementById('part-list'); if (el) renderPartMixer(el, panelCbs); }

const panelCbs = {
  getFocusedPart: () => focusedPart,
  setFocusedPart: (idx: number) => { focusedPart = idx; updateLcdLine1(0); },
  getPartsState: () => partsState,
  onTogglePartKind: (idx: number) => {
    const next = partsState[idx].kind === 'drum_map' ? 'chromatic' : 'drum_map';
    partsState[idx].kind = next;
    bridge.setParam(idx, 'partKind', next === 'drum_map' ? 1 : 0);
    refreshPartList(); updateLcdLine1(0);
    setLcdLine2(`P${String(idx + 1).padStart(2, '0')} -> ${next === 'drum_map' ? t('mcx.partDrumMap') : t('mcx.partChromatic')}`);
  },
  onChangePartChannel: (idx: number, ch: number) => {
    partsState[idx].midiChannel = ch;
    bridge.setParam(idx, 'partMidiChannel', ch);
    updateLcdLine1(0); setLcdLine2(`P${String(idx + 1).padStart(2, '0')} MIDI CH ${ch}`);
  },
  onToggleMute: (idx: number) => { partsState[idx].mute = !partsState[idx].mute; bridge.setParam(idx, 'partMute', partsState[idx].mute ? 1 : 0); refreshPartList(); },
  onToggleSolo: (idx: number) => { partsState[idx].solo = !partsState[idx].solo; bridge.setParam(idx, 'partSolo', partsState[idx].solo ? 1 : 0); refreshPartList(); },
  setLcdLine2,
};

const buildProbeDestinations = () => [
  { id: 1, label: t('mcx.probePostMaster'), hint: t('mcx.probePostMasterHint') },
  { id: 2, label: t('mcx.probePreMaster'), hint: t('mcx.probePreMasterHint') },
  { id: 3, label: t('mcx.probePreFx'), hint: t('mcx.probePreFxHint') },
  { id: 4, label: t('mcx.probePreFilter'), hint: t('mcx.probePreFilterHint') },
  { id: 5, label: t('mcx.probeVoiceDirect'), hint: t('mcx.probeVoiceDirectHint') },
];

function syncOctaveTooltips(): void {
  document.getElementById('oct-up')?.setAttribute('title', t('mcx.octaveUp'));
  document.getElementById('oct-down')?.setAttribute('title', t('mcx.octaveDown'));
}

function initProbeModal(): void {
  probeModal = createDiagnosticProbeModal({
    locale: getLocale(), sampleRate: bridge.getSampleRate(), frequencyHz: globalSettings.masterTuneHz || 440,
    initialVolume: 0.25, selectionMode: 'multi',
    destinations: buildProbeDestinations(),
    onChange: (st: { enabledIds: number[]; enabledMask: number; volume: number; frequencyHz: number; waveform: number }) => {
      if (st.enabledMask > 0) void bridge.enableAudio();
      bridge.setParam(focusedPart, 'diagProbeFreq', st.frequencyHz);
      bridge.setParam(focusedPart, 'diagProbeLevel', st.volume);
      bridge.setParam(focusedPart, 'diagProbeWave', st.waveform);
      bridge.setParam(focusedPart, 'diagProbePoint', st.enabledMask);
      setLcdLine2(st.enabledMask === 0 ? t('mcx.probeOff') : `${t('mcx.probeOn')} [${st.enabledIds.join(',')}] : ${Math.round(st.frequencyHz)} Hz`);
    },
  });
}

window.addEventListener('DOMContentLoaded', () => {
  applyI18n(document.body);
  initProbeModal();
  settingsModal = new McxSettingsModal({ bridge, onSettingsApplied: (s) => { globalSettings = s; updateLcdLine1(0); } });

  const fileInput = document.getElementById('bank-file-input') as HTMLInputElement | null;
  const navHost = document.getElementById('mcx-navbar-host');
  if (navHost) {
    navbar = new McxNavbar(navHost, {
      themeMgr,
      onConfigureFolder: () => (bridge.isNative ? bridge.chooseWorkingDir() : settingsModal?.open()),
      onOpenSettings: () => settingsModal?.toggle(),
      onLoadBank: () => fileInput?.click(),
      onFactoryReset: () => { bridge.resetToFactory(); setLcdLine2(t('mcx.factoryReset')); },
      onPanic: () => { bridge.allNotesOff(); setLcdLine2(t('mcx.allNotesOff')); },
      onEnableAudio: () => { void bridge.enableAudio(); },
      onToggleProbe: () => probeModal?.toggle({
        theme: document.documentElement.getAttribute('data-theme'), locale: getLocale(),
        sampleRate: bridge.getSampleRate(), frequencyHz: globalSettings.masterTuneHz || 440,
      }),
      onSelectTab: (tab) => selectCenterTab(tab),
    });
  }

  themeMgr.onChange((_f, _sc, themeId) => { probeModal?.setTheme(themeId); settingsModal?.syncTheme(); scopeView?.draw(); navbar?.sync(); });
  bridge.onSystemSettings((s) => {
    globalSettings = s;
    if (s.themeFamily) themeMgr.setFamily(s.themeFamily as ThemeFamilyKey);
    settingsModal?.syncFromHost(s);
    updateLcdLine1(0);
  });
  bridge.onAudioStatus((status, detail) => {
    navbar?.setAudioStatus(status, detail);
    if (status === 'ready') probeModal?.setSampleRate(bridge.getSampleRate());
    if (status === 'error' && detail) setLcdLine2(`WASM ERR: ${detail}`);
  });
  onLocaleChange(() => {
    applyI18n(document.body);
    syncOctaveTooltips();
    probeModal?.setLocale(getLocale());
    probeModal?.setDestinations(buildProbeDestinations());
    settingsModal?.refreshLocale();
    navbar?.mount();
    updateLcdLine1(0);
    refreshPartList();
  });

  syncOctaveTooltips();

  themeMgr.apply();
  bridge.updateSystemSettings(globalSettings);

  document.getElementById('master-volume')?.addEventListener('input', (ev) => bridge.setMasterVolume(parseFloat((ev.target as HTMLInputElement).value)));
  document.getElementById('center-tabs')?.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button[data-tab]') as HTMLElement | null;
    if (btn?.dataset.tab === 'tone' || btn?.dataset.tab === 'drums') selectCenterTab(btn.dataset.tab);
  });

  const byId = (id: string) => document.getElementById(id);
  if (byId('bank-drop-zone') && fileInput) wireBankDropZone(byId('bank-drop-zone')!, fileInput, bridge, setLcdLine2);
  if (byId('mcx-scope-canvas')) scopeView = new McxScopeCanvas(byId('mcx-scope-canvas') as HTMLCanvasElement);
  refreshPartList();
  if (byId('macro-deck')) renderMacroDeck(byId('macro-deck')!, bridge, panelCbs);
  if (byId('fx-deck')) renderFxAndSelectors(byId('fx-deck')!, bridge, panelCbs);
  if (byId('drum-pads')) renderDrumPads(byId('drum-pads')!, bridge, getActiveDrumPart, (lbl, note, vel, pIdx) =>
    setLcdLine2(`P${String(pIdx + 1).padStart(2, '0')} DRUM ${lbl} (N${note}) VEL ${Math.round(vel * 127)}`),
  );
  if (byId('vector-pad') && byId('vector-dot')) bindVectorPad(byId('vector-pad')!, byId('vector-dot')!, bridge, panelCbs);

  createKeyboard({
    containerId: 'piano-keyboard', wheelPitchId: 'pitch-wheel-container', wheelModId: 'mod-wheel-container',
    octUpId: 'oct-up', octDownId: 'oct-down', ledUpId: 'led-up', ledDownId: 'led-down',
    onNoteOn: (note: number, vel: number) => bridge.noteOn(focusedPart, note, Math.max(0.05, Math.min(1, vel > 1 ? vel / 127 : vel))),
    onNoteOff: (note: number) => bridge.noteOff(focusedPart, note),
    onPanic: () => bridge.allNotesOff(),
    config: {
      numOctaves: 4, startNote: 36, maxOctaveShift: 3, enableWheels: true, enablePanic: true,
      enableIvoryTexture: true, enableQwerty: true, showQwertyLabels: true,
      enableHold: true, enableRetrig: true, enableSustain: true, enableTouch: true, enableResizeObserver: true,
    },
  });

  bridge.onTelemetry((tel) => { updateLcdLine1(tel.activeVoices); scopeView?.pushTelemetry(tel); });
  bridge.notifyReady();
});

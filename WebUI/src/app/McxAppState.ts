/**
 * ABDMCX0X -- McxAppState.ts
 * Centralized UI state container, LCD readout sync, transport state, and mixer callbacks.
 */

import type { McxHostBridge, McxSystemSettingsDto, McxTelemetry } from '../bridge/McxHostBridge';
import type { MultiBusFxRackModal, GlobalLfoModal, PianoRollModal, GrooveShuffleModal, MpcPadModal, GrooveArpeggiatorModal } from '@abdsynths/shared/components';
import { t } from '../i18n/mcxI18n';
import { renderMixerConsole, createDefaultPartState, type McxMixerCallbacks, type McxPartUiState } from '../ui/McxMixerConsole';
import type { McxStepStrip } from '../ui/McxStepStrip';
import type { McxToneDrawer } from '../ui/McxToneDrawer';
import type { McxSongDrawer } from '../ui/McxSongDrawer';
import type { McxSceneBar } from '../ui/McxSceneBar';
import type { McxBankDrawer } from '../ui/McxBankDrawer';
import type { McxMasterPanel } from '../ui/McxMasterPanel';
import type { McxInstrumentRouteModal } from '../ui/McxInstrumentRouteModal';
import type { McxSynthModal } from '../ui/McxSynthModal';
import type { McxRackColumn } from '../ui/McxRackColumn';
import type { McxGlobalDrawer } from '../ui/McxGlobalDrawer';
import type { McxSettingsModal } from '../ui/McxSettingsModal';
import { createMixerCallbacks } from './McxMixerCallbacksFactory';
import { syncPianoRollPart } from './McxPianoRollSync';

export interface McxUiRefs {
  stepStrip?: McxStepStrip | null; toneDrawer?: McxToneDrawer | null;
  songDrawer?: McxSongDrawer | null; sceneBar?: McxSceneBar | null; bankDrawer?: McxBankDrawer | null;
  masterPanel?: McxMasterPanel | null; routeModal?: McxInstrumentRouteModal | null;
  synthModal?: McxSynthModal | null; rackColumn?: McxRackColumn | null;
  globalDrawer?: McxGlobalDrawer | null; settingsModal?: McxSettingsModal | null;
  fxRackModal?: MultiBusFxRackModal | null; globalLfoModal?: GlobalLfoModal | null;
  pianoRollModal?: PianoRollModal | null; grooveModal?: GrooveShuffleModal | null;
  padModal?: MpcPadModal | null; arpModal?: GrooveArpeggiatorModal | null;
  onSongTelemetry?: (tel: McxTelemetry) => void;
  triggerLiveScene?: (idx: number, immediate?: boolean) => void;
  toggleSongDrawer?: () => void; refreshSongLocale?: () => void;
  onSavePreset?: (isMulti: boolean) => void; onOpenBankFile?: () => void; onPanic?: () => void;
  onToggleProbe?: () => void;
}

export class McxAppState {
  public readonly partsState: McxPartUiState[] = Array.from({ length: 16 }, (_, i) => createDefaultPartState(i));
  public focusedPart = 0;
  public globalSettings: McxSystemSettingsDto;
  public refs: McxUiRefs = {};
  private readonly bridge: McxHostBridge;
  private cachedPanelCbs: McxMixerCallbacks | null = null;

  constructor(bridge: McxHostBridge) {
    this.bridge = bridge;
    this.globalSettings = bridge.loadLocalSettingsFallback();
  }

  public updateLcdLine1(activeVoices = 0): void {
    const ps = this.partsState[this.focusedPart];
    const budget = Math.max(8, Math.min(64, this.globalSettings.maxPolyphony || 64));
    const el = document.getElementById('lcd-line1');
    if (el) {
      el.textContent = `GROOVEBOX 16P  |  P${String(this.focusedPart + 1).padStart(2, '0')} (${ps.kind === 'drum_map' ? 'DRM' : 'CHR'}·CH${ps.midiChannel})  |  ${activeVoices}/${budget} ${t('mcx.voices')}  |  ${this.globalSettings.masterTuneHz.toFixed(1)}Hz  |  ${Math.round(this.globalSettings.standaloneBpm)} BPM`;
    }
  }

  public setLcdLine2 = (text: string): void => {
    const el = document.getElementById('lcd-line2');
    if (el) el.textContent = text;
  };

  public syncOctaveTooltips(): void {
    document.getElementById('oct-up')?.setAttribute('title', t('mcx.octaveUp'));
    document.getElementById('oct-down')?.setAttribute('title', t('mcx.octaveDown'));
  }

  public refreshPartList(): void {
    const el = document.getElementById('part-list');
    if (el) renderMixerConsole(el, this.getPanelCallbacks(), this.bridge);
    this.refs.stepStrip?.refresh();
    this.syncSoloIndicator();
  }

  public syncSoloIndicator(): void {
    const anySolo = this.partsState.some((p) => p.solo);
    const btn = document.getElementById('mcx-solo-clear-btn');
    if (btn) { btn.hidden = !anySolo; btn.textContent = t('mcx.soloActiveClear'); }
  }

  public clearAllSolos(): void {
    this.partsState.forEach((ps, i) => { if (ps.solo) { ps.solo = false; this.bridge.setParam(i, 'partSolo', 0); } });
    this.refreshPartList();
    this.setLcdLine2(t('mcx.allSolosCleared'));
  }

  public syncPianoRollForPart(idx: number): void {
    syncPianoRollPart(this.refs.pianoRollModal, this.partsState[idx], idx);
  }

  public syncArpModalForPart(idx: number): void {
    const ps = this.partsState[idx];
    this.refs.arpModal?.syncPart(idx, {
      enabled: Boolean(ps.arpEnabled), motif: ps.arpMotif ?? 0, rate: ps.arpRate ?? '1/16',
      octaves: ps.arpOctaves ?? 1, gate: ps.arpGate ?? 80, swing: Math.round((ps.patternSwing ?? 0.5) * 100), latch: ps.arpLatch ?? 0,
    });
  }

  public setTransportPlaying(playing: boolean): void {
    this.refs.masterPanel?.setPlaying(playing);
    this.refs.pianoRollModal?.setPlaying(playing, this.globalSettings.standaloneBpm);
    this.refs.stepStrip?.setTransportRunning(playing, this.globalSettings.standaloneBpm);
    if (playing) { this.bridge.setTempo(this.globalSettings.standaloneBpm); this.bridge.setTransportPlaying(true, false); this.setLcdLine2(`TRANSPORT: PLAY (${this.globalSettings.standaloneBpm.toFixed(1)} BPM)`); }
    else { this.bridge.setTransportPlaying(false, true); this.setLcdLine2('TRANSPORT: STOP'); }
  }

  public uploadInitialPatterns(): void {
    for (let i = 0; i < this.partsState.length; ++i) {
      const seq = this.partsState[i].sequence;
      if (seq) this.bridge.setPartPattern(i, seq);
    }
  }

  public focusPart(idx: number): void {
    this.focusedPart = idx;
    this.updateLcdLine1(0);
    document.getElementById('part-list')?.querySelectorAll('.mcx-strip').forEach((el, k) => el.classList.toggle('is-active', k === idx));
    this.refs.stepStrip?.syncFromSequence(idx, this.partsState[idx].sequence);
    if (this.refs.toneDrawer?.isOpen()) this.refs.toneDrawer.syncPart(idx, this.partsState[idx]);
    if (this.refs.padModal?.isOpen()) this.refs.padModal.syncPart(idx, this.partsState[idx]);
    if (this.refs.arpModal?.isOpen()) this.syncArpModalForPart(idx);
    if (this.refs.pianoRollModal?.isOpen()) this.syncPianoRollForPart(idx);
    if (this.refs.synthModal?.isOpen()) this.refs.synthModal.open(idx);
  }

  public notifyPartMetadataChanged(idx: number): void {
    this.refreshPartList(); this.updateLcdLine1(0);
    this.refs.stepStrip?.syncFromSequence(idx, this.partsState[idx].sequence);
    this.bridge.requestPartEngineState(idx);
    if (this.refs.toneDrawer?.isOpen() && this.refs.toneDrawer.getPart() === idx) this.refs.toneDrawer.syncPart(idx, this.partsState[idx]);
    if (this.refs.padModal?.isOpen() && this.refs.padModal.getPart() === idx) this.refs.padModal.syncPart(idx, this.partsState[idx]);
    if (this.refs.arpModal?.isOpen() && this.refs.arpModal.getPart() === idx) this.syncArpModalForPart(idx);
    if (this.refs.pianoRollModal?.isOpen() && this.focusedPart === idx) this.syncPianoRollForPart(idx);
  }

  public getPanelCallbacks(): McxMixerCallbacks {
    if (!this.cachedPanelCbs) this.cachedPanelCbs = createMixerCallbacks(this, this.bridge);
    return this.cachedPanelCbs;
  }
}

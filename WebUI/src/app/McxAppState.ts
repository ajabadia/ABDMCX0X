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
import type { McxPadsDrawer } from '../ui/McxPadsDrawer';
import type { McxSongDrawer } from '../ui/McxSongDrawer';
import type { McxSceneBar } from '../ui/McxSceneBar';
import type { McxBankDrawer } from '../ui/McxBankDrawer';
import type { McxMasterPanel } from '../ui/McxMasterPanel';
import type { McxInstrumentRouteModal } from '../ui/McxInstrumentRouteModal';
import type { McxSynthModal } from '../ui/McxSynthModal';
import type { McxRackColumn } from '../ui/McxRackColumn';
import type { McxGlobalDrawer } from '../ui/McxGlobalDrawer';
import type { McxSettingsModal } from '../ui/McxSettingsModal';
import { syncPianoRollPart } from './McxPianoRollSync';

export interface McxUiRefs {
  stepStrip?: McxStepStrip | null; toneDrawer?: McxToneDrawer | null; padsDrawer?: McxPadsDrawer | null;
  songDrawer?: McxSongDrawer | null; sceneBar?: McxSceneBar | null; bankDrawer?: McxBankDrawer | null;
  masterPanel?: McxMasterPanel | null; routeModal?: McxInstrumentRouteModal | null;
  synthModal?: McxSynthModal | null; rackColumn?: McxRackColumn | null;
  globalDrawer?: McxGlobalDrawer | null; settingsModal?: McxSettingsModal | null;
  fxRackModal?: MultiBusFxRackModal | null; globalLfoModal?: GlobalLfoModal | null;
  pianoRollModal?: PianoRollModal | null; grooveModal?: GrooveShuffleModal | null;
  padModal?: MpcPadModal | null; arpModal?: GrooveArpeggiatorModal | null;
  onSongTelemetry?: (tel: McxTelemetry) => void;
  triggerLiveScene?: (idx: number, immediate?: boolean) => void;
  toggleSongDrawer?: () => void;
  refreshSongLocale?: () => void;
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
  }

  public syncPianoRollForPart(idx: number): void {
    syncPianoRollPart(this.refs.pianoRollModal, this.partsState[idx], idx);
  }

  public syncArpModalForPart(idx: number): void {
    const ps = this.partsState[idx];
    this.refs.arpModal?.syncPart(idx, {
      enabled: Boolean(ps.arpEnabled),
      motif: ps.arpMotif ?? 0,
      rate: ps.arpRate ?? '1/16',
      octaves: ps.arpOctaves ?? 1,
      gate: ps.arpGate ?? 80,
      swing: Math.round((ps.patternSwing ?? 0.5) * 100),
      latch: ps.arpLatch ?? 0,
    });
  }

  public setTransportPlaying(playing: boolean): void {
    this.refs.masterPanel?.setPlaying(playing);
    this.refs.pianoRollModal?.setPlaying(playing, this.globalSettings.standaloneBpm);
    this.refs.stepStrip?.setTransportRunning(playing, this.globalSettings.standaloneBpm);
    if (playing) {
      this.bridge.setTempo(this.globalSettings.standaloneBpm);
      this.bridge.setTransportPlaying(true, false);
      this.setLcdLine2(`TRANSPORT: PLAY ▶ (${this.globalSettings.standaloneBpm.toFixed(1)} BPM)`);
    } else {
      this.bridge.setTransportPlaying(false, true);
      this.setLcdLine2('TRANSPORT: STOP ■');
    }
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
    if (this.refs.padsDrawer?.isOpen()) this.refs.padsDrawer.syncPart(idx, this.partsState[idx]);
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
    if (this.refs.padsDrawer?.isOpen() && this.refs.padsDrawer.getPart() === idx) this.refs.padsDrawer.syncPart(idx, this.partsState[idx]);
    if (this.refs.padModal?.isOpen() && this.refs.padModal.getPart() === idx) this.refs.padModal.syncPart(idx, this.partsState[idx]);
    if (this.refs.arpModal?.isOpen() && this.refs.arpModal.getPart() === idx) this.syncArpModalForPart(idx);
    if (this.refs.pianoRollModal?.isOpen() && this.focusedPart === idx) this.syncPianoRollForPart(idx);
  }

  public getPanelCallbacks(): McxMixerCallbacks {
    if (this.cachedPanelCbs) return this.cachedPanelCbs;
    this.cachedPanelCbs = {
      getFocusedPart: () => this.focusedPart,
      setFocusedPart: (idx) => this.focusPart(idx),
      getPartsState: () => this.partsState,
      getEngineCatalog: () => this.refs.routeModal?.getEngineCatalog() ?? [],
      onOpenRouteForPart: (idx) => { this.focusPart(idx); this.refs.routeModal?.open(idx); },
      onTogglePartKind: (idx) => {
        const next = this.partsState[idx].kind === 'drum_map' ? 'chromatic' : 'drum_map';
        this.partsState[idx].kind = next; this.bridge.setParam(idx, 'partKind', next === 'drum_map' ? 1 : 0);
        this.notifyPartMetadataChanged(idx);
        this.setLcdLine2(`P${String(idx + 1).padStart(2, '0')} -> ${next === 'drum_map' ? t('mcx.partDrumMap') : t('mcx.partChromatic')}`);
      },
      onChangePartChannel: (idx, ch) => {
        this.partsState[idx].midiChannel = ch; this.bridge.setParam(idx, 'partMidiChannel', ch);
        this.updateLcdLine1(0); this.setLcdLine2(`P${String(idx + 1).padStart(2, '0')} MIDI CH ${ch}`);
      },
      onToggleFollowTranspose: (idx) => {
        const next = this.partsState[idx].followTranspose === false;
        this.partsState[idx].followTranspose = next; this.bridge.setParam(idx, 'partFollowTranspose', next ? 1 : 0);
        this.refreshPartList(); this.setLcdLine2(`P${String(idx + 1).padStart(2, '0')} TRANSPOSE: ${next ? 'ON' : 'OFF'}`);
      },
      onToggleMute: (idx) => {
        this.partsState[idx].mute = !this.partsState[idx].mute; this.bridge.setParam(idx, 'partMute', this.partsState[idx].mute ? 1 : 0);
        this.notifyPartMetadataChanged(idx);
      },
      onToggleSolo: (idx) => {
        this.partsState[idx].solo = !this.partsState[idx].solo; this.bridge.setParam(idx, 'partSolo', this.partsState[idx].solo ? 1 : 0);
        this.notifyPartMetadataChanged(idx);
      },
      onOpenSynthForPart: (idx) => { this.focusPart(idx); this.refs.synthModal?.open(idx); },
      onOpenBankForPart: (idx) => { this.focusPart(idx); this.refs.bankDrawer?.open(idx); },
      onOpenToneForPart: (idx, sec) => {
        this.focusPart(idx);
        if (this.refs.songDrawer?.isOpen()) this.refs.songDrawer.close();
        if (sec) this.refs.toneDrawer?.open(idx, sec); else this.refs.toneDrawer?.toggle(idx);
      },
      onOpenPadsForPart: (idx) => {
        this.focusPart(idx);
        if (this.refs.padModal) { this.refs.padModal.syncPart(idx, this.partsState[idx]); this.refs.padModal.toggle(idx); }
        else this.refs.padsDrawer?.toggle(idx);
      },
      onOpenArpForPart: (idx) => { this.focusPart(idx); if (this.refs.arpModal) { this.syncArpModalForPart(idx); this.refs.arpModal.toggle(idx); } },
      onOpenPianoRollForPart: (idx) => { this.focusPart(idx); if (this.refs.pianoRollModal) { this.syncPianoRollForPart(idx); this.refs.pianoRollModal.open(); } },
      onChangeGlide: (idx, ms) => this.refs.stepStrip?.setPortaTime(idx, ms),
      onChangeLevel: (idx, lvl) => { this.partsState[idx].partLevel = lvl; this.bridge.setParam(idx, 'partLevel', lvl); },
      onChangePan: (idx, pan) => { this.partsState[idx].partPan = pan; this.bridge.setParam(idx, 'partPan', pan); },
      onChangeSendA: (idx, send) => { this.partsState[idx].reverbSend = send; this.bridge.setParam(idx, 'reverbSend', send); },
      onChangeSendB: (idx, send) => { this.partsState[idx].chorusSend = send; this.bridge.setParam(idx, 'chorusSend', send); },
      setLcdLine2: this.setLcdLine2,
    };
    return this.cachedPanelCbs;
  }
}

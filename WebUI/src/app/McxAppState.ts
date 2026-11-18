/**
 * ABDMCX0X -- McxAppState.ts
 * Centralized UI state container, LCD readout sync, transport state, and mixer callbacks.
 */

import type { McxHostBridge, McxSystemSettingsDto } from '../bridge/McxHostBridge';
import type { MultiBusFxRackModal, GlobalLfoModal, PianoRollModal, GrooveShuffleModal } from '@abdsynths/shared/components';
import { t } from '../i18n/mcxI18n';
import { renderVoiceLedStrip } from '../ui/McxPanels';
import { renderMixerConsole, createDefaultPartState, type McxMixerCallbacks, type McxPartUiState } from '../ui/McxMixerConsole';
import type { McxStepStrip } from '../ui/McxStepStrip';
import type { McxToneDrawer } from '../ui/McxToneDrawer';
import type { McxPadsDrawer } from '../ui/McxPadsDrawer';
import type { McxBankDrawer } from '../ui/McxBankDrawer';
import type { McxMasterPanel } from '../ui/McxMasterPanel';
import { syncPianoRollPart } from './McxPianoRollSync';

export interface McxUiRefs {
  stepStrip?: McxStepStrip | null;
  toneDrawer?: McxToneDrawer | null;
  padsDrawer?: McxPadsDrawer | null;
  bankDrawer?: McxBankDrawer | null;
  masterPanel?: McxMasterPanel | null;
  fxRackModal?: MultiBusFxRackModal | null;
  globalLfoModal?: GlobalLfoModal | null;
  pianoRollModal?: PianoRollModal | null;
  grooveModal?: GrooveShuffleModal | null;
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
    const cap = document.getElementById('voice-caption');
    if (cap) cap.textContent = `${activeVoices} / ${budget} ${t('mcx.voices')}`;
    const leds = document.getElementById('voice-leds');
    if (leds) renderVoiceLedStrip(leds, budget, activeVoices);
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
    syncPianoRollPart(this.refs.pianoRollModal, this.partsState[idx]);
  }

  public setTransportPlaying(playing: boolean): void {
    this.refs.masterPanel?.setPlaying(playing);
    this.refs.pianoRollModal?.setPlaying(playing, this.globalSettings.standaloneBpm);
    this.refs.stepStrip?.setTransportRunning(playing, this.globalSettings.standaloneBpm);
    if (playing) {
      this.bridge.setTempo(this.globalSettings.standaloneBpm);
      this.setLcdLine2(`TRANSPORT: PLAY ▶ (${this.globalSettings.standaloneBpm.toFixed(1)} BPM)`);
    } else {
      this.bridge.allNotesOff();
      this.setLcdLine2('TRANSPORT: STOP ■');
    }
  }

  public getPanelCallbacks(): McxMixerCallbacks {
    if (this.cachedPanelCbs) return this.cachedPanelCbs;
    this.cachedPanelCbs = {
      getFocusedPart: () => this.focusedPart,
      setFocusedPart: (idx) => {
        this.focusedPart = idx;
        this.updateLcdLine1(0);
        this.refs.stepStrip?.refresh();
        if (this.refs.toneDrawer?.isOpen()) this.refs.toneDrawer.syncPart(idx, this.partsState[idx]);
        if (this.refs.padsDrawer?.isOpen()) this.refs.padsDrawer.syncPart(idx, this.partsState[idx]);
        if (this.refs.pianoRollModal?.isOpen()) this.syncPianoRollForPart(idx);
      },
      getPartsState: () => this.partsState,
      onTogglePartKind: (idx) => {
        const next = this.partsState[idx].kind === 'drum_map' ? 'chromatic' : 'drum_map';
        this.partsState[idx].kind = next;
        this.bridge.setParam(idx, 'partKind', next === 'drum_map' ? 1 : 0);
        if (idx === this.focusedPart) {
          if (this.refs.toneDrawer?.isOpen()) this.refs.toneDrawer.syncPart(idx, this.partsState[idx]);
          if (this.refs.padsDrawer?.isOpen()) this.refs.padsDrawer.syncPart(idx, this.partsState[idx]);
        }
        this.refreshPartList();
        this.updateLcdLine1(0);
        this.setLcdLine2(`P${String(idx + 1).padStart(2, '0')} -> ${next === 'drum_map' ? t('mcx.partDrumMap') : t('mcx.partChromatic')}`);
      },
      onChangePartChannel: (idx, ch) => {
        this.partsState[idx].midiChannel = ch;
        this.bridge.setParam(idx, 'partMidiChannel', ch);
        this.updateLcdLine1(0);
        this.setLcdLine2(`P${String(idx + 1).padStart(2, '0')} MIDI CH ${ch}`);
      },
      onToggleFollowTranspose: (idx) => {
        const next = this.partsState[idx].followTranspose === false;
        this.partsState[idx].followTranspose = next;
        this.bridge.setParam(idx, 'partFollowTranspose', next ? 1 : 0);
        this.refreshPartList();
        this.setLcdLine2(`P${String(idx + 1).padStart(2, '0')} TRANSPOSE: ${next ? 'ON' : 'OFF'}`);
      },
      onToggleMute: (idx) => {
        this.partsState[idx].mute = !this.partsState[idx].mute;
        this.bridge.setParam(idx, 'partMute', this.partsState[idx].mute ? 1 : 0);
        if (this.refs.toneDrawer?.isOpen() && this.refs.toneDrawer.getPart() === idx) this.refs.toneDrawer.syncPart(idx, this.partsState[idx]);
        if (this.refs.padsDrawer?.isOpen() && this.refs.padsDrawer.getPart() === idx) this.refs.padsDrawer.syncPart(idx, this.partsState[idx]);
        this.refreshPartList();
      },
      onToggleSolo: (idx) => {
        this.partsState[idx].solo = !this.partsState[idx].solo;
        this.bridge.setParam(idx, 'partSolo', this.partsState[idx].solo ? 1 : 0);
        if (this.refs.toneDrawer?.isOpen() && this.refs.toneDrawer.getPart() === idx) this.refs.toneDrawer.syncPart(idx, this.partsState[idx]);
        this.refreshPartList();
      },
      onOpenBankForPart: (idx) => this.refs.bankDrawer?.open(idx),
      onOpenToneForPart: (idx, sec) => {
        this.focusedPart = idx;
        if (this.refs.padsDrawer?.isOpen()) this.refs.padsDrawer.close();
        if (sec) this.refs.toneDrawer?.open(idx, sec); else this.refs.toneDrawer?.toggle(idx);
        this.refreshPartList();
      },
      onOpenPadsForPart: (idx) => {
        this.focusedPart = idx;
        if (this.refs.toneDrawer?.isOpen()) this.refs.toneDrawer.close();
        this.refs.padsDrawer?.toggle(idx);
        this.refreshPartList();
      },
      onOpenPianoRollForPart: (idx) => {
        this.focusedPart = idx;
        if (this.refs.pianoRollModal) { this.syncPianoRollForPart(idx); this.refs.pianoRollModal.open(); }
        this.refreshPartList();
      },
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

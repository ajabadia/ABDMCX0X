/**
 * ABDMCX0X -- McxAppState.ts
 * Centralized UI state container, LCD readout sync, transport state, and mixer callbacks.
 */

import type { McxHostBridge, McxMidiDevicesDto, McxSystemSettingsDto, McxTelemetry } from '../bridge/McxHostBridge';
import type { MultiBusFxRackModal, GlobalLfoModal, PianoRollModal, GrooveShuffleModal, MpcPadModal, GrooveArpeggiatorModal } from '@abdsynths/shared/components';
import { t } from '../i18n/mcxI18n';
import {
  addBank,
  addPartInFirstFreeSlot,
  BANK_LETTERS,
  createDefaultBankLayout,
  deletePart,
  findPartLocation,
  formatBankDisplayName,
  formatSlotLabel,
  getBankName,
  hasAnyBankSoloed,
  hasPinnedInBank,
  isBankMuted,
  isBankSoloed,
  MAX_PARTS,
  type McxBankLayoutData,
  movePart,
  movePartToBank,
  pinBank,
  removeBankBit,
  serializeBankLayoutJson,
  setBankMuted,
  setBankName,
  setBankSoloed,
  togglePin,
  unpinBank,
} from '../ui/McxBankLayout';
import type { McxBankRail } from '../ui/McxBankRail';
import { openRenameBankModal } from '../ui/McxRenameBankModal';
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
  stepStrip?: McxStepStrip | null; bankRail?: McxBankRail | null; toneDrawer?: McxToneDrawer | null;
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
  public readonly partsState: McxPartUiState[] = Array.from({ length: MAX_PARTS }, (_, i) => createDefaultPartState(i));
  public bankLayout: McxBankLayoutData = createDefaultBankLayout();
  public midiDevices: McxMidiDevicesDto;
  public focusedPart = 0;
  public globalSettings: McxSystemSettingsDto;
  public refs: McxUiRefs = {};
  private readonly bridge: McxHostBridge;
  private cachedPanelCbs: McxMixerCallbacks | null = null;
  private preSoloMutedBankMask = 0;
  private readonly preSoloMutedParts = new Set<number>();

  constructor(bridge: McxHostBridge) {
    this.bridge = bridge;
    this.midiDevices = { isStandalone: !bridge.isNative, inputs: [], outputs: [] };
    this.globalSettings = bridge.loadLocalSettingsFallback();
  }

  public updateLcdLine1(activeVoices = 0): void {
    const ps = this.partsState[this.focusedPart];
    const budget = Math.max(8, Math.min(64, this.globalSettings.maxPolyphony || 64));
    const el = document.getElementById('lcd-line1');
    if (el && ps) {
      const loc = findPartLocation(this.bankLayout, this.focusedPart);
      const slotPrefix = loc ? `${formatSlotLabel(loc.bankIdx, loc.slotIdx)}·` : '';
      el.textContent = `GROOVEBOX 64P  |  ${slotPrefix}P${String(this.focusedPart + 1).padStart(2, '0')} (${ps.kind === 'drum_map' ? 'DRM' : 'CHR'}·CH${ps.midiChannel})  |  ${activeVoices}/${budget} ${t('mcx.voices')}  |  ${this.globalSettings.masterTuneHz.toFixed(1)}Hz  |  ${Math.round(this.globalSettings.standaloneBpm)} BPM`;
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
    this.refs.bankRail?.render(this.bankLayout, this.partsState);
    const el = document.getElementById('part-list');
    if (el) renderMixerConsole(el, this.getPanelCallbacks(), this.bridge);
    this.refs.stepStrip?.refresh();
    this.refs.songDrawer?.renderAll();
    this.syncSoloIndicator();
  }

  public clearPreSoloMemory(): void {
    this.preSoloMutedBankMask = 0;
    this.preSoloMutedParts.clear();
  }

  public syncSoloIndicator(): void {
    const anySolo = this.partsState.some((p) => p.enabled !== false && p.solo) || hasAnyBankSoloed(this.bankLayout);
    const btn = document.getElementById('mcx-solo-clear-btn');
    if (btn) { btn.hidden = !anySolo; btn.textContent = t('mcx.soloActiveClear'); }
  }

  public clearAllSolos(): void {
    this.bankLayout.bankSoloMask = 0;
    for (let b = 0; b < this.bankLayout.bankCount; ++b) {
      if ((this.preSoloMutedBankMask & (1 << b)) !== 0) setBankMuted(this.bankLayout, b, true);
    }
    this.preSoloMutedBankMask = 0;
    this.partsState.forEach((ps, i) => {
      if (ps.solo) { ps.solo = false; this.bridge.setParam(i, 'partSolo', 0); }
      if (ps.enabled !== false && this.preSoloMutedParts.has(i)) {
        ps.mute = true;
        this.bridge.setParam(i, 'partMute', 1);
      }
    });
    this.preSoloMutedParts.clear();
    this.syncBankLayoutToHost();
    this.refreshPartList();
    this.syncOpenEditorsToFocusedPart();
    this.setLcdLine2(t('mcx.allSolosCleared'));
  }

  public syncBankLayoutToHost(): void {
    this.bridge.setBankLayout(serializeBankLayoutJson(this.bankLayout));
  }

  private initAllocatedPart(partId: number, defaultChannel: number): void {
    this.partsState[partId] = {
      ...createDefaultPartState(Math.max(16, partId)),
      enabled: true, midiChannel: defaultChannel, midiInPortIndex: 0, midiPortIndex: 0,
    };
    this.bridge.setParam(partId, 'partEnabled', 1);
    this.bridge.setParam(partId, 'partMidiChannel', defaultChannel);
    this.bridge.setParam(partId, 'partMidiInPort', 0);
    this.bridge.setParam(partId, 'partMidiPort', 0);
    this.bridge.setParam(partId, 'routeMode', 0);
    this.bridge.setParam(partId, 'partKind', 0);
    this.bridge.setParam(partId, 'partMute', 0);
    this.bridge.setParam(partId, 'partSolo', 0);
    this.bridge.setPartPresetName(partId, 'Init Tone');
  }

  public findFirstPlacedPart(preferredBank = this.bankLayout.activeBank): number {
    for (const pid of this.bankLayout.banks[preferredBank] ?? []) { if (pid !== null) return pid; }
    for (let b = 0; b < this.bankLayout.bankCount; ++b) {
      for (const pid of this.bankLayout.banks[b]) { if (pid !== null) return pid; }
    }
    return 0;
  }

  private syncOpenEditorsToFocusedPart(): void {
    const idx = this.focusedPart;
    const ps = this.partsState[idx];
    if (!ps) return;
    if (this.refs.toneDrawer?.isOpen()) this.refs.toneDrawer.syncPart(idx, ps);
    if (this.refs.padModal?.isOpen()) this.refs.padModal.syncPart(idx, ps);
    if (this.refs.arpModal?.isOpen()) this.syncArpModalForPart(idx);
    if (this.refs.pianoRollModal?.isOpen()) this.syncPianoRollForPart(idx);
    if (this.refs.synthModal?.isOpen()) this.refs.synthModal.open(idx);
  }

  public selectBank(bankIdx: number): void {
    const next = Math.max(0, Math.min(this.bankLayout.bankCount - 1, bankIdx));
    if (next === this.bankLayout.activeBank) return;
    this.bankLayout.activeBank = next;
    const curLoc = findPartLocation(this.bankLayout, this.focusedPart);
    if (!curLoc || curLoc.bankIdx !== next) {
      this.focusedPart = this.findFirstPlacedPart(next);
    }
    this.syncBankLayoutToHost();
    this.refreshPartList();
    this.refs.stepStrip?.syncFromSequence(this.focusedPart, this.partsState[this.focusedPart]?.sequence);
    this.syncOpenEditorsToFocusedPart();
    this.updateLcdLine1(0);
    this.setLcdLine2(formatBankDisplayName(this.bankLayout, next, t('mcx.bankLabel')));
  }

  public addNewBank(): void {
    const res = addBank(this.bankLayout);
    if (!res.ok || res.bankIdx === undefined) return;
    res.allocated.forEach((a) => this.initAllocatedPart(a.partId, a.defaultChannel));
    this.focusedPart = res.allocated[0].partId;
    this.syncBankLayoutToHost();
    this.refreshPartList();
    this.refs.stepStrip?.syncFromSequence(this.focusedPart, this.partsState[this.focusedPart]?.sequence);
    this.syncOpenEditorsToFocusedPart();
    this.updateLcdLine1(0);
    this.setLcdLine2(`${t('mcx.bankLabel')} ${BANK_LETTERS[res.bankIdx]} ${t('mcx.bankCreated')}`);
  }

  public addPartAtFirstFreeSlot(bankIdx: number): void {
    const res = addPartInFirstFreeSlot(this.bankLayout, bankIdx);
    if (!res.ok || res.partId === undefined || res.slotIdx === undefined || res.defaultChannel === undefined) return;
    this.initAllocatedPart(res.partId, res.defaultChannel);
    this.focusedPart = res.partId;
    this.syncBankLayoutToHost();
    this.refreshPartList();
    this.refs.stepStrip?.syncFromSequence(this.focusedPart, this.partsState[this.focusedPart]?.sequence);
    this.syncOpenEditorsToFocusedPart();
    this.updateLcdLine1(0);
    this.setLcdLine2(`${formatSlotLabel(bankIdx, res.slotIdx)} · P${String(res.partId + 1).padStart(2, '0')} ${t('mcx.bankAddPart')}`);
  }

  public requestDeletePart(bankIdx: number, slotIdx: number, forceUnpin = false): void {
    const res = deletePart(this.bankLayout, bankIdx, slotIdx, { forceUnpin });
    if (!res.ok) {
      if (res.reason === 'last_part') this.setLcdLine2(t('mcx.bankDeleteLastBlocked'));
      else if (res.reason === 'pinned') this.setLcdLine2(t('mcx.bankMoveBlockedPinned'));
      return;
    }
    if (res.partId !== undefined) {
      const ps = this.partsState[res.partId];
      if (ps) { ps.enabled = false; ps.mute = false; ps.solo = false; }
      this.preSoloMutedParts.delete(res.partId);
      this.bridge.setParam(res.partId, 'partEnabled', 0);
      this.bridge.setParam(res.partId, 'partMute', 0);
      this.bridge.setParam(res.partId, 'partSolo', 0);
      if (this.focusedPart === res.partId) this.focusedPart = this.findFirstPlacedPart(this.bankLayout.activeBank);
    }
    if (res.removedBank) {
      this.preSoloMutedBankMask = removeBankBit(this.preSoloMutedBankMask, bankIdx);
    }
    this.syncBankLayoutToHost();
    this.refreshPartList();
    this.refs.stepStrip?.syncFromSequence(this.focusedPart, this.partsState[this.focusedPart]?.sequence);
    this.syncOpenEditorsToFocusedPart();
    this.updateLcdLine1(0);
    this.setLcdLine2(res.removedBank ? t('mcx.bankRemoved') : t('mcx.bankEmptySlotNotice'));
  }

  public movePartSlot(fromBank: number, fromSlot: number, toBank: number, toSlot: number): void {
    const res = toSlot < 0 ? movePartToBank(this.bankLayout, fromBank, fromSlot, toBank) : movePart(this.bankLayout, fromBank, fromSlot, toBank, toSlot);
    if (!res.ok) {
      this.setLcdLine2(res.reason === 'overflow_blocked' ? t('mcx.bankMoveOverflowBlocked') : t('mcx.bankMoveBlockedPinned'));
      return;
    }
    if (res.removedEmptyBank) {
      this.preSoloMutedBankMask = removeBankBit(this.preSoloMutedBankMask, fromBank);
    }
    this.syncBankLayoutToHost();
    this.refreshPartList();
    this.updateLcdLine1(0);
    const destLabel = formatSlotLabel(res.destBank ?? toBank, res.destSlot ?? Math.max(0, toSlot));
    if (res.createdBankIdx !== null && res.createdBankIdx !== undefined) {
      this.setLcdLine2(`${t('mcx.bankMoveOverflowNotice')} ${t('mcx.bankLabel')} ${BANK_LETTERS[res.createdBankIdx]}`);
    } else if (res.removedEmptyBank) {
      this.setLcdLine2(`${destLabel} — ${t('mcx.bankRemoved')}`);
    } else {
      this.setLcdLine2(`${formatSlotLabel(fromBank, fromSlot)} ${t('mcx.bankMovedNotice')} ${destLabel}`);
    }
  }

  public togglePartPin(partId: number): void {
    const pinned = togglePin(this.bankLayout, partId);
    this.syncBankLayoutToHost();
    this.refreshPartList();
    this.setLcdLine2(`P${String(partId + 1).padStart(2, '0')} ${pinned ? 'PIN ON' : 'PIN OFF'}`);
  }

  public unpinActiveBank(): void {
    const count = unpinBank(this.bankLayout, this.bankLayout.activeBank);
    this.syncBankLayoutToHost();
    this.refreshPartList();
    this.setLcdLine2(`${t('mcx.bankLabel')} ${BANK_LETTERS[this.bankLayout.activeBank]}: ${count} ${t('mcx.bankUnpinnedCount')}`);
  }

  public togglePinActiveBank(): void {
    const b = this.bankLayout.activeBank;
    if (hasPinnedInBank(this.bankLayout, b)) {
      const count = unpinBank(this.bankLayout, b);
      this.syncBankLayoutToHost();
      this.refreshPartList();
      this.setLcdLine2(`${t('mcx.bankLabel')} ${BANK_LETTERS[b]}: ${count} ${t('mcx.bankUnpinnedCount')}`);
    } else {
      const count = pinBank(this.bankLayout, b);
      this.syncBankLayoutToHost();
      this.refreshPartList();
      this.setLcdLine2(`${t('mcx.bankLabel')} ${BANK_LETTERS[b]}: ${count} ${t('mcx.bankPinnedCount')}`);
    }
  }

  public toggleLiveMuteBank(bankIdx: number): void {
    if (bankIdx < 0 || bankIdx >= this.bankLayout.bankCount) return;
    const nextMuted = !isBankMuted(this.bankLayout, bankIdx);
    setBankMuted(this.bankLayout, bankIdx, nextMuted);
    const bit = 1 << bankIdx;
    if (nextMuted) {
      this.preSoloMutedBankMask &= ~bit;
      setBankSoloed(this.bankLayout, bankIdx, false);
    }
    this.syncBankLayoutToHost();
    this.refreshPartList();
    const statusTxt = nextMuted ? t('mcx.bankMutedStatus') : t('mcx.bankActiveStatus');
    this.setLcdLine2(`${formatBankDisplayName(this.bankLayout, bankIdx, t('mcx.bankLabel'))}: ${statusTxt}`);
  }

  public toggleLiveSoloBank(bankIdx: number): void {
    if (bankIdx < 0 || bankIdx >= this.bankLayout.bankCount) return;
    const nextSolo = !isBankSoloed(this.bankLayout, bankIdx);
    const bit = 1 << bankIdx;
    if (nextSolo) {
      if (isBankMuted(this.bankLayout, bankIdx)) {
        this.preSoloMutedBankMask |= bit;
        setBankMuted(this.bankLayout, bankIdx, false);
      }
      setBankSoloed(this.bankLayout, bankIdx, true);
    } else {
      setBankSoloed(this.bankLayout, bankIdx, false);
      if ((this.preSoloMutedBankMask & bit) !== 0) {
        this.preSoloMutedBankMask &= ~bit;
        setBankMuted(this.bankLayout, bankIdx, true);
      }
    }
    this.syncBankLayoutToHost();
    this.refreshPartList();
    const statusTxt = nextSolo ? t('mcx.bankSoloStatus') : t('mcx.bankActiveStatus');
    this.setLcdLine2(`${formatBankDisplayName(this.bankLayout, bankIdx, t('mcx.bankLabel'))}: ${statusTxt}`);
  }

  public clearAllBankMutes(): void {
    this.bankLayout.bankMuteMask = 0;
    this.preSoloMutedBankMask = 0;
    this.syncBankLayoutToHost();
    this.refreshPartList();
    this.setLcdLine2(t('mcx.allBankMutesCleared'));
  }

  public togglePartMute(partIdx: number): void {
    const ps = this.partsState[partIdx];
    if (!ps) return;
    const nextMuted = !ps.mute;
    ps.mute = nextMuted;
    this.bridge.setParam(partIdx, 'partMute', nextMuted ? 1 : 0);
    if (nextMuted) {
      this.preSoloMutedParts.delete(partIdx);
      if (ps.solo) {
        ps.solo = false;
        this.bridge.setParam(partIdx, 'partSolo', 0);
      }
    }
    this.notifyPartMetadataChanged(partIdx);
  }

  public togglePartSolo(partIdx: number): void {
    const ps = this.partsState[partIdx];
    if (!ps) return;
    const nextSolo = !ps.solo;
    if (nextSolo) {
      if (ps.mute) {
        this.preSoloMutedParts.add(partIdx);
        ps.mute = false;
        this.bridge.setParam(partIdx, 'partMute', 0);
      }
      ps.solo = true;
      this.bridge.setParam(partIdx, 'partSolo', 1);
    } else {
      ps.solo = false;
      this.bridge.setParam(partIdx, 'partSolo', 0);
      if (this.preSoloMutedParts.delete(partIdx)) {
        ps.mute = true;
        this.bridge.setParam(partIdx, 'partMute', 1);
      }
    }
    this.notifyPartMetadataChanged(partIdx);
  }

  public openRenameBankDialog(bankIdx = this.bankLayout.activeBank): void {
    if (bankIdx < 0 || bankIdx >= this.bankLayout.bankCount) return;
    openRenameBankModal({
      bankIdx,
      currentName: getBankName(this.bankLayout, bankIdx),
      onSave: (idx, nextName) => this.renameBank(idx, nextName),
    });
  }

  public renameBank(bankIdx: number, rawName: string): void {
    if (bankIdx < 0 || bankIdx >= this.bankLayout.bankCount) return;
    setBankName(this.bankLayout, bankIdx, rawName);
    this.syncBankLayoutToHost();
    this.refreshPartList();
    this.setLcdLine2(`${formatBankDisplayName(this.bankLayout, bankIdx, t('mcx.bankLabel'))} — ${t('mcx.bankRenamedNotice')}`);
  }

  public resetToFactoryLayout(): void {
    for (let i = 0; i < MAX_PARTS; ++i) this.partsState[i] = createDefaultPartState(i);
    this.bankLayout = createDefaultBankLayout();
    this.clearPreSoloMemory();
    this.bridge.clearLocalBankLayoutFallback?.();
    this.focusedPart = 0;
    this.syncBankLayoutToHost();
    this.refreshPartList();
    this.updateLcdLine1(0);
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
    if (!this.partsState[idx]) return;
    this.focusedPart = idx;
    const loc = findPartLocation(this.bankLayout, idx);
    if (loc && loc.bankIdx !== this.bankLayout.activeBank) {
      this.bankLayout.activeBank = loc.bankIdx;
      this.syncBankLayoutToHost();
      this.refreshPartList();
    } else {
      document.getElementById('part-list')?.querySelectorAll('.mcx-strip').forEach((el) => el.classList.toggle('is-active', el.getAttribute('data-part') === String(idx)));
      this.refs.stepStrip?.syncFromSequence(idx, this.partsState[idx].sequence);
    }
    this.updateLcdLine1(0);
    this.syncOpenEditorsToFocusedPart();
  }

  public notifyPartMetadataChanged(idx: number): void {
    this.refreshPartList(); this.updateLcdLine1(0);
    this.refs.stepStrip?.syncFromSequence(idx, this.partsState[idx].sequence);
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

/**
 * ABDMCX0X -- McxStepStrip.ts
 * Integrates the canonical 16-Step Hardware Pad Strip from @abdsynths/shared.
 * Modes: Part Select/Mute/Solo, TR-REC (Drum vs Chromatic), Accent, Slide.
 * Strict line limit: < 200 lines. 100% tokenized.
 */

import { StepButtonStrip } from '@abdsynths/shared/components/Controls/stepButtonStrip.js';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { t } from '../i18n/mcxI18n';
import { createDefaultBankLayout, formatSlotLabel, hasAnyBankSoloed, MAX_PARTS, type McxBankLayoutData } from './McxBankLayout';
import type { McxPartUiState } from './McxPartState';
import { buildPartPadState, DRUM_INSTRUMENTS, getDrumInstrument, midiToNoteName, resolvePadMapping, type StepStripMode } from './McxStepStripHelpers';
import { buildTrRecPadState, toggleTrRecStep } from './McxStepStripTrRec';

export type { StepStripMode } from './McxStepStripHelpers';

export interface McxStepStripCallbacks {
  getFocusedPart: () => number;
  setFocusedPart: (idx: number) => void;
  getPartsState: () => McxPartUiState[];
  getBankLayout?: () => McxBankLayoutData;
  onToggleMute: (partIdx: number) => void;
  onToggleSolo?: (partIdx: number) => void;
  setLcdNotice: (text: string) => void;
  onPatternChange?: (partIdx: number, seq: any) => void;
  onPreviewNote?: (partIdx: number, note: number, vel: number) => void;
}

export class McxStepStrip {
  private strip: StepButtonStrip;
  private bridge: McxHostBridge;
  private cbs: McxStepStripCallbacks;
  private partPorta: { enabled: boolean; timeMs: number }[];
  private runningChaser = -1;
  private currentBpm = 120;
  private isRunning = false;
  private swing = 0.5;
  private selectedDrumNote = 36; // Kick Drum por defecto
  private activePitch = 60; // C3 por defecto

  constructor(container: HTMLElement, bridge: McxHostBridge, cbs: McxStepStripCallbacks) {
    this.bridge = bridge;
    this.cbs = cbs;
    this.partPorta = Array.from({ length: MAX_PARTS }, () => ({ enabled: true, timeMs: 60 }));

    this.strip = new StepButtonStrip(container, {
      padCount: 16,
      modesPosition: 'right',
      showModeHeader: false,
      modeRows: 2,
      modes: [
        { id: 'part-select', label: 'PART SEL', title: t('mcx.stripPartSelHint') },
        { id: 'part-mute', label: 'PART MUTE', title: t('mcx.stripPartMuteHint') },
        { id: 'part-solo', label: 'PART SOLO', title: t('mcx.stripPartSoloHint') },
        { id: 'tr-rec', label: 'TR-REC', title: 'TR-REC: Step Sequencer' },
        { id: 'step-accent', label: 'ACCENT', title: t('mcx.stripStepAccHint') },
        { id: 'step-slide', label: 'SLIDE / GLIDE', title: t('mcx.stripStepSlideHint') },
      ],
      activeMode: 'part-select',
      onModeChange: (mode: string) => this.handleModeChange(mode as StepStripMode),
      onPadClick: (padIdx: number, ev: MouseEvent) => this.handlePadClick(padIdx, ev),
      onPadLabelClick: (padIdx: number) => this.handlePadLabelClick(padIdx),
    });
    this.strip.setChaserStep(-1);
    this.refresh();
  }

  public refresh(): void {
    const rawMode = this.strip.getMode();
    const mode = (rawMode === 'step-mute' ? 'tr-rec' : rawMode) as StepStripMode;
    const focused = this.cbs.getFocusedPart();
    const parts = this.cbs.getPartsState();
    const part = parts[focused];
    const layout = this.cbs.getBankLayout?.() ?? createDefaultBankLayout();
    const anySolo = parts.some((pt) => pt.enabled !== false && pt.solo) || hasAnyBankSoloed(layout);

    for (let i = 0; i < 16; i++) {
      if (mode === 'part-select' || mode === 'part-mute' || mode === 'part-solo') {
        const mapping = resolvePadMapping(layout, i);
        this.strip.setPadState(i, buildPartPadState(mode, focused, parts, mapping, layout, anySolo));
      } else {
        this.strip.setPadState(i, buildTrRecPadState(mode, i, part, this.selectedDrumNote, this.activePitch));
      }
    }
  }

  private handleModeChange(mode: StepStripMode): void {
    const focused = this.cbs.getFocusedPart();
    const part = this.cbs.getPartsState()[focused];
    const isDrum = part?.kind === 'drum_map';
    const porta = this.partPorta[focused];
    const drum = getDrumInstrument(this.selectedDrumNote);

    const msgs: Record<string, string> = {
      'part-select': t('mcx.stripModePartSelect'),
      'part-mute': t('mcx.stripModePartMute'),
      'part-solo': t('mcx.stripModePartSolo'),
      'tr-rec': isDrum
        ? `TR-REC DRUM [P${focused + 1}]: ${drum.name} (${drum.code} ${drum.note})`
        : `TR-REC MELODIC [P${focused + 1}]: PITCH ${midiToNoteName(this.activePitch)} (${this.activePitch})`,
      'step-mute': isDrum ? `TR-REC DRUM: ${drum.name}` : `TR-REC MELODIC: ${midiToNoteName(this.activePitch)}`,
      'step-accent': `ACCENT EDIT (P${focused + 1}) — VEL 127`,
      'step-slide': `SLIDE / GLIDE (P${focused + 1}: ${porta.timeMs}ms)`,
    };
    this.cbs.setLcdNotice(msgs[mode] || mode);
    this.refresh();
  }

  private handlePadClick(padIdx: number, ev: MouseEvent): void {
    const rawMode = this.strip.getMode();
    const mode = (rawMode === 'step-mute' ? 'tr-rec' : rawMode) as StepStripMode;
    const focused = this.cbs.getFocusedPart();
    const parts = this.cbs.getPartsState();
    const part = parts[focused];

    if (mode === 'part-select' || mode === 'part-mute' || mode === 'part-solo') {
      const layout = this.cbs.getBankLayout?.() ?? createDefaultBankLayout();
      const mapping = resolvePadMapping(layout, padIdx);
      if (mapping.bankIdx === null || mapping.partId === null) return;
      const pid = mapping.partId;
      const slotTag = formatSlotLabel(mapping.bankIdx, mapping.slotIdx);
      if (mode === 'part-select') {
        if (ev.shiftKey) this.cbs.onToggleMute(pid);
        else { this.cbs.setFocusedPart(pid); this.cbs.setLcdNotice(`FOCUSED ${slotTag} · P${String(pid + 1).padStart(2, '0')}`); }
      } else if (mode === 'part-solo') {
        this.cbs.onToggleSolo?.(pid);
        this.cbs.setLcdNotice(`${slotTag} · P${String(pid + 1).padStart(2, '0')} ${parts[pid]?.solo ? 'SOLO ON' : 'SOLO OFF'}`);
      } else {
        this.cbs.onToggleMute(pid);
        this.cbs.setLcdNotice(`${slotTag} · P${String(pid + 1).padStart(2, '0')} ${parts[pid]?.mute ? 'MUTED' : 'UNMUTED'}`);
      }
    } else if (part) {
      const res = toggleTrRecStep(part, focused, padIdx, this.selectedDrumNote, this.activePitch, mode);
      part.sequence = res.seq;
      this.bridge.setPartPattern(focused, res.seq);
      this.cbs.onPatternChange?.(focused, res.seq);
      if (res.auditionNote !== null) {
        this.cbs.onPreviewNote?.(focused, res.auditionNote, res.auditionVel);
      }
      this.cbs.setLcdNotice(res.notice);
    }
    this.refresh();
  }

  private handlePadLabelClick(padIdx: number): void {
    const rawMode = this.strip.getMode();
    const mode = (rawMode === 'step-mute' ? 'tr-rec' : rawMode) as StepStripMode;
    const focused = this.cbs.getFocusedPart();
    const part = this.cbs.getPartsState()[focused];

    if (mode === 'tr-rec' && part?.kind === 'drum_map') {
      const curIdx = DRUM_INSTRUMENTS.findIndex((d) => d.note === this.selectedDrumNote);
      const nextDrum = DRUM_INSTRUMENTS[(curIdx + 1) % DRUM_INSTRUMENTS.length];
      this.setActiveDrumNote(nextDrum.note);
      this.cbs.onPreviewNote?.(focused, nextDrum.note, 100);
      this.cbs.setLcdNotice(`TR-REC DRUM SELECT: ${nextDrum.name} (${nextDrum.code} ${nextDrum.note})`);
    } else if (mode === 'step-slide') {
      const cur = this.partPorta[focused];
      cur.timeMs = cur.timeMs >= 300 ? 30 : cur.timeMs + 45;
      this.bridge.setParam(focused, 'portaTimeMs', cur.timeMs);
      this.cbs.setLcdNotice(`P${focused + 1} PORTAMENTO TIME: ${cur.timeMs} ms`);
    } else {
      const layout = this.cbs.getBankLayout?.() ?? createDefaultBankLayout();
      const mapping = resolvePadMapping(layout, padIdx);
      if (mapping.bankIdx !== null && mapping.partId !== null) {
        this.cbs.setFocusedPart(mapping.partId);
        this.cbs.setLcdNotice(`FOCUSED ${formatSlotLabel(mapping.bankIdx, mapping.slotIdx)} · P${String(mapping.partId + 1).padStart(2, '0')}`);
        this.refresh();
      }
    }
  }

  public setActiveDrumNote(note: number): void {
    this.selectedDrumNote = note;
    this.refresh();
  }

  public getActiveDrumNote(): number { return this.selectedDrumNote; }

  public setActivePitch(pitch: number): void {
    this.activePitch = Math.max(0, Math.min(127, Math.round(pitch)));
    this.refresh();
  }

  public getActivePitch(): number { return this.activePitch; }

  public setPortaTime(partIdx: number, ms: number): void {
    if (this.partPorta[partIdx]) { this.partPorta[partIdx].timeMs = Math.max(0, Math.min(1000, ms)); this.bridge.setParam(partIdx, 'portaTimeMs', this.partPorta[partIdx].timeMs); }
  }

  public setPortaEnabled(partIdx: number, enabled: boolean): void {
    if (this.partPorta[partIdx]) { this.partPorta[partIdx].enabled = enabled; this.bridge.setParam(partIdx, 'portaEnabled', enabled ? 1 : 0); }
  }

  public setBpm(bpm: number): void { this.currentBpm = Math.max(20, Math.min(300, bpm)); }
  public setSwing(swing: number): void { this.swing = Math.max(0, Math.min(1, swing)); }
  public getSwing(): number { return this.swing; }

  public setChaserStep(step: number): void {
    const next = step >= 0 ? (step % 16) : -1;
    if (next !== this.runningChaser) { this.runningChaser = next; this.strip.setChaserStep(next); }
  }

  public setTransportRunning(running: boolean, bpm = this.currentBpm): void {
    this.isRunning = running;
    this.currentBpm = Math.max(20, Math.min(300, bpm));
    if (!running) this.setChaserStep(-1);
  }

  public syncFromSequence(partIdx: number, _seq?: any): void {
    if (partIdx === this.cbs.getFocusedPart()) this.refresh();
  }

  public destroy(): void { this.strip.destroy(); }
}

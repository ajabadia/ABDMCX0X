/**
 * ABDMCX0X -- McxStepStrip.ts
 * Integrates the canonical 16-Step Hardware Pad Strip from @abdsynths/shared.
 * Modes: Part Select, Part Mute, Step Mute, Step Accent, Step Slide / Portamento.
 */

import { StepButtonStrip } from '@abdsynths/shared/components/Controls/stepButtonStrip.js';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import type { McxPartUiState } from './McxMixerConsole';
import { t } from '../i18n/mcxI18n';

export type StepStripMode = 'part-select' | 'part-mute' | 'step-mute' | 'step-accent' | 'step-slide';

export interface StepState {
  active: boolean;
  accent: boolean;
  slide: boolean;
}

export interface McxStepStripCallbacks {
  getFocusedPart: () => number;
  setFocusedPart: (idx: number) => void;
  getPartsState: () => McxPartUiState[];
  onToggleMute: (partIdx: number) => void;
  setLcdNotice: (text: string) => void;
}

function buildPadState(mode: StepStripMode, idx: number, focused: number, p: McxPartUiState, s: StepState) {
  if (mode === 'part-select') {
    return { active: idx === focused, muted: p.mute, label: `P${String(idx + 1).padStart(2, '0')}`, subLabel: p.kind === 'drum_map' ? 'DRM' : `CH${p.midiChannel}` };
  }
  if (mode === 'part-mute') {
    return { active: !p.mute, muted: p.mute, label: `P${idx + 1}`, subLabel: p.mute ? 'MUTE' : 'PLAY' };
  }
  if (mode === 'step-mute') {
    return { active: s.active, muted: !s.active, label: String(idx + 1), subLabel: s.active ? 'ON' : 'OFF' };
  }
  if (mode === 'step-accent') {
    return { active: s.accent, muted: !s.accent, label: String(idx + 1), subLabel: s.accent ? 'ACC' : '---' };
  }
  return { active: s.slide, muted: !s.slide, label: String(idx + 1), subLabel: s.slide ? 'SLD' : '---' };
}

export class McxStepStrip {
  private strip: StepButtonStrip;
  private bridge: McxHostBridge;
  private cbs: McxStepStripCallbacks;
  private partSteps: StepState[][];
  private partPorta: { enabled: boolean; timeMs: number }[];
  private runningChaser = -1;
  private currentBpm = 120;
  private isRunning = false;
  private swing = 0.5;

  constructor(container: HTMLElement, bridge: McxHostBridge, cbs: McxStepStripCallbacks) {
    this.bridge = bridge;
    this.cbs = cbs;
    this.partSteps = Array.from({ length: 16 }, (_, p) =>
      Array.from({ length: 16 }, (_, s) => ({
        active: p === 9 ? (s % 4 === 0) : (s % 2 === 0),
        accent: s === 0 || s === 8,
        slide: s === 3 || s === 11,
      })),
    );
    this.partPorta = Array.from({ length: 16 }, () => ({ enabled: true, timeMs: 60 }));

    this.strip = new StepButtonStrip(container, {
      padCount: 16,
      modes: [
        { id: 'part-select', label: 'PART SEL', title: t('mcx.stripPartSelHint') },
        { id: 'part-mute', label: 'PART MUTE', title: t('mcx.stripPartMuteHint') },
        { id: 'step-mute', label: 'STEP MUTE', title: t('mcx.stripStepMuteHint') },
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
    const mode = this.strip.getMode() as StepStripMode;
    const focused = this.cbs.getFocusedPart();
    const parts = this.cbs.getPartsState();
    const steps = this.partSteps[focused];
    for (let i = 0; i < 16; i++) {
      this.strip.setPadState(i, buildPadState(mode, i, focused, parts[i], steps[i]));
    }
  }

  private handleModeChange(mode: StepStripMode): void {
    const focused = this.cbs.getFocusedPart();
    const porta = this.partPorta[focused];
    const msgs: Record<StepStripMode, string> = {
      'part-select': t('mcx.stripModePartSelect'),
      'part-mute': t('mcx.stripModePartMute'),
      'step-mute': `${t('mcx.stripModeStepMute')} (P${focused + 1})`,
      'step-accent': `${t('mcx.stripModeStepAccent')} (P${focused + 1})`,
      'step-slide': `${t('mcx.stripModeStepSlide')} (P${focused + 1}: ${porta.timeMs}ms)`,
    };
    this.cbs.setLcdNotice(msgs[mode] || mode);
    this.refresh();
  }

  private handlePadClick(padIdx: number, ev: MouseEvent): void {
    const mode = this.strip.getMode() as StepStripMode;
    const focused = this.cbs.getFocusedPart();
    if (mode === 'part-select') {
      if (ev.shiftKey) this.cbs.onToggleMute(padIdx);
      else {
        this.cbs.setFocusedPart(padIdx);
        this.cbs.setLcdNotice(`FOCUSED PART P${String(padIdx + 1).padStart(2, '0')}`);
      }
    } else if (mode === 'part-mute') {
      this.cbs.onToggleMute(padIdx);
      const p = this.cbs.getPartsState()[padIdx];
      this.cbs.setLcdNotice(`P${String(padIdx + 1).padStart(2, '0')} ${p.mute ? 'MUTED' : 'UNMUTED'}`);
    } else {
      const isMute = mode === 'step-mute', isAcc = mode === 'step-accent';
      const prop = isMute ? 'active' : isAcc ? 'accent' : 'slide';
      const paramKey = isMute ? 'stepMute' : isAcc ? 'stepAccent' : 'stepSlide';
      const st = this.partSteps[focused][padIdx];
      st[prop] = !st[prop];
      this.bridge.setParam(focused, paramKey, padIdx * 10 + (st[prop] ? 1 : 0));
      this.cbs.setLcdNotice(`P${focused + 1} STEP ${padIdx + 1} ${prop.toUpperCase()}: ${st[prop] ? 'ON' : 'OFF'}`);
    }
    this.refresh();
  }

  private handlePadLabelClick(padIdx: number): void {
    if (this.strip.getMode() === 'step-slide') {
      const focused = this.cbs.getFocusedPart();
      const cur = this.partPorta[focused];
      cur.timeMs = cur.timeMs >= 300 ? 30 : cur.timeMs + 45;
      this.bridge.setParam(focused, 'portaTimeMs', cur.timeMs);
      this.cbs.setLcdNotice(`P${focused + 1} PORTAMENTO TIME: ${cur.timeMs} ms`);
    } else {
      this.cbs.setFocusedPart(padIdx);
      this.cbs.setLcdNotice(`FOCUSED PART P${String(padIdx + 1).padStart(2, '0')}`);
      this.refresh();
    }
  }

  public setPortaTime(partIdx: number, ms: number): void { if (this.partPorta[partIdx]) { this.partPorta[partIdx].timeMs = Math.max(0, Math.min(1000, ms)); this.bridge.setParam(partIdx, 'portaTimeMs', this.partPorta[partIdx].timeMs); } }
  public setPortaEnabled(partIdx: number, enabled: boolean): void { if (this.partPorta[partIdx]) { this.partPorta[partIdx].enabled = enabled; this.bridge.setParam(partIdx, 'portaEnabled', enabled ? 1 : 0); } }
  public setBpm(bpm: number): void { this.currentBpm = Math.max(20, Math.min(300, bpm)); }
  public setSwing(swing: number): void { this.swing = Math.max(0, Math.min(1, swing)); }
  public getSwing(): number { return this.swing; }
  public setChaserStep(step: number): void { const next = step >= 0 ? (step % 16) : -1; if (next !== this.runningChaser) { this.runningChaser = next; this.strip.setChaserStep(next); } }
  public setTransportRunning(running: boolean, bpm = this.currentBpm): void { this.isRunning = running; this.currentBpm = Math.max(20, Math.min(300, bpm)); if (!running) this.setChaserStep(-1); }

  public syncFromSequence(partIdx: number, seq?: { bars?: number; ppq?: number; notes?: Array<{ startTick: number; velocity?: number; slide?: boolean }> }): void {
    const arr = this.partSteps[partIdx]; if (!arr) return;
    if (seq && Array.isArray(seq.notes)) {
      const tps = Math.max(1, Math.round(((seq.ppq || 96) * 4) / 16));
      arr.forEach((st) => { st.active = false; st.accent = false; st.slide = false; });
      for (const n of seq.notes) {
        const s = Math.floor((n.startTick ?? 0) / tps) % 16;
        if (s >= 0 && s < 16) { arr[s].active = true; if ((n.velocity ?? 100) >= 112) arr[s].accent = true; if (n.slide) arr[s].slide = true; }
      }
    }
    if (partIdx === this.cbs.getFocusedPart()) this.refresh();
  }

  public destroy(): void { this.strip.destroy(); }
}

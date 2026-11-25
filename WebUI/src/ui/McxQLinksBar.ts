/**
 * ABDMCX0X -- McxQLinksBar.ts
 * Collapsible 4-knob contextual Q-Links bar driven by McxQLinksModel.ts.
 * Strict line limit: < 175 lines. 0 #hex colors.
 */

import '../styles/mcx-qlinks.css';
import { Knob } from '@abdsynths/shared/components';
import type { McxAppState } from '../app/McxAppState';
import {
  QLINK_CONTEXTS, deserializeQLinkOverrides, getQLinksForContext,
  type QLinkAssignment, type QLinkContext, type QLinkOverrideMap,
} from '../app/McxQLinksModel';
import type { McxHostBridge, McxParamKey } from '../bridge/McxHostBridge';

export interface McxQLinksBarOptions {
  hostEl: HTMLElement;
  bridge: McxHostBridge;
  state: McxAppState;
  toggleBtn?: HTMLElement | null;
}

const STORAGE_QLINKS = 'abdmcx0x.qlinks.v1';
const CTX_LABELS: Record<QLinkContext, string> = { mixer: 'MIX', tone: 'TONE', rack: 'RACK', pads: 'PADS', master: 'MST' };
const PAD_KEY_FALLBACK: Record<string, McxParamKey> = {
  padLevel: 'partLevel', padTune: 'pitchCoarse', padDecay: 'envDecayOffset', padAttack: 'envAttackOffset',
};

export class McxQLinksBar {
  private readonly hostEl: HTMLElement;
  private readonly bridge: McxHostBridge;
  private readonly state: McxAppState;
  private readonly toggleBtn?: HTMLElement | null;
  private context: QLinkContext = 'mixer';
  private autoFollow = true;
  private opened = false;
  private overrides: QLinkOverrideMap = {};
  private knobs: Array<{ knob: Knob; assign: QLinkAssignment; valEl: HTMLElement | null }> = [];

  constructor(opts: McxQLinksBarOptions) {
    this.hostEl = opts.hostEl; this.bridge = opts.bridge; this.state = opts.state; this.toggleBtn = opts.toggleBtn;
    try { this.overrides = deserializeQLinkOverrides(localStorage.getItem(STORAGE_QLINKS) || ''); } catch { this.overrides = {}; }
    this.hostEl.classList.add('mcx-qlinks-bar');
    this.hostEl.hidden = !this.opened;
    this.toggleBtn?.addEventListener('click', () => this.toggle());
    this.render();
  }

  public isOpen(): boolean { return this.opened; }
  public toggle(): void { this.opened ? this.close() : this.open(); }
  public open(): void { this.opened = true; this.hostEl.hidden = false; this.toggleBtn?.classList.add('is-active'); this.toggleBtn?.setAttribute('aria-pressed', 'true'); this.syncValues(); }
  public close(): void { this.opened = false; this.hostEl.hidden = true; this.toggleBtn?.classList.remove('is-active'); this.toggleBtn?.setAttribute('aria-pressed', 'false'); }
  public getContext(): QLinkContext { return this.context; }

  public setContext(ctx: QLinkContext, fromAuto = false): void {
    if (fromAuto && !this.autoFollow) return;
    if (this.context === ctx) { this.syncValues(); return; }
    this.context = ctx;
    this.render();
  }

  public syncAutoContextFromUi(): void {
    if (!this.autoFollow) return;
    if (this.state.refs.padModal?.isOpen()) this.setContext('pads', true);
    else if (this.state.refs.fxRackModal?.isOpen?.()) this.setContext('rack', true);
    else if (this.state.refs.toneDrawer?.isOpen() || this.state.refs.synthModal?.isOpen()) this.setContext('tone', true);
    else this.setContext('mixer', true);
  }

  private readNorm(a: QLinkAssignment): number {
    const p = this.state.focusedPart, ps = this.state.partsState[p];
    if ((a.targetType === 'partParam' || a.targetType === 'send') && ps && typeof (ps as any)[a.paramKey] === 'number') {
      const span = a.max - a.min || 1;
      return Math.max(0, Math.min(1, ((ps as any)[a.paramKey] - a.min) / span));
    }
    if (a.targetType === 'transport' && a.paramKey === 'tempoBpm') {
      return Math.max(0, Math.min(1, (this.state.globalSettings.standaloneBpm - a.min) / (a.max - a.min || 1)));
    }
    return a.defaultNorm;
  }

  private formatRaw(a: QLinkAssignment, norm01: number): string {
    const raw = a.min + norm01 * (a.max - a.min);
    if (a.paramKey === 'tempoBpm') return `${raw.toFixed(0)} BPM`;
    if (a.min < 0) return `${raw >= 0 ? '+' : ''}${Math.round(raw * 100) / 100}`;
    return `${Math.round(norm01 * 100)}%`;
  }

  private dispatch(a: QLinkAssignment, norm01: number): void {
    const p = this.state.focusedPart, ps = this.state.partsState[p];
    const raw = a.min + norm01 * (a.max - a.min);
    if (a.targetType === 'partParam' || a.targetType === 'send') {
      if (ps) (ps as any)[a.paramKey] = raw;
      this.bridge.setParam(p, a.paramKey as McxParamKey, raw);
      this.state.refs.toneDrawer?.updateParamLive?.(a.paramKey as McxParamKey, raw);
    } else if (a.targetType === 'masterParam') {
      if (a.paramKey === 'masterVolume') { this.bridge.setMasterVolume(raw); this.state.refs.masterPanel?.setVolume(raw); }
      else if (a.paramKey === 'masterLimiterCeiling') this.bridge.setLimiterCeilingDb(-12 + raw * 12);
      else this.bridge.setParam(p, 'reverbMacro', raw);
    } else if (a.targetType === 'transport' && a.paramKey === 'tempoBpm') {
      this.state.globalSettings.standaloneBpm = raw;
      this.bridge.setTempo(raw);
      this.state.refs.masterPanel?.setBpm(raw);
    } else if (a.targetType === 'rackParam') {
      this.bridge.setRackSlotParamByKey(0, a.paramKey, norm01);
    } else if (a.targetType === 'padParam') {
      const k = PAD_KEY_FALLBACK[a.paramKey] ?? 'partLevel';
      this.bridge.setParam(p, k, raw);
    }
  }

  public syncValues(): void {
    for (const item of this.knobs) {
      const n = this.readNorm(item.assign);
      item.knob.setValue(n);
      if (item.valEl) item.valEl.textContent = this.formatRaw(item.assign, n);
    }
  }

  private render(): void {
    for (const item of this.knobs) item.knob.destroy();
    this.knobs = [];
    const list = getQLinksForContext(this.context, this.overrides);
    const pills = QLINK_CONTEXTS.map((c) => `<button type="button" class="btn btn-xs btn-outline mcx-qlinks-ctx-btn${c === this.context ? ' is-active' : ''}" data-ql-ctx="${c}">${CTX_LABELS[c]}</button>`).join('');
    const cells = list.map((a, i) => `
      <div class="mcx-qlinks-cell" data-ql-slot="${i}">
        <div class="mcx-qlinks-knob" data-ql-knob="${i}"></div>
        <div class="mcx-qlinks-meta">
          <span class="mcx-qlinks-label" title="${a.label}">${a.label}</span>
          <span class="mcx-qlinks-val" data-ql-val="${i}">${this.formatRaw(a, this.readNorm(a))}</span>
        </div>
      </div>`).join('');
    this.hostEl.innerHTML = `
      <div class="mcx-qlinks-ctx-row">${pills}<button type="button" class="btn btn-xs btn-outline mcx-qlinks-ctx-btn${this.autoFollow ? ' is-active' : ''}" data-ql-auto="1">AUTO</button></div>
      <div class="mcx-qlinks-knobs">${cells}</div>`;
    this.hostEl.querySelectorAll<HTMLElement>('[data-ql-ctx]').forEach((b) => b.addEventListener('click', () => this.setContext(b.dataset.qlCtx as QLinkContext, false)));
    this.hostEl.querySelector('[data-ql-auto]')?.addEventListener('click', () => { this.autoFollow = !this.autoFollow; this.render(); });
    list.forEach((a, i) => {
      const mount = this.hostEl.querySelector<HTMLElement>(`[data-ql-knob="${i}"]`);
      const valEl = this.hostEl.querySelector<HTMLElement>(`[data-ql-val="${i}"]`);
      if (!mount) return;
      const knob = new Knob(mount, {
        size: 26, value: this.readNorm(a), bipolar: a.min < 0,
        onChange: (n) => { if (valEl) valEl.textContent = this.formatRaw(a, n); this.dispatch(a, n); },
      });
      this.knobs.push({ knob, assign: a, valEl });
    });
  }

  public destroy(): void { for (const k of this.knobs) k.knob.destroy(); this.knobs = []; this.hostEl.innerHTML = ''; }
}
/**
 * ABDMCX0X -- McxToneDrawer.ts
 * Bottom-up sliding drawer for deep Tone, Filter, Envelope, EQ, and Aux Send editing.
 * Synchronized directly with the 16-step button strip (PART SEL / PART MUTE)
 * and wired to McxHostBridge with MIDI-Learn ready attributes.
 */

import type { McxHostBridge, McxParamKey } from '../bridge/McxHostBridge';
import type { McxPartUiState } from './McxMixerConsole';
import {
  buildToneDrawerHeaderHtml,
  buildToneDrawerBodyHtml,
  FILTER_MODELS, STRUCTURE_MODES, ROUTE_MODES, GLIDE_MODES,
} from './McxToneDrawerViews';

export interface McxToneDrawerOptions {
  hostEl: HTMLElement; bridge: McxHostBridge;
  getPartState: (idx: number) => McxPartUiState;
  setLcdLine2: (text: string) => void; onClose?: () => void;
}

interface ParamDef {
  param: McxParamKey; def: number; fmt: (v: number) => string; isSelect?: boolean;
}

const PRE_KEYS = ['sendAPre', 'sendBPre', 'sendCPre', 'sendDPre'] as const;

const PARAM_DEFS: ParamDef[] = [
  { param: 'structureMode', def: 0, fmt: (v) => STRUCTURE_MODES[v] || 'Parallel', isSelect: true },
  { param: 'routeMode', def: 0, fmt: (v) => ROUTE_MODES[v] || 'Internal', isSelect: true },
  { param: 'vectorX', def: 0, fmt: (v) => v.toFixed(2) },
  { param: 'vectorY', def: 0, fmt: (v) => v.toFixed(2) },
  { param: 'pitchCoarse', def: 0, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} st` },
  { param: 'pitchFine', def: 0, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct` },
  { param: 'portaTimeMs', def: 60, fmt: (v) => `${Math.round(v)} ms` },
  { param: 'portaLegatoOnly', def: 1, fmt: (v) => GLIDE_MODES[v] || 'Legato', isSelect: true },
  { param: 'filterModel', def: 0, fmt: (v) => FILTER_MODELS[v] || 'SVF', isSelect: true },
  { param: 'filterCutoff', def: 0.72, fmt: (v) => `${Math.round(20 * Math.pow(1000, v))} Hz` },
  { param: 'filterResonance', def: 0.18, fmt: (v) => `${Math.round(v * 100)}%` },
  { param: 'driveAmount', def: 0, fmt: (v) => (v < 0.005 ? 'OFF' : `${Math.round(v * 100)}%`) },
  { param: 'ampAttack', def: 0.04, fmt: (v) => `${Math.round(0.5 + v * v * 2500)} ms` },
  { param: 'ampDecay', def: 0.25, fmt: (v) => `${Math.round(10 + v * 4000)} ms` },
  { param: 'ampSustain', def: 0.75, fmt: (v) => `${Math.round(v * 100)}%` },
  { param: 'ampRelease', def: 0.18, fmt: (v) => `${Math.round(10 + v * 5000)} ms` },
  { param: 'eqLowGain', def: 0, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB` },
  { param: 'eqMidGain', def: 0, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB` },
  { param: 'eqHighGain', def: 0, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB` },
  { param: 'partLevel', def: 0.85, fmt: (v) => `${Math.round(v * 100)}%` },
  { param: 'partPan', def: 0, fmt: (v) => (Math.abs(v) < 0.03 ? 'C' : v < 0 ? `L${Math.round(-v * 64)}` : `R${Math.round(v * 63)}`) },
  { param: 'reverbSend', def: 0.28, fmt: (v) => `${Math.round(v * 100)}%` },
  { param: 'chorusSend', def: 0.20, fmt: (v) => `${Math.round(v * 100)}%` },
  { param: 'delaySend', def: 0, fmt: (v) => `${Math.round(v * 100)}%` },
  { param: 'auxSend', def: 0, fmt: (v) => `${Math.round(v * 100)}%` },
];

export class McxToneDrawer {
  private el: HTMLElement;
  private currentPart = 0;
  private opened = false;
  private bridge: McxHostBridge;
  private getPartState: (idx: number) => McxPartUiState;
  private setLcdLine2: (text: string) => void;
  private onClose?: () => void;

  constructor(opts: McxToneDrawerOptions) {
    this.bridge = opts.bridge;
    this.getPartState = opts.getPartState;
    this.setLcdLine2 = opts.setLcdLine2;
    this.onClose = opts.onClose;

    this.el = document.createElement('div');
    this.el.className = 'mcx-bottom-drawer';
    this.el.id = 'mcx-tone-drawer';
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', 'Tone & FX Drawer');
    this.el.innerHTML = `<div class="mcx-drawer-head-host"></div>${buildToneDrawerBodyHtml()}`;

    opts.hostEl.appendChild(this.el);
    this.bindEvents();
  }

  public open(partIdx: number): void {
    this.currentPart = partIdx;
    this.opened = true;
    this.el.classList.add('is-open');
    this.syncPart(partIdx, this.getPartState(partIdx));
    this.setLcdLine2(`TONE & FX DRAWER [P${String(partIdx + 1).padStart(2, '0')}]`);
  }

  public close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.el.classList.remove('is-open');
    this.onClose?.();
  }

  public toggle(partIdx: number): void {
    if (this.opened && this.currentPart === partIdx) this.close();
    else this.open(partIdx);
  }

  public isOpen(): boolean { return this.opened; }
  public getPart(): number { return this.currentPart; }

  public syncPart(partIdx: number, ps: McxPartUiState): void {
    this.currentPart = partIdx;
    const headHost = this.el.querySelector('.mcx-drawer-head-host');
    if (headHost) headHost.innerHTML = buildToneDrawerHeaderHtml(partIdx, ps);

    this.el.querySelectorAll<HTMLElement>('[data-learnable]').forEach((c) => {
      c.dataset.part = String(partIdx);
    });

    for (const d of PARAM_DEFS) {
      let val = (ps as unknown as Record<string, number | boolean>)[d.param];
      if (typeof val === 'boolean') val = val ? 1 : 0;
      this.updateCardVal(d.param, typeof val === 'number' ? val : d.def, d.fmt, d.isSelect);
    }

    for (const pk of PRE_KEYS) {
      const btn = this.el.querySelector<HTMLButtonElement>(`[data-send-pre="${pk}"]`);
      if (btn) {
        const isPre = Boolean(ps[pk]);
        btn.textContent = isPre ? 'PRE' : 'POST';
        btn.classList.toggle('is-pre', isPre);
      }
    }
  }

  private updateCardVal(param: McxParamKey, val: number, fmt: (v: number) => string, isSelect?: boolean): void {
    const card = this.el.querySelector<HTMLElement>(`.mcx-tone-card[data-param="${param}"]`);
    if (!card) return;
    if (isSelect) {
      const sel = card.querySelector<HTMLSelectElement>('select');
      if (sel) sel.value = String(val);
    } else {
      const input = card.querySelector<HTMLInputElement>('input');
      const valSpan = card.querySelector<HTMLElement>('.mcx-tone-val');
      if (input) input.value = String(val);
      if (valSpan) valSpan.textContent = fmt(val);
    }
  }

  private bindEvents(): void {
    this.el.addEventListener('click', (ev) => {
      const act = (ev.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
      if (act === 'close') { ev.stopPropagation(); this.close(); }
    });

    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && this.opened) this.close();
    });

    for (const d of PARAM_DEFS) {
      const card = this.el.querySelector<HTMLElement>(`.mcx-tone-card[data-param="${d.param}"]`);
      if (!card) continue;
      if (d.isSelect) {
        const sel = card.querySelector<HTMLSelectElement>('select');
        sel?.addEventListener('change', () => {
          const idx = parseInt(sel.value, 10);
          (this.getPartState(this.currentPart) as unknown as Record<string, number | boolean>)[d.param] = idx;
          this.bridge.setParam(this.currentPart, d.param, idx);
          this.setLcdLine2(`P${String(this.currentPart + 1).padStart(2, '0')} ${d.param}: ${d.fmt(idx)}`);
        });
      } else {
        const input = card.querySelector<HTMLInputElement>('input');
        const valEl = card.querySelector<HTMLElement>('.mcx-tone-val');
        input?.addEventListener('input', () => {
          const v = parseFloat(input.value);
          if (valEl) valEl.textContent = d.fmt(v);
          (this.getPartState(this.currentPart) as unknown as Record<string, number>)[d.param] = v;
          if (d.param === 'driveAmount') this.bridge.setParam(this.currentPart, 'driveEnabled', v > 0.005 ? 1 : 0);
          if (d.param.startsWith('eq')) this.bridge.setParam(this.currentPart, 'eqEnabled', 1);
          this.bridge.setParam(this.currentPart, d.param, v);
          this.setLcdLine2(`P${String(this.currentPart + 1).padStart(2, '0')} ${d.param}: ${d.fmt(v)}`);
        });
      }
    }

    this.el.querySelectorAll<HTMLButtonElement>('.mcx-pre-post-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const preKey = btn.dataset.sendPre as typeof PRE_KEYS[number];
        if (!preKey) return;
        const ps = this.getPartState(this.currentPart);
        const newPre = !ps[preKey];
        ps[preKey] = newPre;
        btn.textContent = newPre ? 'PRE' : 'POST';
        btn.classList.toggle('is-pre', newPre);
        this.bridge.setParam(this.currentPart, preKey, newPre ? 1 : 0);
        this.setLcdLine2(`P${String(this.currentPart + 1).padStart(2, '0')} ${preKey.toUpperCase()}: ${newPre ? 'PRE-FADER' : 'POST-FADER'}`);
      });
    });
  }
}

/**
 * ABDMCX0X -- McxToneDrawer.ts
 * Part Settings Console (Voice, Pitch, Glide, Vector, LFO Dual, Dual Filters, Drive, VCA, EQ, Aux Sends, Output & M/S).
 * Strict line limit: < 200 lines.
 */

import type { McxHostBridge, McxParamKey } from '../bridge/McxHostBridge';
import type { McxPartUiState } from './McxMixerConsole';
import { buildToneDrawerHeaderHtml, buildToneDrawerBodyHtml, applySeriesFilterConstraints } from './McxToneDrawerViews';
import { McxToneDrawerKnobsManager } from './McxToneDrawerKnobs';
import { bindLfoEvents, syncLfoCard } from './McxToneDrawerLfo';

export interface McxToneDrawerOptions {
  hostEl: HTMLElement; bridge: McxHostBridge; getPartState: (idx: number) => McxPartUiState; setLcdLine2: (text: string) => void;
  onClose?: () => void; onChangePartChannel?: (idx: number, ch: number) => void;
  onToggleFollowTranspose?: (idx: number) => void; onToggleMute?: (idx: number) => void; onToggleSolo?: (idx: number) => void;
  onRouteModeChange?: (idx: number, mode: number) => void;
}

const PRE_KEYS = ['sendAPre', 'sendBPre', 'sendCPre', 'sendDPre'] as const;
const SEND_KEYS: McxParamKey[] = ['reverbSend', 'chorusSend', 'delaySend', 'auxSend'];
const SEG_KEYS = ['structureMode', 'routeMode', 'portaMode', 'filterMode', 'filterModel', 'filter2Mode', 'filter2Model', 'driveType', 'lfo1Trigger', 'lfo2Trigger'] as const;

export class McxToneDrawer {
  private el: HTMLElement; private currentPart = 0; private opened = false;
  private bridge: McxHostBridge; private getPartState: (idx: number) => McxPartUiState;
  private setLcdLine2: (text: string) => void; private opts: McxToneDrawerOptions;
  private knobsMgr = new McxToneDrawerKnobsManager();

  constructor(opts: McxToneDrawerOptions) {
    this.opts = opts; this.bridge = opts.bridge; this.getPartState = opts.getPartState; this.setLcdLine2 = opts.setLcdLine2;
    this.el = document.createElement('div');
    this.el.className = 'mcx-bottom-drawer'; this.el.id = 'mcx-tone-drawer';
    this.el.setAttribute('role', 'region'); this.el.setAttribute('aria-label', 'Part Settings Drawer');
    this.el.innerHTML = `<div class="mcx-drawer-head-host"></div>${buildToneDrawerBodyHtml()}`;
    opts.hostEl.appendChild(this.el); this.bindEvents();
  }

  public open(partIdx: number, focusSection?: string): void {
    this.currentPart = partIdx; this.opened = true; this.el.classList.add('is-open');
    this.syncPart(partIdx, this.getPartState(partIdx)); this.highlightSection(focusSection);
    this.setLcdLine2(`PART SETTINGS [P${String(partIdx + 1).padStart(2, '0')}]${focusSection ? ` -> ${focusSection.toUpperCase()}` : ''}`);
  }
  public close(): void { if (!this.opened) return; this.opened = false; this.el.classList.remove('is-open'); this.highlightSection(); this.opts.onClose?.(); }
  public toggle(partIdx: number, focusSection?: string): void {
    if (this.opened && this.currentPart === partIdx && !focusSection) this.close(); else this.open(partIdx, focusSection);
  }
  public highlightSection(sec?: string): void {
    this.el.querySelectorAll('.mcx-module-card').forEach((c) => c.classList.remove('is-highlighted'));
    if (sec) { const c = this.el.querySelector(`.mcx-card-${sec}`); if (c) { c.classList.add('is-highlighted'); setTimeout(() => c.classList.remove('is-highlighted'), 4500); } }
  }
  public isOpen(): boolean { return this.opened; }
  public getPart(): number { return this.currentPart; }
  public updateParamLive(param: McxParamKey, rawVal: number): void { (this.getPartState(this.currentPart) as any)[param] = rawVal; if (this.opened) this.knobsMgr.updateSingle(param, rawVal); }
  public updateSendLabels(labels?: { sendA: string; sendB: string; sendC: string; sendD: string }): void {
    if (!labels) return;
    const names = [labels.sendA, labels.sendB, labels.sendC, labels.sendD];
    this.el.querySelectorAll<HTMLElement>('[data-send-target]').forEach((el) => {
      const b = parseInt(el.dataset.sendTarget ?? '-1', 10);
      if (b >= 0 && b < names.length && names[b]) el.textContent = names[b].toUpperCase();
    });
  }
  public updateSendTelemetry(peaks: number[], busMutes?: boolean[]): void {
    if (!this.opened) return;
    this.el.querySelectorAll<HTMLElement>('[data-send-led]').forEach((led) => led.classList.toggle('is-active', (peaks[parseInt(led.dataset.sendLed ?? '-1', 10)] ?? 0) > 0.005));
    if (busMutes) {
      this.el.querySelectorAll<HTMLElement>('[data-bus-badge]').forEach((badge) => {
        const isMuted = Boolean(busMutes[parseInt(badge.dataset.busBadge ?? '-1', 10)]);
        badge.classList.toggle('is-muted', isMuted); badge.textContent = isMuted ? 'MUTE' : 'BUS';
      });
    }
  }
  public updateLfoPhase(phase: number): void {
    if (this.opened) this.el.querySelector('#mcx-lfo-led')?.classList.toggle('is-active', phase > 0);
  }

  public syncPart(partIdx: number, ps: McxPartUiState): void {
    this.currentPart = partIdx;
    const headHost = this.el.querySelector('.mcx-drawer-head-host');
    if (headHost) headHost.innerHTML = buildToneDrawerHeaderHtml(partIdx, ps);
    this.el.querySelectorAll<HTMLElement>('[data-learnable]').forEach((c) => { c.dataset.part = String(partIdx); });
    const chVal = this.el.querySelector('#drawer-ch-val');
    if (chVal) chVal.textContent = `CH ${String(ps.midiChannel || 1).padStart(2, '0')}`;
    const trBtn = this.el.querySelector<HTMLButtonElement>('[data-act="drawer-tr"]');
    if (trBtn) { trBtn.classList.toggle('is-active', ps.followTranspose !== false && ps.kind !== 'drum_map'); trBtn.disabled = ps.kind === 'drum_map'; }
    this.el.querySelector<HTMLButtonElement>('[data-act="drawer-mute"]')?.classList.toggle('is-mute', Boolean(ps.mute));
    this.el.querySelector<HTMLButtonElement>('[data-act="drawer-solo"]')?.classList.toggle('is-solo', Boolean(ps.solo));
    applySeriesFilterConstraints(this.el, ps, this.bridge, this.currentPart);
    for (const k of SEG_KEYS) {
      const v = k === 'portaMode' ? (!ps.portaEnabled ? 0 : (ps.portaLegatoOnly ? 2 : 1)) : ((ps as any)[k] ?? 0);
      this.el.querySelectorAll<HTMLButtonElement>(`.mcx-seg-btn[data-param="${k}"]`).forEach((b) => b.classList.toggle('is-active', parseInt(b.dataset.val ?? '-1', 10) === v));
    }
    for (const pk of PRE_KEYS) {
      const btn = this.el.querySelector<HTMLButtonElement>(`[data-send-pre="${pk}"]`);
      if (btn) { const p = Boolean(ps[pk]); btn.textContent = p ? 'PRE' : 'POST'; btn.classList.toggle('is-pre', p); }
    }
    this.el.querySelectorAll<HTMLButtonElement>('[data-ch-mute]').forEach((btn) => {
      const b = parseInt(btn.dataset.chMute ?? '-1', 10);
      btn.classList.toggle('is-muted', Boolean((ps as any)[`send${String.fromCharCode(65 + b)}Mute`]));
    });
    this.knobsMgr.syncValues(ps);
    syncLfoCard(this.el, ps);
  }

  private handleSegClick(param: typeof SEG_KEYS[number], val: number): void {
    const ps = this.getPartState(this.currentPart) as any;
    ps[param] = val;
    if (param === 'portaMode') {
      ps.portaEnabled = val > 0 ? 1 : 0; ps.portaLegatoOnly = val === 2 ? 1 : 0;
      this.bridge.setParam(this.currentPart, 'portaEnabled', ps.portaEnabled);
      this.bridge.setParam(this.currentPart, 'portaLegatoOnly', ps.portaLegatoOnly);
    } else if (param === 'filterMode') {
      this.bridge.setParam(this.currentPart, 'filterMode', val);
    } else if (param === 'filter2Mode') {
      this.bridge.setParam(this.currentPart, 'filter2Mode', val);
      this.bridge.setParam(this.currentPart, 'filter2Enabled', val < 3 ? 1 : 0);
    } else {
      this.bridge.setParam(this.currentPart, param as McxParamKey, val);
      if (param === 'routeMode') this.opts.onRouteModeChange?.(this.currentPart, val);
    }
    this.syncPart(this.currentPart, ps);
    this.setLcdLine2(`P${String(this.currentPart + 1).padStart(2, '0')} ${param}: ${val}`);
  }

  private bindEvents(): void {
    this.el.addEventListener('click', (ev) => {
      const tgt = ev.target as HTMLElement;
      if (tgt.closest('[data-act="close"]')) { ev.stopPropagation(); this.close(); return; }
      const act = tgt.closest('[data-act]')?.getAttribute('data-act'), ps = this.getPartState(this.currentPart);
      if (act === 'drawer-ch-dec' || act === 'drawer-ch-inc') {
        ev.stopPropagation(); const ch = Math.min(16, Math.max(1, (ps.midiChannel || 1) + (act === 'drawer-ch-inc' ? 1 : -1)));
        ps.midiChannel = ch; this.bridge.setParam(this.currentPart, 'partMidiChannel', ch);
        this.opts.onChangePartChannel?.(this.currentPart, ch); this.syncPart(this.currentPart, ps);
      } else if (act === 'drawer-tr') {
        ev.stopPropagation(); this.opts.onToggleFollowTranspose?.(this.currentPart); this.syncPart(this.currentPart, this.getPartState(this.currentPart));
      } else if (act === 'drawer-mute') {
        ev.stopPropagation(); this.opts.onToggleMute?.(this.currentPart); this.syncPart(this.currentPart, this.getPartState(this.currentPart));
      } else if (act === 'drawer-solo') {
        ev.stopPropagation(); this.opts.onToggleSolo?.(this.currentPart); this.syncPart(this.currentPart, this.getPartState(this.currentPart));
      }
      const segBtn = tgt.closest<HTMLButtonElement>('.mcx-seg-btn[data-param]');
      if (segBtn && !segBtn.disabled) {
        ev.stopPropagation(); this.handleSegClick(segBtn.dataset.param as typeof SEG_KEYS[number], parseInt(segBtn.dataset.val ?? '0', 10));
      }
    });
    window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && this.opened) this.close(); });

    this.knobsMgr.mount(this.el, (param: McxParamKey, val: number, fmtTxt: string) => {
      const ps = this.getPartState(this.currentPart) as any;
      ps[param] = val;
      if (param === 'driveAmount') this.bridge.setParam(this.currentPart, 'driveEnabled', val > 0.005 ? 1 : 0);
      else if (param.startsWith('eq')) this.bridge.setParam(this.currentPart, 'eqEnabled', 1);
      else if (param.startsWith('filter2')) this.bridge.setParam(this.currentPart, 'filter2Enabled', 1);
      this.bridge.setParam(this.currentPart, param, val);
      this.setLcdLine2(`P${String(this.currentPart + 1).padStart(2, '0')} ${param}: ${fmtTxt}`);
    });

    bindLfoEvents(this.el, () => this.currentPart, (param, val, txt) => {
      const ps = this.getPartState(this.currentPart) as any;
      ps[param] = val; this.bridge.setParam(this.currentPart, param, val);
      if (param === 'lfo1Sync' || param === 'lfo2Sync') {
        const idx = param === 'lfo1Sync' ? 1 : 2, rKey = idx === 1 ? 'lfo1Rate' : 'lfo2Rate', isSync = Boolean(val);
        if (isSync && (ps[rKey] === undefined || ps[rKey] > 19)) { ps[rKey] = 7; this.bridge.setParam(this.currentPart, rKey, 7); }
        else if (!isSync && (ps[rKey] === undefined || (ps[rKey] <= 19 && Number.isInteger(ps[rKey])))) {
          ps[rKey] = idx === 1 ? 2.4 : 1.2; this.bridge.setParam(this.currentPart, rKey, ps[rKey]);
        }
        this.knobsMgr.setLfoSync(idx, isSync, ps[rKey]);
      }
      this.setLcdLine2(`P${String(this.currentPart + 1).padStart(2, '0')} ${param}: ${txt}`);
    });

    this.el.querySelectorAll<HTMLButtonElement>('.mcx-pre-post-btn').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation(); const pk = b.dataset.sendPre as typeof PRE_KEYS[number]; if (!pk) return;
        const ps = this.getPartState(this.currentPart), n = !ps[pk]; ps[pk] = n;
        b.textContent = n ? 'PRE' : 'POST'; b.classList.toggle('is-pre', n);
        this.bridge.setParam(this.currentPart, pk, n ? 1 : 0);
        this.setLcdLine2(`P${String(this.currentPart + 1).padStart(2, '0')} ${pk.toUpperCase()}: ${n ? 'PRE' : 'POST'}`);
      });
    });

    this.el.querySelectorAll<HTMLButtonElement>('[data-ch-mute]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation(); const idx = parseInt(b.dataset.chMute ?? '-1', 10), ps = this.getPartState(this.currentPart) as any;
        const mKey = `send${String.fromCharCode(65 + idx)}Mute`, n = !ps[mKey], pKey = SEND_KEYS[idx];
        ps[mKey] = n; b.classList.toggle('is-muted', n);
        const r = n ? (ps[`_mem_${pKey}`] = ps[pKey] ?? 0.25, 0) : (ps[`_mem_${pKey}`] ?? 0.25);
        ps[pKey] = r; this.bridge.setParam(this.currentPart, pKey, r);
        this.knobsMgr.syncValues(ps);
        this.setLcdLine2(`P${String(this.currentPart + 1).padStart(2, '0')} SEND ${String.fromCharCode(65 + idx)}: ${n ? 'MUTED' : 'ACTIVE'}`);
      });
    });
  }

  public destroy(): void { this.knobsMgr.destroy(); this.el.remove(); }
}

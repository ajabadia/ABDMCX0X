/**
 * ABDMCX0X -- McxMegamixModal.ts
 * Modeless bar-quantized Megamix UI wrapping McxMegamixController.
 * Strict line limit: < 140 lines. 0 #hex colors.
 */

import '../styles/mcx-megamix.css';
import { attachDialogDrag, bringToFront } from '@abdsynths/shared/diagnostic-probe';
import type { McxMegamixController } from '../app/McxMegamixController';
import { pickJsonFile } from '../app/McxPerformancePersistence';

export class McxMegamixModal {
  private readonly dialog: HTMLDialogElement;
  private readonly ctrl: McxMegamixController;
  private readonly isPlayingFn: () => boolean;
  private readonly onEscKey: (ev: KeyboardEvent) => void;

  constructor(ctrl: McxMegamixController, isPlayingFn: () => boolean) {
    this.ctrl = ctrl;
    this.isPlayingFn = isPlayingFn;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'mcx-megamix-dialog';
    this.dialog.setAttribute('aria-label', 'Megamix Live Switcher');
    document.body.appendChild(this.dialog);
    this.onEscKey = (ev) => { if (ev.key === 'Escape' && this.dialog.open) this.close(); };
    this.dialog.addEventListener('close', () => window.removeEventListener('keydown', this.onEscKey));
    this.bindEvents();
  }

  public isOpen(): boolean { return this.dialog.open; }
  public toggle(): void { if (this.dialog.open) this.close(); else this.open(); }
  public open(): void {
    this.syncTheme(); this.render();
    if (!this.dialog.open) (typeof this.dialog.show === 'function' ? this.dialog.show() : this.dialog.setAttribute('open', ''));
    window.addEventListener('keydown', this.onEscKey); bringToFront(this.dialog);
  }
  public close(): void {
    window.removeEventListener('keydown', this.onEscKey);
    if (this.dialog.open) (typeof this.dialog.close === 'function' ? this.dialog.close() : this.dialog.removeAttribute('open'));
  }
  public syncTheme(): void { const t = document.documentElement.getAttribute('data-theme'); if (t) this.dialog.setAttribute('data-theme', t); }
  public refresh(): void { if (this.dialog.open) this.render(); }

  private render(): void {
    const q = this.ctrl.quantizeBars, lock = this.ctrl.keepTempo;
    const cards = this.ctrl.slots.map((s, i) => {
      const cls = ['mcx-megamix-card', this.ctrl.activeIndex === i ? 'is-active' : '', this.ctrl.queuedIndex === i ? 'is-queued' : '', !s ? 'is-empty' : ''].filter(Boolean).join(' ');
      const stateTag = this.ctrl.queuedIndex === i ? 'QUEUED' : (this.ctrl.activeIndex === i ? 'LIVE' : (s ? `${Math.round(s.bpm)} BPM` : 'EMPTY'));
      return `
        <div class="${cls}" data-mx-slot="${i}">
          <div class="mcx-megamix-slot-top"><strong>M${i + 1}</strong><span class="mcx-megamix-meta">${stateTag}</span></div>
          <div class="mcx-megamix-name">${s ? s.name : 'Empty Slot'}</div>
          <div class="mcx-megamix-acts">
            <button type="button" class="btn btn-xs btn-outline" data-mx-act="cap" data-slot="${i}">CAP</button>
            <button type="button" class="btn btn-xs btn-outline" data-mx-act="load" data-slot="${i}">LOAD</button>
            ${s ? `<button type="button" class="btn btn-xs btn-outline${this.ctrl.queuedIndex === i ? ' is-active' : ''}" data-mx-act="go" data-slot="${i}">GO</button>` : ''}
            ${s ? `<button type="button" class="btn btn-xs btn-outline" data-mx-act="clr" data-slot="${i}">✕</button>` : ''}
          </div>
        </div>`;
    }).join('');

    this.dialog.innerHTML = `
      <div class="mcx-megamix-head" data-mx-drag>
        <span class="mcx-megamix-title">MEGAMIX · BAR-QUANTIZED PROJECT LAUNCHER</span>
        <div class="mcx-megamix-controls">
          <button type="button" class="btn btn-xs btn-outline" data-mx-act="qbars">Q: ${q}B</button>
          <button type="button" class="btn btn-xs btn-outline${lock ? ' is-active' : ''}" data-mx-act="bpm-lock">BPM: ${lock ? 'LOCK' : 'PROJ'}</button>
          <button type="button" class="btn btn-xs btn-outline" data-mx-act="close">✕ Close</button>
        </div>
      </div>
      <div class="mcx-megamix-grid">${cards}</div>`;
    const head = this.dialog.querySelector<HTMLElement>('[data-mx-drag]');
    if (head) attachDialogDrag(this.dialog, head);
  }

  private bindEvents(): void {
    this.dialog.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-mx-act]');
      if (!btn) return;
      const act = btn.dataset.mxAct, idx = Number(btn.dataset.slot ?? -1);
      if (act === 'close') this.close();
      else if (act === 'qbars') this.ctrl.setQuantizeBars(this.ctrl.quantizeBars === 1 ? 2 : (this.ctrl.quantizeBars === 2 ? 4 : 1));
      else if (act === 'bpm-lock') this.ctrl.setKeepTempo(!this.ctrl.keepTempo);
      else if (act === 'cap') this.ctrl.captureCurrent(idx);
      else if (act === 'load') pickJsonFile('.mcxprj,.json', (txt, fn) => this.ctrl.loadProjectJson(idx, fn.replace(/\.(mcxprj|json)$/i, ''), txt));
      else if (act === 'go') this.ctrl.queueSlot(idx, this.isPlayingFn());
      else if (act === 'clr') this.ctrl.clearSlot(idx);
    });
  }

  public destroy(): void { window.removeEventListener('keydown', this.onEscKey); this.dialog.remove(); }
}
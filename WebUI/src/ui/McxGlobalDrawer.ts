/**
 * ABDMCX0X -- McxGlobalDrawer.ts
 * Right-side sliding drawer for Global Master Bus, D/A Character, Master Volume,
 * Global Transpose, and Extended Part Parameters. Higher z-index than bottom drawers.
 */

import type { McxHostBridge, McxParamKey } from '../bridge/McxHostBridge';
import { t } from '../i18n/mcxI18n';

export const REVERB_MACROS = ['Room 1', 'Room 2', 'Room 3', 'Hall 1', 'Hall 2', 'Plate', 'Delay', 'Pan Delay'];
export const CHORUS_MACROS = ['Chorus 1', 'Chorus 2', 'Chorus 3', 'Chorus 4', 'FB Chorus', 'Flanger', 'Short Dly', 'Short Dly FB'];
export const DAC_MODES = ['HD Studio', '90s 16-bit', 'Vintage 12-bit'];

export interface McxGlobalDrawerOptions {
  hostEl: HTMLElement; bridge: McxHostBridge;
  setLcdLine2: (text: string) => void; onClose?: () => void;
}

export class McxGlobalDrawer {
  private el: HTMLElement;
  private opened = false;
  private bridge: McxHostBridge;
  private setLcdLine2: (text: string) => void;
  private onClose?: () => void;
  private globalTranspose = 0;
  private masterVol = 0.85;

  constructor(opts: McxGlobalDrawerOptions) {
    this.bridge = opts.bridge;
    this.setLcdLine2 = opts.setLcdLine2;
    this.onClose = opts.onClose;

    this.el = document.createElement('div');
    this.el.className = 'mcx-right-drawer mcx-global-drawer';
    this.el.id = 'mcx-global-drawer';
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', 'Global & Master Drawer');
    this.el.innerHTML = this.buildHtml();

    opts.hostEl.appendChild(this.el);
    this.bindEvents();
  }

  private buildHtml(): string {
    return `
      <div class="mcx-drawer-head">
        <div class="mcx-drawer-title-row">
          <span class="mcx-drawer-title-accent">GLOBAL</span>
          <h3 class="mcx-drawer-title" data-i18n="mcx.globalDrawerTitle">${t('mcx.globalDrawerTitle')}</h3>
        </div>
        <button type="button" class="mcx-drawer-close-btn" data-act="close" title="${t('mcx.closeDrawer')}" aria-label="${t('mcx.closeDrawer')}">✕</button>
      </div>

      <div class="mcx-drawer-body mcx-global-body">
        <!-- Section 1: Master Output & Transpose -->
        <section class="mcx-tone-section">
          <div class="mcx-section-head">
            <span class="mcx-section-title" data-i18n="mcx.masterOutputSection">${t('mcx.masterOutputSection')}</span>
          </div>
          <div class="mcx-tone-cards-row">
            <div class="mcx-tone-card">
              <span class="mcx-tone-lbl" data-i18n="mcx.masterVol">${t('mcx.masterVol')}</span>
              <input type="range" id="g-master-vol" class="mcx-tone-slider" min="0" max="1" step="0.01" value="0.85" />
              <span class="mcx-tone-val" id="g-master-vol-val">85%</span>
            </div>
            <div class="mcx-tone-card">
              <span class="mcx-tone-lbl" data-i18n="mcx.transposeLabel">${t('mcx.transposeLabel')}</span>
              <div class="mcx-live-trans-row" style="margin-top: 4px;">
                <button type="button" class="mcx-trans-btn" id="g-trans-down">-</button>
                <span class="mcx-trans-val" id="g-trans-val">0</span>
                <button type="button" class="mcx-trans-btn" id="g-trans-up">+</button>
              </div>
            </div>
          </div>
        </section>

        <!-- Section 2: Bus Master FX & D/A Character -->
        <section class="mcx-tone-section mcx-tone-section--global">
          <div class="mcx-section-head">
            <span class="mcx-section-title" data-i18n="mcx.masterFxSection">${t('mcx.masterFxSection')}</span>
          </div>
          <div class="mcx-tone-cards-row">
            <div class="mcx-tone-card" data-param="dacCharacter">
              <span class="mcx-tone-lbl" data-i18n="mcx.dacCharacter">${t('mcx.dacCharacter')}</span>
              <select class="mcx-tone-select" id="g-dac-character">${DAC_MODES.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select>
            </div>
            <div class="mcx-tone-card" data-param="reverbMacro">
              <span class="mcx-tone-lbl" data-i18n="mcx.reverbMacro">${t('mcx.reverbMacro')}</span>
              <select class="mcx-tone-select" id="g-reverb-macro">${REVERB_MACROS.map((r, i) => `<option value="${i}">${r}</option>`).join('')}</select>
            </div>
            <div class="mcx-tone-card" data-param="reverbTime">
              <span class="mcx-tone-lbl" data-i18n="mcx.reverbTime">${t('mcx.reverbTime')}</span>
              <input type="range" class="mcx-tone-slider" id="g-reverb-time" min="0" max="1" step="0.01" value="0.5" />
              <span class="mcx-tone-val" id="g-reverb-time-val">50%</span>
            </div>
            <div class="mcx-tone-card" data-param="chorusMacro">
              <span class="mcx-tone-lbl" data-i18n="mcx.chorusMacro">${t('mcx.chorusMacro')}</span>
              <select class="mcx-tone-select" id="g-chorus-macro">${CHORUS_MACROS.map((c, i) => `<option value="${i}">${c}</option>`).join('')}</select>
            </div>
            <div class="mcx-tone-card" data-param="chorusRate">
              <span class="mcx-tone-lbl" data-i18n="mcx.chorusRate">${t('mcx.chorusRate')}</span>
              <input type="range" class="mcx-tone-slider" id="g-chorus-rate" min="0" max="1" step="0.01" value="0.5" />
              <span class="mcx-tone-val" id="g-chorus-rate-val">50%</span>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  public open(): void {
    this.opened = true;
    this.el.classList.add('is-open');
    this.setLcdLine2(`GLOBAL SESSION DRAWER OPEN`);
  }

  public close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.el.classList.remove('is-open');
    this.onClose?.();
  }

  public toggle(): void {
    if (this.opened) this.close();
    else this.open();
  }

  public isOpen(): boolean { return this.opened; }

  public setMasterVolume(v: number): void {
    this.masterVol = v;
    const input = this.el.querySelector<HTMLInputElement>('#g-master-vol');
    const val = this.el.querySelector<HTMLElement>('#g-master-vol-val');
    if (input) input.value = String(v);
    if (val) val.textContent = `${Math.round(v * 100)}%`;
  }

  public setGlobalTranspose(val: number): void {
    this.globalTranspose = Math.max(-24, Math.min(24, Math.round(val)));
    const el = this.el.querySelector<HTMLElement>('#g-trans-val');
    if (el) el.textContent = `${this.globalTranspose > 0 ? '+' : ''}${this.globalTranspose}`;
  }

  private bindEvents(): void {
    this.el.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('[data-act="close"]')) { ev.stopPropagation(); this.close(); }
    });
    window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && this.opened) this.close(); });

    const volSlider = this.el.querySelector<HTMLInputElement>('#g-master-vol');
    const volVal = this.el.querySelector<HTMLElement>('#g-master-vol-val');
    volSlider?.addEventListener('input', () => {
      const v = parseFloat(volSlider.value);
      if (volVal) volVal.textContent = `${Math.round(v * 100)}%`;
      this.bridge.setMasterVolume(v);
      this.setLcdLine2(`MASTER VOL: ${Math.round(v * 100)}%`);
    });

    const updateTrans = (st: number) => {
      this.setGlobalTranspose(st);
      this.bridge.setParam(0, 'globalTranspose', this.globalTranspose);
      this.setLcdLine2(`GLOBAL TRANSPOSE: ${this.globalTranspose > 0 ? '+' : ''}${this.globalTranspose} st`);
    };

    this.el.querySelector('#g-trans-down')?.addEventListener('click', () => updateTrans(this.globalTranspose - 1));
    this.el.querySelector('#g-trans-up')?.addEventListener('click', () => updateTrans(this.globalTranspose + 1));
    this.el.querySelector('#g-trans-val')?.addEventListener('click', () => updateTrans(0));

    const bindSel = (id: string, param: McxParamKey, labels: string[]) => {
      const sel = this.el.querySelector<HTMLSelectElement>(id);
      sel?.addEventListener('change', () => {
        const idx = parseInt(sel.value, 10);
        this.bridge.setParam(0, param, idx);
        this.setLcdLine2(`${param}: ${labels[idx] || idx}`);
      });
    };
    bindSel('#g-dac-character', 'dacCharacter', DAC_MODES);
    bindSel('#g-reverb-macro', 'reverbMacro', REVERB_MACROS);
    bindSel('#g-chorus-macro', 'chorusMacro', CHORUS_MACROS);

    const bindSlider = (id: string, valId: string, param: McxParamKey) => {
      const input = this.el.querySelector<HTMLInputElement>(id);
      const valEl = this.el.querySelector<HTMLElement>(valId);
      input?.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (valEl) valEl.textContent = `${Math.round(v * 100)}%`;
        this.bridge.setParam(0, param, v);
        this.setLcdLine2(`${param}: ${Math.round(v * 100)}%`);
      });
    };
    bindSlider('#g-reverb-time', '#g-reverb-time-val', 'reverbTime');
    bindSlider('#g-chorus-rate', '#g-chorus-rate-val', 'chorusRate');
  }
}

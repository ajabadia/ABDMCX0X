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
  onOpenFxRack?: () => void;
  onMasterVolumeChange?: (v: number) => void;
  onGlobalTransposeChange?: (st: number) => void;
}

export class McxGlobalDrawer {
  private el: HTMLElement; private opened = false; private bridge: McxHostBridge;
  private setLcdLine2: (text: string) => void; private opts: McxGlobalDrawerOptions;
  private globalTranspose = 0; private masterVol = 0.85;
  private dacIdx = 0; private revIdx = 0; private revTime = 0.5; private choIdx = 0; private choRate = 0.5;
  private onEscKey = (ev: KeyboardEvent): void => { if (ev.key === 'Escape' && this.opened) this.close(); };

  constructor(opts: McxGlobalDrawerOptions) {
    this.opts = opts; this.bridge = opts.bridge; this.setLcdLine2 = opts.setLcdLine2;
    this.el = document.createElement('div');
    this.el.className = 'mcx-right-drawer mcx-global-drawer';
    this.el.id = 'mcx-global-drawer';
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', 'Global & Master Drawer');
    this.el.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('[data-act="close"]')) { ev.stopPropagation(); this.close(); }
    });
    this.el.innerHTML = this.buildHtml();
    opts.hostEl.appendChild(this.el);
    this.bindDomChildren();
  }

  private buildHtml(): string {
    return `
      <div class="mcx-drawer-head">
        <div class="mcx-drawer-title-row">
          <span class="mcx-drawer-title-accent">GLOBAL</span>
          <h3 class="mcx-drawer-title" data-i18n="mcx.globalDrawerTitle">${t('mcx.globalDrawerTitle') || 'SESIÓN & SALIDA MASTER'}</h3>
        </div>
        <button type="button" class="mcx-drawer-close-btn" data-act="close" title="${t('mcx.closeDrawer') || 'Cerrar'}" aria-label="${t('mcx.closeDrawer') || 'Cerrar'}"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
      </div>
      <div class="mcx-drawer-body mcx-global-body">
        <section class="mcx-module-card mcx-card-global-out">
          <div class="mcx-module-head"><span class="mcx-module-title">${t('mcx.masterOutputSection') || 'SALIDA MAESTRA & TRANSPOSICIÓN'}</span><span class="mcx-module-badge">BUS</span></div>
          <div class="mcx-global-card-body">
            <div class="mcx-global-field">
              <div class="mcx-global-field-head"><span class="mcx-global-field-lbl">${t('mcx.masterVol') || 'Nivel Master'}</span><span class="mcx-global-field-val" id="g-master-vol-val">85%</span></div>
              <input type="range" id="g-master-vol" class="mcx-strip-fader mcx-global-slider" min="0" max="1" step="0.01" value="0.85" />
            </div>
            <div class="mcx-global-field">
              <div class="mcx-global-field-head"><span class="mcx-global-field-lbl">${t('mcx.transposeLabel') || 'Transposición Global'}</span></div>
              <div class="mcx-live-trans-row">
                <button type="button" class="mcx-trans-btn" id="g-trans-down">-</button>
                <span class="mcx-trans-val" id="g-trans-val" title="Clic para resetear a 0">0</span>
                <button type="button" class="mcx-trans-btn" id="g-trans-up">+</button>
              </div>
            </div>
          </div>
        </section>
        <section class="mcx-module-card mcx-card-global-fx">
          <div class="mcx-module-head"><span class="mcx-module-title">${t('mcx.masterFxSection') || 'BUS MASTER FX & CONVERTIDOR D/A'}</span><span class="mcx-module-badge">DSP</span></div>
          <div class="mcx-global-card-body">
            <div class="mcx-global-field"><span class="mcx-global-field-lbl">${t('mcx.dacCharacter') || 'Carácter D/A Vintage'}</span><select class="mcx-global-select" id="g-dac-character">${DAC_MODES.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></div>
            <div class="mcx-global-field"><span class="mcx-global-field-lbl">${t('mcx.reverbMacro') || 'Macro Reverb Master'}</span><select class="mcx-global-select" id="g-reverb-macro">${REVERB_MACROS.map((r, i) => `<option value="${i}">${r}</option>`).join('')}</select></div>
            <div class="mcx-global-field">
              <div class="mcx-global-field-head"><span class="mcx-global-field-lbl">${t('mcx.reverbTime') || 'Tiempo Reverb'}</span><span class="mcx-global-field-val" id="g-reverb-time-val">${Math.round(this.revTime * 100)}%</span></div>
              <input type="range" class="mcx-global-slider" id="g-reverb-time" min="0" max="1" step="0.01" value="${this.revTime}" />
            </div>
            <div class="mcx-global-field"><span class="mcx-global-field-lbl">${t('mcx.chorusMacro') || 'Macro Chorus Master'}</span><select class="mcx-global-select" id="g-chorus-macro">${CHORUS_MACROS.map((c, i) => `<option value="${i}">${c}</option>`).join('')}</select></div>
            <div class="mcx-global-field">
              <div class="mcx-global-field-head"><span class="mcx-global-field-lbl">${t('mcx.chorusRate') || 'Velocidad Chorus'}</span><span class="mcx-global-field-val" id="g-chorus-rate-val">${Math.round(this.choRate * 100)}%</span></div>
              <input type="range" class="mcx-global-slider" id="g-chorus-rate" min="0" max="1" step="0.01" value="${this.choRate}" />
            </div>
            <p class="mcx-midifx-hint" id="g-legacy-fx-note">${t('mcx.legacyFxNote')}</p>
            <button type="button" class="mcx-global-rack-launch-btn" id="g-open-full-rack">${t('mcx.openFullRack')} <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M7 3l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </div>
        </section>
      </div>
    `;
  }

  public refreshLocale(): void {
    this.el.innerHTML = this.buildHtml();
    this.bindDomChildren();
    this.setMasterVolume(this.masterVol);
    this.setGlobalTranspose(this.globalTranspose);
    this.syncFromSession({ dacCharacter: this.dacIdx, reverbMacro: this.revIdx, chorusMacro: this.choIdx });
    const revInput = this.el.querySelector<HTMLInputElement>('#g-reverb-time'), revVal = this.el.querySelector<HTMLElement>('#g-reverb-time-val');
    if (revInput) revInput.value = String(this.revTime);
    if (revVal) revVal.textContent = `${Math.round(this.revTime * 100)}%`;
  }

  public open(): void { this.opened = true; this.el.classList.add('is-open'); window.addEventListener('keydown', this.onEscKey); this.setLcdLine2('GLOBAL SESSION DRAWER OPEN'); }
  public close(): void { if (!this.opened) return; this.opened = false; this.el.classList.remove('is-open'); window.removeEventListener('keydown', this.onEscKey); this.opts.onClose?.(); }
  public destroy(): void { window.removeEventListener('keydown', this.onEscKey); this.el.remove(); }
  public toggle(): void { if (this.opened) this.close(); else this.open(); }
  public isOpen(): boolean { return this.opened; }

  public setMasterVolume(v: number): void {
    this.masterVol = v;
    const input = this.el.querySelector<HTMLInputElement>('#g-master-vol'), val = this.el.querySelector<HTMLElement>('#g-master-vol-val');
    if (input) input.value = String(v);
    if (val) val.textContent = `${Math.round(v * 100)}%`;
  }

  public setGlobalTranspose(val: number): void {
    this.globalTranspose = Math.max(-24, Math.min(24, Math.round(val)));
    const el = this.el.querySelector<HTMLElement>('#g-trans-val');
    if (el) el.textContent = `${this.globalTranspose > 0 ? '+' : ''}${this.globalTranspose}`;
  }

  public syncFromSession(dto: { masterGain?: number; globalTranspose?: number; dacCharacter?: number; reverbMacro?: number; chorusMacro?: number }): void {
    if (typeof dto.masterGain === 'number') this.setMasterVolume(dto.masterGain);
    if (typeof dto.globalTranspose === 'number') this.setGlobalTranspose(dto.globalTranspose);
    if (typeof dto.dacCharacter === 'number') this.dacIdx = dto.dacCharacter;
    if (typeof dto.reverbMacro === 'number') this.revIdx = dto.reverbMacro;
    if (typeof dto.chorusMacro === 'number') this.choIdx = dto.chorusMacro;
    const setSel = (id: string, val?: number) => { const s = this.el.querySelector<HTMLSelectElement>(id); if (s && typeof val === 'number') s.value = String(val); };
    setSel('#g-dac-character', dto.dacCharacter);
    setSel('#g-reverb-macro', dto.reverbMacro);
    setSel('#g-chorus-macro', dto.chorusMacro);
  }

  private bindDomChildren(): void {
    this.el.querySelector('#g-open-full-rack')?.addEventListener('click', () => { this.close(); this.opts.onOpenFxRack?.(); });

    const volSlider = this.el.querySelector<HTMLInputElement>('#g-master-vol');
    const volVal = this.el.querySelector<HTMLElement>('#g-master-vol-val');
    volSlider?.addEventListener('input', () => {
      const v = parseFloat(volSlider.value);
      this.masterVol = v; if (volVal) volVal.textContent = `${Math.round(v * 100)}%`;
      this.bridge.setMasterVolume(v); this.opts.onMasterVolumeChange?.(v);
      this.setLcdLine2(`MASTER VOL: ${Math.round(v * 100)}%`);
    });

    const updateTrans = (st: number) => {
      this.setGlobalTranspose(st);
      this.bridge.setParam(0, 'globalTranspose', this.globalTranspose);
      this.opts.onGlobalTransposeChange?.(this.globalTranspose);
      this.setLcdLine2(`GLOBAL TRANSPOSE: ${this.globalTranspose > 0 ? '+' : ''}${this.globalTranspose} st`);
    };
    this.el.querySelector('#g-trans-down')?.addEventListener('click', () => updateTrans(this.globalTranspose - 1));
    this.el.querySelector('#g-trans-up')?.addEventListener('click', () => updateTrans(this.globalTranspose + 1));
    this.el.querySelector('#g-trans-val')?.addEventListener('click', () => updateTrans(0));

    const bindSel = (id: string, param: McxParamKey, labels: string[], onIdx: (n: number) => void) => {
      this.el.querySelector<HTMLSelectElement>(id)?.addEventListener('change', (e) => {
        const idx = parseInt((e.target as HTMLSelectElement).value, 10);
        onIdx(idx); this.bridge.setParam(0, param, idx);
        this.setLcdLine2(`${param}: ${labels[idx] || idx}`);
      });
    };
    bindSel('#g-dac-character', 'dacCharacter', DAC_MODES, (n) => { this.dacIdx = n; });
    bindSel('#g-reverb-macro', 'reverbMacro', REVERB_MACROS, (n) => { this.revIdx = n; });
    bindSel('#g-chorus-macro', 'chorusMacro', CHORUS_MACROS, (n) => { this.choIdx = n; });

    const bindSlider = (id: string, valId: string, param: McxParamKey, onVal: (v: number) => void) => {
      const input = this.el.querySelector<HTMLInputElement>(id);
      const valEl = this.el.querySelector<HTMLElement>(valId);
      input?.addEventListener('input', () => {
        const v = parseFloat(input.value);
        onVal(v); if (valEl) valEl.textContent = `${Math.round(v * 100)}%`;
        this.bridge.setParam(0, param, v);
        this.setLcdLine2(`${param}: ${Math.round(v * 100)}%`);
      });
    };
    bindSlider('#g-reverb-time', '#g-reverb-time-val', 'reverbTime', (v) => { this.revTime = v; });
    bindSlider('#g-chorus-rate', '#g-chorus-rate-val', 'chorusRate', (v) => { this.choRate = v; });
  }
}

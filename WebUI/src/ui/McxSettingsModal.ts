/**
 * ABDMCX0X -- McxSettingsModal.ts (Slice 1)
 * Level-1 Global Synth Settings modal (floating draggable <dialog>, 100% ABDShared tokenized + i18n).
 */

import { attachDialogDrag } from '@abdsynths/shared/diagnostic-probe/DiagnosticProbeI18n.js';
import type { McxHostBridge, McxSystemSettingsDto } from '../bridge/McxHostBridge';
import { t } from '../i18n/mcxI18n';

export interface SettingsModalCallbacks {
  bridge: McxHostBridge;
  onSettingsApplied: (settings: McxSystemSettingsDto) => void;
}

export class McxSettingsModal {
  private dialog: HTMLDialogElement;
  private cb: SettingsModalCallbacks;
  private state: McxSystemSettingsDto;

  constructor(cb: SettingsModalCallbacks) {
    this.cb = cb;
    this.state = cb.bridge.loadLocalSettingsFallback();
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'abd-probe-dialog mcx-settings-dialog';
    this.dialog.setAttribute('aria-labelledby', 'mcx-settings-title');
    document.body.appendChild(this.dialog);
    this.render();
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && this.dialog.open) this.dialog.close();
    });
  }

  public getState(): McxSystemSettingsDto { return { ...this.state }; }

  public syncFromHost(next: McxSystemSettingsDto): void {
    this.state = { ...this.state, ...next };
    this.render();
    this.cb.onSettingsApplied(this.getState());
  }

  public refreshLocale(): void { this.render(); }

  public open(): void {
    this.syncTheme();
    this.render();
    if (!this.dialog.open) this.dialog.show();
  }

  public toggle(): void {
    if (this.dialog.open) this.dialog.close();
    else this.open();
  }

  public syncTheme(): void {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme) this.dialog.setAttribute('data-theme', theme);
  }

  private render(): void {
    const sr = Math.round(this.cb.bridge.getSampleRate());
    this.dialog.innerHTML = `
      <div class="abd-probe-shell">
        <div class="abd-probe-header">
          <div>
            <h2 class="abd-probe-title" id="mcx-settings-title">${t('mcx.settingsTitle')}</h2>
            <p class="abd-probe-subtitle">${t('mcx.settingsSubtitle')}</p>
          </div>
          <button type="button" class="abd-probe-close" data-role="close" aria-label="${t('mcx.close')}">&times;</button>
        </div>

        <div class="mcx-settings-grid">
          <div class="mcx-settings-field mcx-settings-field--full">
            <label class="abd-probe-section-label">${t('mcx.settingsWorkDir')}</label>
            <div class="mcx-settings-row">
              <input type="text" class="mcx-text-input" id="set-workdir" value="${this.state.workingDirectory}" placeholder="${t('mcx.settingsWorkDirPlaceholder')}" />
              ${this.cb.bridge.isNative ? `<button type="button" class="mcx-btn" id="btn-browse-dir">${t('mcx.settingsBrowse')}</button>` : ''}
            </div>
            <span class="abd-probe-subtitle">Models/{Rompler,Drums,Wavetables,Spectral} · Presets/{Parts,Multis,Patterns} · Banks · MidiLearn</span>
          </div>

          <label class="mcx-settings-field">
            <span class="abd-probe-section-label">${t('mcx.settingsPoly')} (<strong id="val-poly">${this.state.maxPolyphony}</strong>)</span>
            <input type="range" id="set-poly" min="8" max="64" step="1" value="${this.state.maxPolyphony}" />
          </label>

          <label class="mcx-settings-field">
            <span class="abd-probe-section-label">${t('mcx.settingsTune')} (<strong id="val-tune">${this.state.masterTuneHz.toFixed(1)} Hz</strong>)</span>
            <div class="mcx-settings-row">
              <input type="range" id="set-tune" min="415" max="466" step="0.1" value="${this.state.masterTuneHz}" />
              <button type="button" class="mcx-btn" id="btn-tune-440">440</button>
            </div>
          </label>

          <label class="mcx-settings-field">
            <span class="abd-probe-section-label">${t('mcx.settingsBpm')} (<strong id="val-bpm">${Math.round(this.state.standaloneBpm)}</strong>)</span>
            <input type="range" id="set-bpm" min="40" max="240" step="1" value="${this.state.standaloneBpm}" />
          </label>

          <label class="mcx-settings-field">
            <span class="abd-probe-section-label">GLOBAL TRANSPOSE (<strong id="val-trans">0 st</strong>)</span>
            <input type="range" id="set-trans" min="-24" max="24" step="1" value="0" />
          </label>

          <div class="mcx-settings-field">
            <span class="abd-probe-section-label">MUSICAL SCALE QUANTIZE</span>
            <div class="mcx-settings-row">
              <select class="mcx-select" id="set-scale-root" style="width: 70px;">
                ${['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map((n, idx) => `<option value="${idx}">${n}</option>`).join('')}
              </select>
              <select class="mcx-select" id="set-scale-type" style="flex: 1;">
                <option value="0">Off (Chromatic)</option>
                <option value="1">Major</option>
                <option value="2">Minor Natural</option>
                <option value="3">Minor Harmonic</option>
                <option value="4">Minor Melodic</option>
                <option value="5">Dorian</option>
                <option value="6">Phrygian</option>
                <option value="7">Lydian</option>
                <option value="8">Mixolydian</option>
                <option value="9">Locrian</option>
                <option value="10">Pentatonic Major</option>
                <option value="11">Pentatonic Minor</option>
                <option value="12">Blues</option>
                <option value="13">Whole Tone</option>
                <option value="14">Diminished</option>
              </select>
            </div>
          </div>

          <div class="mcx-settings-field">
            <span class="abd-probe-section-label">${t('mcx.settingsSampleRate')}</span>
            <div class="mcx-readonly-pill">${sr} Hz (${this.cb.bridge.isNative ? 'JUCE Native' : 'WASM AudioWorklet'})</div>
          </div>
        </div>
      </div>
    `;

    attachDialogDrag(this.dialog, this.dialog.querySelector('.abd-probe-header'));
    this.dialog.querySelector('[data-role="close"]')?.addEventListener('click', () => this.dialog.close());

    const commit = () => {
      this.cb.bridge.updateSystemSettings(this.state);
      this.cb.onSettingsApplied(this.getState());
    };

    const dirInput = this.dialog.querySelector('#set-workdir') as HTMLInputElement | null;
    dirInput?.addEventListener('change', () => { this.state.workingDirectory = dirInput.value.trim(); commit(); });
    this.dialog.querySelector('#btn-browse-dir')?.addEventListener('click', () => this.cb.bridge.chooseWorkingDir());

    const polyIn = this.dialog.querySelector('#set-poly') as HTMLInputElement | null;
    polyIn?.addEventListener('input', () => {
      this.state.maxPolyphony = parseInt(polyIn.value, 10);
      const lbl = this.dialog.querySelector('#val-poly');
      if (lbl) lbl.textContent = String(this.state.maxPolyphony);
      commit();
    });

    const tuneIn = this.dialog.querySelector('#set-tune') as HTMLInputElement | null;
    const applyTune = (hz: number) => {
      this.state.masterTuneHz = hz;
      if (tuneIn) tuneIn.value = String(hz);
      const lbl = this.dialog.querySelector('#val-tune');
      if (lbl) lbl.textContent = `${hz.toFixed(1)} Hz`;
      commit();
    };
    tuneIn?.addEventListener('input', () => applyTune(parseFloat(tuneIn.value)));
    this.dialog.querySelector('#btn-tune-440')?.addEventListener('click', () => applyTune(440.0));

    const bpmIn = this.dialog.querySelector('#set-bpm') as HTMLInputElement | null;
    bpmIn?.addEventListener('input', () => {
      this.state.standaloneBpm = parseFloat(bpmIn.value);
      const lbl = this.dialog.querySelector('#val-bpm');
      if (lbl) lbl.textContent = String(Math.round(this.state.standaloneBpm));
      commit();
    });

    const transIn = this.dialog.querySelector('#set-trans') as HTMLInputElement | null;
    transIn?.addEventListener('input', () => {
      const val = parseInt(transIn.value, 10);
      const lbl = this.dialog.querySelector('#val-trans');
      if (lbl) lbl.textContent = `${val > 0 ? '+' : ''}${val} st`;
      this.cb.bridge.setParam(0, 'globalTranspose', val);
    });

    const scaleRoot = this.dialog.querySelector('#set-scale-root') as HTMLSelectElement | null;
    scaleRoot?.addEventListener('change', () => {
      this.cb.bridge.setParam(0, 'globalScaleRoot', parseInt(scaleRoot.value, 10));
    });

    const scaleType = this.dialog.querySelector('#set-scale-type') as HTMLSelectElement | null;
    scaleType?.addEventListener('change', () => {
      const scaleVal = parseInt(scaleType.value, 10);
      this.cb.bridge.setParam(0, 'globalScale', scaleVal);
      this.cb.bridge.setParam(0, 'globalScaleQuantize', scaleVal > 0 ? 1 : 0);
    });
  }
}

/**
 * ABDMCX0X -- McxSettingsModalView.ts
 * Pure HTML template builder for Global Synth Settings Modal. Strictly < 200 lines.
 */

import type { McxSystemSettingsDto } from '../bridge/McxHostBridge';
import { t } from '../i18n/mcxI18n';

export const SCALE_NAMES = [
  'Off (Chromatic)', 'Major', 'Minor Natural', 'Minor Harmonic', 'Minor Melodic',
  'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian',
  'Pentatonic Major', 'Pentatonic Minor', 'Blues', 'Whole Tone', 'Diminished',
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function buildSettingsModalHtml(
  state: McxSystemSettingsDto,
  sr: number,
  isNative: boolean,
  globalTranspose: number,
  scaleRoot: number,
  scaleType: number,
): string {
  const trSign = globalTranspose > 0 ? '+' : '';
  return `
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
            <input type="text" class="mcx-text-input" id="set-workdir" value="${state.workingDirectory}" placeholder="${t('mcx.settingsWorkDirPlaceholder')}" />
            ${isNative ? `<button type="button" class="mcx-btn" id="btn-browse-dir">${t('mcx.settingsBrowse')}</button>` : ''}
          </div>
          <span class="abd-probe-subtitle">Models/{Rompler,Drums,Wavetables,Spectral} · Presets/{Parts,Multis,Patterns} · Banks · MidiLearn</span>
        </div>

        <label class="mcx-settings-field">
          <span class="abd-probe-section-label">${t('mcx.settingsPoly')} (<strong id="val-poly">${state.maxPolyphony}</strong>)</span>
          <input type="range" id="set-poly" min="8" max="64" step="1" value="${state.maxPolyphony}" />
        </label>

        <label class="mcx-settings-field">
          <span class="abd-probe-section-label">${t('mcx.settingsTune')} (<strong id="val-tune">${state.masterTuneHz.toFixed(1)} Hz</strong>)</span>
          <div class="mcx-settings-row">
            <input type="range" id="set-tune" min="415" max="466" step="0.1" value="${state.masterTuneHz}" />
            <button type="button" class="mcx-btn" id="btn-tune-440">440</button>
          </div>
        </label>

        <label class="mcx-settings-field">
          <span class="abd-probe-section-label">${t('mcx.settingsBpm')} (<strong id="val-bpm">${Math.round(state.standaloneBpm)}</strong>)</span>
          <input type="range" id="set-bpm" min="40" max="240" step="1" value="${state.standaloneBpm}" />
        </label>

        <label class="mcx-settings-field">
          <span class="abd-probe-section-label">GLOBAL TRANSPOSE (<strong id="val-trans">${trSign}${globalTranspose} st</strong>)</span>
          <input type="range" id="set-trans" min="-24" max="24" step="1" value="${globalTranspose}" />
        </label>

        <div class="mcx-settings-field">
          <span class="abd-probe-section-label">MUSICAL SCALE QUANTIZE</span>
          <div class="mcx-settings-row">
            <select class="mcx-select" id="set-scale-root" style="width: 70px;">
              ${NOTE_NAMES.map((n, idx) => `<option value="${idx}"${idx === scaleRoot ? ' selected' : ''}>${n}</option>`).join('')}
            </select>
            <select class="mcx-select" id="set-scale-type" style="flex: 1;">
              ${SCALE_NAMES.map((name, idx) => `<option value="${idx}"${idx === scaleType ? ' selected' : ''}>${name}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="mcx-settings-field">
          <span class="abd-probe-section-label">${t('mcx.settingsSampleRate')}</span>
          <div class="mcx-readonly-pill">${sr} Hz (${isNative ? 'JUCE Native' : 'WASM AudioWorklet'})</div>
        </div>
      </div>
    </div>
  `;
}

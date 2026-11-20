/**
 * ABDMCX0X -- McxSettingsModalView.ts
 * Pure HTML template builder for Global Synth Settings Modal. Strictly < 200 lines.
 */

import type { McxMidiDeviceInfoDto, McxMidiDevicesDto, McxSystemSettingsDto } from '../bridge/McxHostBridge';
import { t } from '../i18n/mcxI18n';
import { ICON_CLOSE, ICON_REFRESH } from './mcxIcons';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderDeviceList(list: McxMidiDeviceInfoDto[], dir: 'input' | 'output', isNative: boolean): string {
  if (!list || list.length === 0) return `<p class="mcx-midi-dev-empty">${esc(t('mcx.settingsMidiEmpty'))}</p>`;
  return list.map((d) => {
    if (isNative) {
      return `
        <div class="mcx-midi-dev-row">
          <label><input type="checkbox" data-midi-dir="${dir}" data-midi-id="${esc(d.id)}"${d.enabled ? ' checked' : ''} />
            <span class="mcx-midi-dev-name" title="${esc(d.name)}">${esc(d.name)}</span></label>
        </div>`;
    }
    const statusLbl = d.enabled ? t('mcx.settingsMidiConnected') : t('mcx.settingsMidiDisconnected');
    return `
      <div class="mcx-midi-dev-row">
        <span class="mcx-midi-dev-name" title="${esc(d.name)}">${esc(d.name)}</span>
        <span class="mcx-bank-rail-count">${esc(statusLbl)}</span>
      </div>`;
  }).join('');
}

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
  midiDevices: McxMidiDevicesDto = { isStandalone: !isNative, inputs: [], outputs: [] },
): string {
  const trSign = globalTranspose > 0 ? '+' : '';
  return `
    <div class="abd-probe-shell">
      <div class="abd-probe-header">
        <div>
          <h2 class="abd-probe-title" id="mcx-settings-title">${esc(t('mcx.settingsTitle'))}</h2>
          <p class="abd-probe-subtitle">${esc(t('mcx.settingsSubtitle'))}</p>
        </div>
        <button type="button" class="abd-probe-close" data-role="close" aria-label="${esc(t('mcx.close'))}">${ICON_CLOSE}</button>
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
          <span class="abd-probe-section-label">${esc(t('mcx.settingsSampleRate'))}</span>
          <div class="mcx-readonly-pill">${sr} Hz (${isNative ? 'JUCE Native' : 'WASM AudioWorklet'})</div>
        </div>

        <div class="mcx-settings-field mcx-settings-field--full">
          <div class="mcx-route-midi-head-row">
            <span class="abd-probe-section-label">${esc(t('mcx.settingsMidiTitle'))}</span>
            <button type="button" class="mcx-route-refresh-btn" id="btn-refresh-midi">${ICON_REFRESH}<span>${esc(t('mcx.routeMidiRefresh'))}</span></button>
          </div>
          <div class="mcx-midi-devices-grid">
            <div class="mcx-midi-dev-col">
              <span class="mcx-route-label">${esc(t('mcx.settingsMidiInHead'))}</span>
              <div class="mcx-midi-dev-list">${renderDeviceList(midiDevices.inputs, 'input', isNative)}</div>
            </div>
            <div class="mcx-midi-dev-col">
              <span class="mcx-route-label">${esc(t('mcx.settingsMidiOutHead'))}</span>
              <div class="mcx-midi-dev-list">${renderDeviceList(midiDevices.outputs, 'output', isNative)}</div>
            </div>
          </div>
          ${!isNative ? `<span class="abd-probe-subtitle">${esc(t('mcx.settingsMidiWebHint'))}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

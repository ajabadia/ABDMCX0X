/**
 * ABDMCX0X -- McxToneDrawerViews.ts
 * HTML templates and card builders for the Bottom Tone & FX Drawer (100% per-channel).
 * 100% tokenized with @abdsynths/shared tokens and fully i18n-ready.
 */

import { t } from '../i18n/mcxI18n';
import type { McxPartUiState } from './McxMixerConsole';

export const FILTER_MODELS = ['SVF Clean', 'Roland TVF ZDF', 'MS-20 Acid', 'Ladder Drive', 'Z-Plane Morph', 'TC6116AF TVF'];
export const STRUCTURE_MODES = ['Parallel', 'RingMod 1-2', 'Booster 1-2', 'Vector 2D'];
export const ROUTE_MODES = ['Internal (DSP)', 'External (MIDI)', 'Both (INT+EXT)'];
export const GLIDE_MODES = ['Always', 'Legato Only'];

export function buildToneDrawerHeaderHtml(partIdx: number, ps: McxPartUiState): string {
  const isDrum = ps.kind === 'drum_map';
  const name = ps.name || (isDrum ? 'TR-909 Kit' : `Sound P${partIdx + 1}`);
  const kindBadge = isDrum ? t('mcx.partDrumMap') : t('mcx.partChromatic');

  return `
    <div class="mcx-drawer-head">
      <div class="mcx-drawer-title-row">
        <span class="mcx-drawer-title-accent">P${String(partIdx + 1).padStart(2, '0')}</span>
        <h3 class="mcx-drawer-title" data-i18n="mcx.toneDrawerTitle">${t('mcx.toneDrawerTitle')}</h3>
        <span class="mcx-drawer-part-name">${name}</span>
        <span class="mcx-drawer-kind-badge${isDrum ? ' is-drum' : ''}">${kindBadge}</span>
        ${ps.mute ? `<span class="mcx-drawer-mute-badge">${t('mcx.mute')}</span>` : ''}
      </div>
      <button type="button" class="mcx-drawer-close-btn" data-act="close" title="${t('mcx.closeDrawer')}" aria-label="${t('mcx.closeDrawer')}">✕</button>
    </div>
  `;
}

const selectCard = (p: string, lbl: string, opts: string[]) => `
  <div class="mcx-tone-card" data-param="${p}" data-learnable="true">
    <span class="mcx-tone-lbl">${lbl}</span>
    <select class="mcx-tone-select" data-param="${p}">${opts.map((o, i) => `<option value="${i}">${o}</option>`).join('')}</select>
  </div>`;

const sliderCard = (p: string, lbl: string, min: number, max: number, step: number, defVal: number, valTxt: string) => `
  <div class="mcx-tone-card" data-param="${p}" data-learnable="true">
    <span class="mcx-tone-lbl">${lbl}</span>
    <input type="range" class="mcx-tone-slider" min="${min}" max="${max}" step="${step}" value="${defVal}" />
    <span class="mcx-tone-val">${valTxt}</span>
  </div>`;

const sendCard = (p: string, preKey: string, lbl: string, defVal: number, valTxt: string) => `
  <div class="mcx-tone-card mcx-send-card" data-param="${p}" data-learnable="true">
    <div class="mcx-send-header">
      <span class="mcx-tone-lbl">${lbl}</span>
      <button type="button" class="mcx-pre-post-btn" data-send-pre="${preKey}" title="${t('mcx.prePostFader')}">POST</button>
    </div>
    <input type="range" class="mcx-tone-slider" min="0" max="1" step="0.01" value="${defVal}" />
    <span class="mcx-tone-val">${valTxt}</span>
  </div>`;

export function buildToneDrawerBodyHtml(): string {
  return `
    <div class="mcx-drawer-body">
      <!-- Section 1: Tone, Structure, Routing, Vector & Pitch/Glide -->
      <section class="mcx-tone-section">
        <div class="mcx-section-head">
          <span class="mcx-section-title" data-i18n="mcx.toneGenSection">${t('mcx.toneGenSection')}</span>
        </div>
        <div class="mcx-tone-cards-row">
          ${selectCard('structureMode', `* ${t('mcx.structureMode')} (VOZ)`, STRUCTURE_MODES)}
          ${selectCard('routeMode', `* ${t('mcx.routeMode')} (REV)`, ROUTE_MODES)}
          ${sliderCard('vectorX', '* VECTOR X (REV)', -1, 1, 0.02, 0, '0.00')}
          ${sliderCard('vectorY', '* VECTOR Y (REV)', -1, 1, 0.02, 0, '0.00')}
          ${sliderCard('pitchCoarse', t('mcx.pitchCoarse'), -24, 24, 1, 0, '0 st')}
          ${sliderCard('pitchFine', t('mcx.pitchFine'), -50, 50, 1, 0, '0 ct')}
          ${sliderCard('portaTimeMs', t('mcx.portaTime'), 0, 500, 5, 60, '60 ms')}
          ${selectCard('portaLegatoOnly', t('mcx.portaLegato'), GLIDE_MODES)}
        </div>
      </section>

      <!-- Section 2: Dual Filters & Drive -->
      <section class="mcx-tone-section">
        <div class="mcx-section-head">
          <span class="mcx-section-title" data-i18n="mcx.filterSection">${t('mcx.filterSection')}</span>
        </div>
        <div class="mcx-tone-cards-row">
          ${selectCard('filterModel', `FILTRO 1: ${t('mcx.filterModel')}`, FILTER_MODELS)}
          ${sliderCard('filterCutoff', `F1 ${t('mcx.cutoff')}`, 0, 1, 0.01, 0.72, '3200 Hz')}
          ${sliderCard('filterResonance', `F1 ${t('mcx.resonance')}`, 0, 0.96, 0.01, 0.18, '18%')}
          ${selectCard('filterModel2', `* FILTRO 2 (PROYECTADO)`, FILTER_MODELS)}
          ${sliderCard('filterCutoff2', `* F2 CORTE (REV)`, 0, 1, 0.01, 0.85, '8000 Hz')}
          ${sliderCard('filterResonance2', `* F2 RESO (REV)`, 0, 0.96, 0.01, 0.10, '10%')}
          ${sliderCard('driveAmount', t('mcx.drive'), 0, 1, 0.01, 0, 'OFF')}
        </div>
      </section>

      <!-- Section 3: Amplitude Envelope (VCA) -->
      <section class="mcx-tone-section">
        <div class="mcx-section-head">
          <span class="mcx-section-title">3. ENVOLVENTE AMPLITUD VCA (* MODULACIÓN EN LFO / MATRIZ)</span>
        </div>
        <div class="mcx-tone-cards-row">
          ${sliderCard('ampAttack', t('mcx.attack'), 0, 1, 0.01, 0.04, '5 ms')}
          ${sliderCard('ampDecay', t('mcx.decay'), 0, 1, 0.01, 0.25, '260 ms')}
          ${sliderCard('ampSustain', t('mcx.sustain'), 0, 1, 0.01, 0.75, '75%')}
          ${sliderCard('ampRelease', t('mcx.release'), 0, 1, 0.01, 0.18, '170 ms')}
        </div>
      </section>

      <!-- Section 4: Parametric EQ & Auxiliary Sends (Pre/Post) -->
      <section class="mcx-tone-section">
        <div class="mcx-section-head">
          <span class="mcx-section-title" data-i18n="mcx.eqSection">${t('mcx.eqSection')}</span>
        </div>
        <div class="mcx-tone-cards-row">
          ${sliderCard('eqLowGain', t('mcx.eqLow'), -12, 12, 0.5, 0, '0.0 dB')}
          ${sliderCard('eqMidGain', t('mcx.eqMid'), -12, 12, 0.5, 0, '0.0 dB')}
          ${sliderCard('eqHighGain', t('mcx.eqHigh'), -12, 12, 0.5, 0, '0.0 dB')}
          ${sliderCard('partLevel', t('mcx.partLevel'), 0, 1, 0.01, 0.85, '85%')}
          ${sliderCard('partPan', t('mcx.partPan'), -1, 1, 0.02, 0, 'C')}
          ${sendCard('reverbSend', 'sendAPre', t('mcx.sendA'), 0.28, '28%')}
          ${sendCard('chorusSend', 'sendBPre', t('mcx.sendB'), 0.20, '20%')}
          ${sendCard('delaySend', 'sendCPre', t('mcx.sendC'), 0.0, '0%')}
          ${sendCard('auxSend', 'sendDPre', t('mcx.sendD'), 0.0, '0%')}
        </div>
      </section>
    </div>
  `;
}

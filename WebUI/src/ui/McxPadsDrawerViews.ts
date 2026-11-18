/**
 * ABDMCX0X -- McxPadsDrawerViews.ts
 * HTML view templates and markup builders for the 16-pad MPC Drawer.
 * Modularized to maintain strict < 200 lines per file.
 */

import type { McxPartUiState } from './McxMixerConsole';
import { t } from '../i18n/mcxI18n';

export function buildPadsHeaderHtml(partIdx: number, ps: McxPartUiState): string {
  const isDrum = ps.kind === 'drum_map';
  const name = ps.name || (isDrum ? 'TR-909 Kit' : `Sound P${partIdx + 1}`);
  const kindBadge = isDrum ? t('mcx.partDrumMap') : t('mcx.partChromatic');

  return `
    <div class="mcx-drawer-head">
      <div class="mcx-drawer-title-row">
        <span class="mcx-drawer-title-accent">P${String(partIdx + 1).padStart(2, '0')}</span>
        <h3 class="mcx-drawer-title" data-i18n="mcx.padsDrawerTitle">${t('mcx.padsDrawerTitle') || 'MATRIZ DE PADS MPC (4x4)'}</h3>
        <span class="mcx-drawer-part-name">${name}</span>
        <span class="mcx-drawer-kind-badge${isDrum ? ' is-drum' : ''}">${kindBadge}</span>
        ${ps.mute ? `<span class="mcx-drawer-mute-badge">${t('mcx.mute')}</span>` : ''}
      </div>
      <button type="button" class="mcx-drawer-close-btn" data-act="close" title="${t('mcx.closeDrawer')}" aria-label="${t('mcx.closeDrawer')}">✕</button>
    </div>
  `;
}

export function buildPadsDrawerBodyHtml(): string {
  return `
    <!-- LEFT PANEL: Key Assignment, Input & Dynamics -->
    <aside class="mcx-pads-side-panel is-left" aria-label="Asignación y Teclas">
      <div class="mcx-pads-side-head">
        <span class="mcx-pads-side-title" data-i18n="mcx.padsKeyMapTitle">MAPEO &amp; ENTRADA</span>
      </div>

      <div class="mcx-pads-group">
        <div class="mcx-pads-group-title">
          <span data-i18n="mcx.padsPcKeyboard">TECLADO PC</span>
          <button type="button" class="mcx-pads-action-btn is-active" id="mcx-pads-toggle-labels">VER TECLAS</button>
        </div>
        <div class="mcx-pads-btn-row">
          <button type="button" class="mcx-pads-action-btn is-active" data-keymap="4x4">4x4 (1-4 / Q-R / A-F / Z-V)</button>
          <button type="button" class="mcx-pads-action-btn" data-keymap="numpad">NUMPAD</button>
        </div>
      </div>

      <div class="mcx-pads-group">
        <div class="mcx-pads-group-title">
          <span data-i18n="mcx.padsDynamics">DINÁMICA &amp; DISPARO</span>
        </div>
        <div class="mcx-pads-btn-row">
          <button type="button" class="mcx-pads-action-btn is-active" data-dyn="linear">LINEAR</button>
          <button type="button" class="mcx-pads-action-btn" data-dyn="soft">SOFT</button>
          <button type="button" class="mcx-pads-action-btn" data-dyn="hard">HARD</button>
          <button type="button" class="mcx-pads-action-btn" data-dyn="gate">GATE</button>
        </div>
      </div>

      <div class="mcx-pads-slot-custom" id="mcx-pads-key-assign-slot">
        <span data-i18n="mcx.padsCustomKeysSlot">+ ASIGNAR TECLAS / MIDI TRIGGER (Próximamente)</span>
      </div>
    </aside>

    <!-- CENTER PANEL: 4x4 MPC Pads Matrix (Height-constrained, zero scroll) -->
    <div class="mcx-pads-center-col">
      <div class="mcx-matrix-mount-point"></div>
    </div>

    <!-- RIGHT PANEL: Pad Parameters, Roll & Secondary Functions -->
    <aside class="mcx-pads-side-panel is-right" aria-label="Funciones Secundarias">
      <div class="mcx-pads-side-head">
        <span class="mcx-pads-side-title" data-i18n="mcx.padsSecondaryTitle">FUNCIONES SECUNDARIAS</span>
      </div>

      <div class="mcx-pads-group">
        <div class="mcx-pads-group-title">
          <span data-i18n="mcx.padsSelectedPad">PAD ACTIVO</span>
          <span class="mcx-pad-target-badge" id="mcx-pad-target-lbl">PAD 01: C2 (36)</span>
        </div>
        <div class="mcx-pads-ctrl-row">
          <label class="mcx-pads-ctrl-lbl" data-i18n="mcx.padsChokeGroup">CHOKE GROUP:</label>
          <select class="mcx-pads-select" id="mcx-pad-choke-sel">
            <option value="0">OFF</option>
            <option value="1">CH 1 (HI-HAT EXCL)</option>
            <option value="2">CH 2</option>
            <option value="3">CH 3</option>
            <option value="4">CH 4</option>
          </select>
        </div>
      </div>

      <div class="mcx-pads-group">
        <div class="mcx-pads-group-title">
          <span data-i18n="mcx.padsRollRepeat">ROLL &amp; REPETICIÓN</span>
          <button type="button" class="mcx-pads-action-btn" id="mcx-pad-flam-btn">FLAM</button>
        </div>
        <div class="mcx-pads-btn-row">
          <button type="button" class="mcx-pads-action-btn is-active" data-roll="off">OFF</button>
          <button type="button" class="mcx-pads-action-btn" data-roll="1_8">1/8</button>
          <button type="button" class="mcx-pads-action-btn" data-roll="1_16">1/16</button>
          <button type="button" class="mcx-pads-action-btn" data-roll="1_32">1/32</button>
          <button type="button" class="mcx-pads-action-btn" data-roll="trip">1/16T</button>
        </div>
      </div>

      <div class="mcx-pads-slot-custom" id="mcx-pads-secondary-slot">
        <span data-i18n="mcx.padsSecondarySlot">+ ACCIONES &amp; MODULACIÓN SECUNDARIA (Próximamente)</span>
      </div>
    </aside>
  `;
}

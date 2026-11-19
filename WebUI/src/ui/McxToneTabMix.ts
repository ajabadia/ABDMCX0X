/**
 * ABDMCX0X -- McxToneTabMix.ts
 * Tab 2 ("CANAL / MEZCLA"): Pitch, Portamento, 3-Band EQ, Saturation & Drive,
 * spacious 4-Send Aux Bus Matrix (A..D), and Channel Output (CH, TR, M, S, Pan, Level).
 * Strict line limit: < 200 lines.
 */

import { t } from '../i18n/mcxI18n';
import { DRIVE_TYPES, knobCell, renderSegGroup } from './McxToneDrawerViews';

const sendKnobCell = (p: string, bus: number, preKey: string, lbl: string, target: string, initialNum: string) => `
  <div class="mcx-send-knob-cell" data-param="${p}" data-bus="${bus}" data-learnable="true">
    <div class="mcx-send-cell-top">
      <div class="mcx-send-head-row">
        <span class="mcx-send-lbl">${lbl}</span>
        <span class="mcx-send-led" data-send-led="${bus}" title="Actividad telemetría"></span>
      </div>
      <span class="mcx-send-target-tag" data-send-target="${bus}">${target}</span>
      <div class="mcx-send-btn-row">
        <button type="button" class="mcx-pre-post-btn" data-send-pre="${preKey}" title="${t('mcx.prePostFader')}">POST</button>
        <button type="button" class="mcx-send-ch-mute-btn" data-ch-mute="${bus}" title="Mute envío canal">M</button>
        <span class="mcx-send-bus-badge" data-bus-badge="${bus}" title="Estado del bus máster (Rack FX)">BUS</span>
      </div>
    </div>
    <div class="synth-knob-mount" id="knob-${p}"></div>
    <span class="synth-knob-num" id="val-${p}">${initialNum}</span>
  </div>`;

export function buildMixTabHtml(): string {
  return `
    <div class="mcx-tone-deck mcx-mix-deck-1">
      <section class="mcx-module-card mcx-card-pitch" title="Afinación de parte (Semitonos y Finos)">
        <div class="mcx-module-head">
          <span class="mcx-module-title">AFINACIÓN</span>
          <span class="mcx-module-badge">PITCH</span>
        </div>
        <div class="mcx-module-body">
          <div class="mcx-knobs-row">
            ${knobCell('pitchCoarse', 'SEMI', '0 st')}
            ${knobCell('pitchFine', 'FINA', '0 ct')}
          </div>
        </div>
      </section>

      <section class="mcx-module-card mcx-card-eq" title="Ecualizador paramétrico de 3 bandas por parte">
        <div class="mcx-module-head">
          <span class="mcx-module-title">ECUALIZADOR (EQ 3B)</span>
          <span class="mcx-module-badge">EQ 3B</span>
        </div>
        <div class="mcx-module-body">
          <div class="mcx-knobs-row">
            ${knobCell('eqLowGain', 'GRAVES', '0.0 dB')}
            ${knobCell('eqMidGain', 'MEDIOS', '0.0 dB')}
            ${knobCell('eqHighGain', 'AGUDOS', '0.0 dB')}
          </div>
        </div>
      </section>

      <section class="mcx-module-card mcx-card-drive" title="Saturador y Drive analógico por parte">
        <div class="mcx-module-head">
          <span class="mcx-module-title">SATURACIÓN &amp; DRIVE</span>
          <span class="mcx-module-badge">DRIVE</span>
        </div>
        <div class="mcx-module-body mcx-stack-col">
          ${renderSegGroup('driveType', 'TIPO', DRIVE_TYPES, 0)}
          <div class="mcx-knobs-row">
            ${knobCell('driveAmount', 'DRIVE', 'OFF')}
          </div>
        </div>
      </section>
    </div>

    <div class="mcx-tone-deck mcx-mix-deck-2">
      <section class="mcx-module-card mcx-card-sends" title="4 Envíos auxiliares independientes Pre/Post con mute individual hacia el Rack FX">
        <div class="mcx-module-head">
          <span class="mcx-module-title">BUSES DE ENVÍO AUXILIAR (RACK FX)</span>
          <span class="mcx-module-badge">FX SENDS</span>
        </div>
        <div class="mcx-module-body">
          <div class="mcx-knobs-row mcx-sends-grid-row">
            ${sendKnobCell('reverbSend', 0, 'sendAPre', 'ENVÍO A', 'HALL 1', '28%')}
            ${sendKnobCell('chorusSend', 1, 'sendBPre', 'ENVÍO B', 'CHORUS', '20%')}
            ${sendKnobCell('delaySend', 2, 'sendCPre', 'ENVÍO C', 'DELAY', '0%')}
            ${sendKnobCell('auxSend', 3, 'sendDPre', 'ENVÍO D', 'AUX', '0%')}
          </div>
          <div class="mcx-insert-fx-row" style="margin-top:8px;padding-top:6px;border-top:1px solid var(--color-border-subtle);display:flex;align-items:center;justify-content:space-between;font-size:10px;">
            <span style="font-weight:700;color:var(--color-text-secondary);">INSERCIÓN DIRECTA:</span>
            <select class="mcx-insert-select" id="mcx-track-insert-select" style="height:22px;background:var(--color-control-bg);color:var(--color-text-primary);border:1px solid var(--color-border-subtle);border-radius:3px;font-size:10px;font-family:inherit;">
              <option value="-1">-- SIN INSERCIÓN --</option>
              <option value="0">BAHÍA 1 (SLOT 1)</option>
              <option value="1">BAHÍA 2 (SLOT 2)</option>
              <option value="2">BAHÍA 3 (SLOT 3)</option>
              <option value="3">BAHÍA 4 (SLOT 4)</option>
              <option value="4">BAHÍA 5 (SLOT 5)</option>
              <option value="5">BAHÍA 6 (SLOT 6)</option>
              <option value="6">BAHÍA 7 (SLOT 7)</option>
              <option value="7">BAHÍA 8 (SLOT 8)</option>
            </select>
          </div>
        </div>
      </section>

      <section class="mcx-module-card mcx-card-channel" title="Canal MIDI, Transposición, Mute / Solo, Panorama y Volumen de parte">
        <div class="mcx-module-head">
          <span class="mcx-module-title">SALIDA &amp; CANAL</span>
          <span class="mcx-module-badge">CANAL</span>
        </div>
        <div class="mcx-module-body mcx-stack-col">
          <div class="mcx-drawer-midi-row">
            <div class="mcx-drawer-ch-stepper">
              <span class="mcx-drawer-stepper-lbl">CANAL</span>
              <div class="mcx-drawer-stepper-ctrl">
                <button type="button" class="mcx-stepper-btn" data-act="drawer-ch-dec" title="Canal anterior">◀</button>
                <span class="mcx-stepper-val" id="drawer-ch-val">CH 01</span>
                <button type="button" class="mcx-stepper-btn" data-act="drawer-ch-inc" title="Canal siguiente">▶</button>
              </div>
            </div>
            <button type="button" class="mcx-drawer-tr-btn is-active" data-act="drawer-tr" title="Seguir Transposición Global">TR</button>
          </div>
          <div class="mcx-channel-body">
            <div class="mcx-drawer-ms-group">
              <button type="button" class="mcx-drawer-ms-btn" data-act="drawer-mute" title="${t('mcx.mute')}">M</button>
              <button type="button" class="mcx-drawer-ms-btn" data-act="drawer-solo" title="${t('mcx.solo')}">S</button>
            </div>
            <div class="mcx-knobs-row">
              ${knobCell('partPan', 'PAN', 'C')}
              ${knobCell('partLevel', 'VOLUMEN', '85%')}
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}

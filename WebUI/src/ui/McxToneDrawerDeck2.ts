/**
 * ABDMCX0X -- McxToneDrawerDeck2.ts
 * Deck 2 (Inferior): Dual LFO Modulators, VCA Envelope, 3-Band EQ, Aux FX Sends, and Channel Output (with Mute/Solo).
 * Strict line limit: < 200 lines.
 */

import { t } from '../i18n/mcxI18n';
import { knobCell } from './McxToneDrawerViews';
import { buildLfoCardHtml } from './McxToneDrawerLfo';

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

export function buildDeck2Html(): string {
  return `
    <div class="mcx-tone-deck mcx-deck-2">
      <!-- MODULADORES LFO 1 & 2 -->
      ${buildLfoCardHtml()}

      <!-- ENVOLVENTE AMPLITUD VCA (ADSR) -->
      <section class="mcx-module-card mcx-card-env" title="Envolvente ADSR de amplitud VCA">
        <div class="mcx-module-head">
          <span class="mcx-module-title">ENVOLVENTE VCA</span>
          <span class="mcx-module-badge">ADSR</span>
        </div>
        <div class="mcx-module-body">
          <div class="mcx-knobs-row">
            ${knobCell('ampAttack', 'ATAQUE', '5 ms')}
            ${knobCell('ampDecay', 'CAÍDA', '260 ms')}
            ${knobCell('ampSustain', 'SOSTÉN', '75%')}
            ${knobCell('ampRelease', 'LIBERACIÓN', '170 ms')}
          </div>
        </div>
      </section>

      <!-- ECUALIZADOR (EQ 3-BANDAS) -->
      <section class="mcx-module-card mcx-card-eq" title="Ecualizador paramétrico ligero de 3 bandas por parte">
        <div class="mcx-module-head">
          <span class="mcx-module-title">ECUALIZADOR (EQ 3B)</span>
          <span class="mcx-module-badge">EQ 3B</span>
        </div>
        <div class="mcx-module-body">
          <div class="mcx-knobs-row">
            ${knobCell('eqLowGain', 'EQ GRAVES', '0.0 dB')}
            ${knobCell('eqMidGain', 'EQ MEDIOS', '0.0 dB')}
            ${knobCell('eqHighGain', 'EQ AGUDOS', '0.0 dB')}
          </div>
        </div>
      </section>

      <!-- BUSES DE ENVÍO AUXILIAR (RACK FX) -->
      <section class="mcx-module-card mcx-card-sends" title="4 Envíos auxiliares independientes Pre/Post con mute individual hacia el Rack FX">
        <div class="mcx-module-head">
          <span class="mcx-module-title">BUSES DE ENVÍO AUXILIAR (RACK FX)</span>
          <span class="mcx-module-badge">FX SENDS</span>
        </div>
        <div class="mcx-module-body">
          <div class="mcx-knobs-row">
            ${sendKnobCell('reverbSend', 0, 'sendAPre', 'ENVÍO A', 'HALL 1', '28%')}
            ${sendKnobCell('chorusSend', 1, 'sendBPre', 'ENVÍO B', 'CHORUS', '20%')}
            ${sendKnobCell('delaySend', 2, 'sendCPre', 'ENVÍO C', 'DELAY', '0%')}
            ${sendKnobCell('auxSend', 3, 'sendDPre', 'ENVÍO D', 'AUX', '0%')}
          </div>
        </div>
      </section>

      <!-- SALIDA & CANAL (MEZCLA) - ÚLTIMO BLOQUE -->
      <section class="mcx-module-card mcx-card-channel" title="Panorama, volumen y control Mute / Solo de parte">
        <div class="mcx-module-head">
          <span class="mcx-module-title">SALIDA &amp; CANAL</span>
          <span class="mcx-module-badge">CANAL</span>
        </div>
        <div class="mcx-module-body mcx-channel-body">
          <div class="mcx-drawer-ms-group">
            <button type="button" class="mcx-drawer-ms-btn" data-act="drawer-mute" title="${t('mcx.mute')}">M</button>
            <button type="button" class="mcx-drawer-ms-btn" data-act="drawer-solo" title="${t('mcx.solo')}">S</button>
          </div>
          <div class="mcx-knobs-row">
            ${knobCell('partPan', 'PAN', 'C')}
            ${knobCell('partLevel', 'VOLUMEN', '85%')}
          </div>
        </div>
      </section>
    </div>
  `;
}

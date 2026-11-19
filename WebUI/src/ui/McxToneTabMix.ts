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
        <span class="mcx-send-led" data-send-led="${bus}" title="${t('mcx.mixSendActivityTitle')}"></span>
      </div>
      <span class="mcx-send-target-tag" data-send-target="${bus}">${target}</span>
      <div class="mcx-send-btn-row">
        <button type="button" class="mcx-pre-post-btn" data-send-pre="${preKey}" title="${t('mcx.prePostFader')}">POST</button>
        <button type="button" class="mcx-send-ch-mute-btn" data-ch-mute="${bus}" title="${t('mcx.mixSendMuteTitle')}">M</button>
        <span class="mcx-send-bus-badge" data-bus-badge="${bus}" title="${t('mcx.mixSendBusBadgeTitle')}">BUS</span>
      </div>
    </div>
    <div class="synth-knob-mount" id="knob-${p}"></div>
    <span class="synth-knob-num" id="val-${p}">${initialNum}</span>
  </div>`;

export function buildMixTabHtml(): string {
  const bay = t('mcx.rackBay');
  return `
    <div class="mcx-tone-deck mcx-mix-deck-1">
      <section class="mcx-module-card mcx-card-pitch" title="${t('mcx.mixPitchTitle')}">
        <div class="mcx-module-head">
          <span class="mcx-module-title">${t('mcx.mixPitchHead')}</span>
          <span class="mcx-module-badge">PITCH</span>
        </div>
        <div class="mcx-module-body">
          <div class="mcx-knobs-row">
            ${knobCell('pitchCoarse', 'SEMI', '0 st')}
            ${knobCell('pitchFine', 'FINE', '0 ct')}
          </div>
        </div>
      </section>

      <section class="mcx-module-card mcx-card-eq" title="${t('mcx.mixEqTitle')}">
        <div class="mcx-module-head">
          <span class="mcx-module-title">${t('mcx.mixEqHead')}</span>
          <span class="mcx-module-badge">EQ 3B</span>
        </div>
        <div class="mcx-module-body">
          <div class="mcx-knobs-row">
            ${knobCell('eqLowGain', t('mcx.mixEqLow'), '0.0 dB')}
            ${knobCell('eqMidGain', t('mcx.mixEqMid'), '0.0 dB')}
            ${knobCell('eqHighGain', t('mcx.mixEqHigh'), '0.0 dB')}
          </div>
        </div>
      </section>

      <section class="mcx-module-card mcx-card-drive" title="${t('mcx.mixDriveTitle')}">
        <div class="mcx-module-head">
          <span class="mcx-module-title">${t('mcx.mixDriveHead')}</span>
          <span class="mcx-module-badge">DRIVE</span>
        </div>
        <div class="mcx-module-body mcx-stack-col">
          ${renderSegGroup('driveType', t('mcx.mixDriveType'), DRIVE_TYPES, 0)}
          <div class="mcx-knobs-row">
            ${knobCell('driveAmount', 'DRIVE', 'OFF')}
          </div>
        </div>
      </section>
    </div>

    <div class="mcx-tone-deck mcx-mix-deck-2">
      <section class="mcx-module-card mcx-card-sends" title="${t('mcx.mixSendsTitle')}">
        <div class="mcx-module-head">
          <span class="mcx-module-title">${t('mcx.mixSendsHead')}</span>
          <span class="mcx-module-badge">FX SENDS</span>
        </div>
        <div class="mcx-module-body">
          <div class="mcx-knobs-row mcx-sends-grid-row">
            ${sendKnobCell('reverbSend', 0, 'sendAPre', `${t('mcx.mixSendLabel')} A`, 'HALL 1', '28%')}
            ${sendKnobCell('chorusSend', 1, 'sendBPre', `${t('mcx.mixSendLabel')} B`, 'CHORUS', '20%')}
            ${sendKnobCell('delaySend', 2, 'sendCPre', `${t('mcx.mixSendLabel')} C`, 'DELAY', '0%')}
            ${sendKnobCell('auxSend', 3, 'sendDPre', `${t('mcx.mixSendLabel')} D`, 'AUX', '0%')}
          </div>
          <div class="mcx-insert-fx-row" style="margin-top:8px;padding-top:6px;border-top:1px solid var(--color-border-subtle);display:flex;align-items:center;justify-content:space-between;font-size:10px;">
            <span style="font-weight:700;color:var(--color-text-secondary);">${t('mcx.mixInsertDirect')}</span>
            <select class="mcx-insert-select" id="mcx-track-insert-select" style="height:22px;background:var(--color-control-bg);color:var(--color-text-primary);border:1px solid var(--color-border-subtle);border-radius:3px;font-size:10px;font-family:inherit;">
              <option value="-1">${t('mcx.mixNoInsert')}</option>
              ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<option value="${i}">${bay} ${i + 1} (SLOT ${i + 1})</option>`).join('')}
            </select>
          </div>
        </div>
      </section>

      <section class="mcx-module-card mcx-card-channel" title="${t('mcx.mixChannelTitle')}">
        <div class="mcx-module-head">
          <span class="mcx-module-title">${t('mcx.mixChannelHead')}</span>
          <span class="mcx-module-badge">${t('mcx.mixChannelLbl')}</span>
        </div>
        <div class="mcx-module-body mcx-stack-col">
          <div class="mcx-drawer-midi-row">
            <div class="mcx-drawer-ch-stepper">
              <span class="mcx-drawer-stepper-lbl">${t('mcx.mixChannelLbl')}</span>
              <div class="mcx-drawer-stepper-ctrl">
                <button type="button" class="mcx-stepper-btn" data-act="drawer-ch-dec" title="${t('mcx.mixPrevCh')}"><svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true"><path d="M7 1.5L3 5l4 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                <span class="mcx-stepper-val" id="drawer-ch-val">CH 01</span>
                <button type="button" class="mcx-stepper-btn" data-act="drawer-ch-inc" title="${t('mcx.mixNextCh')}"><svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5L7 5l-4 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
              </div>
            </div>
            <button type="button" class="mcx-drawer-tr-btn is-active" data-act="drawer-tr" title="${t('mcx.mixFollowTrTitle')}">TR</button>
          </div>
          <div class="mcx-channel-body">
            <div class="mcx-drawer-ms-group">
              <button type="button" class="mcx-drawer-ms-btn" data-act="drawer-mute" title="${t('mcx.mute')}">M</button>
              <button type="button" class="mcx-drawer-ms-btn" data-act="drawer-solo" title="${t('mcx.solo')}">S</button>
            </div>
            <div class="mcx-knobs-row">
              ${knobCell('partPan', t('mcx.mixPanShort'), 'C')}
              ${knobCell('partLevel', t('mcx.mixVolShort'), '85%')}
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}

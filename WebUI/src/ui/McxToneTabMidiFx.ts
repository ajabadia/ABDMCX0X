import { t } from '../i18n/mcxI18n';
import { knobCell } from './McxToneDrawerViews';

const LAUNCH_SVG = `<svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 9L9 3M4.5 3H9V7.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function buildMidiFxTabHtml(): string {
  return `
    <div class="mcx-midifx-grid">
      <section class="mcx-module-card mcx-card-seq-links" title="${t('mcx.midiCard1Title')}">
        <div class="mcx-module-head">
          <span class="mcx-module-title">${t('mcx.midiCard1Head')}</span>
          <span class="mcx-module-badge">IN/SEQ</span>
        </div>
        <div class="mcx-module-body mcx-stack-col mcx-midifx-card-body">
          <span class="mcx-midifx-summary" id="mcx-midifx-seq-summary">${t('mcx.midiSeqSummaryDefault')}</span>
          <div class="mcx-midifx-actions">
            <button type="button" class="mcx-midifx-action-btn" data-act="open-seq">${t('mcx.midiOpenSeq')} ${LAUNCH_SVG}</button>
            <button type="button" class="mcx-midifx-action-btn" data-act="open-pads">${t('mcx.midiOpenPads')} ${LAUNCH_SVG}</button>
            <button type="button" class="mcx-midifx-action-btn" data-act="open-groove">${t('mcx.midiOpenGroove')} ${LAUNCH_SVG}</button>
          </div>
          <p class="mcx-midifx-hint">${t('mcx.midiCard1Hint')}</p>
        </div>
      </section>

      <section class="mcx-module-card mcx-card-arp" title="${t('mcx.midiCard2Title')}">
        <div class="mcx-module-head">
          <span class="mcx-module-title">${t('mcx.midiCard2Head')}</span>
          <span class="mcx-module-badge is-fx">ARP FX</span>
        </div>
        <div class="mcx-module-body mcx-stack-col mcx-midifx-card-body">
          <button type="button" class="mcx-midifx-toggle-btn" id="mcx-drawer-arp-btn" data-act="drawer-arp">${t('mcx.midiArpOff')}</button>
          <div class="mcx-midifx-actions">
            <button type="button" class="mcx-midifx-action-btn" data-act="open-arp">${t('mcx.midiConfigArp')} ${LAUNCH_SVG}</button>
          </div>
          <p class="mcx-midifx-hint">${t('mcx.midiCard2Hint')}</p>
        </div>
      </section>

      <section class="mcx-module-card mcx-card-scale" title="${t('mcx.midiCard3Title')}">
        <div class="mcx-module-head">
          <span class="mcx-module-title">${t('mcx.midiCard3Head')}</span>
          <span class="mcx-module-badge">PITCH FX</span>
        </div>
        <div class="mcx-module-body mcx-stack-col mcx-midifx-card-body">
          <button type="button" class="mcx-midifx-toggle-btn is-active" id="mcx-midifx-tr-btn" data-act="drawer-tr">${t('mcx.midiTrOn')}</button>
          <p class="mcx-midifx-hint" id="mcx-midifx-tr-hint">${t('mcx.midiTrHint')}</p>
        </div>
      </section>

      <section class="mcx-module-card mcx-card-offsets" title="${t('mcx.midiCard4Title')}">
        <div class="mcx-module-head">
          <span class="mcx-module-title">${t('mcx.midiCard4Head')}</span>
          <span class="mcx-module-badge">TRK MOD</span>
        </div>
        <div class="mcx-module-body mcx-stack-col mcx-midifx-card-body">
          <div class="mcx-knobs-row">
            ${knobCell('cutoffOffset', t('mcx.macroCutoff'), '0%')}
            ${knobCell('resonanceOffset', t('mcx.macroResonance'), '0%')}
            ${knobCell('envAttackOffset', t('mcx.macroAttack'), '0%')}
            ${knobCell('envDecayOffset', t('mcx.macroDecay'), '0%')}
            ${knobCell('envReleaseOffset', t('mcx.macroRelease'), '0%')}
            ${knobCell('vibratoOffset', t('mcx.macroVibrato'), '0%')}
          </div>
          <div class="mcx-midifx-actions">
            <button type="button" class="mcx-midifx-action-btn" data-act="reset-offsets">${t('mcx.midiResetOffsets')}</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

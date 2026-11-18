/**
 * ABDMCX0X -- McxToneDrawerLfo.ts
 * Dual LFO Modulation Section with Waveform & Target segmented button strips.
 * Strict line limit: < 200 lines.
 */

import type { McxParamKey } from '../bridge/McxHostBridge';
import type { McxPartUiState } from './McxMixerConsole';
import { knobCell, renderSegGroup } from './McxToneDrawerViews';

const ST = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const svgW = (d: string) => `<svg viewBox="0 0 24 16" width="18" height="12" aria-hidden="true" focusable="false">${d}</svg>`;

export const LFO_WAVES = [
  { id: 0, label: 'SINE', title: 'Seno (Sine)', svg: svgW(`<path d="M2 8 C5 1.5, 8 1.5, 12 8 S 19 14.5, 22 8" ${ST}/>`) },
  { id: 1, label: 'TRI', title: 'Triángulo (Triangle)', svg: svgW(`<path d="M2 11 L7 4 L12 12 L17 4 L22 12" ${ST}/>`) },
  { id: 2, label: 'SQR', title: 'Cuadrada (Square)', svg: svgW(`<path d="M2 12 L2 4 L12 4 L12 12 L22 12 L22 4" ${ST}/>`) },
  { id: 3, label: 'RAMP+', title: 'Rampa ascendente (Saw Up)', svg: svgW(`<path d="M2 12 L11 4 L11 12 L20 4 L20 12" ${ST}/>`) },
  { id: 4, label: 'SAW-', title: 'Sierra descendente (Saw Down)', svg: svgW(`<path d="M2 4 L11 12 L11 4 L20 12 L20 4" ${ST}/>`) },
  { id: 5, label: 'S&H', title: 'Sample & Hold', svg: svgW('<circle cx="3" cy="9" r="1.3" fill="currentColor"/><circle cx="7.5" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="16.5" cy="6" r="1.3" fill="currentColor"/><circle cx="21" cy="10" r="1.3" fill="currentColor"/>') },
  { id: 6, label: 'GLIDE', title: 'Sample & Glide', svg: svgW(`<path d="M2 11 Q6 5 10 9 T18 6 L22 10" ${ST}/><circle cx="3" cy="9" r="1.1" fill="currentColor"/><circle cx="12" cy="10" r="1.1" fill="currentColor"/><circle cx="21" cy="8" r="1.1" fill="currentColor"/>`) },
  { id: 7, label: 'PULSE', title: 'Pulso 25%', svg: svgW(`<path d="M2 12 L2 4 L8 4 L8 12 L22 12" ${ST}/>`) },
];

export const LFO_TRIGGERS = [
  { id: 0, label: 'VOICE', title: 'Retrigger por tecla' }, { id: 1, label: 'BEAT', title: 'Sync al compás' }, { id: 2, label: 'FREE', title: 'Oscilador libre' },
];

export const LFO1_TARGETS = [
  { id: 0, label: 'PITCH', title: 'Pitch principal (Vibrato)' }, { id: 1, label: 'FINE', title: 'Pitch fino (Chorus)' },
  { id: 2, label: 'PAN', title: 'Panorama estéreo (Auto-Pan)' }, { id: 3, label: 'VECTOR', title: 'Plano Vector 2D (Morphing)' },
];

export const LFO2_TARGETS = [
  { id: 0, label: 'CUTOFF', title: 'Frecuencia de corte (Wah/Sweep)' }, { id: 1, label: 'RESO', title: 'Resonancia de filtro' },
  { id: 2, label: 'LEVEL', title: 'Nivel VCA (Trémolo)' }, { id: 3, label: 'DRIVE', title: 'Saturación y armónicos' },
];

function renderLfoPaneHtml(idx: 1 | 2): string {
  const isLfo1 = idx === 1;
  const targets = isLfo1 ? LFO1_TARGETS : LFO2_TARGETS;

  return `
    <div class="mcx-lfo-pane${isLfo1 ? ' is-active' : ''}" data-lfo-pane="${idx}">
      <div class="mcx-lfo-ctrl-row">
        ${renderSegGroup(`lfo${idx}Trigger`, 'TRIGGER', LFO_TRIGGERS, 0, 'mcx-lfo-trig-seg')}
        <div class="mcx-lfo-right-actions">
          <div class="mcx-lfo-sync-wrap">
            <span class="mcx-segmented-lbl">TEMPO</span>
            <button type="button" class="mcx-lfo-sync-btn" data-lfo-sync="${idx}" title="Alterna entre Hz y métrica BPM">
              Hz
            </button>
          </div>
          <button type="button" class="mcx-lfo-power-btn" data-lfo-power="${idx}" title="Encender/Apagar LFO ${idx} (Ahorro CPU)">
            ON
          </button>
        </div>
      </div>

      <div class="mcx-lfo-strip-box">
        <span class="mcx-segmented-lbl">FORMA DE ONDA</span>
        <div class="mcx-segmented-strip mcx-lfo-waves-strip">
          ${LFO_WAVES.map((w) => `
            <button type="button" class="mcx-seg-btn mcx-lfo-wave-btn" data-lfo-wave="${idx}" data-val="${w.id}" title="${w.title}">
              ${w.svg}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="mcx-knobs-row mcx-lfo-knobs-row">
        ${knobCell(`lfo${idx}Rate`, 'VELOCIDAD', isLfo1 ? '2.40 Hz' : '1.20 Hz')}
        ${knobCell(`lfo${idx}Delay`, 'RETARDO', '0 ms')}
        ${knobCell(`lfo${idx}Depth`, 'PROFUND.', '0%')}
      </div>

      <div class="mcx-lfo-strip-box">
        <span class="mcx-segmented-lbl">DESTINO MODULACIÓN</span>
        <div class="mcx-segmented-strip mcx-lfo-targets-strip">
          ${targets.map((t) => `
            <button type="button" class="mcx-seg-btn mcx-lfo-tgt-btn" data-lfo-tgt="${idx}" data-val="${t.id}" title="${t.title}">
              ${t.label}
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

export function buildLfoCardHtml(): string {
  return `
    <section class="mcx-module-card mcx-card-lfo" title="Moduladores LFO duales (LFO 1: Pitch/Pan, LFO 2: Timbre/Amp)">
      <div class="mcx-module-head">
        <div class="mcx-head-title-wrap">
          <span class="mcx-module-title">LFO DUAL</span>
          <div class="mcx-lfo-tab-group">
            <button type="button" class="mcx-lfo-tab-btn is-active" data-lfo-tab="1" title="LFO 1: Pitch / Pan">LFO 1</button>
            <button type="button" class="mcx-lfo-tab-btn" data-lfo-tab="2" title="LFO 2: Filter / Amp">LFO 2</button>
          </div>
        </div>
        <div class="mcx-lfo-head-right">
          <span class="mcx-lfo-phase-led" id="mcx-lfo-led" title="Indicador de fase de LFO"></span>
          <span class="mcx-module-badge">MOD</span>
        </div>
      </div>
      <div class="mcx-module-body mcx-lfo-body">
        ${renderLfoPaneHtml(1)}
        ${renderLfoPaneHtml(2)}
      </div>
    </section>
  `;
}

export function bindLfoEvents(
  rootEl: HTMLElement,
  _getPart: () => number,
  onParamChange: (param: McxParamKey, val: number, txt: string) => void
): void {
  rootEl.querySelectorAll<HTMLButtonElement>('[data-lfo-tab]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const tab = btn.dataset.lfoTab ?? '1';
      rootEl.querySelectorAll('.mcx-lfo-tab-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      rootEl.querySelectorAll<HTMLElement>('[data-lfo-pane]').forEach((p) => {
        p.classList.toggle('is-active', p.dataset.lfoPane === tab);
      });
    });
  });

  rootEl.querySelectorAll<HTMLButtonElement>('[data-lfo-power]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const idx = btn.dataset.lfoPower === '2' ? 2 : 1, isOff = btn.classList.toggle('is-off');
      btn.textContent = isOff ? 'OFF' : 'ON';
      rootEl.querySelector(`[data-lfo-pane="${idx}"]`)?.classList.toggle('is-off', isOff);
      onParamChange(`lfo${idx}Enabled` as any, isOff ? 0 : 1, isOff ? 'OFF' : 'ON');
    });
  });

  rootEl.querySelectorAll<HTMLButtonElement>('[data-lfo-sync]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const idx = btn.dataset.lfoSync === '2' ? 2 : 1, isSync = btn.classList.toggle('is-sync');
      btn.textContent = isSync ? 'BPM SYNC' : 'Hz';
      onParamChange(`lfo${idx}Sync`, isSync ? 1 : 0, isSync ? 'BPM SYNC' : 'Hz');
    });
  });

  rootEl.querySelectorAll<HTMLButtonElement>('[data-lfo-wave]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const idx = btn.dataset.lfoWave === '2' ? 2 : 1, val = parseInt(btn.dataset.val ?? '0', 10);
      rootEl.querySelectorAll<HTMLButtonElement>(`[data-lfo-wave="${idx}"]`).forEach((b) => b.classList.toggle('is-active', b === btn));
      const w = LFO_WAVES.find((s) => s.id === val);
      onParamChange(`lfo${idx}Shape`, val, w?.label || String(val));
    });
  });

  rootEl.querySelectorAll<HTMLButtonElement>('[data-lfo-tgt]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const idx = btn.dataset.lfoTgt === '2' ? 2 : 1, val = parseInt(btn.dataset.val ?? '0', 10);
      rootEl.querySelectorAll<HTMLButtonElement>(`[data-lfo-tgt="${idx}"]`).forEach((b) => b.classList.toggle('is-active', b === btn));
      const targets = idx === 1 ? LFO1_TARGETS : LFO2_TARGETS;
      const tg = targets.find((t) => t.id === val);
      onParamChange(`lfo${idx}Target`, val, tg?.label || String(val));
    });
  });
}

export function syncLfoCard(rootEl: HTMLElement, ps: McxPartUiState): void {
  for (const idx of [1, 2] as const) {
    const shVal = idx === 1 ? (ps.lfo1Shape ?? 0) : (ps.lfo2Shape ?? 0);
    rootEl.querySelectorAll<HTMLButtonElement>(`[data-lfo-wave="${idx}"]`).forEach((b) => {
      b.classList.toggle('is-active', parseInt(b.dataset.val ?? '-1', 10) === shVal);
    });
    const tgVal = idx === 1 ? (ps.lfo1Target ?? 0) : (ps.lfo2Target ?? 0);
    rootEl.querySelectorAll<HTMLButtonElement>(`[data-lfo-tgt="${idx}"]`).forEach((b) => {
      b.classList.toggle('is-active', parseInt(b.dataset.val ?? '-1', 10) === tgVal);
    });
    const isSync = Boolean(idx === 1 ? ps.lfo1Sync : ps.lfo2Sync);
    const syncBtn = rootEl.querySelector<HTMLButtonElement>(`[data-lfo-sync="${idx}"]`);
    if (syncBtn) {
      syncBtn.classList.toggle('is-sync', isSync);
      syncBtn.textContent = isSync ? 'BPM SYNC' : 'Hz';
    }
    const isOff = (ps as any)[`lfo${idx}Enabled`] === 0 || (ps as any)[`lfo${idx}Mute`] === 1;
    const pwrBtn = rootEl.querySelector<HTMLButtonElement>(`[data-lfo-power="${idx}"]`);
    if (pwrBtn) {
      pwrBtn.classList.toggle('is-off', isOff);
      pwrBtn.textContent = isOff ? 'OFF' : 'ON';
    }
    rootEl.querySelector(`[data-lfo-pane="${idx}"]`)?.classList.toggle('is-off', isOff);
  }
}

/**
 * ABDMCX0X -- McxToneDrawerDeck1.ts
 * Deck 1 (Superior): Configuration & Route, Pitch, Glide, Vector 2D,
 * Dual Filters in Series, and Saturation Drive.
 * Strict line limit: < 200 lines.
 */

import {
  FILTER_MODELS, FILTER_MODES, STRUCTURE_MODES, ROUTE_MODES, GLIDE_MODES, DRIVE_TYPES,
  knobCell, renderSegGroup,
} from './McxToneDrawerViews';

export function buildDeck1Html(): string {
  const fModelItems = FILTER_MODELS.map((m) => ({ id: m.id, label: m.shortLabel, title: m.label }));

  return `
    <div class="mcx-tone-deck mcx-deck-1">
      <!-- CONFIGURACIÓN Y RUTA (VOZ) -->
      <section class="mcx-module-card mcx-card-config" title="Canal MIDI, Transposición, Estructura y Enrutamiento de voz">
        <div class="mcx-module-head">
          <span class="mcx-module-title">CONFIG &amp; RUTA</span>
          <span class="mcx-module-badge">VOZ</span>
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
          ${renderSegGroup('structureMode', 'ESTRUCTURA', STRUCTURE_MODES, 0)}
          ${renderSegGroup('routeMode', 'RUTA SALIDA', ROUTE_MODES, 0)}
        </div>
      </section>

      <!-- AFINACIÓN (PITCH) -->
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

      <!-- GLIDE / PORTAMENTO -->
      <section class="mcx-module-card mcx-card-glide" title="Portamento / Glide y modo de transición">
        <div class="mcx-module-head">
          <span class="mcx-module-title">PORTAMENTO</span>
          <span class="mcx-module-badge">GLIDE</span>
        </div>
        <div class="mcx-module-body mcx-stack-col">
          ${renderSegGroup('portaMode', 'MODO', GLIDE_MODES, 0)}
          <div class="mcx-knobs-row">
            ${knobCell('portaTimeMs', 'TIEMPO', '60 ms')}
          </div>
        </div>
      </section>

      <!-- VECTOR 2D -->
      <section class="mcx-module-card mcx-card-vector" title="Expresión Vectorial 4-Partial (Plano X / Y)">
        <div class="mcx-module-head">
          <span class="mcx-module-title">VECTOR 2D</span>
          <span class="mcx-module-badge">VEC</span>
        </div>
        <div class="mcx-module-body">
          <div class="mcx-knobs-row">
            ${knobCell('vectorX', 'VEC X', '0.00')}
            ${knobCell('vectorY', 'VEC Y', '0.00')}
          </div>
        </div>
      </section>

      <!-- FILTROS DUALES (VCF 1 -> 2 EN SERIE) -->
      <section class="mcx-module-card mcx-card-filters" title="Filtros Duales en Serie: Tipo antes que Modelo, sin duplicidad de tipo ni modelo">
        <div class="mcx-module-head">
          <div class="mcx-head-title-wrap">
            <span class="mcx-module-title">FILTROS DUALES (SERIE)</span>
            <span class="mcx-filter-conflict-warn" id="mcx-vcf-conflict-warn" style="display: none;">⚠ CONFLICTO</span>
          </div>
          <span class="mcx-module-badge">DUAL VCF</span>
        </div>
        <div class="mcx-module-body mcx-dual-vcf-body">
          <!-- VCF 1 -->
          <div class="mcx-vcf-unit" data-vcf="1">
            <div class="mcx-vcf-tag">VCF 1 (VOZ)</div>
            ${renderSegGroup('filterMode', 'TIPO', FILTER_MODES, 0, 'mcx-vcf-type-seg')}
            ${renderSegGroup('filterModel', 'MODELO', fModelItems, 0, 'mcx-vcf-model-seg')}
            <div class="mcx-knobs-row">
              ${knobCell('filterCutoff', 'F1 CORTE', '3200 Hz')}
              ${knobCell('filterResonance', 'F1 RESO', '18%')}
            </div>
          </div>

          <div class="mcx-filter-flow-arrow" title="Conexión en Serie VCF 1 hacia VCF 2">➔</div>

          <!-- VCF 2 -->
          <div class="mcx-vcf-unit" data-vcf="2">
            <div class="mcx-vcf-tag">VCF 2 (CANAL)</div>
            ${renderSegGroup('filter2Mode', 'TIPO', FILTER_MODES, 1, 'mcx-vcf-type-seg')}
            ${renderSegGroup('filter2Model', 'MODELO', fModelItems, 0, 'mcx-vcf-model-seg')}
            <div class="mcx-knobs-row">
              ${knobCell('filter2Cutoff', 'F2 CORTE', '8000 Hz')}
              ${knobCell('filter2Resonance', 'F2 RESO', '10%')}
            </div>
          </div>
        </div>
      </section>

      <!-- SATURACIÓN & DRIVE -->
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
  `;
}

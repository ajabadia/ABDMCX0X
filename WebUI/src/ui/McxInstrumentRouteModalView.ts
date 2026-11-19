/**
 * ABDMCX0X -- McxInstrumentRouteModalView.ts
 * HTML renderer for McxInstrumentRouteModal (<dialog>).
 * Strict line limit: < 200 lines.
 */

import type { McxEngineDescriptorDto } from '../bridge/McxHostBridge';
import type { McxPartUiState } from './McxMixerConsole';

export function buildRouteModalHtml(
  partIdx: number,
  ps: McxPartUiState,
  catalog: McxEngineDescriptorDto[],
  presets: Array<{ index: number; name: string }>,
  midiOutputs?: Array<{ name: string }>
): string {
  const isDrum = ps.kind === 'drum_map';
  const routeMode = ps.routeMode ?? 0;
  const isExt = routeMode === 1;
  const isLayer = routeMode === 2;
  const engIdx = ps.engineTypeIndex ?? (isExt ? 1 : 0);
  const activePreset = ps.factoryPresetIndex ?? (isDrum ? 16 : partIdx);

  const curEngine = catalog.find((e) => e.index === engIdx);
  const canChooseFormat = !isExt && curEngine
    ? curEngine.supportsDrumMode !== false && curEngine.supportsChromaticMode !== false
    : true;
  const internalEngines = catalog.filter((e) => e.typeId !== 'external_midi');

  return `
    <div class="mcx-route-shell">
      <div class="mcx-route-head">
        <div class="mcx-route-head-left">
          <span class="mcx-route-part-badge">P${String(partIdx + 1).padStart(2, '0')}</span>
          <h2 class="mcx-route-title" id="mcx-route-title">Asignación de Pista</h2>
          <span class="mcx-route-name-pill">${ps.name || `Pista ${partIdx + 1}`}</span>
        </div>
        <button type="button" class="mcx-route-close" data-act="close" aria-label="Cerrar"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="mcx-route-body">
        <div class="mcx-route-section">
          <span class="mcx-route-label">1. Destino del Instrumento</span>
          <div class="mcx-route-btn-group">
            <button type="button" class="mcx-route-choice${routeMode === 0 ? ' is-active' : ''}" data-route="0">Interno (DSP)</button>
            <button type="button" class="mcx-route-choice is-ext${isExt ? ' is-active' : ''}" data-route="1">Externo (MIDI Out)</button>
            <button type="button" class="mcx-route-choice${isLayer ? ' is-active' : ''}" data-route="2">Capa Doble (A+B)</button>
          </div>
        </div>

        ${isExt ? `
          <div class="mcx-route-section">
            <span class="mcx-route-label">2. Instrumento Externo (Hardware / Plugin DAW)</span>
            <div class="mcx-route-midi-row">
              <div><label class="mcx-route-label" for="mcx-route-port">Puerto MIDI</label>
                <select class="mcx-route-select" id="mcx-route-port">
                  ${(midiOutputs && midiOutputs.length > 0)
                    ? midiOutputs.map((o, idx) => `<option value="${idx}"${(ps.midiPortIndex ?? 0) === idx ? ' selected' : ''}>${o.name || `Puerto ${idx + 1}`}</option>`).join('')
                    : Array.from({ length: 8 }, (_, idx) => `<option value="${idx}"${(ps.midiPortIndex ?? 0) === idx ? ' selected' : ''}>Puerto ${idx + 1}</option>`).join('')}
                </select>
              </div>
              <div><label class="mcx-route-label" for="mcx-route-ch">Canal MIDI</label>
                <select class="mcx-route-select" id="mcx-route-ch">
                  ${Array.from({ length: 16 }, (_, idx) => `<option value="${idx + 1}"${ps.midiChannel === idx + 1 ? ' selected' : ''}>Canal ${String(idx + 1).padStart(2, '0')}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
        ` : `
          <div class="mcx-route-section">
            <span class="mcx-route-label">2. Motor de Síntesis Interno</span>
            <div class="mcx-route-two-cols">
              <select class="mcx-route-select" id="mcx-route-engine" autofocus>
                ${internalEngines.map((e) => `<option value="${e.index}"${e.index === engIdx ? ' selected' : ''}>${e.displayName}</option>`).join('')}
              </select>
              <select class="mcx-route-select" id="mcx-route-preset" ${presets.length === 0 ? 'disabled' : ''}>
                ${presets.length === 0 ? '<option value="-1">Sin presets</option>' : presets.map((pr) => `<option value="${pr.index}"${pr.index === activePreset ? ' selected' : ''}>${pr.name}</option>`).join('')}
              </select>
            </div>
          </div>
          ${isLayer ? `
            <div class="mcx-route-section">
              <span class="mcx-route-label">Capa Externa B (Salida MIDI)</span>
              <div class="mcx-route-midi-row">
                <div><label class="mcx-route-label" for="mcx-route-port">Puerto</label>
                  <select class="mcx-route-select" id="mcx-route-port">
                    ${Array.from({ length: 8 }, (_, idx) => `<option value="${idx}"${(ps.midiPortIndex ?? 0) === idx ? ' selected' : ''}>Puerto ${idx + 1}</option>`).join('')}
                  </select>
                </div>
                <div><label class="mcx-route-label" for="mcx-route-ch">Canal</label>
                  <select class="mcx-route-select" id="mcx-route-ch">
                    ${Array.from({ length: 16 }, (_, idx) => `<option value="${idx + 1}"${ps.midiChannel === idx + 1 ? ' selected' : ''}>Canal ${String(idx + 1).padStart(2, '0')}</option>`).join('')}
                  </select>
                </div>
              </div>
            </div>
          ` : ''}
        `}

        <div class="mcx-route-section">
          <span class="mcx-route-label">3. Formato Musical y Transposición</span>
          ${canChooseFormat ? `
            <div class="mcx-route-btn-group">
              <button type="button" class="mcx-route-choice${!isDrum ? ' is-active' : ''}" data-kind="chromatic">Cromático (Melodía)</button>
              <button type="button" class="mcx-route-choice is-drum${isDrum ? ' is-active' : ''}" data-kind="drum_map">Batería / Drum Map</button>
              <button type="button" class="mcx-route-choice${ps.followTranspose !== false && !isDrum ? ' is-active' : ''}" data-act="toggle-tr" ${isDrum ? 'disabled' : ''}>
                ${isDrum ? 'TR: Fijo Drum' : (ps.followTranspose !== false ? 'TR Global: ON' : 'TR Global: OFF')}
              </button>
            </div>
          ` : `
            <div class="mcx-route-fixed-format">
              <span class="mcx-route-format-tag">${isDrum ? 'Batería / Drum Map (Fijado por motor)' : 'Cromático / Tonal (Fijado por motor)'}</span>
              <button type="button" class="mcx-route-choice${ps.followTranspose !== false && !isDrum ? ' is-active' : ''}" data-act="toggle-tr" ${isDrum ? 'disabled' : ''}>
                ${isDrum ? 'TR: Fijo Drum' : (ps.followTranspose !== false ? 'TR Global: ON' : 'TR Global: OFF')}
              </button>
            </div>
          `}
        </div>
      </div>
      <div class="mcx-route-foot">
        <button type="button" class="mcx-route-btn" data-act="audition"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg><span>Probar sonido</span></button>
        <div class="mcx-route-foot-right">
          <button type="button" class="mcx-route-btn is-primary" data-act="open-tone"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M6 5v7"/><path d="M10 5v7"/><path d="M14 5v7"/><path d="M18 5v7"/><path d="M2 12h20"/></svg><span>Editar Instrumento</span></button>
          <button type="button" class="mcx-route-btn" data-act="close">Listo</button>
        </div>
      </div>
    </div>`;
}

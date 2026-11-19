/**
 * ABDMCX0X -- McxInstrumentRouteModalView.ts
 * HTML renderer for McxInstrumentRouteModal (<dialog>).
 * Strict line limit: < 200 lines.
 */

import type { McxEngineDescriptorDto } from '../bridge/McxHostBridge';
import { t } from '../i18n/mcxI18n';
import type { McxPartUiState } from './McxMixerConsole';

const renderMidiPortOptions = (midiOutputs: Array<{ name: string }> | undefined, selected: number): string => {
  const count = midiOutputs && midiOutputs.length > 0 ? midiOutputs.length : 8;
  const portLbl = t('mcx.routePort');
  return Array.from({ length: count }, (_, idx) => {
    const label = midiOutputs?.[idx]?.name || `${portLbl} ${idx + 1}`;
    return `<option value="${idx}"${selected === idx ? ' selected' : ''}>${label}</option>`;
  }).join('');
};

const renderMidiChannelOptions = (selected: number): string => {
  const chLbl = t('mcx.routeCh');
  return Array.from({ length: 16 }, (_, idx) =>
    `<option value="${idx + 1}"${selected === idx + 1 ? ' selected' : ''}>${chLbl} ${String(idx + 1).padStart(2, '0')}</option>`
  ).join('');
};

export function buildRouteModalHtml(
  partIdx: number,
  ps: McxPartUiState,
  catalog: McxEngineDescriptorDto[],
  presets: Array<{ index: number; name: string }>,
  midiOutputs?: Array<{ name: string }>
): string {
  const isDrum = ps.kind === 'drum_map', routeMode = ps.routeMode ?? 0;
  const isExt = routeMode === 1, isLayer = routeMode === 2;
  const engIdx = ps.engineTypeIndex ?? (isExt ? 1 : 0);
  const activePreset = ps.factoryPresetIndex ?? (isDrum ? 16 : partIdx);
  const curEngine = catalog.find((e) => e.index === engIdx);
  const canChooseFormat = !isExt && curEngine ? curEngine.supportsDrumMode !== false && curEngine.supportsChromaticMode !== false : true;
  const internalEngines = catalog.filter((e) => e.typeId !== 'external_midi');
  const portIdx = ps.midiPortIndex ?? 0, trLabel = isDrum ? t('mcx.routeTrFixed') : (ps.followTranspose !== false ? t('mcx.routeTrOn') : t('mcx.routeTrOff'));

  return `
    <div class="mcx-route-shell">
      <div class="mcx-route-head" data-drag-handle>
        <div class="mcx-route-head-left">
          <span class="mcx-route-part-badge">P${String(partIdx + 1).padStart(2, '0')}</span>
          <h2 class="mcx-route-title" id="mcx-route-title">${t('mcx.routeHeading')}</h2>
          <span class="mcx-route-name-pill">${ps.name || `${t('mcx.routeTrackName')} ${partIdx + 1}`}</span>
        </div>
        <button type="button" class="mcx-route-close" data-act="close" aria-label="${t('mcx.closeDrawer')}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="mcx-route-body">
        <div class="mcx-route-section">
          <span class="mcx-route-label">${t('mcx.routeDestLabel')}</span>
          <div class="mcx-route-btn-group">
            <button type="button" class="mcx-route-choice${routeMode === 0 ? ' is-active' : ''}" data-route="0">${t('mcx.routeDestInt')}</button>
            <button type="button" class="mcx-route-choice is-ext${isExt ? ' is-active' : ''}" data-route="1">${t('mcx.routeDestExt')}</button>
            <button type="button" class="mcx-route-choice${isLayer ? ' is-active' : ''}" data-route="2">${t('mcx.routeDestDual')}</button>
          </div>
        </div>
        ${isExt ? `
          <div class="mcx-route-section">
            <span class="mcx-route-label">${t('mcx.routeExtHead')}</span>
            <div class="mcx-route-midi-row">
              <div><label class="mcx-route-label" for="mcx-route-port">${t('mcx.routeMidiPort')}</label>
                <select class="mcx-route-select" id="mcx-route-port">${renderMidiPortOptions(midiOutputs, portIdx)}</select></div>
              <div><label class="mcx-route-label" for="mcx-route-ch">${t('mcx.routeMidiCh')}</label>
                <select class="mcx-route-select" id="mcx-route-ch">${renderMidiChannelOptions(ps.midiChannel)}</select></div>
            </div>
          </div>
        ` : `
          <div class="mcx-route-section">
            <span class="mcx-route-label">${t('mcx.routeIntHead')}</span>
            <div class="mcx-route-two-cols">
              <select class="mcx-route-select" id="mcx-route-engine" autofocus>${internalEngines.map((e) => `<option value="${e.index}"${e.index === engIdx ? ' selected' : ''}>${e.displayName}</option>`).join('')}</select>
              <select class="mcx-route-select" id="mcx-route-preset" ${presets.length === 0 ? 'disabled' : ''}>${presets.length === 0 ? `<option value="-1">${t('mcx.routeNoPresets')}</option>` : presets.map((pr) => `<option value="${pr.index}"${pr.index === activePreset ? ' selected' : ''}>${pr.name}</option>`).join('')}</select>
            </div>
          </div>
          ${isLayer ? `
            <div class="mcx-route-section">
              <span class="mcx-route-label">${t('mcx.routeLayerBHead')}</span>
              <div class="mcx-route-midi-row">
                <div><label class="mcx-route-label" for="mcx-route-port">${t('mcx.routeMidiPort')}</label>
                  <select class="mcx-route-select" id="mcx-route-port">${renderMidiPortOptions(midiOutputs, portIdx)}</select></div>
                <div><label class="mcx-route-label" for="mcx-route-ch">${t('mcx.routeMidiCh')}</label>
                  <select class="mcx-route-select" id="mcx-route-ch">${renderMidiChannelOptions(ps.midiChannel)}</select></div>
              </div>
            </div>
          ` : ''}
        `}
        <div class="mcx-route-section">
          <span class="mcx-route-label">${t('mcx.routeFormatHead')}</span>
          ${canChooseFormat ? `
            <div class="mcx-route-btn-group">
              <button type="button" class="mcx-route-choice${!isDrum ? ' is-active' : ''}" data-kind="chromatic">${t('mcx.routeFmtChromatic')}</button>
              <button type="button" class="mcx-route-choice is-drum${isDrum ? ' is-active' : ''}" data-kind="drum_map">${t('mcx.routeFmtDrum')}</button>
              <button type="button" class="mcx-route-choice${ps.followTranspose !== false && !isDrum ? ' is-active' : ''}" data-act="toggle-tr" ${isDrum ? 'disabled' : ''}>${trLabel}</button>
            </div>
          ` : `
            <div class="mcx-route-fixed-format">
              <span class="mcx-route-format-tag">${isDrum ? t('mcx.routeFmtFixedDrum') : t('mcx.routeFmtFixedChrom')}</span>
              <button type="button" class="mcx-route-choice${ps.followTranspose !== false && !isDrum ? ' is-active' : ''}" data-act="toggle-tr" ${isDrum ? 'disabled' : ''}>${trLabel}</button>
            </div>
          `}
        </div>
      </div>
      <div class="mcx-route-foot">
        <button type="button" class="mcx-route-btn" data-act="audition"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg><span>${t('mcx.routeAudition')}</span></button>
        <div class="mcx-route-foot-right">
          <button type="button" class="mcx-route-btn is-primary" data-act="open-tone"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M6 5v7"/><path d="M10 5v7"/><path d="M14 5v7"/><path d="M18 5v7"/><path d="M2 12h20"/></svg><span>${t('mcx.routeEditInst')}</span></button>
          <button type="button" class="mcx-route-btn" data-act="close">${t('mcx.routeDone')}</button>
        </div>
      </div>
    </div>`;
}

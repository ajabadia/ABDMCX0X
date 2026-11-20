/**
 * ABDMCX0X -- McxInstrumentRouteModalView.ts
 * HTML renderer for McxInstrumentRouteModal (<dialog>).
 * Strict line limit: < 200 lines.
 */

import type { McxEngineDescriptorDto, McxMidiDeviceInfoDto, McxMidiDevicesDto } from '../bridge/McxHostBridge';
import { t } from '../i18n/mcxI18n';
import { ICON_CLOSE, ICON_REFRESH } from './mcxIcons';
import type { McxPartUiState } from './McxMixerConsole';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderMidiInOptions(inputs: McxMidiDeviceInfoDto[], selected: number, savedName?: string): string {
  const opts = [
    `<option value="-1"${selected < 0 ? ' selected' : ''}>${esc(t('mcx.routeMidiNone'))}</option>`,
    `<option value="0"${selected === 0 ? ' selected' : ''}>${esc(t('mcx.routeMidiDawHost'))}</option>`,
  ];
  let matched = selected <= 0;
  for (const d of inputs) {
    const isSel = selected === d.portIndex;
    if (isSel) matched = true;
    const offTag = d.enabled ? '' : ' [OFF]';
    opts.push(`<option value="${d.portIndex}"${isSel ? ' selected' : ''}>${esc(d.name)}${offTag}</option>`);
  }
  if (!matched && (selected > 0 || savedName)) {
    const label = savedName || `${t('mcx.routePort')} ${selected}`;
    opts.push(`<option value="${selected}" disabled selected>${esc(label)} ${esc(t('mcx.routeMidiDisconnected'))}</option>`);
  }
  return opts.join('');
}

function renderMidiOutOptions(outputs: McxMidiDeviceInfoDto[], selected: number, savedName?: string): string {
  const opts = [`<option value="0"${selected === 0 ? ' selected' : ''}>${esc(t('mcx.routeMidiDawOut'))}</option>`];
  let matched = selected <= 0;
  for (const d of outputs) {
    const isSel = selected === d.portIndex;
    if (isSel) matched = true;
    const offTag = d.enabled ? '' : ' [OFF]';
    opts.push(`<option value="${d.portIndex}"${isSel ? ' selected' : ''}>${esc(d.name)}${offTag}</option>`);
  }
  if (!matched && (selected > 0 || savedName)) {
    const label = savedName || `${t('mcx.routePort')} ${selected}`;
    opts.push(`<option value="${selected}" disabled selected>${esc(label)} ${esc(t('mcx.routeMidiDisconnected'))}</option>`);
  }
  return opts.join('');
}

const renderMidiChannelOptions = (selected: number): string => {
  const chLbl = t('mcx.routeCh');
  return Array.from({ length: 16 }, (_, idx) =>
    `<option value="${idx + 1}"${selected === idx + 1 ? ' selected' : ''}>${esc(chLbl)} ${String(idx + 1).padStart(2, '0')}</option>`
  ).join('');
};

export function buildRouteModalHtml(
  partIdx: number,
  ps: McxPartUiState,
  catalog: McxEngineDescriptorDto[],
  presets: Array<{ index: number; name: string }>,
  midiDevices: McxMidiDevicesDto = { isStandalone: true, inputs: [], outputs: [] }
): string {
  const isDrum = ps.kind === 'drum_map', routeMode = ps.routeMode ?? 0;
  const isExt = routeMode === 1, isLayer = routeMode === 2, showMidiOut = isExt || isLayer;
  const engIdx = ps.engineTypeIndex ?? (isExt ? 1 : 0);
  const activePreset = ps.factoryPresetIndex ?? (isDrum ? 16 : partIdx);
  const curEngine = catalog.find((e) => e.index === engIdx);
  const canChooseFormat = !isExt && curEngine ? curEngine.supportsDrumMode !== false && curEngine.supportsChromaticMode !== false : true;
  const internalEngines = catalog.filter((e) => e.typeId !== 'external_midi');
  const inPortIdx = ps.midiInPortIndex ?? 0, outPortIdx = ps.midiPortIndex ?? 0;
  const trLabel = isDrum ? t('mcx.routeTrFixed') : (ps.followTranspose !== false ? t('mcx.routeTrOn') : t('mcx.routeTrOff'));

  return `
    <div class="mcx-route-shell">
      <div class="mcx-route-head" data-drag-handle>
        <div class="mcx-route-head-left">
          <span class="mcx-route-part-badge">P${String(partIdx + 1).padStart(2, '0')}</span>
          <h2 class="mcx-route-title" id="mcx-route-title">${esc(t('mcx.routeHeading'))}</h2>
          <span class="mcx-route-name-pill">${esc(ps.name || `${t('mcx.routeTrackName')} ${partIdx + 1}`)}</span>
        </div>
        <button type="button" class="mcx-route-close" data-act="close" aria-label="${esc(t('mcx.closeDrawer'))}">${ICON_CLOSE}</button>
      </div>
      <div class="mcx-route-body">
        <div class="mcx-route-section">
          <span class="mcx-route-label">${esc(t('mcx.routeDestLabel'))}</span>
          <div class="mcx-route-btn-group">
            <button type="button" class="mcx-route-choice${routeMode === 0 ? ' is-active' : ''}" data-route="0">${esc(t('mcx.routeDestInt'))}</button>
            <button type="button" class="mcx-route-choice is-ext${isExt ? ' is-active' : ''}" data-route="1">${esc(t('mcx.routeDestExt'))}</button>
            <button type="button" class="mcx-route-choice${isLayer ? ' is-active' : ''}" data-route="2">${esc(t('mcx.routeDestDual'))}</button>
          </div>
        </div>
        ${!isExt ? `
          <div class="mcx-route-section">
            <span class="mcx-route-label">${esc(t('mcx.routeIntHead'))}</span>
            <div class="mcx-route-two-cols">
              <select class="mcx-route-select" id="mcx-route-engine" autofocus>${internalEngines.map((e) => `<option value="${e.index}"${e.index === engIdx ? ' selected' : ''}>${esc(e.displayName)}</option>`).join('')}</select>
              <select class="mcx-route-select" id="mcx-route-preset" ${presets.length === 0 ? 'disabled' : ''}>${presets.length === 0 ? `<option value="-1">${esc(t('mcx.routeNoPresets'))}</option>` : presets.map((pr) => `<option value="${pr.index}"${pr.index === activePreset ? ' selected' : ''}>${esc(pr.name)}</option>`).join('')}</select>
            </div>
          </div>
        ` : ''}
        <div class="mcx-route-section">
          <div class="mcx-route-midi-head-row">
            <span class="mcx-route-label">${esc(isExt ? t('mcx.routeExtHead') : isLayer ? t('mcx.routeLayerBHead') : t('mcx.routeMidiIn'))}</span>
            <button type="button" class="mcx-route-refresh-btn" data-act="refresh-midi">${ICON_REFRESH}<span>${esc(t('mcx.routeMidiRefresh'))}</span></button>
          </div>
          <div class="mcx-route-midi-row${showMidiOut ? '' : ' mcx-route-midi-row--two'}">
            <div><label class="mcx-route-label" for="mcx-route-in-port">${esc(t('mcx.routeMidiIn'))}</label>
              <select class="mcx-route-select" id="mcx-route-in-port">${renderMidiInOptions(midiDevices.inputs, inPortIdx, ps.midiInDeviceName)}</select></div>
            ${showMidiOut ? `<div><label class="mcx-route-label" for="mcx-route-port">${esc(t('mcx.routeMidiOut'))}</label>
              <select class="mcx-route-select" id="mcx-route-port">${renderMidiOutOptions(midiDevices.outputs, outPortIdx, ps.midiOutDeviceName)}</select></div>` : ''}
            <div><label class="mcx-route-label" for="mcx-route-ch">${esc(t('mcx.routeMidiCh'))}</label>
              <select class="mcx-route-select" id="mcx-route-ch">${renderMidiChannelOptions(ps.midiChannel)}</select></div>
          </div>
          ${showMidiOut && midiDevices.outputs.length === 0 ? `<p class="mcx-route-midi-empty">${esc(t('mcx.routeMidiNoOsOut'))}</p>` : ''}
        </div>
        <div class="mcx-route-section">
          <span class="mcx-route-label">${esc(t('mcx.routeFormatHead'))}</span>
          ${canChooseFormat ? `
            <div class="mcx-route-btn-group">
              <button type="button" class="mcx-route-choice${!isDrum ? ' is-active' : ''}" data-kind="chromatic">${esc(t('mcx.routeFmtChromatic'))}</button>
              <button type="button" class="mcx-route-choice is-drum${isDrum ? ' is-active' : ''}" data-kind="drum_map">${esc(t('mcx.routeFmtDrum'))}</button>
              <button type="button" class="mcx-route-choice${ps.followTranspose !== false && !isDrum ? ' is-active' : ''}" data-act="toggle-tr" ${isDrum ? 'disabled' : ''}>${esc(trLabel)}</button>
            </div>
          ` : `
            <div class="mcx-route-fixed-format">
              <span class="mcx-route-format-tag">${esc(isDrum ? t('mcx.routeFmtFixedDrum') : t('mcx.routeFmtFixedChrom'))}</span>
              <button type="button" class="mcx-route-choice${ps.followTranspose !== false && !isDrum ? ' is-active' : ''}" data-act="toggle-tr" ${isDrum ? 'disabled' : ''}>${esc(trLabel)}</button>
            </div>
          `}
        </div>
      </div>
      <div class="mcx-route-foot">
        <button type="button" class="mcx-route-btn" data-act="audition"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg><span>${esc(t('mcx.routeAudition'))}</span></button>
        <div class="mcx-route-foot-right">
          <button type="button" class="mcx-route-btn is-primary" data-act="open-tone"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M6 5v7"/><path d="M10 5v7"/><path d="M14 5v7"/><path d="M18 5v7"/><path d="M2 12h20"/></svg><span>${esc(t('mcx.routeEditInst'))}</span></button>
          <button type="button" class="mcx-route-btn" data-act="close">${esc(t('mcx.routeDone'))}</button>
        </div>
      </div>
    </div>`;
}

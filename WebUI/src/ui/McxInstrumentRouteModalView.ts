/**
 * ABDMCX0X -- McxInstrumentRouteModalView.ts
 * HTML renderer for McxInstrumentRouteModal (<dialog>).
 * Strict line limit: < 200 lines.
 */

import { attachCoverPopup } from '@abdsynths/shared/components';
import { getEngineMetadata } from '@abdsynths/shared/components/synth-engines';
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
  _presets: Array<{ index: number; name: string }> = [],
  midiDevices: McxMidiDevicesDto = { isStandalone: true, inputs: [], outputs: [] }
): string {
  const isDrum = ps.kind === 'drum_map', routeMode = ps.routeMode ?? 0;
  const isExt = routeMode === 1, isLayer = routeMode === 2, showMidiOut = isExt || isLayer;
  const engIdx = ps.engineTypeIndex ?? (isExt ? 1 : 0);
  const curEngine = catalog.find((e) => e.index === engIdx);
  const supportsBoth = Boolean(curEngine && curEngine.supportsDrumMode !== false && curEngine.supportsChromaticMode !== false);
  const internalEngines = catalog.filter((e) => e.typeId !== 'external_midi');
  const inPortIdx = ps.midiInPortIndex ?? 0, outPortIdx = ps.midiPortIndex ?? 0;
  const trLabel = isDrum ? t('mcx.routeTrFixed') : (ps.followTranspose !== false ? t('mcx.routeTrOn') : t('mcx.routeTrOff'));
  const activeSound = ps.name || `${t('mcx.routeTrackName')} ${partIdx + 1}`;
  const midiHead = isExt ? t('mcx.routeExtHead') : isLayer ? t('mcx.routeMidiDualHead') : t('mcx.routeMidiIntHead');
  const midiInLabel = showMidiOut ? t('mcx.routeMidiIn') : t('mcx.routeMidiPort');
  const fmtHead = isExt ? t('mcx.routeFormatHead') : t('mcx.routeFormatHead4');
  const fmtReadout = supportsBoth
    ? (isDrum ? t('mcx.routeFmtBySoundDrum') : t('mcx.routeFmtBySoundChrom'))
    : (isDrum ? t('mcx.routeFmtFixedDrum') : t('mcx.routeFmtFixedChrom'));

  return `
    <div class="mcx-route-shell">
      <div class="mcx-route-head" data-drag-handle>
        <div class="mcx-route-head-left">
          <span class="mcx-route-part-badge">P${String(partIdx + 1).padStart(2, '0')}</span>
          <h2 class="mcx-route-title" id="mcx-route-title">${esc(t('mcx.routeHeading'))}</h2>
          <span class="mcx-route-name-pill">${esc(activeSound)}</span>
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
            <label class="mcx-route-label" for="mcx-route-engine">${esc(t('mcx.routeIntHead'))}</label>
            <div class="mcx-route-engine-grid" role="group" aria-label="${esc(t('mcx.routeIntHead'))}">
              ${internalEngines.map((e) => {
                const m = getEngineMetadata(e.typeId), thumb = m.defaultImage ? `<img class="mcx-route-engine-thumb" src="${esc(m.defaultImage)}" alt="${esc(e.displayName)}" />` : `<span class="mcx-route-engine-ico">${m.iconSvg}</span>`;
                const capTag = `${e.supportsDrumMode !== false ? 'CHR+DRM' : 'CHR'}${e.supportsBankArchives ? ' · BNK' : ''}${e.maxRecommendedInstances ? ` · ${e.maxRecommendedInstances}V` : ''}`;
                return `<button type="button" class="mcx-route-engine-card${e.index === engIdx ? ' is-active' : ''}" data-engine-idx="${e.index}" aria-pressed="${e.index === engIdx}" title="${esc(m.description || e.displayName)}"><span class="mcx-route-engine-thumb-wrap" data-cover-engine="${esc(e.typeId)}">${thumb}</span><span class="mcx-route-engine-meta"><span class="mcx-route-engine-head"><span class="mcx-route-engine-badge">${esc(m.shortBadge)}</span><span class="mcx-route-engine-mode">${capTag}</span></span><span class="mcx-route-engine-name">${esc(e.displayName)}</span><span class="mcx-route-engine-desc">${esc(m.description || '')}</span></span></button>`;
              }).join('')}
            </div>
            <select class="mcx-route-select" id="mcx-route-engine" hidden>${internalEngines.map((e) => `<option value="${e.index}"${e.index === engIdx ? ' selected' : ''}>${esc(e.displayName)}</option>`).join('')}</select>
          </div>
        ` : (() => {
          const m = getEngineMetadata('external_midi');
          const thumb = m.defaultImage ? `<img class="mcx-route-engine-thumb" src="${esc(m.defaultImage)}" alt="${esc(m.displayName)}" />` : `<span class="mcx-route-engine-ico">${m.iconSvg}</span>`;
          return `<div class="mcx-route-ext-card"><span class="mcx-route-engine-thumb-wrap" data-cover-engine="external_midi">${thumb}</span><span class="mcx-route-engine-meta"><span class="mcx-route-engine-head"><span class="mcx-route-engine-badge">${esc(m.shortBadge)}</span><span class="mcx-route-engine-mode">MIDI OUT</span></span><span class="mcx-route-engine-name">${esc(m.displayName)}</span><span class="mcx-route-engine-desc">${esc(m.description || '')}</span></span></div>`;
        })()}
        <div class="mcx-route-section">
          <div class="mcx-route-midi-head-row">
            <span class="mcx-route-label">${esc(midiHead)}</span>
            <button type="button" class="mcx-route-refresh-btn" data-act="refresh-midi">${ICON_REFRESH}<span>${esc(t('mcx.routeMidiRefresh'))}</span></button>
          </div>
          <div class="mcx-route-midi-row${showMidiOut ? '' : ' mcx-route-midi-row--two'}">
            <div><label class="mcx-route-label" for="mcx-route-in-port">${esc(midiInLabel)}</label>
              <select class="mcx-route-select" id="mcx-route-in-port">${renderMidiInOptions(midiDevices.inputs, inPortIdx, ps.midiInDeviceName)}</select></div>
            ${showMidiOut ? `<div><label class="mcx-route-label" for="mcx-route-port">${esc(t('mcx.routeMidiOut'))}</label>
              <select class="mcx-route-select" id="mcx-route-port">${renderMidiOutOptions(midiDevices.outputs, outPortIdx, ps.midiOutDeviceName)}</select></div>` : ''}
            <div><label class="mcx-route-label" for="mcx-route-ch">${esc(t('mcx.routeMidiCh'))}</label>
              <select class="mcx-route-select" id="mcx-route-ch">${renderMidiChannelOptions(ps.midiChannel)}</select></div>
          </div>
          ${showMidiOut && midiDevices.outputs.length === 0 ? `<p class="mcx-route-midi-empty">${esc(t('mcx.routeMidiNoOsOut'))}</p>` : ''}
        </div>
        <div class="mcx-route-section">
          <span class="mcx-route-label">${esc(fmtHead)}</span>
          ${isExt ? `
            <div class="mcx-route-btn-group">
              <button type="button" class="mcx-route-choice${!isDrum ? ' is-active' : ''}" data-kind="chromatic">${esc(t('mcx.routeFmtChromatic'))}</button>
              <button type="button" class="mcx-route-choice is-drum${isDrum ? ' is-active' : ''}" data-kind="drum_map">${esc(t('mcx.routeFmtDrum'))}</button>
              <button type="button" class="mcx-route-choice${ps.followTranspose !== false && !isDrum ? ' is-active' : ''}" data-act="toggle-tr" ${isDrum ? 'disabled' : ''}>${esc(trLabel)}</button>
            </div>
          ` : `
            <div class="mcx-route-fixed-format">
              <span class="mcx-route-format-tag">${esc(fmtReadout)}</span>
              <button type="button" class="mcx-route-choice${ps.followTranspose !== false && !isDrum ? ' is-active' : ''}" data-act="toggle-tr" ${isDrum ? 'disabled' : ''}>${esc(trLabel)}</button>
            </div>
          `}
        </div>
      </div>
      <div class="mcx-route-foot">
        <button type="button" class="mcx-route-btn" data-act="audition"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg><span>${esc(t('mcx.routeAudition'))}</span></button>
        <div class="mcx-route-foot-right">
          ${!isExt ? `<button type="button" class="mcx-route-btn is-primary" data-act="open-tone"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M6 5v7"/><path d="M10 5v7"/><path d="M14 5v7"/><path d="M18 5v7"/><path d="M2 12h20"/></svg><span>${esc(t('mcx.routeEditInst'))}</span></button>` : ''}
          <button type="button" class="mcx-route-btn${isExt ? ' is-primary' : ''}" data-act="close">${esc(t('mcx.routeDone'))}</button>
        </div>
      </div>
    </div>`;
}

export function wireRouteCoverPopups(rootEl: HTMLElement, catalog: McxEngineDescriptorDto[]): void {
  rootEl.querySelectorAll<HTMLElement>('[data-cover-engine]').forEach((el) => {
    const tid = el.dataset.coverEngine || '';
    const desc = catalog.find((e) => e.typeId === tid), meta = getEngineMetadata(tid);
    attachCoverPopup(el, () => ({
      title: desc?.displayName || meta.displayName,
      subtitle: `${meta.shortBadge} · ${meta.category}`,
      badge: desc?.supportsDrumMode !== false ? 'CHR + DRUM' : 'CHROMATIC',
      description: meta.description || '',
      coverUrl: meta.defaultImage || '',
      fallbackSvg: meta.iconSvg,
      accentToken: meta.accentToken,
      fit: 'contain',
      hoverWidth: 188,
      hoverHeight: 112,
      pills: [
        ...(desc?.supportsBankArchives ? ['.abdbank'] : []),
        ...(desc?.maxRecommendedInstances ? [`${desc.maxRecommendedInstances} voces`] : []),
      ],
    }), { click: false });
  });
}

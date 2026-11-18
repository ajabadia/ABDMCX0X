/**
 * ABDMCX0X -- McxToneDrawerViews.ts
 * Type definitions, model maps, and view helpers for Tone & FX Drawer.
 * Strict line limit: < 200 lines.
 */

import { t } from '../i18n/mcxI18n';
import type { McxPartUiState } from './McxMixerConsole';
import { buildDeck1Html } from './McxToneDrawerDeck1';
import { buildDeck2Html } from './McxToneDrawerDeck2';
import {
  ABD_FILTER_CATALOG,
  ABD_FILTER_MODES,
  checkSeriesFilterConflict,
  type FilterMetadata,
  type FilterModeDef,
} from '@abdsynths/shared/contracts/filterRegistry.ts';

export type { FilterMetadata, FilterModeDef };
export const FILTER_MODELS = ABD_FILTER_CATALOG.map((f) => ({
  id: f.numericId,
  label: f.name,
  shortLabel: f.shortLabel,
  supportedModes: f.supportedModes,
}));
export const FILTER_MODES = ABD_FILTER_MODES;

export const STRUCTURE_MODES = [
  { id: 0, label: 'PAR', title: 'Paralelo' },
  { id: 1, label: 'RING', title: 'Ring Mod 1-2' },
  { id: 2, label: 'BOOST', title: 'Booster 1-2' },
  { id: 3, label: 'VEC', title: 'Vector 2D' },
];

export const ROUTE_MODES = [
  { id: 0, label: 'INT', title: 'Internal (DSP)' },
  { id: 1, label: 'EXT', title: 'External (MIDI)' },
  { id: 2, label: 'BOTH', title: 'Both (INT+EXT)' },
];

export const GLIDE_MODES = [
  { id: 0, label: 'OFF', title: 'Portamento desactivado' },
  { id: 1, label: 'ALWAYS', title: 'Siempre activo en cada nota' },
  { id: 2, label: 'LEGATO', title: 'Solo activo en notas ligadas' },
];

export const DRIVE_TYPES = [
  { id: 0, label: 'TUBE', title: 'Válvula Analógica' },
  { id: 1, label: 'TAPE', title: 'Cinta Magnética' },
  { id: 2, label: 'CLIP', title: 'Hard Clipping' },
  { id: 3, label: 'FOLD', title: 'Wavefolder' },
];

export function buildToneDrawerHeaderHtml(partIdx: number, ps: McxPartUiState): string {
  const isDrum = ps.kind === 'drum_map';
  const name = ps.name || (isDrum ? 'TR-909 Kit' : `Sound P${partIdx + 1}`);
  const kindBadge = isDrum ? t('mcx.partDrumMap') : t('mcx.partChromatic');

  return `
    <div class="mcx-drawer-head">
      <div class="mcx-drawer-title-row">
        <span class="mcx-drawer-title-accent">P${String(partIdx + 1).padStart(2, '0')}</span>
        <h3 class="mcx-drawer-title" data-i18n="mcx.toneDrawerTitle">${t('mcx.toneDrawerTitle')}</h3>
        <span class="mcx-drawer-part-name">${name}</span>
        <span class="mcx-drawer-kind-badge${isDrum ? ' is-drum' : ''}">${kindBadge}</span>
        ${ps.mute ? `<span class="mcx-drawer-mute-badge">${t('mcx.mute')}</span>` : ''}
      </div>
      <button type="button" class="mcx-drawer-close-btn" data-act="close" title="${t('mcx.closeDrawer')}" aria-label="${t('mcx.closeDrawer')}">✕</button>
    </div>
  `;
}

export const knobCell = (p: string, title: string, initialNum: string) => `
  <div class="synth-knob-cell" data-param="${p}" data-learnable="true">
    <div class="synth-knob-mount" id="knob-${p}"></div>
    <span class="synth-knob-num" id="val-${p}">${initialNum}</span>
    <span class="synth-knob-title">${title}</span>
  </div>`;

export const renderSegGroup = (
  param: string,
  lbl: string,
  items: ReadonlyArray<{ id: number; label: string; title?: string }>,
  curVal = 0,
  extraCls = ''
) => `
  <div class="mcx-segmented-ctrl ${extraCls}" data-param-ctrl="${param}">
    <span class="mcx-segmented-lbl">${lbl}</span>
    <div class="mcx-segmented-strip">
      ${items.map((it) => `
        <button type="button" class="mcx-seg-btn${it.id === curVal ? ' is-active' : ''}"
          data-param="${param}" data-val="${it.id}" title="${it.title || it.label}">
          ${it.label}
        </button>
      `).join('')}
    </div>
  </div>`;

export function buildToneDrawerBodyHtml(): string {
  return `
    <div class="mcx-drawer-body">
      ${buildDeck1Html()}
      ${buildDeck2Html()}
    </div>
  `;
}

export function applySeriesFilterConstraints(el: HTMLElement, ps: McxPartUiState, bridge: any, currentPart: number): void {
  const f1M = ps.filterMode ?? 0, f1Mod = ps.filterModel ?? 0;
  let f2M = ps.filter2Mode ?? 1, f2Mod = ps.filter2Model ?? 0;
  const chk = checkSeriesFilterConflict(f1M, f1Mod, f2M, f2Mod);
  if (chk.duplicateType) { f2M = f1M === 0 ? 1 : 0; ps.filter2Mode = f2M; bridge.setParam(currentPart, 'filter2Mode', f2M); }
  if (chk.duplicateModel) { f2Mod = (f1Mod + 1) % FILTER_MODELS.length; ps.filter2Model = f2Mod; bridge.setParam(currentPart, 'filter2Model', f2Mod); }

  el.querySelectorAll<HTMLButtonElement>('.mcx-seg-btn[data-param="filterModel"]').forEach((b) => {
    const mDef = FILTER_MODELS.find((m) => m.id === parseInt(b.dataset.val ?? '0', 10));
    const ok = f1M === 3 || (mDef ? mDef.supportedModes.includes(f1M) : true);
    b.disabled = !ok; b.classList.toggle('is-disabled', !ok);
  });
  el.querySelectorAll<HTMLButtonElement>('.mcx-seg-btn[data-param="filter2Mode"]').forEach((b) => {
    const isDup = f1M < 3 && parseInt(b.dataset.val ?? '0', 10) === f1M;
    b.disabled = isDup; b.classList.toggle('is-disabled', isDup); b.classList.toggle('is-conflict', isDup);
  });
  el.querySelectorAll<HTMLButtonElement>('.mcx-seg-btn[data-param="filter2Model"]').forEach((b) => {
    const mId = parseInt(b.dataset.val ?? '0', 10), mDef = FILTER_MODELS.find((m) => m.id === mId);
    const ok = f2M === 3 || (mDef ? mDef.supportedModes.includes(f2M) : true), isDup = f1M < 3 && f2M < 3 && mId === f1Mod;
    b.disabled = !ok || isDup; b.classList.toggle('is-disabled', !ok || isDup); b.classList.toggle('is-conflict', isDup);
  });
}

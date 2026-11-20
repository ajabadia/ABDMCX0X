/**
 * ABDMCX0X -- McxRackColumnViews.ts
 * View builders and engine catalog options for McxRackColumn. Strictly < 200 lines.
 */

import { findAlgorithmById } from '@abdsynths/shared/components';
import { t } from '../i18n/mcxI18n';
import { ICON_CLOSE, ICON_DOWN, ICON_EXPAND, ICON_POWER_OFF, ICON_POWER_ON, ICON_UP } from './mcxIcons';

export interface UiRackSlot {
  slot: number; engine: number; algoId: string; name: string;
  bypass: boolean; duck: boolean; p1: number; p2: number; mix?: number; presetIdx?: number; params?: Record<string, number>;
}

export const RACK_PICKER_ENGINES = [
  { id: 'zita', eng: 1, name: 'Zita Reverb' }, { id: 'space_echo', eng: 2, name: 'Space Echo RE-201' }, { id: 'bbd_chorus', eng: 3, name: 'Roland BBD Chorus' },
  { id: 'stereo_delay', eng: 4, name: 'Stereo Delay' }, { id: 'saturation', eng: 5, name: 'Tape Saturation' }, { id: 'flanger', eng: 6, name: 'Stereo Flanger' },
  { id: 'midas_eq', eng: 7, name: 'Midas 4-Band EQ' }, { id: 'fair_comp', eng: 8, name: 'Fairchild Comp' }, { id: 'mood_filter', eng: 9, name: 'Moog Ladder Filter' },
];

export function buildRackShellHtml(): string {
  return `<div class="mcx-rack-head"><span class="mcx-rack-title">ARMARIO RACK 19''</span><button type="button" class="mcx-rack-topo-btn" id="mcx-rack-open-topo" title="Abrir matriz de topología">${ICON_EXPAND} TOPOLOGÍA</button></div><div class="mcx-rack-patchbay-strip" id="mcx-rack-patchbay-strip" title="Abrir Matriz de Topología y Envíos"><span>PATCHBAY: 4 ENVÍOS (A..D)</span><span style="color:var(--color-accent);font-weight:700;">ACTIVO</span></div><div class="mcx-rack-slots-container" id="mcx-rack-slots-mount"></div>`;
}

export function buildOccupiedSlotHtml(s: UiRackSlot, def: ReturnType<typeof findAlgorithmById>): string {
  const iconHtml = def.image ? `<img src="${def.image}" class="mcx-rack-slot-thumb" alt="${def.badge || 'FX'}" />` : `<span class="mcx-rack-slot-badge">${def.badge || 'FX'}</span>`;
  return `<div class="mcx-rack-slot-row-head"><button type="button" class="mcx-rack-btn-mini btn-bypass" title="Bypass">${s.bypass ? ICON_POWER_OFF : ICON_POWER_ON}</button>${iconHtml}<span class="mcx-rack-slot-name" title="Clic para editar y renombrar">${s.name || def.name}</span><div class="mcx-rack-slot-actions"><button type="button" class="mcx-rack-btn-mini btn-up" title="Mover arriba">${ICON_UP}</button><button type="button" class="mcx-rack-btn-mini btn-dn" title="Mover abajo">${ICON_DOWN}</button><button type="button" class="mcx-rack-btn-mini btn-del" title="Desmontar">${ICON_CLOSE}</button></div></div><div class="mcx-rack-vu-row"><span class="mcx-rack-vu-label">IN</span><div class="mcx-rack-vu-bar-wrap"><span class="mcx-rack-vu-fill in-fill"></span></div><span class="mcx-rack-vu-clip in-clip"></span></div><div class="mcx-rack-vu-row"><span class="mcx-rack-vu-label">OUT</span><div class="mcx-rack-vu-bar-wrap"><span class="mcx-rack-vu-fill out-fill"></span></div><span class="mcx-rack-vu-clip out-clip"></span></div>`;
}

export function buildRackPickerHtml(slotIdx: number): string {
  return `<div class="mcx-rack-picker-head"><span>${t('mcx.rackPickTitle')} ${slotIdx + 1}</span>` +
    `<button type="button" class="mcx-rack-picker-close" aria-label="${t('mcx.rackClose')}"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div>` +
    `<div class="mcx-rack-picker-list">${RACK_PICKER_ENGINES.map((item, i) => `<button type="button" class="mcx-rack-picker-item" data-eng-idx="${i}">${item.name}</button>`).join('')}</div>`;
}

/**
 * ABDMCX0X -- McxRackColumnViews.ts
 * View builders and engine catalog options for McxRackColumn. Strictly < 200 lines.
 */

import { attachCoverPopup, buildFxCoverPopupData, findAlgorithmById, getAllAlgorithms, FX_CATEGORIES } from '@abdsynths/shared/components';
import { t } from '../i18n/mcxI18n';
import { ICON_CHEVRON_LEFT, ICON_CHEVRON_RIGHT, ICON_CLOSE, ICON_DOWN, ICON_EXPAND, ICON_POWER_OFF, ICON_POWER_ON, ICON_UP } from './mcxIcons';

export interface UiRackSlot {
  slot: number; engine: number; algoId: string; name: string;
  bypass: boolean; duck: boolean; duckAmount?: number; chainTarget?: number;
  p1: number; p2: number; mix?: number; presetIdx?: number; params?: Record<string, number>;
}

export interface RackPickerItem {
  id: string; fxId?: number; eng: number; name: string; category?: string; image?: string; badge?: string;
}

export const RACK_PICKER_ENGINES: RackPickerItem[] = getAllAlgorithms().map((a: any) => ({
  id: a.id,
  fxId: a.fxId ?? 1,
  eng: a.fxId ?? 1,
  name: a.name,
  category: a.category,
  image: a.image,
  badge: a.badge,
}));

export function buildRackShellHtml(): string {
  return `<div class="mcx-col-expand-strip"><button type="button" class="mcx-col-expand-btn" id="mcx-rack-expand" title="Mostrar Armario Rack 19''" aria-label="Mostrar Rack">${ICON_CHEVRON_LEFT}</button><span class="mcx-col-expand-lbl">RACK 19''</span><span class="mcx-col-expand-badge" id="mcx-rack-collapsed-count">2</span></div><div class="mcx-rack-content"><div class="mcx-rack-head"><span class="mcx-rack-title">ARMARIO RACK 19''</span><div class="mcx-rack-head-actions"><button type="button" class="mcx-rack-topo-btn" id="mcx-rack-open-topo" title="Abrir matriz de topología">${ICON_EXPAND} TOPOLOGÍA</button><button type="button" class="mcx-master-collapse-btn" id="mcx-rack-collapse" title="Ocultar Rack 19''" aria-label="Ocultar Rack">${ICON_CHEVRON_RIGHT}</button></div></div><div class="mcx-rack-patchbay-strip" id="mcx-rack-patchbay-strip" title="Abrir Matriz de Topología y Envíos"><span>PATCHBAY: 4 ENVÍOS (A..D)</span><span style="color:var(--color-accent);font-weight:700;">ACTIVO</span></div><div class="mcx-rack-slots-container" id="mcx-rack-slots-mount"></div></div>`;
}

export function buildOccupiedSlotHtml(s: UiRackSlot, def: ReturnType<typeof findAlgorithmById>): string {
  const iconHtml = def.image
    ? `<div class="mcx-rack-slot-thumb-wrap abd-cover-trigger" tabindex="0" data-slot="${s.slot}"><img src="${def.image}" class="mcx-rack-slot-thumb" alt="${def.badge || 'FX'}" /></div>`
    : `<span class="mcx-rack-slot-badge">${def.badge || 'FX'}</span>`;
  const chainOpts = [`<option value="-1"${(s.chainTarget ?? -1) < 0 ? ' selected' : ''}>OUT: MASTER</option>`];
  for (let b = 0; b < 8; b++) {
    if (b === s.slot) continue;
    chainOpts.push(`<option value="${b}"${s.chainTarget === b ? ' selected' : ''}>OUT: → B${b + 1}</option>`);
  }
  return `<div class="mcx-rack-slot-row-head"><button type="button" class="mcx-rack-btn-mini btn-bypass" title="Bypass">${s.bypass ? ICON_POWER_OFF : ICON_POWER_ON}</button>${iconHtml}<span class="mcx-rack-slot-name" title="Clic para ver carátula y editar">${s.name || def.name}</span><div class="mcx-rack-slot-actions"><button type="button" class="mcx-rack-btn-mini btn-faceplate" title="Ver Carátula Fotorealista 19''">${ICON_EXPAND}</button><button type="button" class="mcx-rack-btn-mini btn-up" title="Mover arriba">${ICON_UP}</button><button type="button" class="mcx-rack-btn-mini btn-dn" title="Mover abajo">${ICON_DOWN}</button><button type="button" class="mcx-rack-btn-mini btn-del" title="Desmontar">${ICON_CLOSE}</button></div></div><div class="mcx-rack-vu-row"><span class="mcx-rack-vu-label">IN</span><div class="mcx-rack-vu-bar-wrap"><span class="mcx-rack-vu-fill in-fill"></span></div><span class="mcx-rack-vu-clip in-clip"></span></div><div class="mcx-rack-vu-row"><span class="mcx-rack-vu-label">OUT</span><div class="mcx-rack-vu-bar-wrap"><span class="mcx-rack-vu-fill out-fill"></span></div><span class="mcx-rack-vu-clip out-clip"></span><select class="mcx-rack-chain-sel" title="Series Chain Output Target">${chainOpts.join('')}</select></div>`;
}

export function buildRackPickerHtml(slotIdx: number): string {
  const catSections = FX_CATEGORIES.map((cat: { id: string; label: string }) => {
    const algos = RACK_PICKER_ENGINES.filter((item) => item.category === cat.id);
    if (!algos.length) return '';
    const itemsHtml = algos.map((item) => {
      const globalIdx = RACK_PICKER_ENGINES.indexOf(item);
      const imgTag = item.image ? `<img src="${item.image}" class="mcx-rack-picker-thumb" alt="${item.name}" />` : '';
      return `<button type="button" class="mcx-rack-picker-item" data-eng-idx="${globalIdx}"><span class="mcx-rack-picker-item-name">${item.name}</span>${imgTag}</button>`;
    }).join('');
    return `<div class="mcx-rack-picker-cat-title">${cat.label}</div>${itemsHtml}`;
  }).join('');

  return `<div class="mcx-rack-picker-head"><span>${t('mcx.rackPickTitle')} ${slotIdx + 1} (${RACK_PICKER_ENGINES.length} Modelos)</span>` +
    `<button type="button" class="mcx-rack-picker-close" aria-label="${t('mcx.rackClose')}"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div>` +
    `<div class="mcx-rack-picker-list" style="max-height:420px;overflow-y:auto;">${catSections}</div>`;
}

export const createEmptyRackSlot = (slot: number): UiRackSlot => ({
  slot, engine: 0, algoId: '', name: '', bypass: false, duck: false, p1: 0.5, p2: 0.5, mix: 1.0,
});

export function createEmptyRackSlots(): UiRackSlot[] {
  return Array.from({ length: 8 }, (_, i) => createEmptyRackSlot(i));
}

export function createDefaultRackSlots(): UiRackSlot[] {
  const slots = createEmptyRackSlots();
  slots[0] = { slot: 0, engine: 2, algoId: 'space_echo', name: 'RE-201 Lead Echo', bypass: false, duck: true, p1: 0.45, p2: 0.50, mix: 1.0 };
  slots[1] = { slot: 1, engine: 1, algoId: 'zita', name: 'Zita Hall Space', bypass: false, duck: true, p1: 0.60, p2: 0.40, mix: 1.0 };
  return slots;
}

export function wireRackSlotCoverPopup(
  card: HTMLElement,
  s: UiRackSlot,
  def: ReturnType<typeof findAlgorithmById>,
  onOpenFaceplate?: () => void,
): void {
  const wrap = card.querySelector<HTMLElement>('.mcx-rack-slot-thumb-wrap');
  if (!wrap) return;
  attachCoverPopup(wrap, () => buildFxCoverPopupData(def, {
    customName: s.name,
    badge: def.badge || 'FX',
    extraPills: [`Bahía B${s.slot + 1}`, s.bypass ? 'BYPASS' : 'ON', (s.chainTarget ?? -1) >= 0 ? `→ B${Number(s.chainTarget) + 1}` : 'MASTER'],
    extraRows: [
      ['Bahía', `Bay ${s.slot + 1}`],
      ['Estado', s.bypass ? 'Bypass (0% CPU)' : 'Activo'],
      ...(s.duck ? [['Ducking', `${Math.round((s.duckAmount ?? 0.6) * 100)}%`]] : []),
    ],
    primaryAction: onOpenFaceplate ? { label: "Editar Faceplate 19''", onClick: onOpenFaceplate } : undefined,
  }), { stopPropagation: true });
}

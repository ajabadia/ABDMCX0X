/**
 * ABDMCX0X -- McxToneDrawerViews.ts
 * Shared tab type, Mix/Drive segmented model tables, and knob/segmented HTML helpers.
 * Strict line limit: < 200 lines.
 */

export type McxDrawerTabId = 'motor' | 'mix' | 'midifx';

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

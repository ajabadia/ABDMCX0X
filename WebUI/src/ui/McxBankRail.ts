/**
 * ABDMCX0X -- McxBankRail.ts
 * Left vertical bank selector rail (A..H + Add Bank) with drag/drop targets and LED indicators.
 */

import { t } from '../i18n/mcxI18n';
import {
  BANK_COLOR_VARS,
  BANK_LETTERS,
  countOccupiedInBank,
  MAX_BANKS,
  type McxBankLayoutData,
  SLOTS_PER_BANK,
} from './McxBankLayout';
import { ICON_PLUS } from './mcxIcons';
import type { McxPartUiState } from './McxPartState';

export interface DragPartPayload { fromBank: number; fromSlot: number; }
let activeDragPayload: DragPartPayload | null = null;

export function setActivePartDrag(payload: DragPartPayload | null): void {
  activeDragPayload = payload;
}

export function hasActivePartDrag(ev?: DragEvent): boolean {
  if (activeDragPayload !== null) return true;
  return Boolean(ev?.dataTransfer?.types?.includes('application/x-mcx-part'));
}

export function readPartDragPayload(ev: DragEvent): DragPartPayload | null {
  try {
    const raw = ev.dataTransfer?.getData('application/x-mcx-part');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.fromBank === 'number' && typeof parsed?.fromSlot === 'number') {
        return { fromBank: parsed.fromBank, fromSlot: parsed.fromSlot };
      }
    }
  } catch { /* ignore */ }
  return activeDragPayload;
}

export interface McxBankRailCallbacks {
  onSelectBank: (bankIdx: number) => void;
  onAddBank: () => void;
  onDropPartOnBank: (fromBank: number, fromSlot: number, targetBank: number) => void;
  onToggleMuteBank?: (bankIdx: number) => void;
}

export class McxBankRail {
  private readonly hostEl: HTMLElement;
  private readonly cbs: McxBankRailCallbacks;
  private bankCount = 2;

  constructor(hostEl: HTMLElement, cbs: McxBankRailCallbacks) {
    this.hostEl = hostEl;
    this.cbs = cbs;
    this.bindEvents();
  }

  public render(layout: McxBankLayoutData, parts: McxPartUiState[]): void {
    this.bankCount = layout.bankCount;
    const headerHtml = `
      <div class="mcx-bank-rail-hdr">
        <span class="mcx-bank-rail-title">${t('mcx.banksTitle')}</span>
        <span class="mcx-bank-rail-count">${layout.bankCount}/${MAX_BANKS}</span>
      </div>`;

    const buttonsHtml = Array.from({ length: layout.bankCount }, (_, b) => {
      const isActive = b === layout.activeBank;
      const occupied = countOccupiedInBank(layout, b);
      let mutedCount = 0;
      let anySolo = false;
      for (let s = 0; s < SLOTS_PER_BANK; ++s) {
        const pid = layout.banks[b][s];
        if (pid === null) continue;
        if (parts[pid]?.mute) ++mutedCount;
        if (parts[pid]?.solo) anySolo = true;
      }
      const allMuted = occupied > 0 && mutedCount === occupied;
      const anyMute = mutedCount > 0;
      const letter = BANK_LETTERS[b];
      const flags = anySolo ? 'S' : anyMute ? 'M' : '';
      return `
        <div class="mcx-bank-item" style="--bank-color:${BANK_COLOR_VARS[b]}">
          <button type="button" class="mcx-bank-btn${isActive ? ' is-active' : ''}"
            data-bank-idx="${b}"
            aria-pressed="${isActive ? 'true' : 'false'}" ${isActive ? 'aria-current="true"' : ''}
            title="${t('mcx.bankLabel')} ${letter} (${occupied}/${SLOTS_PER_BANK})">
            <span class="mcx-bank-btn-top">
              <span class="mcx-bank-led" aria-hidden="true"></span>
              <span class="mcx-bank-letter">${letter}</span>
            </span>
            <span class="mcx-bank-meta">${occupied}/${SLOTS_PER_BANK}${flags ? ` · ${flags}` : ''}</span>
            <span class="mcx-bank-activity" aria-hidden="true"><span class="mcx-bank-activity-fill" data-bank-act="${b}"></span></span>
          </button>
          <button type="button" class="mcx-bank-mute-btn${allMuted ? ' is-muted' : anyMute ? ' is-partial' : ''}"
            data-bank-mute="${b}" aria-pressed="${allMuted ? 'true' : 'false'}"
            ${occupied === 0 ? 'disabled' : ''}
            aria-label="${t('mcx.liveMuteBank')} ${letter}"
            title="${t('mcx.liveMuteBankHint')} (${letter})">M</button>
        </div>`;
    }).join('');

    const addBtnHtml = layout.bankCount < MAX_BANKS
      ? `<button type="button" class="mcx-bank-add-btn" data-bank-add="1"
          style="--bank-color:${BANK_COLOR_VARS[layout.bankCount]}"
          title="${t('mcx.bankAddTooltip')}" aria-label="${t('mcx.bankAddTooltip')}">
          ${ICON_PLUS}<span>${BANK_LETTERS[layout.bankCount]}</span>
        </button>`
      : '';

    this.hostEl.innerHTML = `${headerHtml}<div class="mcx-bank-rail-list">${buttonsHtml}${addBtnHtml}</div>`;
  }

  public updateActivity(layout: McxBankLayoutData, partPeaks?: number[], partMidiPeaks?: number[]): void {
    for (let b = 0; b < layout.bankCount; ++b) {
      let maxPeak = 0;
      for (let s = 0; s < SLOTS_PER_BANK; ++s) {
        const pid = layout.banks[b][s];
        if (pid === null) continue;
        const pk = Math.max(partPeaks?.[pid] ?? 0, partMidiPeaks?.[pid] ?? 0);
        if (pk > maxPeak) maxPeak = pk;
      }
      const fill = this.hostEl.querySelector<HTMLElement>(`[data-bank-act="${b}"]`);
      if (fill) fill.style.width = `${Math.round(Math.min(1, maxPeak) * 100)}%`;
    }
  }

  private bindEvents(): void {
    this.hostEl.addEventListener('click', (ev) => {
      const muteBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-bank-mute]');
      if (muteBtn) {
        this.cbs.onToggleMuteBank?.(Number(muteBtn.dataset.bankMute));
        return;
      }
      const bankBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-bank-idx]');
      if (bankBtn) {
        this.cbs.onSelectBank(Number(bankBtn.dataset.bankIdx));
        return;
      }
      const addBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-bank-add]');
      if (addBtn) this.cbs.onAddBank();
    });

    this.hostEl.addEventListener('dragover', (ev) => {
      const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-bank-idx], [data-bank-add]');
      if (!target || !hasActivePartDrag(ev)) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
      target.classList.add('is-drop-target');
    });

    this.hostEl.addEventListener('dragleave', (ev) => {
      const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-bank-idx], [data-bank-add]');
      if (target) target.classList.remove('is-drop-target');
    });

    this.hostEl.addEventListener('drop', (ev) => {
      const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-bank-idx], [data-bank-add]');
      if (!target) return;
      target.classList.remove('is-drop-target');
      const payload = readPartDragPayload(ev);
      if (!payload) return;
      ev.preventDefault();
      const targetBank = target.hasAttribute('data-bank-add') ? this.bankCount : Number(target.dataset.bankIdx);
      setActivePartDrag(null);
      this.cbs.onDropPartOnBank(payload.fromBank, payload.fromSlot, targetBank);
    });
  }
}

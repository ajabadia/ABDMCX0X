/**
 * ABDMCX0X -- McxBankRail.ts
 * Left vertical bank selector rail (A..H + Add Bank) with drag/drop targets and LED indicators.
 */

import { t } from '../i18n/mcxI18n';
import {
  BANK_COLOR_VARS,
  BANK_LETTERS,
  countOccupiedInBank,
  getBankName,
  hasAnyBankSoloed,
  isBankMuted,
  isBankSoloed,
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

export type McxBankRailMode = 'edit' | 'mute' | 'solo';

export interface McxBankRailCallbacks {
  onSelectBank: (bankIdx: number) => void;
  onAddBank: () => void;
  onDropPartOnBank: (fromBank: number, fromSlot: number, targetBank: number) => void;
  onToggleMuteBank?: (bankIdx: number) => void;
  onToggleSoloBank?: (bankIdx: number) => void;
  onClearAllSolos?: () => void;
  onClearAllBankMutes?: () => void;
  onRequestRenameBank?: (bankIdx: number) => void;
}

const supportsNativeFocusGroup = (): boolean =>
  typeof HTMLElement !== 'undefined' && 'focusGroup' in HTMLElement.prototype;

const escHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export class McxBankRail {
  private readonly hostEl: HTMLElement;
  private readonly cbs: McxBankRailCallbacks;
  private bankCount = 2;
  private mode: McxBankRailMode = 'edit';
  private lastLayout: McxBankLayoutData | null = null;
  private lastParts: McxPartUiState[] | null = null;

  constructor(hostEl: HTMLElement, cbs: McxBankRailCallbacks) {
    this.hostEl = hostEl;
    this.cbs = cbs;
    this.bindEvents();
  }

  public getMode(): McxBankRailMode {
    return this.mode;
  }

  public setMode(next: McxBankRailMode): void {
    if (this.mode === next) return;
    const activeEl = document.activeElement as HTMLElement | null;
    const focusedToolbarBtn = Boolean(activeEl && this.hostEl.contains(activeEl) && activeEl.closest('[data-bank-mode]'));
    this.mode = next;
    if (this.lastLayout && this.lastParts) {
      this.render(this.lastLayout, this.lastParts);
    }
    if (focusedToolbarBtn) {
      this.hostEl.querySelector<HTMLButtonElement>(`[data-bank-mode="${next}"]`)?.focus();
    }
  }

  public render(layout: McxBankLayoutData, parts: McxPartUiState[]): void {
    this.lastLayout = layout;
    this.lastParts = parts;
    this.bankCount = layout.bankCount;

    const headerHtml = `
      <div class="mcx-bank-rail-hdr">
        <span class="mcx-bank-rail-title">${t('mcx.banksTitle')}</span>
        <span class="mcx-bank-rail-count">${layout.bankCount}/${MAX_BANKS}</span>
      </div>`;

    const modeMeta: Array<{ id: McxBankRailMode; label: string; hint: string }> = [
      { id: 'edit', label: t('mcx.bankModeEdit'), hint: t('mcx.bankModeEditHint') },
      { id: 'mute', label: t('mcx.bankModeMute'), hint: t('mcx.bankModeMuteHint') },
      { id: 'solo', label: t('mcx.bankModeSolo'), hint: t('mcx.bankModeSoloHint') },
    ];
    const hasFocusGroup = supportsNativeFocusGroup();
    const modeBarHtml = `
      <div class="mcx-bank-mode-bar" role="toolbar" focusgroup="toolbar wrap"
        aria-label="${t('mcx.bankRailModeLabel')}" data-rail-mode="${this.mode}">
        ${modeMeta.map((m) => {
          const isModeActive = this.mode === m.id;
          const tabindexAttr = hasFocusGroup ? '' : ` tabindex="${isModeActive ? '0' : '-1'}"`;
          return `<button type="button" class="mcx-bank-mode-btn" data-bank-mode="${m.id}"
            aria-pressed="${isModeActive ? 'true' : 'false'}"${tabindexAttr}
            aria-label="${escHtml(m.hint)}" title="${escHtml(m.hint)}">${m.label}</button>`;
        }).join('')}
      </div>`;

    let anyPartSoloGlobal = false;
    for (let b = 0; b < layout.bankCount && !anyPartSoloGlobal; ++b) {
      for (let s = 0; s < SLOTS_PER_BANK; ++s) {
        const pid = layout.banks[b][s];
        if (pid !== null && parts[pid]?.solo) {
          anyPartSoloGlobal = true;
          break;
        }
      }
    }
    const anySoloGlobal = anyPartSoloGlobal || hasAnyBankSoloed(layout);

    const buttonsHtml = Array.from({ length: layout.bankCount }, (_, b) => {
      const isActive = b === layout.activeBank;
      const occupied = countOccupiedInBank(layout, b);
      const bankMuted = isBankMuted(layout, b);
      const bankSoloed = isBankSoloed(layout, b);
      const customName = getBankName(layout, b);
      let childMutedCount = 0;
      let childSoloCount = 0;
      for (let s = 0; s < SLOTS_PER_BANK; ++s) {
        const pid = layout.banks[b][s];
        if (pid === null) continue;
        if (parts[pid]?.mute) ++childMutedCount;
        if (parts[pid]?.solo) ++childSoloCount;
      }
      const anySoloSelfOrChild = bankSoloed || childSoloCount > 0;
      const silencedBySolo = anySoloGlobal && !anySoloSelfOrChild && occupied > 0;
      const letter = BANK_LETTERS[b];

      const flagBadges = [
        bankSoloed
          ? '<span class="mcx-bank-flag is-solo">S</span>'
          : childSoloCount > 0
            ? '<span class="mcx-bank-flag is-solo is-partial">S</span>'
            : '',
        bankMuted
          ? '<span class="mcx-bank-flag is-muted">M</span>'
          : childMutedCount > 0
            ? '<span class="mcx-bank-flag is-muted is-partial">M</span>'
            : '',
      ].filter(Boolean).join('');

      const btnClasses = [
        'mcx-bank-btn',
        isActive ? 'is-active' : '',
        bankMuted ? 'is-muted' : childMutedCount > 0 ? 'is-muted-partial' : '',
        bankSoloed ? 'is-solo' : childSoloCount > 0 ? 'is-solo-partial' : '',
        silencedBySolo ? 'is-solo-silenced' : '',
      ].filter(Boolean).join(' ');

      const isModePressed = this.mode === 'mute' ? bankMuted : this.mode === 'solo' ? bankSoloed : isActive;
      const disabledAttr = this.mode !== 'edit' && occupied === 0 ? ' disabled' : '';
      const displaySuffix = customName ? ` · ${customName}` : '';
      const modeTitle = this.mode === 'mute'
        ? `${t('mcx.liveMuteBankHint')} (${letter}${displaySuffix})`
        : this.mode === 'solo'
          ? `${t('mcx.liveSoloBankHint')} (${letter}${displaySuffix})`
          : `${t('mcx.bankLabel')} ${letter}${displaySuffix} (${occupied}/${SLOTS_PER_BANK})`;
      const modeAriaLabel = this.mode === 'mute'
        ? `${t('mcx.liveMuteBank')} ${letter}${displaySuffix}`
        : this.mode === 'solo'
          ? `${t('mcx.liveSoloBank')} ${letter}${displaySuffix}`
          : `${t('mcx.bankLabel')} ${letter}${displaySuffix} (${occupied}/${SLOTS_PER_BANK})`;

      return `
        <div class="mcx-bank-item" style="--bank-color:${BANK_COLOR_VARS[b]}">
          <button type="button" class="${btnClasses}"
            data-bank-idx="${b}"
            aria-pressed="${isModePressed ? 'true' : 'false'}" ${isActive ? 'aria-current="true"' : ''}
            aria-label="${escHtml(modeAriaLabel)}" title="${escHtml(modeTitle)}"${disabledAttr}>
            <span class="mcx-bank-btn-top">
              <span class="mcx-bank-led" aria-hidden="true"></span>
              <span class="mcx-bank-letter">${letter}</span>
            </span>
            ${customName ? `<span class="mcx-bank-name">${escHtml(customName)}</span>` : ''}
            <span class="mcx-bank-meta">
              <span>${occupied}/${SLOTS_PER_BANK}</span>${flagBadges ? `<span class="mcx-bank-flags">${flagBadges}</span>` : ''}
            </span>
            <span class="mcx-bank-activity" aria-hidden="true"><span class="mcx-bank-activity-fill" data-bank-act="${b}"></span></span>
          </button>
        </div>`;
    }).join('');

    const addBtnHtml = this.mode === 'edit' && layout.bankCount < MAX_BANKS
      ? `<button type="button" class="mcx-bank-add-btn" data-bank-add="1"
          style="--bank-color:${BANK_COLOR_VARS[layout.bankCount]}"
          title="${t('mcx.bankAddTooltip')}" aria-label="${t('mcx.bankAddTooltip')}">
          ${ICON_PLUS}<span>${BANK_LETTERS[layout.bankCount]}</span>
        </button>`
      : '';

    this.hostEl.innerHTML = `${headerHtml}${modeBarHtml}<div class="mcx-bank-rail-list" data-rail-mode="${this.mode}">${buttonsHtml}${addBtnHtml}</div>`;
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
      const modeBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-bank-mode]');
      if (modeBtn) {
        const next = modeBtn.dataset.bankMode as McxBankRailMode | undefined;
        if (next === 'edit' || next === 'mute' || next === 'solo') {
          const wasFocused = document.activeElement === modeBtn || modeBtn.contains(document.activeElement);
          if (next === this.mode) {
            if (next === 'solo' || next === 'mute') {
              this.mode = 'edit';
              if (next === 'solo') this.cbs.onClearAllSolos?.();
              else this.cbs.onClearAllBankMutes?.();
              if (this.lastLayout && this.lastParts) this.render(this.lastLayout, this.lastParts);
              if (wasFocused) this.hostEl.querySelector<HTMLButtonElement>('[data-bank-mode="edit"]')?.focus();
            }
          } else {
            this.setMode(next);
          }
        }
        return;
      }
      const bankBtn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-bank-idx]');
      if (bankBtn) {
        if (bankBtn.disabled) return;
        const bankIdx = Number(bankBtn.dataset.bankIdx);
        if (this.mode === 'mute') { this.cbs.onToggleMuteBank?.(bankIdx); return; }
        if (this.mode === 'solo') { this.cbs.onToggleSoloBank?.(bankIdx); return; }
        this.cbs.onSelectBank(bankIdx);
        return;
      }
      const addBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-bank-add]');
      if (addBtn) this.cbs.onAddBank();
    });

    this.hostEl.addEventListener('dblclick', (ev) => {
      if (this.mode !== 'edit') return;
      const bankBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-bank-idx]');
      if (bankBtn) this.cbs.onRequestRenameBank?.(Number(bankBtn.dataset.bankIdx));
    });

    if (!supportsNativeFocusGroup()) {
      this.hostEl.addEventListener('focusin', (ev) => {
        const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-bank-mode]');
        const toolbar = btn?.closest<HTMLElement>('.mcx-bank-mode-bar');
        if (!btn || !toolbar) return;
        toolbar.querySelectorAll<HTMLButtonElement>('[data-bank-mode]').forEach((item) => {
          item.tabIndex = item === btn ? 0 : -1;
        });
      });

      this.hostEl.addEventListener('keydown', (ev) => {
        if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
        const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-bank-mode]');
        const toolbar = btn?.closest<HTMLElement>('.mcx-bank-mode-bar');
        if (!btn || !toolbar) return;
        const items = [...toolbar.querySelectorAll<HTMLButtonElement>('[data-bank-mode]:not(:disabled)')];
        if (items.length === 0) return;
        const rtl = getComputedStyle(toolbar).direction === 'rtl';
        const forwardKey = rtl ? 'ArrowLeft' : 'ArrowRight';
        const backwardKey = rtl ? 'ArrowRight' : 'ArrowLeft';
        const idx = items.indexOf(btn);
        if (idx === -1) return;

        let nextIdx = -1;
        if (ev.key === forwardKey) nextIdx = (idx + 1) % items.length;
        else if (ev.key === backwardKey) nextIdx = (idx - 1 + items.length) % items.length;
        else if (ev.key === 'Home') nextIdx = 0;
        else if (ev.key === 'End') nextIdx = items.length - 1;
        if (nextIdx === -1) return;

        ev.preventDefault();
        items.forEach((item, i) => { item.tabIndex = i === nextIdx ? 0 : -1; });
        items[nextIdx].focus();
      });
    }

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

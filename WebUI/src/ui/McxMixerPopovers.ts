/**
 * ABDMCX0X -- McxMixerPopovers.ts
 * Non-blocking Popover API overlays for touch/keyboard "Move to..." and pinned-part delete confirmation.
 */

import { t } from '../i18n/mcxI18n';
import {
  BANK_COLOR_VARS,
  BANK_LETTERS,
  formatSlotLabel,
  MAX_BANKS,
  type McxBankLayoutData,
  SLOTS_PER_BANK,
} from './McxBankLayout';
import { ICON_CLOSE, ICON_PIN_FILLED, ICON_PLUS } from './mcxIcons';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let activePopover: HTMLElement | null = null;
let fallbackCloseFn: (() => void) | null = null;

export function closeActiveMixerPopover(): void {
  if (fallbackCloseFn) { fallbackCloseFn(); fallbackCloseFn = null; }
  if (!activePopover) return;
  const el = activePopover;
  activePopover = null;
  el.classList.remove('is-visible');
  if (typeof el.hidePopover === 'function') {
    try { if (el.matches(':popover-open')) el.hidePopover(); } catch { /* ignore */ }
  }
  el.remove();
}

function mountAndPositionPopover(anchorEl: HTMLElement, el: HTMLElement): void {
  closeActiveMixerPopover();
  el.setAttribute('popover', 'auto');
  el.classList.add('mcx-mixer-popover', 'is-js-positioned');
  document.body.appendChild(el);
  activePopover = el;

  if (typeof el.showPopover === 'function') {
    try {
      el.showPopover();
      el.addEventListener('toggle', (ev: any) => {
        if (ev.newState === 'closed' && activePopover === el) closeActiveMixerPopover();
      });
    } catch { el.classList.add('is-visible'); }
  } else {
    el.classList.add('is-visible');
    const onDown = (ev: MouseEvent) => {
      if (!el.contains(ev.target as Node) && !anchorEl.contains(ev.target as Node)) closeActiveMixerPopover();
    };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') closeActiveMixerPopover(); };
    setTimeout(() => {
      document.addEventListener('pointerdown', onDown, true);
      window.addEventListener('keydown', onKey);
    }, 0);
    fallbackCloseFn = () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }

  const ar = anchorEl.getBoundingClientRect();
  const pr = el.getBoundingClientRect();
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 720;
  const pw = pr.width || 240;
  const ph = pr.height || 140;
  const left = Math.max(8, Math.min(vw - pw - 8, ar.left));
  const below = ar.bottom + 6;
  const top = (below + ph <= vh - 8) ? below : Math.max(8, ar.top - ph - 6);
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

export function openMovePartPopover(
  anchorEl: HTMLElement,
  layout: McxBankLayoutData,
  fromBank: number,
  fromSlot: number,
  partName: string,
  onMove: (toBank: number, toSlot: number) => void,
): void {
  const pop = document.createElement('div');
  pop.setAttribute('aria-label', t('mcx.bankMoveHeading'));

  const banksHtml = Array.from({ length: layout.bankCount }, (_, b) => {
    const slotsHtml = Array.from({ length: SLOTS_PER_BANK }, (_, s) => {
      const pid = layout.banks[b][s];
      const isCurrent = b === fromBank && s === fromSlot;
      const isLocked = pid !== null && layout.pinnedParts.has(pid);
      const cls = isCurrent ? 'is-current' : isLocked ? 'is-locked' : pid === null ? 'is-free' : 'is-occupied';
      const label = isLocked ? ICON_PIN_FILLED : String(s + 1);
      return `<button type="button" class="mcx-move-slot-btn ${cls}" data-to-bank="${b}" data-to-slot="${s}"
        ${isCurrent || isLocked ? 'disabled' : ''} title="${formatSlotLabel(b, s)}">${label}</button>`;
    }).join('');
    return `
      <div class="mcx-move-bank-row" style="--bank-color:${BANK_COLOR_VARS[b]}">
        <span class="mcx-move-bank-tag">${BANK_LETTERS[b]}</span>
        <div class="mcx-move-slots-grid">${slotsHtml}</div>
      </div>`;
  }).join('');

  const newBankHtml = layout.bankCount < MAX_BANKS
    ? `<button type="button" class="mcx-popover-btn is-accent" data-to-bank="${layout.bankCount}" data-to-slot="-1">
        ${ICON_PLUS}<span>${esc(t('mcx.bankNewBankTarget'))} (${BANK_LETTERS[layout.bankCount]})</span>
      </button>`
    : '';

  pop.innerHTML = `
    <div class="mcx-popover-head">
      <span class="mcx-popover-title">${esc(formatSlotLabel(fromBank, fromSlot))} · ${esc(partName)}</span>
      <button type="button" class="mcx-popover-close" data-act="close" aria-label="${esc(t('mcx.close'))}">${ICON_CLOSE}</button>
    </div>
    <div class="mcx-popover-sub">${esc(t('mcx.bankMoveHeading'))}</div>
    <div class="mcx-move-banks-list">${banksHtml}</div>
    ${newBankHtml ? `<div class="mcx-popover-foot">${newBankHtml}</div>` : ''}`;

  pop.addEventListener('click', (ev) => {
    const closeBtn = (ev.target as HTMLElement).closest('[data-act="close"]');
    if (closeBtn) { closeActiveMixerPopover(); return; }
    const destBtn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-to-bank]');
    if (destBtn && !destBtn.disabled) {
      const toBank = Number(destBtn.dataset.toBank);
      const toSlot = Number(destBtn.dataset.toSlot);
      closeActiveMixerPopover();
      onMove(toBank, toSlot);
    }
  });

  mountAndPositionPopover(anchorEl, pop);
}

export function openPinnedDeletePopover(
  anchorEl: HTMLElement,
  slotLabel: string,
  partName: string,
  onConfirm: () => void,
): void {
  const pop = document.createElement('div');
  pop.setAttribute('aria-label', t('mcx.bankDeletePinnedTitle'));
  pop.innerHTML = `
    <div class="mcx-popover-head">
      <span class="mcx-popover-title">${ICON_PIN_FILLED} ${esc(t('mcx.bankDeletePinnedTitle'))}</span>
      <button type="button" class="mcx-popover-close" data-act="cancel" aria-label="${esc(t('mcx.close'))}">${ICON_CLOSE}</button>
    </div>
    <p class="mcx-popover-msg"><strong>${esc(slotLabel)} · ${esc(partName)}</strong> ${esc(t('mcx.bankDeletePinnedBody'))}</p>
    <div class="mcx-popover-actions">
      <button type="button" class="mcx-popover-btn" data-act="cancel">${esc(t('mcx.cancel'))}</button>
      <button type="button" class="mcx-popover-btn is-danger" data-act="confirm">${esc(t('mcx.bankUnpinAndDelete'))}</button>
    </div>`;

  pop.addEventListener('click', (ev) => {
    const act = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'cancel') closeActiveMixerPopover();
    else if (act === 'confirm') { closeActiveMixerPopover(); onConfirm(); }
  });

  mountAndPositionPopover(anchorEl, pop);
}

/**
 * ABDMCX0X -- McxRenameBankModal.ts
 * Native <dialog> modal for renaming a bank group (A..H) with quick-tag chips and light dismiss.
 */

import { t } from '../i18n/mcxI18n';
import { BANK_COLOR_VARS, BANK_LETTERS, MAX_BANK_NAME_LEN } from './McxBankLayout';
import { ICON_CLOSE } from './mcxIcons';

export interface McxRenameBankModalOptions {
  bankIdx: number;
  currentName: string;
  onSave: (bankIdx: number, nextName: string) => void;
}

const QUICK_TAGS = ['Drums', 'Bass', 'Synth', 'Keys', 'Pads', 'Leads', 'Perc', 'FX'] as const;

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function openRenameBankModal(opts: McxRenameBankModalOptions): HTMLDialogElement {
  document.querySelectorAll('dialog.mcx-rename-bank-dialog').forEach((prev) => {
    if (typeof (prev as HTMLDialogElement).close === 'function' && (prev as HTMLDialogElement).open) {
      (prev as HTMLDialogElement).close();
    }
    prev.remove();
  });

  const letter = BANK_LETTERS[opts.bankIdx] ?? '?';
  const dialog = document.createElement('dialog');
  dialog.className = 'mcx-rename-bank-dialog';
  dialog.setAttribute('closedby', 'any');
  dialog.setAttribute('aria-labelledby', 'mcx-rename-bank-title');
  dialog.style.setProperty('--bank-color', BANK_COLOR_VARS[opts.bankIdx] ?? BANK_COLOR_VARS[0]);

  const chipsHtml = QUICK_TAGS.map(
    (tag) => `<button type="button" class="mcx-rename-chip" data-rename-chip="${tag}">${tag}</button>`,
  ).join('');

  dialog.innerHTML = `
    <form method="dialog" class="mcx-rename-modal-form">
      <div class="mcx-rename-modal-head">
        <div class="mcx-rename-modal-head-left">
          <span class="mcx-rename-modal-badge">${esc(t('mcx.bankLabel'))} ${letter}</span>
          <h2 id="mcx-rename-bank-title" class="mcx-rename-modal-title">${esc(t('mcx.bankRenameModalTitle'))}</h2>
        </div>
        <button type="submit" value="cancel" formnovalidate class="mcx-rename-modal-close"
          aria-label="${esc(t('mcx.close'))}" title="${esc(t('mcx.close'))}">${ICON_CLOSE}</button>
      </div>
      <div class="mcx-rename-modal-body">
        <label class="mcx-rename-modal-label" for="mcx-rename-bank-input">${esc(t('mcx.bankRenameFieldLabel'))}</label>
        <div class="mcx-rename-modal-input-row">
          <input type="text" id="mcx-rename-bank-input" class="mcx-rename-modal-input"
            value="${esc(opts.currentName)}" maxlength="${MAX_BANK_NAME_LEN}"
            placeholder="${esc(t('mcx.bankRenamePlaceholder'))}" autocomplete="off" autofocus />
          <span class="mcx-rename-modal-counter" data-rename-counter>${opts.currentName.length}/${MAX_BANK_NAME_LEN}</span>
        </div>
        <div class="mcx-rename-modal-tags-wrap">
          <span class="mcx-rename-modal-tags-lbl">${esc(t('mcx.bankRenameSuggestions'))}</span>
          <div class="mcx-rename-modal-chips">${chipsHtml}</div>
        </div>
      </div>
      <div class="mcx-rename-modal-foot">
        <button type="submit" value="clear" formnovalidate class="mcx-rename-modal-btn is-ghost">${esc(t('mcx.bankRenameClear'))}</button>
        <div class="mcx-rename-modal-foot-right">
          <button type="submit" value="cancel" formnovalidate class="mcx-rename-modal-btn">${esc(t('mcx.cancel'))}</button>
          <button type="submit" value="save" class="mcx-rename-modal-btn is-primary">${esc(t('mcx.save'))}</button>
        </div>
      </div>
    </form>`;

  document.body.appendChild(dialog);

  const form = dialog.querySelector<HTMLFormElement>('form')!;
  const input = dialog.querySelector<HTMLInputElement>('#mcx-rename-bank-input')!;
  const counter = dialog.querySelector<HTMLElement>('[data-rename-counter]')!;
  const updateCounter = () => { counter.textContent = `${input.value.length}/${MAX_BANK_NAME_LEN}`; };

  input.addEventListener('input', updateCounter);
  dialog.addEventListener('click', (ev) => {
    const chip = (ev.target as HTMLElement).closest<HTMLElement>('[data-rename-chip]');
    if (!chip) return;
    input.value = chip.dataset.renameChip ?? '';
    updateCounter();
    input.focus();
  });

  dialog.addEventListener('close', () => {
    const action = dialog.returnValue;
    dialog.returnValue = '';
    if (action === 'save') opts.onSave(opts.bankIdx, input.value);
    else if (action === 'clear') opts.onSave(opts.bankIdx, '');
    dialog.remove();
  });

  if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e) => { pressedOutside = outside(e); });
    dialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && outside(e) && typeof dialog.close === 'function') dialog.close();
    });
  }

  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
    let clickedValue = '';
    form.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach((btn) => {
      btn.addEventListener('click', () => { clickedValue = btn.getAttribute('value') || ''; });
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const sub = (ev as SubmitEvent).submitter as HTMLElement | null;
      dialog.returnValue = sub?.getAttribute?.('value') || clickedValue || 'save';
      clickedValue = '';
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new Event('close'));
    });
  }

  input.focus();
  input.select();
  return dialog;
}

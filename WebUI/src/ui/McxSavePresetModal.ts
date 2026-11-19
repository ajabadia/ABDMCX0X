/**
 * ABDMCX0X — McxSavePresetModal.ts
 * Modal for saving single Part presets (.abdpart) or full 16-part Multi presets (.abdmulti).
 * 0 hardcoded colors, 100% token-driven, ES/EN i18n.
 */

import { CATEGORY_32_PALETTE, getBankCategoryLabel } from '@abdsynths/shared/components/bank/bankCategories.js';
import { attachDialogDrag } from '@abdsynths/shared/diagnostic-probe';
import { t } from '../i18n/mcxI18n';
import { ICON_CLOSE } from './mcxIcons';

export interface McxSavePresetOptions {
  type: 'part' | 'multi';
  partIndex?: number;
  initialName?: string;
  initialCategory?: number;
  sublibraries?: string[];
  onSave: (payload: {
    type: 'part' | 'multi';
    partIndex?: number;
    name: string;
    sublibrary: string;
    categoryId: number;
    author: string;
    isSelfContained: boolean;
  }) => void;
}

export class McxSavePresetModal {
  private dialog: HTMLDialogElement | null = null;

  constructor(private options: McxSavePresetOptions) {}

  public open(): void {
    if (this.dialog) return;

    this.dialog = document.createElement('dialog');
    this.dialog.className = 'mcx-settings-dialog mcx-save-modal';
    const isMulti = this.options.type === 'multi';
    const title = isMulti ? t('mcx.saveMultiTitle') : `${t('mcx.savePartTitle')} [P${String((this.options.partIndex ?? 0) + 1).padStart(2, '0')}]`;
    const sublibs = this.options.sublibraries?.length ? this.options.sublibraries : ['User', 'Bass', 'Leads', 'Pads', 'Drums'];
    const defName = this.options.initialName || (isMulti ? 'My Multi 01' : `Part ${(this.options.partIndex ?? 0) + 1} Sound`);
    const defCat = this.options.initialCategory ?? (isMulti ? 0 : 3);

    this.dialog.innerHTML = `
      <div class="mcx-settings-card">
        <div class="mcx-settings-header" data-drag-handle style="cursor: move;">
          <div class="mcx-settings-title">
            <span class="mcx-settings-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg></span>
            <span>${title}</span>
          </div>
          <button type="button" class="mcx-dialog-close" data-act="close" title="${t('mcx.close')}">${ICON_CLOSE}</button>
        </div>
        <div class="mcx-settings-body">
          <div class="mcx-field-row">
            <label class="mcx-field-label">${t('mcx.saveName')}</label>
            <input type="text" class="mcx-input-text" id="save-name" value="${defName}" maxlength="64" />
          </div>
          <div class="mcx-field-row">
            <label class="mcx-field-label">${t('mcx.saveSublib')}</label>
            <input type="text" class="mcx-input-text" id="save-sublib" list="sublib-list" value="${sublibs[0]}" />
            <datalist id="sublib-list">${sublibs.map((s) => `<option value="${s}">`).join('')}</datalist>
          </div>
          <div class="mcx-field-row">
            <label class="mcx-field-label">${t('mcx.saveCategory')}</label>
            <select class="mcx-select" id="save-cat">
              ${CATEGORY_32_PALETTE.map((c) => `<option value="${c.slot}"${c.slot === defCat ? ' selected' : ''}>${c.slot}: ${getBankCategoryLabel(c.slot)}</option>`).join('')}
            </select>
          </div>
          <div class="mcx-field-row">
            <label class="mcx-field-label">${t('mcx.saveAuthor')}</label>
            <input type="text" class="mcx-input-text" id="save-author" value="User" maxlength="48" />
          </div>
          <div class="mcx-field-row">
            <label class="mcx-field-label">${t('mcx.savePackageMode')}</label>
            <label class="mcx-checkbox-label">
              <input type="checkbox" id="save-bundle" />
              <span>${t('mcx.saveBundleHint')}</span>
            </label>
          </div>
        </div>
        <div class="mcx-settings-footer">
          <button type="button" class="btn btn-outline" data-act="close">${t('mcx.cancel')}</button>
          <button type="button" class="btn btn-primary" data-act="confirm">${t('mcx.save')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.dialog);
    this.dialog.showModal();
    const handle = this.dialog.querySelector('[data-drag-handle]') as HTMLElement | null;
    if (handle) attachDialogDrag(this.dialog, handle);

    this.dialog.querySelectorAll('[data-act="close"]').forEach((btn) => btn.addEventListener('click', () => this.close()));
    this.dialog.querySelector('[data-act="confirm"]')?.addEventListener('click', () => {
      const name = (this.dialog?.querySelector('#save-name') as HTMLInputElement)?.value.trim() || 'Preset';
      const sublib = (this.dialog?.querySelector('#save-sublib') as HTMLInputElement)?.value.trim() || 'User';
      const catId = parseInt((this.dialog?.querySelector('#save-cat') as HTMLSelectElement)?.value || '0', 10);
      const author = (this.dialog?.querySelector('#save-author') as HTMLInputElement)?.value.trim() || 'User';
      const isSelfContained = (this.dialog?.querySelector('#save-bundle') as HTMLInputElement)?.checked ?? false;

      this.options.onSave({
        type: this.options.type,
        partIndex: this.options.partIndex,
        name,
        sublibrary: sublib,
        categoryId: catId,
        author,
        isSelfContained,
      });
      this.close();
    });
  }

  public close(): void {
    if (!this.dialog) return;
    this.dialog.close();
    this.dialog.remove();
    this.dialog = null;
  }
}

/**
 * ABDMCX0X — McxBankDrawer.ts
 * Sliding drawer for browsing Models, Part Presets (.abdpart), Multi Presets (.abdmulti),
 * and Sound Banks (.abdbank). Built on top of ABDShared::createBankShell.
 */

import { createBankShell } from '@abdsynths/shared/components/bank/bankShell.js';
import { bankChipsHtml, bindBankChips } from '@abdsynths/shared/components/bank/bankChips.js';
import { BankCatalogState } from '@abdsynths/shared/components/bank/bankCatalogState.js';
import { BANK_ICONS } from '@abdsynths/shared/components/bank/bankIcons.js';
import { CATEGORY_32_PALETTE, getBankCategoryLabel } from '@abdsynths/shared/components/bank/bankCategories.js';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { getDefaultFactoryItems } from './McxDefaultCatalog';
import { renderCatalogGrid, renderCatalogTable } from './McxBankDrawerViews';
import { t } from '../i18n/mcxI18n';

export interface McxCatalogItem {
  id: string;
  name: string;
  sublibrary?: string;
  categoryName?: string;
  categoryId?: number;
  engineKind?: string;
  itemType?: number;
  filePath?: string;
  thumbnailUrl?: string;
  isFavorite?: boolean;
}

export interface McxBankDrawerCallbacks {
  getTargetPart: () => number;
  setTargetPart: (idx: number) => void;
  onSelectModel: (partIdx: number, item: McxCatalogItem) => void;
  onSelectPartPreset: (partIdx: number, item: McxCatalogItem) => void;
  onSelectMultiPreset: (item: McxCatalogItem) => void;
  onAudition: (partIdx: number, item: McxCatalogItem) => void;
  onOpenSaveModal: (type: 'part' | 'multi') => void;
}

export class McxBankDrawer {
  private shell!: ReturnType<typeof createBankShell>;
  private state = new BankCatalogState();
  private items: McxCatalogItem[] = [];
  private cardUnbind: (() => void) | null = null;
  private chipsUnbind: (() => void) | null = null;
  private isOpen = false;

  constructor(
    private bridge: McxHostBridge,
    private cb: McxBankDrawerCallbacks
  ) {
    this.initShell();
    this.setItems(getDefaultFactoryItems());
  }

  private initShell(): void {
    this.shell = createBankShell({
      title: 'ABDMCX0X BANK MANAGER',
      badge: '16 PARTS',
      tabs: [
        { id: 'models', label: t('mcx.bankTabModels'), iconHtml: BANK_ICONS.database },
        { id: 'parts', label: t('mcx.bankTabParts'), iconHtml: BANK_ICONS.sliders },
        { id: 'multis', label: t('mcx.bankTabMultis'), iconHtml: BANK_ICONS.database },
        { id: 'banks', label: t('mcx.bankTabBanks'), iconHtml: BANK_ICONS.folder },
      ],
      searchPlaceholder: t('mcx.searchPlaceholder'),
      headerActions: [
        { id: 'save-part', label: t('mcx.savePartPreset'), iconHtml: BANK_ICONS.save },
        { id: 'save-multi', label: t('mcx.saveMultiPreset'), iconHtml: BANK_ICONS.save },
        { id: 'close', label: '✕', iconHtml: BANK_ICONS.close },
      ],
      onTabChange: (tab) => {
        this.state.activeTab = tab;
        this.render();
      },
      onSearch: (q) => {
        this.state.setQuery(q);
        this.render();
      },
      onHeaderAction: (act) => {
        if (act === 'save-part') this.cb.onOpenSaveModal('part');
        else if (act === 'save-multi') this.cb.onOpenSaveModal('multi');
      },
      onClose: () => this.close(),
    });

    this.shell.element.classList.add('mcx-bank-drawer-view');
    document.body.appendChild(this.shell.element);
    this.renderToolbar();
  }

  private renderToolbar(): void {
    const targetPart = this.cb.getTargetPart();
    this.shell.toolbarEl.innerHTML = `
      <div class="mcx-bank-target-bar">
        <span class="mcx-bank-target-label">${t('mcx.destination')}</span>
        <select class="mcx-bank-part-select" id="mcx-bank-part-select">
          ${Array.from({ length: 16 }, (_, i) => `<option value="${i}"${i === targetPart ? ' selected' : ''}>PART ${String(i + 1).padStart(2, '0')}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-xs ${this.state.favoritesOnly ? 'btn-warning' : 'btn-outline'}" id="mcx-bank-favs-btn" title="${t('mcx.filterFavorites')}">
          ${BANK_ICONS.starFilled} ${t('mcx.favs')}
        </button>
        <button type="button" class="btn btn-xs ${this.state.viewMode === 'grid' ? 'btn-primary' : 'btn-outline'}" id="mcx-bank-grid-btn" title="${t('mcx.gridView')}">
          ${BANK_ICONS.viewGrid}
        </button>
        <button type="button" class="btn btn-xs ${this.state.viewMode === 'table' ? 'btn-primary' : 'btn-outline'}" id="mcx-bank-table-btn" title="${t('mcx.tableView')}">
          ${BANK_ICONS.viewTable}
        </button>
      </div>
      <div class="ndb-chips-row" id="mcx-cat-chips-row"></div>
    `;

    const sel = this.shell.toolbarEl.querySelector('#mcx-bank-part-select') as HTMLSelectElement | null;
    sel?.addEventListener('change', () => this.cb.setTargetPart(parseInt(sel.value, 10)));
    this.shell.toolbarEl.querySelector('#mcx-bank-favs-btn')?.addEventListener('click', () => {
      this.state.setFavoritesOnly(!this.state.favoritesOnly);
      this.renderToolbar();
      this.render();
    });
    this.shell.toolbarEl.querySelector('#mcx-bank-grid-btn')?.addEventListener('click', () => {
      this.state.setViewMode('grid');
      this.renderToolbar();
      this.render();
    });
    this.shell.toolbarEl.querySelector('#mcx-bank-table-btn')?.addEventListener('click', () => {
      this.state.setViewMode('table');
      this.renderToolbar();
      this.render();
    });

    this.renderCategoryChips();
  }

  private renderCategoryChips(): void {
    const row = this.shell.toolbarEl.querySelector('#mcx-cat-chips-row') as HTMLElement | null;
    if (!row) return;
    const chips = [
      { id: 'all', label: t('common.all') || 'All', catClass: 'cat-0' },
      ...CATEGORY_32_PALETTE.slice(0, 10).map((c) => ({
        id: String(c.slot),
        label: getBankCategoryLabel(c.slot),
        catClass: c.catClass,
      })),
    ];
    row.innerHTML = bankChipsHtml(chips, String(this.state.selectedCategory));
    this.chipsUnbind?.();
    this.chipsUnbind = bindBankChips(row, (catId) => {
      this.state.setCategory(catId);
      this.renderCategoryChips();
      this.render();
    });
  }

  public open(targetPart?: number): void {
    if (typeof targetPart === 'number') this.cb.setTargetPart(targetPart);
    this.renderToolbar();
    this.render();
    this.shell.element.classList.add('is-open');
    this.isOpen = true;
  }

  public close(): void {
    this.shell.element.classList.remove('is-open');
    this.isOpen = false;
  }

  public toggle(targetPart?: number): void {
    if (this.isOpen) this.close();
    else this.open(targetPart);
  }

  public setItems(items: McxCatalogItem[]): void {
    this.items = items;
    this.render();
  }

  private render(): void {
    const filtered = this.state.filterItems(this.items);
    this.shell.setTabCount(this.shell.activeTab, filtered.length);
    this.cardUnbind?.();

    if (this.state.viewMode === 'table') {
      renderCatalogTable(this.shell.contentEl, filtered, this.cb);
    } else {
      this.cardUnbind = renderCatalogGrid(this.shell.contentEl, filtered, this.state, this.cb, () => this.render());
    }
  }
}

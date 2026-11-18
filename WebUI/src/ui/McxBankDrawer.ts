/**
 * ABDMCX0X — McxBankDrawer.ts
 * Sliding drawer for browsing Models, Part Presets (.abdpart), Multi Presets (.abdmulti),
 * and Sound Banks (.abdbank). Built on top of ABDShared::createBankShell.
 */

import { createBankShell } from '@abdsynths/shared/components/bank/bankShell.js';
import { bankCardHtml, bindBankCards } from '@abdsynths/shared/components/bank/bankCard.js';
import { bankChipsHtml, bindBankChips } from '@abdsynths/shared/components/bank/bankChips.js';
import { BankCatalogState } from '@abdsynths/shared/components/bank/bankCatalogState.js';
import { BANK_ICONS, getCategoryIconSvg } from '@abdsynths/shared/components/bank/bankIcons.js';
import { CATEGORY_32_PALETTE, getBankCategoryLabel } from '@abdsynths/shared/components/bank/bankCategories.js';
import type { McxHostBridge } from '../bridge/McxHostBridge';
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
    this.loadDefaultFactoryItems();
  }

  private initShell(): void {
    this.shell = createBankShell({
      title: 'ABDMCX0X BANK MANAGER',
      badge: '16 PARTS',
      tabs: [
        { id: 'models', label: 'MODELS', iconHtml: BANK_ICONS.database },
        { id: 'parts', label: 'PART PRESETS (.ABDPART)', iconHtml: BANK_ICONS.sliders },
        { id: 'multis', label: 'MULTIS (.ABDMULTI)', iconHtml: BANK_ICONS.database },
        { id: 'banks', label: 'BANKS (.ABDBANK)', iconHtml: BANK_ICONS.folder },
      ],
      searchPlaceholder: t('mcx.searchPlaceholder') || 'Search sounds, models, tags...',
      headerActions: [
        { id: 'save-part', label: 'Save Part...', iconHtml: BANK_ICONS.save },
        { id: 'save-multi', label: 'Save Multi...', iconHtml: BANK_ICONS.save },
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
        <span class="mcx-bank-target-label">DESTINATION:</span>
        <select class="mcx-bank-part-select" id="mcx-bank-part-select">
          ${Array.from({ length: 16 }, (_, i) => `<option value="${i}"${i === targetPart ? ' selected' : ''}>PART ${String(i + 1).padStart(2, '0')}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-xs ${this.state.favoritesOnly ? 'btn-warning' : 'btn-outline'}" id="mcx-bank-favs-btn" title="Filter Favorites">
          ${BANK_ICONS.starFilled} FAVS
        </button>
        <button type="button" class="btn btn-xs ${this.state.viewMode === 'grid' ? 'btn-primary' : 'btn-outline'}" id="mcx-bank-grid-btn" title="Grid View">
          ${BANK_ICONS.viewGrid}
        </button>
        <button type="button" class="btn btn-xs ${this.state.viewMode === 'table' ? 'btn-primary' : 'btn-outline'}" id="mcx-bank-table-btn" title="Table View">
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
      { id: 'all', label: 'All', catClass: 'cat-0' },
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
      this.renderTable(filtered);
    } else {
      this.renderGrid(filtered);
    }
  }

  private renderGrid(items: McxCatalogItem[]): void {
    const cardsHtml = items.map((it) => bankCardHtml({
      slot: it.id,
      name: it.name,
      catLabel: it.categoryName || getBankCategoryLabel(it.categoryId ?? 0),
      catClass: `cat-${it.categoryId ?? 0}`,
      paramId: it.categoryId ?? 0,
      badges: [it.engineKind || 'ROM', it.sublibrary || 'Default'],
      thumbnailUrl: it.thumbnailUrl,
      isFavorite: this.state.isFavorite(it.id),
      hasAudition: true,
    })).join('');

    this.shell.contentEl.innerHTML = `<div class="ndb-grid catalog-grid">${cardsHtml}</div>`;
    this.cardUnbind = bindBankCards(this.shell.contentEl, {
      onCardClick: (_slot, id) => {
        const item = items.find((x) => x.id === id);
        if (item && this.state.autoAudition) this.cb.onAudition(this.cb.getTargetPart(), item);
      },
      onCardDblClick: (_slot, id) => {
        const item = items.find((x) => x.id === id);
        if (item) this.cb.onSelectPartPreset(this.cb.getTargetPart(), item);
      },
      onAudition: ({ id }) => {
        const item = items.find((x) => x.id === id);
        if (item) this.cb.onAudition(this.cb.getTargetPart(), item);
      },
      onFavorite: ({ id }) => {
        this.state.toggleFavorite(id);
        this.render();
      },
    });
  }

  private renderTable(items: McxCatalogItem[]): void {
    const rowsHtml = items.map((it) => `
      <tr data-id="${it.id}">
        <td>${getCategoryIconSvg(it.categoryId ?? 0)}</td>
        <td><strong>${it.name}</strong></td>
        <td><span class="ndb-card-cat cat-${it.categoryId ?? 0}">${it.categoryName || getBankCategoryLabel(it.categoryId ?? 0)}</span></td>
        <td>${it.engineKind || 'ROM'}</td>
        <td>${it.sublibrary || 'Default'}</td>
        <td><button type="button" class="btn btn-xs btn-audition" data-act="audition" data-id="${it.id}">${BANK_ICONS.audition}</button></td>
      </tr>
    `).join('');

    this.shell.contentEl.innerHTML = `
      <table class="catalog-table">
        <thead><tr><th></th><th>Name</th><th>Category</th><th>Engine</th><th>Sublibrary</th><th>Preview</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;

    this.shell.contentEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-act="audition"]');
      if (btn) {
        const id = btn.getAttribute('data-id');
        const item = items.find((x) => x.id === id);
        if (item) this.cb.onAudition(this.cb.getTargetPart(), item);
        return;
      }
      const row = (e.target as HTMLElement).closest('tr');
      if (row) {
        const id = row.getAttribute('data-id');
        const item = items.find((x) => x.id === id);
        if (item) this.cb.onSelectPartPreset(this.cb.getTargetPart(), item);
      }
    }, { once: true });
  }

  private loadDefaultFactoryItems(): void {
    // Standard Roland/Boss factory tones & kits
    const factory = [
      { id: 'f_piano01', name: 'Acoustic Piano 1', categoryName: 'Keys / Organ', categoryId: 5, engineKind: 'rompler_chromatic', sublibrary: 'Factory Roland' },
      { id: 'f_piano02', name: 'Bright Piano', categoryName: 'Keys / Organ', categoryId: 5, engineKind: 'rompler_chromatic', sublibrary: 'Factory Roland' },
      { id: 'f_ep01', name: 'Vintage Rhodes EP', categoryName: 'Keys / Organ', categoryId: 5, engineKind: 'rompler_chromatic', sublibrary: 'Factory Roland' },
      { id: 'f_strings01', name: 'Silk Warm Strings', categoryName: 'Strings / Solo', categoryId: 1, engineKind: 'rompler_chromatic', sublibrary: 'Factory Roland' },
      { id: 'f_bass01', name: 'Acid TB-303 Square', categoryName: 'Bass / Pluck', categoryId: 3, engineKind: 'virtual_analog', sublibrary: 'Factory Roland' },
      { id: 'f_bass02', name: 'Acid TB-303 Saw', categoryName: 'Bass / Pluck', categoryId: 3, engineKind: 'virtual_analog', sublibrary: 'Factory Roland' },
      { id: 'f_bass03', name: 'Slap Bass Fingered', categoryName: 'Bass / Pluck', categoryId: 3, engineKind: 'rompler_chromatic', sublibrary: 'Factory Roland' },
      { id: 'f_pad01', name: 'Solar Ambient Pad', categoryName: 'Pads / Showcase', categoryId: 4, engineKind: 'rompler_chromatic', sublibrary: 'Factory Roland' },
      { id: 'f_drum01', name: 'TR-909 Dance Kit', categoryName: 'Rhythm / Drums', categoryId: 9, engineKind: 'rompler_drum_map', sublibrary: 'Factory Roland' },
      { id: 'f_drum02', name: 'TR-808 Electro Kit', categoryName: 'Rhythm / Drums', categoryId: 9, engineKind: 'rompler_drum_map', sublibrary: 'Factory Roland' },
      { id: 'f_drum03', name: 'Boss DR-5 Standard', categoryName: 'Rhythm / Drums', categoryId: 9, engineKind: 'rompler_drum_map', sublibrary: 'Factory Boss' },
    ];
    this.setItems(factory);
  }
}

/**
 * ABDMCX0X — McxBankDrawerViews.ts
 * Grid and Table catalog renderers for McxBankDrawer.
 */

import { bankCardHtml, bindBankCards } from '@abdsynths/shared/components/bank/bankCard.js';
import { BANK_ICONS, getCategoryIconSvg } from '@abdsynths/shared/components/bank/bankIcons.js';
import { getBankCategoryLabel } from '@abdsynths/shared/components/bank/bankCategories.js';
import type { BankCatalogState } from '@abdsynths/shared/components/bank/bankCatalogState.js';
import type { McxCatalogItem, McxBankDrawerCallbacks } from './McxBankDrawer';
import { t } from '../i18n/mcxI18n';

function dispatchItemSelect(cb: McxBankDrawerCallbacks, item: McxCatalogItem): void {
  if (item.itemType === 2) {
    cb.onSelectMultiPreset(item);
  } else if (item.itemType === 0) {
    cb.onSelectModel(cb.getTargetPart(), item);
  } else {
    cb.onSelectPartPreset(cb.getTargetPart(), item);
  }
}

export function renderCatalogGrid(
  container: HTMLElement,
  items: McxCatalogItem[],
  state: BankCatalogState,
  cb: McxBankDrawerCallbacks,
  onRefresh: () => void,
): () => void {
  const cardsHtml = items.map((it) => bankCardHtml({
    slot: it.id,
    name: it.name,
    catLabel: it.categoryName || getBankCategoryLabel(it.categoryId ?? 0),
    catClass: `cat-${it.categoryId ?? 0}`,
    paramId: it.categoryId ?? 0,
    badges: [it.engineKind || 'ROM', it.sublibrary || 'Default'],
    thumbnailUrl: it.thumbnailUrl,
    isFavorite: state.isFavorite(it.id),
    hasAudition: true,
  })).join('');

  container.innerHTML = `<div class="ndb-grid catalog-grid">${cardsHtml}</div>`;
  return bindBankCards(container, {
    onCardClick: (_slot, id) => {
      const item = items.find((x) => x.id === id);
      if (item) dispatchItemSelect(cb, item);
    },
    onCardDblClick: (_slot, id) => {
      const item = items.find((x) => x.id === id);
      if (item) dispatchItemSelect(cb, item);
    },
    onAction: ({ id }) => {
      const item = items.find((x) => x.id === id);
      if (item) dispatchItemSelect(cb, item);
    },
    onAudition: ({ id }) => {
      const item = items.find((x) => x.id === id);
      if (item) dispatchItemSelect(cb, item);
    },
    onFavorite: ({ id }) => {
      state.toggleFavorite(id);
      onRefresh();
    },
  });
}

export function renderCatalogTable(
  container: HTMLElement,
  items: McxCatalogItem[],
  cb: McxBankDrawerCallbacks,
): void {
  const rowsHtml = items.map((it) => `
    <tr data-id="${it.id}">
      <td>${getCategoryIconSvg(it.categoryId ?? 0)}</td>
      <td><strong>${it.name}</strong></td>
      <td><span class="ndb-card-cat cat-${it.categoryId ?? 0}">${it.categoryName || getBankCategoryLabel(it.categoryId ?? 0)}</span></td>
      <td>${it.engineKind || 'ROM'}</td>
      <td>${it.sublibrary || 'Default'}</td>
      <td><button type="button" class="btn btn-xs btn-audition" data-act="load" data-id="${it.id}" title="Cargar">${BANK_ICONS.audition}</button></td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="catalog-table">
      <thead><tr><th></th><th>${t('common.name')}</th><th>${t('mcx.category')}</th><th>${t('mcx.engine')}</th><th>${t('mcx.sublibrary')}</th><th>${t('mcx.preview')}</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

  container.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-act="load"], [data-act="audition"]');
    if (btn) {
      const id = btn.getAttribute('data-id');
      const item = items.find((x) => x.id === id);
      if (item) dispatchItemSelect(cb, item);
      return;
    }
    const row = (e.target as HTMLElement).closest('tr');
    if (row) {
      const id = row.getAttribute('data-id');
      const item = items.find((x) => x.id === id);
      if (item) dispatchItemSelect(cb, item);
    }
  }, { once: true });
}

/**
 * ABDMCX0X -- McxSoundBankModal.ts
 * Clean dialog for choosing or dropping a Sound Bank (.abdbank) for the active track.
 * Strictly < 200 lines.
 */

import { attachDialogDrag, bringToFront } from '@abdsynths/shared/diagnostic-probe';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import type { McxAppState } from '../app/McxAppState';
import { loadBankIntoPart, soundBankRegistry, type McxSoundBankEntry } from '../app/McxSoundBankManager';
import { t } from '../i18n/mcxI18n';

export interface McxSoundBankModalOptions {
  bridge: McxHostBridge;
  state: McxAppState;
  onBankSelected?: (bank: McxSoundBankEntry) => void;
  onLoadCustomFile?: () => void;
}

export class McxSoundBankModal {
  private readonly dialog: HTMLDialogElement;
  private currentPart = 0;
  private readonly opts: McxSoundBankModalOptions;
  private readonly onEscKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && this.dialog.open) this.close(); };

  constructor(opts: McxSoundBankModalOptions) {
    this.opts = opts;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'mcx-soundbank-dialog';
    this.dialog.setAttribute('aria-labelledby', 'mcx-soundbank-title');
    document.body.appendChild(this.dialog);

    this.dialog.addEventListener('close', () => {
      window.removeEventListener('keydown', this.onEscKey);
    });
    this.dialog.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement | null;
      if (target?.closest('[data-act="close"]')) this.close();
      const card = target?.closest<HTMLElement>('[data-bank-id]');
      if (card) {
        const bankId = card.dataset.bankId;
        if (bankId) void this.selectBank(bankId, card);
      }
      if (target?.closest('[data-act="load-file"]')) {
        this.close();
        this.opts.onLoadCustomFile?.();
      }
    });
  }

  public open(partIdx: number): void {
    this.currentPart = partIdx;
    this.syncTheme();
    this.render();
    if (!this.dialog.open) {
      if (typeof this.dialog.showModal === 'function') this.dialog.showModal();
      else this.dialog.setAttribute('open', '');
    }
    window.addEventListener('keydown', this.onEscKey);
    bringToFront(this.dialog);
  }

  public close(): void {
    window.removeEventListener('keydown', this.onEscKey);
    if (!this.dialog.open) return;
    if (typeof this.dialog.close === 'function') this.dialog.close();
    else this.dialog.removeAttribute('open');
  }

  private async selectBank(bankId: string, cardEl: HTMLElement): Promise<void> {
    const bank = soundBankRegistry.getBankById(bankId);
    if (!bank) return;
    cardEl.classList.add('is-loading');
    const prevText = cardEl.querySelector('.mcx-soundbank-card-desc')?.textContent;
    const descEl = cardEl.querySelector('.mcx-soundbank-card-desc');
    if (descEl) descEl.textContent = 'Cargando muestras en memoria...';

    await loadBankIntoPart(this.opts.bridge, this.opts.state, this.currentPart, bank, 0);
    this.opts.onBankSelected?.(bank);
    cardEl.classList.remove('is-loading');
    if (descEl && prevText) descEl.textContent = prevText;
    this.close();
  }

  public syncTheme(): void {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme) this.dialog.setAttribute('data-theme', theme);
  }

  private render(): void {
    const p = this.currentPart;
    const ps = this.opts.state.partsState[p];
    const banks = soundBankRegistry.getBanks();
    const activeBankId = ps?.soundBankId;

    const cardsHtml = banks.length > 0 ? banks.map((b) => {
      const count = b.items.filter((it) => it.itemType === 1).length;
      const isActive = b.id === activeBankId || b.name === ps?.soundBankName;
      const countLabel = count > 0 ? `${count} instrumentos / kits` : (b.isLoaded ? 'Libreria lista' : 'Disponible en servidor');
      return `
        <div class="mcx-soundbank-card${isActive ? ' is-active' : ''}" data-bank-id="${b.id}">
          <div class="mcx-soundbank-card-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="7" y2="12"/><line x1="11" y1="8" x2="11" y2="12"/><line x1="15" y1="8" x2="15" y2="12"/>
            </svg>
          </div>
          <div class="mcx-soundbank-card-info">
            <div class="mcx-soundbank-card-title">${b.name}</div>
            <div class="mcx-soundbank-card-desc">${b.description || countLabel}</div>
            <div class="mcx-soundbank-card-meta">${countLabel} · ${b.filename}</div>
          </div>
          ${isActive ? '<span class="mcx-soundbank-active-tag">ACTIVO</span>' : ''}
        </div>
      `;
    }).join('') : `
      <div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--text-muted, #888); font-family: monospace;">
        Cargando catalogo de librerias...
      </div>
    `;

    this.dialog.innerHTML = `
      <div class="mcx-soundbank-shell">
        <header class="mcx-soundbank-head" data-drag-handle>
          <div class="mcx-soundbank-head-left">
            <span class="mcx-synth-part-badge">P${String(p + 1).padStart(2, '0')}</span>
            <div>
              <h2 class="mcx-soundbank-title" id="mcx-soundbank-title">SELECCIONAR BANCO DE SONIDO PCM (.abdbank)</h2>
              <span class="mcx-soundbank-sub">Librerias instaladas para la Pista ${p + 1} (${ps?.name || 'Init'})</span>
            </div>
          </div>
          <button type="button" class="mcx-synth-close-btn" data-act="close" aria-label="${t('mcx.close')}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div class="mcx-soundbank-body">
          <div class="mcx-soundbank-grid">
            ${cardsHtml}
          </div>
        </div>
        <footer class="mcx-soundbank-foot">
          <button type="button" class="mcx-btn mcx-btn--secondary" data-act="load-file">
            Cargar archivo .abdbank externo...
          </button>
          <button type="button" class="mcx-btn mcx-btn--primary" data-act="close">
            Listo
          </button>
        </footer>
      </div>
    `;

    const head = this.dialog.querySelector<HTMLElement>('.mcx-soundbank-head');
    if (head) attachDialogDrag(this.dialog, head);
  }
}

/**
 * ABDMCX0X -- McxSynthModal.ts
 * Dedicated Modeless Instrument Modal (<dialog>) hosting the active part's synth engine
 * interface (e.g. StructuredRomplerPanel) or External MIDI controller. Strictly < 200 lines.
 */

import { EnginePanelHost } from '@abdsynths/shared/components/synth-engines';
import { attachDialogDrag, bringToFront } from '@abdsynths/shared/diagnostic-probe';
import type { McxEngineDescriptorDto, McxHostBridge, McxPartEngineStateDto, McxPartPresetsDto } from '../bridge/McxHostBridge';
import { McxPartEngineBridge } from '../bridge/McxPartEngineBridge';
import { DEFAULT_ENGINE_CATALOG } from './McxEngineCatalogDefaults';
import type { McxPartUiState } from './McxMixerConsole';
import { getLocale, t } from '../i18n/mcxI18n';

export interface McxSynthModalOptions {
  bridge: McxHostBridge; getPartState: (idx: number) => McxPartUiState;
  getCatalog?: () => McxEngineDescriptorDto[]; getPartPresets?: (idx: number) => McxPartPresetsDto | undefined;
  onPartUpdated: (idx: number) => void; onOpenRouteModal: (idx: number) => void;
  onOpenBank: (idx: number) => void; setLcdLine2: (text: string) => void;
}

export class McxSynthModal {
  private readonly dialog: HTMLDialogElement; private readonly opts: McxSynthModalOptions;
  private currentPart = 0; private catalog: McxEngineDescriptorDto[] = [...DEFAULT_ENGINE_CATALOG];
  private presetsByPart = new Map<number, McxPartPresetsDto>();
  private partBridges = new Map<number, McxPartEngineBridge>();
  private mountedPart = -1; private mountedEngineTypeId = '';
  private enginePanelHost: EnginePanelHost | null = null; private slotEl: HTMLElement | null = null;
  private readonly onEscKey: (ev: KeyboardEvent) => void;

  constructor(opts: McxSynthModalOptions) {
    this.opts = opts;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'mcx-synth-dialog';
    this.dialog.setAttribute('aria-labelledby', 'mcx-synth-title');
    document.body.appendChild(this.dialog);
    this.onEscKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && this.dialog.open) this.close(); };
    this.dialog.addEventListener('close', () => {
      this.dialog.returnValue = ''; window.removeEventListener('keydown', this.onEscKey); this.opts.onPartUpdated(this.currentPart);
    });
    this.dialog.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement | null;
      const actEl = target?.closest<HTMLElement>('[data-act]');
      const act = actEl?.dataset.act;
      if (act === 'close') { ev.stopPropagation(); this.close(); }
      else if (act === 'open-route') { ev.stopPropagation(); this.close(); this.opts.onOpenRouteModal(this.currentPart); }
    });
  }

  private getOrCreatePartBridge(partIdx: number): McxPartEngineBridge {
    let pb = this.partBridges.get(partIdx);
    if (!pb) {
      pb = new McxPartEngineBridge({
        partIndex: partIdx, hostBridge: this.opts.bridge, getPartState: () => this.opts.getPartState(partIdx),
        getCatalog: () => this.catalog, getPartPresets: () => this.presetsByPart.get(partIdx),
        onRequestBank: () => this.opts.onOpenBank(partIdx),
        onHostStateChanged: () => { this.opts.onPartUpdated(partIdx); this.syncHeader(); },
      });
      this.partBridges.set(partIdx, pb);
    }
    return pb;
  }

  public setEngineCatalog(engines: McxEngineDescriptorDto[]): void { if (engines.length > 0) this.catalog = engines; if (this.dialog.open) this.syncHeader(); }
  public setPartPresets(dto: McxPartPresetsDto): void { this.presetsByPart.set(dto.part, dto); if (this.dialog.open && dto.part === this.currentPart) this.syncEnginePanel(); }
  public applyPartEngineState(dto: McxPartEngineStateDto): void {
    this.getOrCreatePartBridge(dto.part).applyRemoteState(dto.engineTypeId, dto.stateJson, dto.presetName, dto.coverDataUrl);
    if (this.dialog.open && dto.part === this.currentPart) this.syncEnginePanel();
  }
  public setLocale(locale: 'en' | 'es'): void {
    if (this.dialog.open) { this.render(); this.syncEnginePanel(); }
    else this.enginePanelHost?.setLocale(locale);
  }

  public open(partIdx: number): void {
    this.currentPart = partIdx; this.syncTheme();
    this.opts.bridge.requestPartPresets(partIdx); this.opts.bridge.requestPartEngineState(partIdx);
    this.render();
    if (!this.dialog.open) {
      if (typeof this.dialog.show === 'function') this.dialog.show();
      else this.dialog.setAttribute('open', '');
    }
    window.addEventListener('keydown', this.onEscKey);
    bringToFront(this.dialog);
    this.syncEnginePanel();
    const ps = this.opts.getPartState(partIdx);
    this.opts.setLcdLine2(`INSTRUMENT [P${String(partIdx + 1).padStart(2, '0')}] ${ps.name || 'Tone'}`);
  }

  public close(): void {
    window.removeEventListener('keydown', this.onEscKey);
    if (!this.dialog.open) return;
    if (typeof this.dialog.close === 'function') this.dialog.close();
    else this.dialog.removeAttribute('open');
  }
  public toggle(partIdx: number): void { if (this.dialog.open && this.currentPart === partIdx) this.close(); else this.open(partIdx); }
  public isOpen(): boolean { return this.dialog.open; }

  private syncTheme(): void {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme) this.dialog.setAttribute('data-theme', theme);
  }

  private render(): void {
    this.enginePanelHost?.destroy();
    this.enginePanelHost = null;
    this.mountedPart = -1;
    this.mountedEngineTypeId = '';

    const p = this.currentPart, ps = this.opts.getPartState(p);
    const isExt = ps.routeMode === 1;
    const desc = this.catalog.find((e) => e.index === ps.engineTypeIndex);
    const engineTitle = isExt ? t('mcx.synthExtTitle') : (desc?.displayName || 'ABD Structured Rompler');

    this.dialog.innerHTML = `
      <div class="mcx-synth-shell">
        <header class="mcx-synth-head" data-drag-handle>
          <div class="mcx-synth-head-left">
            <span class="mcx-synth-part-badge" id="mcx-synth-part-badge">P${String(p + 1).padStart(2, '0')}</span>
            <h2 class="mcx-synth-title" id="mcx-synth-title">${engineTitle}</h2>
          </div>
          <div class="mcx-synth-head-actions">
            <button type="button" class="mcx-synth-route-btn" data-act="open-route" title="${t('mcx.synthChangeRouteTitle')}"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg> <span>${t('mcx.synthChangeRoute')}</span></button>
            <button type="button" class="mcx-synth-close-btn" data-act="close" aria-label="${t('mcx.closeDrawer')}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
        </header>
        <div class="mcx-synth-body"><div class="mcx-synth-slot" id="mcx-synth-slot"></div></div>
      </div>
    `;

    const head = this.dialog.querySelector<HTMLElement>('.mcx-synth-head');
    if (head) attachDialogDrag(this.dialog, head);
    this.slotEl = this.dialog.querySelector<HTMLElement>('#mcx-synth-slot');
    if (this.slotEl) this.enginePanelHost = new EnginePanelHost(this.slotEl, { locale: getLocale() === 'es' ? 'es' : 'en', skin: 'ms2000' });
  }

  private syncHeader(): void {
    const titleEl = this.dialog.querySelector<HTMLElement>('#mcx-synth-title');
    if (!titleEl) return;
    const ps = this.opts.getPartState(this.currentPart);
    const isExt = ps.routeMode === 1;
    const desc = this.catalog.find((c) => c.index === ps.engineTypeIndex);
    titleEl.textContent = isExt ? t('mcx.synthExtTitle') : (desc?.displayName || 'ABD Structured Rompler');
  }

  private syncEnginePanel(): void {
    const ps = this.opts.getPartState(this.currentPart);
    const isExternal = ps.routeMode === 1 || ps.engineTypeIndex === 1 || ps.engineTypeId === 'external_midi';
    if (isExternal) {
      this.enginePanelHost?.clear(); this.mountedPart = -1; this.mountedEngineTypeId = '';
      if (this.slotEl) {
        this.slotEl.innerHTML = `
          <div class="mcx-motor-external">
            <div class="mcx-ext-head">
              <span class="mcx-ext-title">${t('mcx.synthExtUpper')} (${t('mcx.routePort').toUpperCase()} ${(ps.midiPortIndex ?? 0) + 1} · ${t('mcx.routeCh').toUpperCase()} ${ps.midiChannel || 1})</span>
              <button type="button" class="mcx-synth-route-btn" data-act="open-route">${t('mcx.synthChangePortCh')}</button>
            </div>
            <p class="mcx-ext-hint">${t('mcx.synthExtHint')}</p>
          </div>`;
      }
      return;
    }

    const pb = this.getOrCreatePartBridge(this.currentPart), typeId = pb.getDescriptor().typeId;
    if (this.mountedPart !== this.currentPart || this.mountedEngineTypeId !== typeId) {
      this.enginePanelHost?.mount(pb); this.mountedPart = this.currentPart; this.mountedEngineTypeId = typeId;
      this.opts.bridge.requestPartEngineState(this.currentPart);
    } else this.enginePanelHost?.sync();
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.onEscKey);
    this.enginePanelHost?.destroy();
    this.dialog.remove();
  }
}

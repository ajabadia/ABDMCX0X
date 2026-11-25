/**
 * ABDMCX0X -- McxToneDrawer.ts
 * 2-Tab Track Mixing & Performance Console ([ CANAL / MEZCLA ] | [ MIDI FX ]).
 * 100% decoupled from synth engine internals (synthesis GUI hosted in McxSynthModal).
 * Strictly < 200 lines.
 */

import type { McxEngineDescriptorDto, McxHostBridge, McxPartEngineStateDto, McxPartPresetsDto, McxParamKey } from '../bridge/McxHostBridge';
import { DEFAULT_ENGINE_CATALOG } from './McxEngineCatalogDefaults';
import type { McxPartUiState } from './McxMixerConsole';
import type { McxDrawerTabId } from './McxToneDrawerViews';
import { bindDrawerSendButtons, buildToneDrawerShellHtml, resetPartSemanticOffsets, syncInsertSelectOptions, syncToneDrawerDom, updateDrawerSendLabels, updateDrawerSendTelemetry } from './McxToneDrawerSync';
import { McxToneDrawerKnobsManager } from './McxToneDrawerKnobs';

export interface McxToneDrawerOptions {
  hostEl: HTMLElement; bridge: McxHostBridge; getPartState: (idx: number) => McxPartUiState; setLcdLine2: (text: string) => void;
  getRackSlots?: () => any[]; onClose?: () => void; onChangePartChannel?: (idx: number, ch: number) => void;
  onToggleFollowTranspose?: (idx: number) => void; onToggleMute?: (idx: number) => void; onToggleSolo?: (idx: number) => void;
  onRouteModeChange?: (idx: number, mode: number) => void; onOpenSynth?: (idx: number) => void;
  onOpenRouteModal?: (idx: number) => void; onOpenPianoRoll?: (idx: number) => void;
  onOpenGroove?: (idx: number) => void; onOpenArp?: (idx: number) => void;
  onOpenPads?: (idx: number) => void; onPartChanged?: (idx: number) => void;
}

const TAB_ORDER: McxDrawerTabId[] = ['mix', 'midifx'];
const mapSectionToTab = (s?: string): McxDrawerTabId | null => !s ? null : (['midifx', 'arp', 'scale', 'seq-links', 'offsets'].includes(s) ? 'midifx' : 'mix');

export class McxToneDrawer {
  private el: HTMLElement; private currentPart = 0; private opened = false;
  private activeTab: McxDrawerTabId = 'mix';
  private catalog: McxEngineDescriptorDto[] = [...DEFAULT_ENGINE_CATALOG];
  private bridge: McxHostBridge; private getPartState: (idx: number) => McxPartUiState;
  private setLcdLine2: (text: string) => void; private opts: McxToneDrawerOptions;
  private knobsMgr = new McxToneDrawerKnobsManager();
  private lastSendLabels?: { sendA: string; sendB: string; sendC: string; sendD: string };
  private onEscKey = (ev: KeyboardEvent): void => { if (ev.key === 'Escape' && this.opened) this.close(); };

  constructor(opts: McxToneDrawerOptions) {
    this.opts = opts; this.bridge = opts.bridge; this.getPartState = opts.getPartState; this.setLcdLine2 = opts.setLcdLine2;
    this.el = document.createElement('div');
    this.el.className = 'mcx-bottom-drawer'; this.el.id = 'mcx-tone-drawer';
    this.el.setAttribute('role', 'region'); this.el.setAttribute('aria-label', 'Consola de Canal de Pista');
    this.bindShellClicksOnce();
    this.el.innerHTML = buildToneDrawerShellHtml();
    opts.hostEl.appendChild(this.el);
    this.bindDomChildren();
  }

  public setEngineCatalog(engines: McxEngineDescriptorDto[]): void { if (engines.length > 0) this.catalog = engines; if (this.opened) this.syncPart(this.currentPart, this.getPartState(this.currentPart)); }
  public setPartPresets(_dto: McxPartPresetsDto): void {}
  public applyPartEngineState(_dto: McxPartEngineStateDto): void {}
  public setLocale(_locale: 'en' | 'es'): void {
    const prevTab = this.activeTab;
    this.knobsMgr.destroy();
    this.el.innerHTML = buildToneDrawerShellHtml();
    this.bindDomChildren();
    this.setActiveTab(prevTab);
    this.syncPart(this.currentPart, this.getPartState(this.currentPart));
    if (this.lastSendLabels) updateDrawerSendLabels(this.el, this.lastSendLabels);
  }

  public setActiveTab(tabId: McxDrawerTabId, focusTab = false): void {
    this.activeTab = tabId;
    this.el.querySelectorAll<HTMLButtonElement>('[data-drawer-tab]').forEach((tab) => {
      const active = tab.dataset.drawerTab === tabId;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1; tab.toggleAttribute('focusgroupstart', active);
      if (active) { tab.scrollIntoView({ block: 'nearest', inline: 'nearest' }); if (focusTab) tab.focus(); }
    });
    this.el.querySelectorAll<HTMLElement>('[data-tab-panel]').forEach((panel) => {
      const active = panel.dataset.tabPanel === tabId;
      if (active) { panel.removeAttribute('hidden'); panel.setAttribute('tabindex', '0'); }
      else { (panel as any).hidden = 'until-found'; panel.removeAttribute('tabindex'); }
    });
  }

  public open(partIdx: number, focusSection?: string): void {
    this.currentPart = partIdx; this.opened = true; this.el.classList.add('is-open');
    window.addEventListener('keydown', this.onEscKey);
    this.syncPart(partIdx, this.getPartState(partIdx)); this.highlightSection(focusSection);
    this.setLcdLine2(`TRACK MIXER [P${String(partIdx + 1).padStart(2, '0')}]${focusSection ? ` -> ${focusSection.toUpperCase()}` : ''}`);
  }
  public close(): void {
    if (!this.opened) return;
    this.opened = false; this.el.classList.remove('is-open'); window.removeEventListener('keydown', this.onEscKey);
    this.highlightSection(); this.opts.onClose?.();
  }
  public toggle(partIdx: number, focusSection?: string): void { if (this.opened && this.currentPart === partIdx && !focusSection) this.close(); else this.open(partIdx, focusSection); }
  public highlightSection(sec?: string): void {
    this.el.querySelectorAll('.mcx-module-card').forEach((c) => c.classList.remove('is-highlighted'));
    const tab = mapSectionToTab(sec); if (tab) this.setActiveTab(tab);
    if (sec) { const c = this.el.querySelector(`.mcx-card-${sec}`); if (c) { c.classList.add('is-highlighted'); setTimeout(() => c.classList.remove('is-highlighted'), 4500); } }
  }
  public isOpen(): boolean { return this.opened; }
  public getPart(): number { return this.currentPart; }
  public updateParamLive(param: McxParamKey, rawVal: number): void {
    (this.getPartState(this.currentPart) as any)[param] = rawVal;
    if (this.opened) this.knobsMgr.updateSingle(param, rawVal);
  }
  public updateSendLabels(labels?: { sendA: string; sendB: string; sendC: string; sendD: string }): void {
    this.lastSendLabels = labels; updateDrawerSendLabels(this.el, labels);
  }
  public updateSendTelemetry(peaks: number[], busMutes?: boolean[]): void { if (this.opened) updateDrawerSendTelemetry(this.el, peaks, busMutes); }
  public updateLfoPhase(_phase: number): void {}

  public syncPart(partIdx: number, ps: McxPartUiState): void {
    this.currentPart = partIdx;
    syncToneDrawerDom(this.el, partIdx, ps, this.catalog, this.knobsMgr);
    this.knobsMgr.syncValues(ps);
    syncInsertSelectOptions(this.el, this.opts.getRackSlots?.(), ps.insertSlot ?? -1);
  }
  public updateInsertOptions(rackSlots?: any[]): void {
    const ps = this.getPartState(this.currentPart);
    syncInsertSelectOptions(this.el, rackSlots ?? this.opts.getRackSlots?.(), ps?.insertSlot ?? -1);
  }

  private handleAction(act: string, ps: McxPartUiState): void {
    const p = this.currentPart, tag = `P${String(p + 1).padStart(2, '0')}`;
    if (act === 'close') { this.close(); return; }
    if (act === 'open-synth') { this.opts.onOpenSynth?.(p); return; }
    if (act === 'open-route') { this.opts.onOpenRouteModal?.(p); return; }
    if (act === 'open-seq') { this.opts.onOpenPianoRoll?.(p); return; }
    if (act === 'open-groove') { this.opts.onOpenGroove?.(p); return; }
    if (act === 'open-arp') { this.opts.onOpenArp?.(p); return; }
    if (act === 'open-pads') { this.opts.onOpenPads?.(p); return; }
    if (act === 'drawer-arp') {
      ps.arpEnabled = !ps.arpEnabled; this.bridge.setParam(p, 'arpEnabled', ps.arpEnabled ? 1 : 0);
      this.syncPart(p, ps); this.setLcdLine2(`${tag} ARP: ${ps.arpEnabled ? 'ON' : 'OFF'}`);
    } else if (act === 'reset-offsets') {
      resetPartSemanticOffsets(this.bridge, p, ps); this.syncPart(p, ps); this.setLcdLine2(`${tag} MACROS RESET 0%`);
    } else if (act === 'drawer-ch-dec' || act === 'drawer-ch-inc') {
      const ch = Math.min(16, Math.max(1, (ps.midiChannel || 1) + (act === 'drawer-ch-inc' ? 1 : -1)));
      ps.midiChannel = ch; this.bridge.setParam(p, 'partMidiChannel', ch); this.opts.onChangePartChannel?.(p, ch); this.syncPart(p, ps);
    } else if (act === 'drawer-tr') { this.opts.onToggleFollowTranspose?.(p); this.syncPart(p, this.getPartState(p)); }
    else if (act === 'drawer-mute') { this.opts.onToggleMute?.(p); this.syncPart(p, this.getPartState(p)); }
    else if (act === 'drawer-solo') { this.opts.onToggleSolo?.(p); this.syncPart(p, this.getPartState(p)); }
  }

  private bindShellClicksOnce(): void {
    this.el.addEventListener('click', (ev) => {
      const tgt = ev.target as HTMLElement, tabBtn = tgt.closest<HTMLButtonElement>('[data-drawer-tab]');
      if (tabBtn?.dataset.drawerTab) { ev.stopPropagation(); this.setActiveTab(tabBtn.dataset.drawerTab as McxDrawerTabId); return; }
      const act = tgt.closest('[data-act]')?.getAttribute('data-act');
      if (act) { ev.stopPropagation(); this.handleAction(act, this.getPartState(this.currentPart)); return; }
      const segBtn = tgt.closest<HTMLButtonElement>('.mcx-seg-btn[data-param]');
      if (segBtn && !segBtn.disabled) {
        ev.stopPropagation();
        const param = segBtn.dataset.param!, val = parseInt(segBtn.dataset.val ?? '0', 10);
        (this.getPartState(this.currentPart) as any)[param] = val;
        this.bridge.setParam(this.currentPart, param as McxParamKey, val);
        this.syncPart(this.currentPart, this.getPartState(this.currentPart));
        this.setLcdLine2(`P${String(this.currentPart + 1).padStart(2, '0')} ${param}: ${val}`);
      }
    });
  }

  private bindDomChildren(): void {
    this.el.querySelector<HTMLElement>('.mcx-drawer-tablist')?.addEventListener('keydown', (ev) => {
      const idx = TAB_ORDER.indexOf(this.activeTab);
      const next = ev.key === 'ArrowRight' ? (idx + 1) % 2 : ev.key === 'ArrowLeft' ? (idx + 1) % 2 : ev.key === 'Home' ? 0 : ev.key === 'End' ? 1 : -1;
      if (next >= 0) { ev.preventDefault(); this.setActiveTab(TAB_ORDER[next], true); }
    });
    this.el.querySelectorAll<HTMLElement>('[data-tab-panel]').forEach((p) => p.addEventListener('beforematch', () => { const id = p.dataset.tabPanel as McxDrawerTabId; if (id) this.setActiveTab(id); }));
    this.knobsMgr.mount(this.el, (param, val, fmtTxt) => {
      const ps = this.getPartState(this.currentPart) as any; ps[param] = val;
      if (param === 'driveAmount') this.bridge.setParam(this.currentPart, 'driveEnabled', val > 0.005 ? 1 : 0);
      else if (param.startsWith('eq')) this.bridge.setParam(this.currentPart, 'eqEnabled', 1);
      this.bridge.setParam(this.currentPart, param, val); this.setLcdLine2(`P${String(this.currentPart + 1).padStart(2, '0')} ${param}: ${fmtTxt}`);
    });
    bindDrawerSendButtons(this.el, this.bridge, () => this.currentPart, this.getPartState, this.knobsMgr, this.setLcdLine2);
    this.el.querySelector<HTMLSelectElement>('#mcx-track-insert-select')?.addEventListener('change', (e) => {
      const slot = parseInt((e.target as HTMLSelectElement).value, 10);
      const ps = this.getPartState(this.currentPart);
      ps.insertSlot = slot;
      this.bridge.setPartInsertSlot(this.currentPart, slot);
      this.setLcdLine2(`P${String(this.currentPart + 1).padStart(2, '0')} INSERT FX: ${slot < 0 ? 'OFF' : `BAY ${slot + 1}`}`);
    });
  }

  public destroy(): void { window.removeEventListener('keydown', this.onEscKey); this.knobsMgr.destroy(); this.el.remove(); }
}

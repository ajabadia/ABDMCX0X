/**
 * ABDMCX0X -- McxRackColumn.ts
 * 8-Slot Modular 19'' Studio Rack Chassis & Patchbay Component.
 * Strict line limit: < 200 lines. 100% theme tokenized.
 */

import { findAlgorithmById, openFxPicker } from '@abdsynths/shared/components';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { t } from '../i18n/mcxI18n';
import { buildOccupiedSlotHtml, buildRackShellHtml, createDefaultRackSlots, createEmptyRackSlot, createEmptyRackSlots, wireRackSlotCoverPopup, type UiRackSlot } from './McxRackColumnViews';

export type { UiRackSlot } from './McxRackColumnViews';

export interface McxRackColumnOptions {
  bridge: McxHostBridge; setLcdLine2?: (text: string) => void;
  onOpenTopology?: () => void; onSlotsChanged?: (slots: UiRackSlot[]) => void;
  onSlotMoved?: (from: number, to: number) => void; onSlotRemoved?: (slot: number) => void;
  onOpenEffectDetail?: (slotIdx: number, algoId: string, customName: string, slot: UiRackSlot) => void;
  onToggleCollapse?: () => void;
}

export class McxRackColumn {
  private el: HTMLElement; private opts: McxRackColumnOptions;
  private slots: UiRackSlot[] = []; private sendTargets: number[] = [0, 1, -1, -1];
  private hasHostHydrated = false;
  private pickerEl: HTMLElement | null = null;

  constructor(container: HTMLElement, opts: McxRackColumnOptions) {
    this.el = container; this.opts = opts;
    this.initDefaultSlots(); this.render();
  }

  private pushToBridge(): void {
    this.slots.forEach((st, i) => {
      if (st?.engine) {
        this.opts.bridge.setRackSlotEngine(i, st.engine, st.name);
        this.opts.bridge.setRackSlotParams(i, st.p1 ?? 0.5, st.p2 ?? 0.5, st.mix ?? 1.0);
        if (st.params) Object.entries(st.params).forEach(([k, v]) => this.opts.bridge.setRackSlotParamByKey(i, k, Number(v)));
      }
      if (st?.bypass) this.opts.bridge.setRackSlotBypass(i, true);
      if (st?.duck !== undefined) this.opts.bridge.setRackSlotDucking(i, Boolean(st.duck), st.duckAmount ?? 0.6);
      if ((st?.chainTarget ?? -1) >= 0) this.opts.bridge.setSlotChainTarget(i, Number(st.chainTarget));
    });
    this.sendTargets.forEach((bay, b) => this.opts.bridge.setSendSlotTarget(b, bay));
  }

  private initDefaultSlots(): void {
    if (!this.opts.bridge.isNative) {
      try {
        const s = localStorage.getItem('abdmcx_rack_slots_v1'), t = localStorage.getItem('abdmcx_rack_sends_v1');
        if (s) {
          this.slots = JSON.parse(s); if (t) this.sendTargets = JSON.parse(t);
          this.opts.bridge.onAudioStatus((st) => { if (st === 'ready' && !this.hasHostHydrated) this.pushToBridge(); });
          return;
        }
      } catch { /* ignore */ }
      this.opts.bridge.onAudioStatus((st) => { if (st === 'ready' && !this.hasHostHydrated) this.pushToBridge(); });
    }
    this.slots = createDefaultRackSlots();
  }

  public hydrateFromHost(rackJson: string, sendTargets?: number[]): void {
    this.hasHostHydrated = true;
    if (Array.isArray(sendTargets) && sendTargets.length >= 4) this.sendTargets = sendTargets.slice(0, 4).map(Number);
    try {
      const parsed = rackJson ? JSON.parse(rackJson) : null;
      if (Array.isArray(parsed?.slots)) {
        this.slots = Array.from({ length: 8 }, (_, i) => {
          const r = parsed.slots[i];
          return { slot: i, engine: Number(r?.engine ?? 0), algoId: String(r?.algoId ?? ''), name: String(r?.name ?? ''), bypass: Boolean(r?.bypass), duck: Boolean(r?.duck), duckAmount: Number(r?.duckAmt ?? 0.6), chainTarget: Number(r?.chain ?? -1), p1: Number(r?.p1 ?? 0.5), p2: Number(r?.p2 ?? 0.5), mix: Number(r?.mix ?? 1.0), params: r ? { p3: Number(r.p3 ?? 0.5), p4: Number(r.p4 ?? 0.5), p5: Number(r.p5 ?? 0.5), mode: Number(r.mode ?? 0), mix: Number(r.mix ?? 1.0) } : undefined };
        });
      }
    } catch { /* ignore invalid rackJson */ }
    this.renderSlots(); this.opts.onSlotsChanged?.(this.slots);
  }

  getSlots(): UiRackSlot[] { return this.slots; }
  getSendTargets(): number[] { return [...this.sendTargets]; }
  setSendTarget(bus: number, slot: number): void { this.sendTargets[bus] = slot; this.syncSlotIndices(); }
  public clearAllSlots(): void {
    for (let s = 0; s < 8; ++s) { this.opts.bridge.removeRackSlot(s); this.opts.bridge.setRackSlotBypass(s, false); }
    for (let b = 0; b < 4; ++b) this.opts.bridge.setSendSlotTarget(b, -1);
    this.slots = createEmptyRackSlots();
    this.sendTargets = [-1, -1, -1, -1];
    this.syncSlotIndices(); this.renderSlots();
  }
  public resetToFactoryRack(): void {
    this.slots = createDefaultRackSlots();
    this.sendTargets = [1, 0, 0, -1];
    this.sendTargets.forEach((tgt, b) => this.opts.bridge.setSendSlotTarget(b, tgt));
    this.pushToBridge(); this.syncSlotIndices(); this.renderSlots();
  }
  updateSlotState(slotIdx: number, patch: Partial<UiRackSlot>, rerender = false): void {
    const cur = this.slots[slotIdx]; if (!cur) return;
    this.slots[slotIdx] = { ...cur, ...patch, params: patch.params ? { ...(cur.params || {}), ...patch.params } : cur.params };
    this.syncSlotIndices(); if (rerender) this.renderSlots();
  }
  private syncSlotIndices(): void {
    this.slots.forEach((st, i) => { st.slot = i; });
    if (!this.opts.bridge.isNative) {
      try { localStorage.setItem('abdmcx_rack_slots_v1', JSON.stringify(this.slots)); localStorage.setItem('abdmcx_rack_sends_v1', JSON.stringify(this.sendTargets)); } catch { /* ignore */ }
    }
    this.opts.onSlotsChanged?.(this.slots);
  }
  setSlotCustomName(slotIdx: number, name: string): void { if (this.slots[slotIdx]) { this.slots[slotIdx].name = name; this.syncSlotIndices(); this.renderSlots(); } }
  openSlotFaceplate(slotIdx: number): void { const s = this.slots[slotIdx]; if (s && s.engine !== 0) this.opts.onOpenEffectDetail?.(slotIdx, s.algoId, s.name, s); }

  render(): void {
    this.el.innerHTML = buildRackShellHtml();
    const openPatch = () => this.opts.onOpenTopology?.();
    const toggleCol = () => this.opts.onToggleCollapse?.();
    this.el.querySelector('#mcx-rack-open-topo')?.addEventListener('click', openPatch);
    this.el.querySelector('#mcx-rack-patchbay-strip')?.addEventListener('click', openPatch);
    this.el.querySelector('#mcx-rack-collapse')?.addEventListener('click', toggleCol);
    this.el.querySelector('#mcx-rack-expand')?.addEventListener('click', toggleCol);
    this.renderSlots();
  }

  private renderSlots(): void {
    const mount = this.el.querySelector('#mcx-rack-slots-mount');
    const badge = this.el.querySelector('#mcx-rack-collapsed-count');
    if (badge) badge.textContent = String(this.slots.filter((sl) => sl.engine !== 0).length);
    if (!mount) return;
    mount.innerHTML = '';
    this.slots.forEach((s, idx) => {
      const card = document.createElement('div');
      card.className = `mcx-rack-slot-card${s.engine === 0 ? ' is-empty' : ''}`; card.dataset.slot = String(idx);
      if (s.engine === 0) {
        card.innerHTML = `<button type="button" class="mcx-rack-add-btn"><span>+</span> ${t('mcx.rackBay')} ${idx + 1}: ${t('mcx.rackAddSlot')}</button>`;
        card.querySelector('button')?.addEventListener('click', (ev) => { ev.stopPropagation(); this.showAddEffectMenu(idx, card); });
      } else {
        const def = findAlgorithmById(s.algoId);
        card.style.background = `color-mix(in srgb, ${def.baseColor || 'transparent'} 35%, var(--color-panel-surface))`;
        card.style.borderLeft = `3px solid ${def.accentColor || 'var(--color-accent)'}`;
        card.innerHTML = buildOccupiedSlotHtml(s, def); this.bindSlotEvents(card, s, idx);
      }
      mount.appendChild(card);
    });
  }

  private bindSlotEvents(card: HTMLElement, s: UiRackSlot, idx: number): void {
    card.querySelector('.btn-bypass')?.addEventListener('click', (e) => {
      e.stopPropagation(); s.bypass = !s.bypass;
      this.opts.bridge.setRackSlotBypass(idx, s.bypass); this.syncSlotIndices();
      this.opts.setLcdLine2?.(`SLOT ${idx + 1} ${s.name}: ${s.bypass ? 'BYPASS (0% CPU)' : 'ACTIVO'}`); this.renderSlots();
    });
    const openDetail = (e: Event) => { e.stopPropagation(); this.opts.onOpenEffectDetail?.(idx, s.algoId, s.name, s); };
    wireRackSlotCoverPopup(card, s, findAlgorithmById(s.algoId), () => this.opts.onOpenEffectDetail?.(idx, s.algoId, s.name, s));
    card.querySelector('.mcx-rack-slot-name')?.addEventListener('click', openDetail);
    card.querySelector('.btn-faceplate')?.addEventListener('click', openDetail);
    card.querySelector('.btn-del')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.slots[idx] = createEmptyRackSlot(idx);
      this.sendTargets = this.sendTargets.map((t) => (t === idx ? -1 : t));
      this.opts.bridge.removeRackSlot(idx); this.syncSlotIndices(); this.opts.onSlotRemoved?.(idx); this.renderSlots();
    });
    const swapRack = (from: number, to: number) => {
      [this.slots[to], this.slots[from]] = [this.slots[from], this.slots[to]];
      this.sendTargets = this.sendTargets.map((t) => (t === from ? to : t === to ? from : t));
      this.opts.bridge.moveRackSlot(from, to); this.syncSlotIndices(); this.opts.onSlotMoved?.(from, to); this.renderSlots();
    };
    card.querySelector('.btn-up')?.addEventListener('click', (e) => { e.stopPropagation(); if (idx > 0) swapRack(idx, idx - 1); });
    card.querySelector('.btn-dn')?.addEventListener('click', (e) => { e.stopPropagation(); if (idx < 7) swapRack(idx, idx + 1); });
    const chainSel = card.querySelector<HTMLSelectElement>('.mcx-rack-chain-sel');
    chainSel?.addEventListener('click', (e) => e.stopPropagation());
    chainSel?.addEventListener('change', (e) => {
      e.stopPropagation();
      const target = Number(chainSel.value); s.chainTarget = target;
      this.opts.bridge.setSlotChainTarget(idx, target); this.syncSlotIndices();
      this.opts.setLcdLine2?.(`BAY ${idx + 1} OUT: ${target >= 0 ? `CHAIN → B${target + 1}` : 'MASTER MIX'}`);
    });
    card.addEventListener('click', () => this.opts.onOpenEffectDetail?.(idx, s.algoId, s.name, s));
  }

  private showAddEffectMenu(slotIdx: number, anchorEl: HTMLElement): void {
    openFxPicker({
      slotIdx, anchorEl, activeId: this.slots[slotIdx]?.algoId || null,
      onSelect: (chosen: { id: string; fxId?: number; eng?: number; rackEngine?: number; name: string }) => {
        const engId = chosen?.rackEngine ?? chosen?.fxId ?? chosen?.eng ?? 0;
        const isNone = !chosen || engId === 0;
        this.slots[slotIdx] = { slot: slotIdx, engine: isNone ? 0 : engId, algoId: isNone ? '' : chosen.id, name: isNone ? '' : chosen.name, bypass: false, duck: false, p1: 0.5, p2: 0.5 };
        if (isNone) this.opts.bridge.removeRackSlot(slotIdx);
        else { this.opts.bridge.setRackSlotEngine(slotIdx, engId, chosen.name); this.opts.setLcdLine2?.(`${t('mcx.rackMounted')} ${slotIdx + 1}: ${chosen.name}`); }
        this.syncSlotIndices(); this.renderSlots();
      },
    });
  }

  updateMeter(slotIdx: number, pIn: number, pOut: number, clipIn = false, clipOut = false): void {
    const card = this.el.querySelector(`.mcx-rack-slot-card[data-slot="${slotIdx}"]`); if (!card) return;
    const inFill = card.querySelector<HTMLElement>('.in-fill'), outFill = card.querySelector<HTMLElement>('.out-fill');
    if (inFill) inFill.style.width = `${Math.min(100, Math.round(pIn * 100))}%`;
    if (outFill) outFill.style.width = `${Math.min(100, Math.round(pOut * 100))}%`;
    card.querySelector('.in-clip')?.classList.toggle('is-active', clipIn); card.querySelector('.out-clip')?.classList.toggle('is-active', clipOut);
  }
}

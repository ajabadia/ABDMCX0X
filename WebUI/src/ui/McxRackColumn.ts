/**
 * ABDMCX0X -- McxRackColumn.ts
 * 8-Slot Modular 19'' Studio Rack Chassis & Patchbay Component.
 * Strict line limit: < 200 lines. 100% theme tokenized.
 */

import { findAlgorithmById } from '@abdsynths/shared/components';
import type { McxHostBridge } from '../bridge/McxHostBridge';

export interface McxRackColumnOptions {
  bridge: McxHostBridge; setLcdLine2?: (text: string) => void;
  onOpenTopology?: () => void; onSlotsChanged?: (slots: UiRackSlot[]) => void;
  onSlotMoved?: (from: number, to: number) => void; onSlotRemoved?: (slot: number) => void;
  onOpenEffectDetail?: (slotIdx: number, algoId: string, customName: string, slot: UiRackSlot) => void;
}

export interface UiRackSlot {
  slot: number; engine: number; algoId: string; name: string;
  bypass: boolean; duck: boolean; p1: number; p2: number; mix?: number; presetIdx?: number; params?: Record<string, number>;
}

export class McxRackColumn {
  private el: HTMLElement; private opts: McxRackColumnOptions;
  private slots: UiRackSlot[] = []; private sendTargets: number[] = [0, 1, -1, -1];

  constructor(container: HTMLElement, opts: McxRackColumnOptions) {
    this.el = container; this.opts = opts;
    this.initDefaultSlots(); this.render();
  }

  private initDefaultSlots(): void {
    try {
      const s = localStorage.getItem('abdmcx_rack_slots_v1'), t = localStorage.getItem('abdmcx_rack_sends_v1');
      if (s) {
        this.slots = JSON.parse(s); if (t) this.sendTargets = JSON.parse(t);
        this.slots.forEach((st, i) => {
          if (st?.engine) {
            this.opts.bridge.setRackSlotEngine(i, st.engine, st.name);
            this.opts.bridge.setRackSlotParams(i, st.p1 ?? 0.5, st.p2 ?? 0.5, st.mix ?? 1.0);
            if (st.params) Object.entries(st.params).forEach(([k, v]) => this.opts.bridge.setRackSlotParamByKey(i, k, Number(v)));
          }
          if (st?.bypass) this.opts.bridge.setRackSlotBypass(i, true);
          if (st?.duck !== undefined) this.opts.bridge.setRackSlotDucking(i, Boolean(st.duck));
        });
        this.sendTargets.forEach((bay, b) => this.opts.bridge.setSendSlotTarget(b, bay));
        return;
      }
    } catch {}
    this.slots = Array.from({ length: 8 }, (_, i) => ({ slot: i, engine: 0, algoId: '', name: '', bypass: false, duck: false, p1: 0.5, p2: 0.5, mix: 1.0 }));
    this.slots[0] = { slot: 0, engine: 2, algoId: 'space_echo', name: 'RE-201 Lead Echo', bypass: false, duck: true, p1: 0.45, p2: 0.50, mix: 1.0 };
    this.slots[1] = { slot: 1, engine: 1, algoId: 'zita', name: 'Zita Hall Space', bypass: false, duck: true, p1: 0.60, p2: 0.40, mix: 1.0 };
  }

  getSlots(): UiRackSlot[] { return this.slots; }
  getSendTargets(): number[] { return [...this.sendTargets]; }
  setSendTarget(bus: number, slot: number): void { this.sendTargets[bus] = slot; this.syncSlotIndices(); }
  updateSlotState(slotIdx: number, patch: Partial<UiRackSlot>, rerender = false): void {
    const cur = this.slots[slotIdx]; if (!cur) return;
    this.slots[slotIdx] = { ...cur, ...patch, params: patch.params ? { ...(cur.params || {}), ...patch.params } : cur.params };
    this.syncSlotIndices(); if (rerender) this.renderSlots();
  }
  private syncSlotIndices(): void {
    this.slots.forEach((st, i) => { st.slot = i; });
    try { localStorage.setItem('abdmcx_rack_slots_v1', JSON.stringify(this.slots)); localStorage.setItem('abdmcx_rack_sends_v1', JSON.stringify(this.sendTargets)); } catch {}
    this.opts.onSlotsChanged?.(this.slots);
  }
  setSlotCustomName(slotIdx: number, name: string): void {
    if (this.slots[slotIdx]) { this.slots[slotIdx].name = name; this.syncSlotIndices(); this.renderSlots(); }
  }
  openSlotFaceplate(slotIdx: number): void {
    const s = this.slots[slotIdx]; if (s && s.engine !== 0) this.opts.onOpenEffectDetail?.(slotIdx, s.algoId, s.name, s);
  }

  render(): void {
    this.el.innerHTML = `
      <div class="mcx-rack-head">
        <span class="mcx-rack-title">ARMARIO RACK 19''</span>
        <button type="button" class="mcx-rack-topo-btn" id="mcx-rack-open-topo" title="Abrir matriz de topología">⤢ TOPOLOGÍA</button>
      </div>
      <div class="mcx-rack-patchbay-strip" id="mcx-rack-patchbay-strip" title="Abrir Matriz de Topología y Envíos">
        <span>PATCHBAY: 4 ENVÍOS (A..D)</span>
        <span style="color:var(--color-accent);font-weight:700;">ACTIVO</span>
      </div>
      <div class="mcx-rack-slots-container" id="mcx-rack-slots-mount"></div>
    `;
    const openPatch = () => this.opts.onOpenTopology?.();
    this.el.querySelector('#mcx-rack-open-topo')?.addEventListener('click', openPatch);
    this.el.querySelector('#mcx-rack-patchbay-strip')?.addEventListener('click', openPatch);
    this.renderSlots();
  }

  private renderSlots(): void {
    const mount = this.el.querySelector('#mcx-rack-slots-mount');
    if (!mount) return;
    mount.innerHTML = '';
    this.slots.forEach((s, idx) => {
      const card = document.createElement('div');
      card.className = `mcx-rack-slot-card${s.engine === 0 ? ' is-empty' : ''}`;
      card.dataset.slot = String(idx);
      if (s.engine === 0) {
        card.innerHTML = `<div class="mcx-rack-add-btn"><span>+</span> BAHÍA ${idx + 1}: AÑADIR EFECTO</div>`;
        card.addEventListener('click', () => this.showAddEffectMenu(idx));
      } else {
        const def = findAlgorithmById(s.algoId);
        card.style.background = `color-mix(in srgb, ${def.baseColor || 'transparent'} 35%, var(--color-panel-surface))`;
        card.style.borderLeft = `3px solid ${def.accentColor || 'var(--color-accent)'}`;
        card.innerHTML = this.buildOccupiedSlotHtml(s, def);
        this.bindSlotEvents(card, s, idx);
      }
      mount.appendChild(card);
    });
  }

  private buildOccupiedSlotHtml(s: UiRackSlot, def: ReturnType<typeof findAlgorithmById>): string {
    const iconHtml = def.image ? `<img src="${def.image}" class="mcx-rack-slot-thumb" alt="${def.badge || 'FX'}" />` : `<span class="mcx-rack-slot-badge">${def.badge || 'FX'}</span>`;
    return `
      <div class="mcx-rack-slot-row-head">
        <button type="button" class="mcx-rack-btn-mini btn-bypass" title="Bypass">${s.bypass ? '◯' : '●'}</button>
        ${iconHtml}
        <span class="mcx-rack-slot-name" title="Clic para editar y renombrar">${s.name || def.name}</span>
        <div class="mcx-rack-slot-actions">
          <button type="button" class="mcx-rack-btn-mini btn-up" title="Mover arriba">▲</button>
          <button type="button" class="mcx-rack-btn-mini btn-dn" title="Mover abajo">▼</button>
          <button type="button" class="mcx-rack-btn-mini btn-del" title="Desmontar">✕</button>
        </div>
      </div>
      <div class="mcx-rack-vu-row">
        <span class="mcx-rack-vu-label">IN</span>
        <div class="mcx-rack-vu-bar-wrap"><span class="mcx-rack-vu-fill in-fill"></span></div>
        <span class="mcx-rack-vu-clip in-clip"></span>
      </div>
      <div class="mcx-rack-vu-row">
        <span class="mcx-rack-vu-label">OUT</span>
        <div class="mcx-rack-vu-bar-wrap"><span class="mcx-rack-vu-fill out-fill"></span></div>
        <span class="mcx-rack-vu-clip out-clip"></span>
      </div>
    `;
  }

  private bindSlotEvents(card: HTMLElement, s: UiRackSlot, idx: number): void {
    card.querySelector('.btn-bypass')?.addEventListener('click', (e) => {
      e.stopPropagation(); s.bypass = !s.bypass;
      this.opts.bridge.setRackSlotBypass(idx, s.bypass); this.syncSlotIndices();
      this.opts.setLcdLine2?.(`SLOT ${idx + 1} ${s.name}: ${s.bypass ? 'BYPASS (0% CPU)' : 'ACTIVO'}`);
      this.renderSlots();
    });
    card.querySelector('.mcx-rack-slot-name')?.addEventListener('click', (e) => {
      e.stopPropagation(); this.opts.onOpenEffectDetail?.(idx, s.algoId, s.name, s);
    });
    card.querySelector('.btn-del')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.slots[idx] = { slot: idx, engine: 0, algoId: '', name: '', bypass: false, duck: false, p1: 0.5, p2: 0.5, mix: 1.0 };
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
    card.addEventListener('click', () => this.opts.onOpenEffectDetail?.(idx, s.algoId, s.name, s));
  }

  private showAddEffectMenu(slotIdx: number): void {
    const list = [
      { id: 'space_echo', eng: 2, name: 'Space Echo RE-201' }, { id: 'zita', eng: 1, name: 'Zita Reverb' },
      { id: 'bbd_chorus', eng: 3, name: 'Roland BBD Chorus' }, { id: 'stereo_delay', eng: 4, name: 'Stereo Delay' },
      { id: 'saturation', eng: 5, name: 'Tape Saturation' }, { id: 'flanger', eng: 6, name: 'Stereo Flanger' },
    ];
    const choice = window.prompt(`Selecciona efecto para Bahía ${slotIdx + 1}:\n` + list.map((item, i) => `${i + 1}: ${item.name}`).join('\n'), '1');
    if (choice) {
      const num = parseInt(choice, 10), chosen = list[num - 1] || list[0];
      this.slots[slotIdx] = { slot: slotIdx, engine: chosen.eng, algoId: chosen.id, name: chosen.name, bypass: false, duck: false, p1: 0.5, p2: 0.5 };
      this.opts.bridge.setRackSlotEngine(slotIdx, chosen.eng, chosen.name);
      this.opts.setLcdLine2?.(`MONTADO EN BAHÍA ${slotIdx + 1}: ${chosen.name}`);
      this.syncSlotIndices(); this.renderSlots();
    }
  }

  updateMeter(slotIdx: number, pIn: number, pOut: number, clipIn = false, clipOut = false): void {
    const card = this.el.querySelector(`.mcx-rack-slot-card[data-slot="${slotIdx}"]`);
    if (!card) return;
    const inFill = card.querySelector<HTMLElement>('.in-fill'), outFill = card.querySelector<HTMLElement>('.out-fill');
    if (inFill) inFill.style.width = `${Math.min(100, Math.round(pIn * 100))}%`;
    if (outFill) outFill.style.width = `${Math.min(100, Math.round(pOut * 100))}%`;
    card.querySelector('.in-clip')?.classList.toggle('is-active', clipIn);
    card.querySelector('.out-clip')?.classList.toggle('is-active', clipOut);
  }
}

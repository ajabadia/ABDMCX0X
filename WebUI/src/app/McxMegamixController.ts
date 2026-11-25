/**
 * ABDMCX0X -- McxMegamixController.ts
 * 8-slot bar-quantized .mcxprj live project transition controller (Megamix).
 * Strict line limit: < 155 lines. 0 #hex colors.
 */

import type { McxHostBridge } from '../bridge/McxHostBridge';
import type { McxAppState } from './McxAppState';
import { exportProjectJson, importProjectJson } from './McxProjectManager';

export interface MegamixSlot {
  index: number;
  name: string;
  projectJson: string;
  bpm: number;
}

export class McxMegamixController {
  public readonly slots: Array<MegamixSlot | null> = Array.from({ length: 8 }, () => null);
  public activeIndex = -1;
  public queuedIndex = -1;
  public quantizeBars: 1 | 2 | 4 = 1;
  public keepTempo = true;

  private readonly state: McxAppState;
  private readonly bridge: McxHostBridge;
  private readonly onChanged?: () => void;
  private lastTick = -1;
  private barCrossings = 0;

  constructor(state: McxAppState, bridge: McxHostBridge, onChanged?: () => void) {
    this.state = state;
    this.bridge = bridge;
    this.onChanged = onChanged;
  }

  public setQuantizeBars(bars: 1 | 2 | 4): void { this.quantizeBars = bars; this.onChanged?.(); }
  public setKeepTempo(lock: boolean): void { this.keepTempo = lock; this.onChanged?.(); }

  public captureCurrent(slotIdx: number, name?: string): boolean {
    if (slotIdx < 0 || slotIdx >= 8) return false;
    const label = (name || `Mix ${slotIdx + 1}`).trim();
    const json = exportProjectJson(this.state, label);
    this.slots[slotIdx] = { index: slotIdx, name: label, projectJson: json, bpm: this.state.globalSettings.standaloneBpm };
    this.activeIndex = slotIdx;
    this.state.setLcdLine2(`MEGAMIX M${slotIdx + 1} CAPTURED: ${label}`);
    this.onChanged?.();
    return true;
  }

  public loadProjectJson(slotIdx: number, name: string, rawJson: string): boolean {
    if (slotIdx < 0 || slotIdx >= 8) return false;
    try {
      const parsed = JSON.parse(rawJson);
      if (!parsed || !Array.isArray(parsed.parts)) return false;
      const cleanName = String(parsed.name || name || `Mix ${slotIdx + 1}`).trim();
      const bpm = typeof parsed.bpm === 'number' && Number.isFinite(parsed.bpm) ? parsed.bpm : 120;
      this.slots[slotIdx] = { index: slotIdx, name: cleanName, projectJson: rawJson, bpm };
      this.state.setLcdLine2(`MEGAMIX M${slotIdx + 1} READY: ${cleanName}`);
      this.onChanged?.();
      return true;
    } catch { return false; }
  }

  public clearSlot(slotIdx: number): void {
    if (slotIdx < 0 || slotIdx >= 8) return;
    this.slots[slotIdx] = null;
    if (this.activeIndex === slotIdx) this.activeIndex = -1;
    if (this.queuedIndex === slotIdx) this.queuedIndex = -1;
    this.onChanged?.();
  }

  public queueSlot(slotIdx: number, isPlaying: boolean): 'empty' | 'applied' | 'queued' | 'cancelled' {
    if (slotIdx < 0 || slotIdx >= 8 || !this.slots[slotIdx]) return 'empty';
    if (this.queuedIndex === slotIdx) {
      this.queuedIndex = -1;
      this.state.setLcdLine2(`MEGAMIX M${slotIdx + 1} CANCELLED`);
      this.onChanged?.();
      return 'cancelled';
    }
    if (!isPlaying) {
      this.applySlot(slotIdx);
      return 'applied';
    }
    this.queuedIndex = slotIdx;
    this.barCrossings = 0;
    this.state.setLcdLine2(`MEGAMIX QUEUED (${this.quantizeBars}B): M${slotIdx + 1} ${this.slots[slotIdx]!.name}`);
    this.onChanged?.();
    return 'queued';
  }

  public applySlot(slotIdx: number): boolean {
    const slot = this.slots[slotIdx];
    if (!slot) return false;
    const prevBpm = this.state.globalSettings.standaloneBpm;
    const ok = importProjectJson(this.state, this.bridge, slot.projectJson);
    if (!ok) return false;
    if (this.keepTempo && Math.abs(prevBpm - this.state.globalSettings.standaloneBpm) > 0.05) {
      this.state.globalSettings.standaloneBpm = prevBpm;
      this.bridge.setTempo(prevBpm);
      this.state.refs.masterPanel?.setBpm(prevBpm);
      this.state.updateLcdLine1(0);
    }
    this.activeIndex = slotIdx;
    this.queuedIndex = -1;
    this.barCrossings = 0;
    this.state.setLcdLine2(`MEGAMIX LIVE: M${slotIdx + 1} · ${slot.name}`);
    this.onChanged?.();
    return true;
  }

  public onTelemetryTick(tick: number, playing: boolean, ppq = 96): boolean {
    const barTicks = Math.max(1, 4 * ppq);
    const curBar = Math.floor(Math.max(0, tick) / barTicks);
    const prevBar = this.lastTick >= 0 ? Math.floor(this.lastTick / barTicks) : curBar;
    const wrapped = this.lastTick >= 0 && tick < this.lastTick && curBar === 0;
    this.lastTick = tick;
    if (!playing || this.queuedIndex < 0) return false;
    if (curBar !== prevBar || wrapped) {
      ++this.barCrossings;
      if (this.barCrossings >= this.quantizeBars) {
        return this.applySlot(this.queuedIndex);
      }
    }
    return false;
  }
}
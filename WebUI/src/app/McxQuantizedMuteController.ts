/**
 * ABDMCX0X -- McxQuantizedMuteController.ts
 * Coordinates Bar-Quantized Track & Bank Mutes with C++20 engine + browser fallback.
 * Strict line limit: < 160 lines.
 */

import type { McxTelemetry } from '../bridge/McxHostBridge';
import type { McxSongBridge } from '../bridge/McxSongBridge';
import type { McxBankLayoutData } from '../ui/McxBankLayout';
import type { McxPartUiState } from '../ui/McxPartState';

const STORAGE_KEY = 'abdmcx0x.muteQuantizeBar.v1';
const TICKS_PER_BAR = 384;

export interface QuantizedMuteDeps {
  songBridge: McxSongBridge;
  getBankLayout: () => McxBankLayoutData;
  getPartsState: () => McxPartUiState[];
  setBankMutedLocal: (bankIdx: number, muted: boolean) => void;
  setBankSoloedLocal: (bankIdx: number, soloed: boolean) => void;
  onImmediatePartMute: (partIdx: number) => void;
  onImmediateBankMute: (bankIdx: number) => void;
  onUiRefresh: (lcdMessage?: string) => void;
}

export class McxQuantizedMuteController {
  private readonly deps: QuantizedMuteDeps;
  private enabled = false;
  private seqPlaying = false;
  private lastSeqTick = -1;
  private lastMuteApplySeq = 0;
  private readonly queuedParts = new Set<number>();
  private readonly queuedBanks = new Set<number>();

  constructor(deps: QuantizedMuteDeps) {
    this.deps = deps;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === '1' || saved === 'true') this.enabled = true;
    } catch { /* ignore */ }
  }

  public isEnabled(): boolean { return this.enabled; }
  public getQueuedParts(): ReadonlySet<number> { return this.queuedParts; }
  public getQueuedBanks(): ReadonlySet<number> { return this.queuedBanks; }

  public syncHostQuantizeSetting(): void {
    this.deps.songBridge.setMuteQuantize(this.enabled);
  }

  public setEnabled(next: boolean): void {
    const val = Boolean(next);
    if (this.enabled === val) return;
    this.enabled = val;
    try { localStorage.setItem(STORAGE_KEY, val ? '1' : '0'); } catch { /* ignore */ }
    this.deps.songBridge.setMuteQuantize(val);
    if (!val && (this.queuedParts.size > 0 || this.queuedBanks.size > 0)) {
      this.flushLocalFallback();
    }
    this.deps.onUiRefresh(val ? 'MUTE QUANTIZE: BAR' : 'MUTE QUANTIZE: IMM');
  }

  public togglePartMute(partIdx: number, forceImmediate = false): boolean {
    if (!this.enabled || forceImmediate || !this.seqPlaying) return false;
    if (this.queuedParts.has(partIdx)) this.queuedParts.delete(partIdx);
    else this.queuedParts.add(partIdx);
    this.deps.songBridge.togglePartMuteQuantized(partIdx, false);
    const pending = this.queuedParts.has(partIdx);
    this.deps.onUiRefresh(`P${String(partIdx + 1).padStart(2, '0')} MUTE ${pending ? 'QUEUED @ BAR' : 'CANCELLED'}`);
    return true;
  }

  public toggleBankMute(bankIdx: number, forceImmediate = false): boolean {
    if (!this.enabled || forceImmediate || !this.seqPlaying) return false;
    if (this.queuedBanks.has(bankIdx)) this.queuedBanks.delete(bankIdx);
    else this.queuedBanks.add(bankIdx);
    this.deps.songBridge.toggleBankMuteQuantized(bankIdx, false);
    const letter = String.fromCharCode(65 + Math.max(0, Math.min(7, bankIdx)));
    const pending = this.queuedBanks.has(bankIdx);
    this.deps.onUiRefresh(`BANK ${letter} MUTE ${pending ? 'QUEUED @ BAR' : 'CANCELLED'}`);
    return true;
  }

  public onTelemetry(tel: McxTelemetry): void {
    const wasPlaying = this.seqPlaying;
    if (tel.seqPlaying !== undefined) this.seqPlaying = Boolean(tel.seqPlaying);
    if (wasPlaying && !this.seqPlaying && (this.queuedParts.size > 0 || this.queuedBanks.size > 0)) {
      this.queuedParts.clear();
      this.queuedBanks.clear();
      this.deps.onUiRefresh();
    }
    if (tel.muteApplySeq !== undefined && tel.muteApplySeq !== this.lastMuteApplySeq) {
      this.lastMuteApplySeq = tel.muteApplySeq;
      this.applyHostSnapshot(tel);
      return;
    }
    if (this.seqPlaying && tel.seqTick !== undefined && (this.queuedParts.size > 0 || this.queuedBanks.size > 0)) {
      const prevBar = this.lastSeqTick >= 0 ? Math.floor(this.lastSeqTick / TICKS_PER_BAR) : 0;
      const curBar = Math.floor(tel.seqTick / TICKS_PER_BAR);
      if (this.lastSeqTick >= 0 && (curBar !== prevBar || tel.seqTick < this.lastSeqTick)) {
        this.flushLocalFallback();
      }
    }
    if (tel.seqTick !== undefined) this.lastSeqTick = tel.seqTick;
  }

  private applyHostSnapshot(tel: McxTelemetry): void {
    const parts = this.deps.getPartsState();
    if (tel.appliedMuteMask64 && tel.appliedMuteMask64.length >= 4) {
      for (let p = 0; p < parts.length; ++p) {
        const w = tel.appliedMuteMask64[Math.floor(p / 16)] ?? 0;
        const muted = (w & (1 << (p % 16))) !== 0;
        parts[p].mute = muted;
        if (muted) parts[p].solo = false;
      }
    }
    if (tel.appliedBankMuteMask !== undefined) {
      for (let b = 0; b < 8; ++b) {
        const muted = (tel.appliedBankMuteMask & (1 << b)) !== 0;
        this.deps.setBankMutedLocal(b, muted);
        if (muted) this.deps.setBankSoloedLocal(b, false);
      }
    }
    this.queuedParts.clear();
    if (tel.queuedPartMuteMask64 && tel.queuedPartMuteMask64.length >= 4) {
      for (let p = 0; p < parts.length; ++p) {
        if (((tel.queuedPartMuteMask64[Math.floor(p / 16)] ?? 0) & (1 << (p % 16))) !== 0) {
          this.queuedParts.add(p);
        }
      }
    }
    this.queuedBanks.clear();
    if (tel.queuedBankMuteMask !== undefined) {
      for (let b = 0; b < 8; ++b) {
        if ((tel.queuedBankMuteMask & (1 << b)) !== 0) this.queuedBanks.add(b);
      }
    }
    this.deps.onUiRefresh();
  }

  private flushLocalFallback(): void {
    const parts = [...this.queuedParts];
    const banks = [...this.queuedBanks];
    this.queuedParts.clear();
    this.queuedBanks.clear();
    parts.forEach((p) => this.deps.onImmediatePartMute(p));
    banks.forEach((b) => this.deps.onImmediateBankMute(b));
    this.deps.onUiRefresh();
  }
}

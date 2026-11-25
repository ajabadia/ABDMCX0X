/**
 * ABDMCX0X -- McxQuantizedMuteController.test.ts
 * Vitest unit tests for Bar-Quantized Track & Bank Mute controller.
 * Strict line limit: < 140 lines.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultBankLayout, isBankMuted, setBankMuted, setBankSoloed } from '../ui/McxBankLayout';
import { createDefaultPartState } from '../ui/McxPartState';
import { McxQuantizedMuteController } from './McxQuantizedMuteController';

function createHarness() {
  const layout = createDefaultBankLayout();
  const parts = [createDefaultPartState(0), createDefaultPartState(1)];
  const songBridge = {
    setMuteQuantize: vi.fn(),
    togglePartMuteQuantized: vi.fn(),
    toggleBankMuteQuantized: vi.fn(),
  };
  const onImmediatePartMute = vi.fn((p: number) => { parts[p].mute = !parts[p].mute; });
  const onImmediateBankMute = vi.fn((b: number) => setBankMuted(layout, b, !isBankMuted(layout, b)));
  const onUiRefresh = vi.fn();

  const ctrl = new McxQuantizedMuteController({
    songBridge: songBridge as never,
    getBankLayout: () => layout,
    getPartsState: () => parts,
    setBankMutedLocal: (b, m) => setBankMuted(layout, b, m),
    setBankSoloedLocal: (b, s) => setBankSoloed(layout, b, s),
    onImmediatePartMute,
    onImmediateBankMute,
    onUiRefresh,
  });
  return { layout, parts, songBridge, onImmediatePartMute, onImmediateBankMute, onUiRefresh, ctrl };
}

describe('McxQuantizedMuteController', () => {
  beforeEach(() => { localStorage.clear(); });

  it('encola mute de pista y banco en reproducción, cancela en segundo clic y respeta Shift inmediato', () => {
    const { ctrl, songBridge } = createHarness();
    ctrl.setEnabled(true);
    expect(songBridge.setMuteQuantize).toHaveBeenCalledWith(true);

    // While stopped -> immediate (returns false so caller executes immediately)
    expect(ctrl.togglePartMute(0, false)).toBe(false);

    // While playing -> queues in controller and notifies C++
    ctrl.onTelemetry({ peakL: 0, peakR: 0, activeVoices: 0, seqPlaying: true, seqTick: 96 });
    expect(ctrl.togglePartMute(0, false)).toBe(true);
    expect(ctrl.getQueuedParts().has(0)).toBe(true);
    expect(songBridge.togglePartMuteQuantized).toHaveBeenCalledWith(0, false);

    // Double toggle cancels pending mute
    expect(ctrl.togglePartMute(0, false)).toBe(true);
    expect(ctrl.getQueuedParts().has(0)).toBe(false);

    // Shift+Click immediate override bypasses queue even when playing
    expect(ctrl.togglePartMute(1, true)).toBe(false);
    expect(ctrl.toggleBankMute(0, false)).toBe(true);
    expect(ctrl.getQueuedBanks().has(0)).toBe(true);
  });

  it('sincroniza muteApplySeq desde telemetría C++/WASM y aplica fallback al cruzar compás', () => {
    const { ctrl, parts, layout, onImmediatePartMute } = createHarness();
    ctrl.setEnabled(true);
    ctrl.onTelemetry({ peakL: 0, peakR: 0, activeVoices: 0, seqPlaying: true, seqTick: 120 });
    ctrl.togglePartMute(0, false);

    // Native/WASM reports bar-boundary application via muteApplySeq
    ctrl.onTelemetry({
      peakL: 0, peakR: 0, activeVoices: 0, seqPlaying: true, seqTick: 384,
      muteApplySeq: 1,
      appliedMuteMask64: [0x0001, 0, 0, 0],
      appliedBankMuteMask: 0x02,
      queuedBankMuteMask: 0,
      queuedPartMuteMask64: [0, 0, 0, 0],
    });
    expect(parts[0].mute).toBe(true);
    expect(isBankMuted(layout, 1)).toBe(true);
    expect(ctrl.getQueuedParts().size).toBe(0);

    // Fallback path when no muteApplySeq arrives across bar wrap
    ctrl.togglePartMute(1, false);
    ctrl.onTelemetry({ peakL: 0, peakR: 0, activeVoices: 0, seqPlaying: true, seqTick: 768 });
    expect(onImmediatePartMute).toHaveBeenCalledWith(1);
    expect(parts[1].mute).toBe(true);
  });
});

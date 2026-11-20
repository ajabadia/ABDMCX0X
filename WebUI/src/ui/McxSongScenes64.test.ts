/**
 * ABDMCX0X -- McxSongScenes64.test.ts
 * Vitest coverage for 64-bit Scene muteMask64 math, dynamic A..H x 8 Song Drawer matrix, and Live Bank Mute.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McxSceneSlotDto, McxSongScenesStateDto } from '../bridge/BridgeWasmTypes';
import { addBank, createDefaultBankLayout, deletePart, unpinBank } from './McxBankLayout';
import { McxBankRail } from './McxBankRail';
import { createDefaultPartState } from './McxPartState';
import { McxSongDrawer } from './McxSongDrawer';
import {
  buildSceneCardsHtml,
  buildSceneInspectorHtml,
  countLayoutMutes,
  ensureMuteMask64,
  isPartMutedInMask64,
  toggleBankMutedInMask64,
  togglePartMutedInMask64,
} from './McxSongDrawerViews';

describe('Phase 13C: 64-Part Song/Scenes Matrix & Live Bank Mute', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('toggles individual parts and banks across all 4x16-bit words (0..63) without 32-bit overflow', () => {
    const sc: McxSceneSlotDto = { index: 0, name: 'Test', muteMask: 0, transpose: 0 };
    const m64 = ensureMuteMask64(sc);
    expect(m64).toEqual([0, 0, 0, 0]);

    for (const pid of [0, 15, 16, 31, 32, 47, 48, 63]) {
      expect(togglePartMutedInMask64(sc, pid)).toBe(true);
      expect(isPartMutedInMask64(sc.muteMask64!, pid)).toBe(true);
    }
    expect(sc.muteMask64).toEqual([0x8001, 0x8001, 0x8001, 0x8001]);
    expect(sc.muteMask).toBe(0x8001);

    // Toggle Bank A partial -> mutes remaining A parts, toggle again -> unmutes Bank A cleanly
    const layout = createDefaultBankLayout();
    expect(toggleBankMutedInMask64(sc, layout, 0)).toBe(true);
    expect(sc.muteMask64![0]).toBe(0x80FF); // A1..A8 muted + B8 (bit 15) untouched
    expect(toggleBankMutedInMask64(sc, layout, 0)).toBe(false);
    expect(sc.muteMask64![0]).toBe(0x8000);
  });

  it('renders dynamic A..H bank rows, empty slot placeholders, and unique accessible bank labels', () => {
    const layout = createDefaultBankLayout();
    addBank(layout); // C = [16..23]
    unpinBank(layout, 0);
    deletePart(layout, 0, 1); // empty A2 slot

    const sc: McxSceneSlotDto = { index: 0, name: 'Live', muteMask: 0, muteMask64: [0, 0, 0, 0], transpose: 0 };
    togglePartMutedInMask64(sc, 20); // C5 (partId = 20)
    const state: McxSongScenesStateDto = {
      songMode: false, songLoop: true, activeScene: 0, queuedScene: -1, songBlockIdx: 0, songBarInBlock: 0,
      scenes: [sc], blocks: [{ sceneIndex: 0, bars: 4, transposeOffset: 0 }],
    };

    const cardsHtml = buildSceneCardsHtml(state, 0, layout);
    expect(cardsHtml).toContain('22/23');

    const inspWrap = document.createElement('div');
    inspWrap.innerHTML = buildSceneInspectorHtml(sc, 0, layout, Array.from({ length: 64 }, (_, i) => createDefaultPartState(i)));
    expect(inspWrap.querySelectorAll('.mcx-sc-bank-row')).toHaveLength(3);
    expect(inspWrap.querySelectorAll('.mcx-sc-mute-empty')).toHaveLength(1);
    expect(inspWrap.querySelector('[data-sc-part-mute="20"]')?.classList.contains('is-muted')).toBe(true);

    const bankBtns = inspWrap.querySelectorAll<HTMLButtonElement>('[data-sc-bank-mute]');
    const labels = Array.from(bankBtns).map((b) => b.getAttribute('aria-label'));
    expect(new Set(labels).size).toBe(3);
  });

  it('commits lossless muteMask64 from McxSongDrawer and keeps Live Bank Mute independent in McxBankRail', () => {
    const layout = createDefaultBankLayout();
    addBank(layout); // A, B, C (active = C)
    const parts = Array.from({ length: 64 }, (_, i) => createDefaultPartState(i));
    const songState: McxSongScenesStateDto = {
      songMode: false, songLoop: true, activeScene: 0, queuedScene: -1, songBlockIdx: 0, songBarInBlock: 0,
      scenes: Array.from({ length: 8 }, (_, index) => ({ index, name: `S${index + 1}`, muteMask: 0, muteMask64: [0, 0, 0, 0], transpose: 0 })),
      blocks: [{ sceneIndex: 0, bars: 4, transposeOffset: 0 }],
    };

    const updateScene = vi.fn();
    const songBridge = {
      updateScene, requestState: vi.fn(), setSongMode: vi.fn(), setSongLoop: vi.fn(),
      setSongArrangement: vi.fn(), triggerScene: vi.fn(), captureScene: vi.fn(), jumpSongBlock: vi.fn(),
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const drawer = new McxSongDrawer({
      hostEl: host, songBridge: songBridge as never,
      getState: () => songState, getBankLayout: () => layout, getPartsState: () => parts,
      onStateMutated: vi.fn(),
    });
    drawer.open(0);

    // Toggle C5 (partId = 20 -> word 1 bit 4 = 16)
    host.querySelector<HTMLButtonElement>('[data-sc-part-mute="20"]')?.click();
    expect(updateScene).toHaveBeenLastCalledWith(0, 0, 0, 'S1', [0, 16, 0, 0]);

    // Mute entire Bank C (parts 16..23 -> word 1 low byte = 255)
    host.querySelector<HTMLButtonElement>('[data-sc-bank-mute="2"]')?.click();
    expect(updateScene).toHaveBeenLastCalledWith(0, 0, 0, 'S1', [0, 255, 0, 0]);

    // 3-Mode Bank Rail (EDIT / M / S) triggers mute/solo without per-bank M button or switching active bank
    const railHost = document.createElement('div');
    const onSelectBank = vi.fn();
    const onToggleMuteBank = vi.fn();
    const onToggleSoloBank = vi.fn();
    const onClearAllSolos = vi.fn();
    const onClearAllBankMutes = vi.fn();
    const onRequestRenameBank = vi.fn();
    const rail = new McxBankRail(railHost, {
      onSelectBank,
      onAddBank: vi.fn(),
      onDropPartOnBank: vi.fn(),
      onToggleMuteBank,
      onToggleSoloBank,
      onClearAllSolos,
      onClearAllBankMutes,
      onRequestRenameBank,
    });
    rail.render(layout, parts);
    expect(railHost.querySelectorAll('button button')).toHaveLength(0);
    expect(railHost.querySelectorAll('[data-bank-mute]')).toHaveLength(0);
    expect(railHost.querySelector('[role="toolbar"]')?.getAttribute('focusgroup')).toBe('toolbar wrap');
    expect(Array.from(railHost.querySelectorAll('[data-bank-mode]')).map((b) => b.textContent?.trim())).toEqual([
      'EDIT', 'MUTE', 'SOLO',
    ]);
    expect(railHost.querySelector('[data-bank-mode="edit"]')?.getAttribute('aria-pressed')).toBe('true');

    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="mute"]')?.click();
    expect(railHost.querySelector('[data-bank-mode="mute"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(railHost.querySelector('[data-bank-add]')).toBeNull();
    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="0"]')?.click();
    expect(onToggleMuteBank).toHaveBeenCalledWith(0);
    expect(onSelectBank).not.toHaveBeenCalled();
    // 2nd click on MUTE clears group mutes and returns to EDIT
    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="mute"]')?.click();
    expect(onClearAllBankMutes).toHaveBeenCalledTimes(1);
    expect(rail.getMode()).toBe('edit');

    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="solo"]')?.click();
    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="1"]')?.click();
    expect(onToggleSoloBank).toHaveBeenCalledWith(1);
    expect(onSelectBank).not.toHaveBeenCalled();
    // 2nd click on SOLO clears all solos and returns to EDIT
    railHost.querySelector<HTMLButtonElement>('[data-bank-mode="solo"]')?.click();
    expect(onClearAllSolos).toHaveBeenCalledTimes(1);
    expect(rail.getMode()).toBe('edit');

    // Double-click in EDIT mode requests rename modal for that bank without nested interactive controls
    railHost.querySelector<HTMLButtonElement>('[data-bank-idx="0"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(railHost.querySelectorAll('button input, button button')).toHaveLength(0);
    expect(onRequestRenameBank).toHaveBeenCalledWith(0);

    const { total, muted } = countLayoutMutes(songState.scenes[0], layout);
    expect(total).toBe(24);
    expect(muted).toBe(8);
  });
});

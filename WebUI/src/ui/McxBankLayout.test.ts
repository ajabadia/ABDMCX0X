import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_CATALOG } from './McxEngineCatalogDefaults';
import { buildRouteModalHtml } from './McxInstrumentRouteModalView';
import { createDefaultPartState } from './McxPartState';
import {
  addBank,
  addPartInFirstFreeSlot,
  createDefaultBankLayout,
  defaultChannelForSlot,
  deletePart,
  deserializeBankLayoutJson,
  formatSlotLabel,
  getFirstFreeSlot,
  getTopStripPair,
  MAX_BANKS,
  movePart,
  movePartToBank,
  serializeBankLayoutJson,
  togglePin,
  unpinBank,
} from './McxBankLayout';

describe('McxBankLayout 8x8 engine', () => {
  it('initializes banks A and B with 16 pinned parts and roundtrips JSON with 64-bit pin mask', () => {
    const layout = createDefaultBankLayout();
    expect(layout.bankCount).toBe(2);
    expect(layout.activeBank).toBe(0);
    expect(layout.banks[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(layout.banks[1]).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(layout.pinnedParts.size).toBe(16);

    togglePin(layout, 25);
    expect(layout.pinnedParts.has(25)).toBe(true);
    const json = serializeBankLayoutJson(layout);
    const restored = deserializeBankLayoutJson(json);
    expect(restored.bankCount).toBe(2);
    expect(restored.banks[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(restored.pinnedParts.has(0)).toBe(true);
    expect(restored.pinnedParts.has(15)).toBe(true);
    expect(restored.pinnedParts.has(25)).toBe(true);
  });

  it('pairs the 16 top hardware buttons so last active bank stays on the right', () => {
    expect(getTopStripPair(0, 1)).toEqual({ leftBank: 0, rightBank: null });
    expect(getTopStripPair(0, 2)).toEqual({ leftBank: 0, rightBank: 1 });
    expect(getTopStripPair(1, 2)).toEqual({ leftBank: 0, rightBank: 1 });
    expect(getTopStripPair(2, 3)).toEqual({ leftBank: 1, rightBank: 2 });
    expect(getTopStripPair(2, 4)).toEqual({ leftBank: 2, rightBank: 3 });
    expect(getTopStripPair(4, 5)).toEqual({ leftBank: 3, rightBank: 4 });
    expect(getTopStripPair(6, 7)).toEqual({ leftBank: 5, rightBank: 6 });
    expect(getTopStripPair(7, 8)).toEqual({ leftBank: 6, rightBank: 7 });
  });

  it('adds banks up to 8 with alternating CH 1..8 / 9..16 defaults and rejects bank 9', () => {
    const layout = createDefaultBankLayout();
    for (let b = 2; b < MAX_BANKS; ++b) {
      const res = addBank(layout);
      expect(res.ok).toBe(true);
      expect(res.bankIdx).toBe(b);
      expect(res.allocated).toHaveLength(8);
      const expectedFirstCh = b % 2 === 0 ? 1 : 9;
      expect(defaultChannelForSlot(b, 0)).toBe(expectedFirstCh);
      expect(res.allocated[0].defaultChannel).toBe(expectedFirstCh);
      expect(layout.pinnedParts.has(res.allocated[0].partId)).toBe(false);
    }
    expect(layout.bankCount).toBe(8);
    expect(addBank(layout).ok).toBe(false);
  });

  it('respects pins on delete, leaves empty slot, adds only at first free slot, and compacts empty banks', () => {
    const layout = createDefaultBankLayout();
    addBank(layout); // bank C = [16..23] unpinned
    expect(formatSlotLabel(2, 0)).toBe('C1');

    // Refuses deleting pinned A2 unless forceUnpin is set
    const pinnedRes = deletePart(layout, 0, 1);
    expect(pinnedRes.ok).toBe(false);
    expect(pinnedRes.reason).toBe('pinned');

    // Force-unpin & delete A2 leaves slot 1 free without shifting A3..A8
    const forcedRes = deletePart(layout, 0, 1, { forceUnpin: true });
    expect(forcedRes.ok).toBe(true);
    expect(layout.banks[0][1]).toBeNull();
    expect(layout.banks[0][2]).toBe(2);
    expect(getFirstFreeSlot(layout, 0)).toBe(1);

    // Deleting A5 later still keeps first free slot at A2 (index 1)
    deletePart(layout, 0, 4, { forceUnpin: true });
    expect(getFirstFreeSlot(layout, 0)).toBe(1);

    // Adding part places cleanly in index 1 (first free slot)
    const addRes = addPartInFirstFreeSlot(layout, 0);
    expect(addRes.ok).toBe(true);
    expect(addRes.slotIdx).toBe(1);
    expect(getFirstFreeSlot(layout, 0)).toBe(4);

    // Delete all 8 parts in Bank B (middle bank) -> compacts Bank C down to B preserving partIds 16..23
    unpinBank(layout, 1);
    for (let s = 0; s < 8; ++s) deletePart(layout, 1, s);
    expect(layout.bankCount).toBe(2);
    expect(layout.banks[1]).toEqual([16, 17, 18, 19, 20, 21, 22, 23]);
  });

  it('reorders within a bank skipping pinned parts, cascades cross-bank, and auto-creates overflow bank', () => {
    const layout = createDefaultBankLayout();
    unpinBank(layout, 0);
    unpinBank(layout, 1);

    // Pin A3 (part 2) and move A1 (part 0) onto A5 (part 4) -> A3 must stay anchored
    togglePin(layout, 2);
    const sameRes = movePart(layout, 0, 0, 0, 4);
    expect(sameRes.ok).toBe(true);
    expect(layout.banks[0][2]).toBe(2);
    expect(layout.banks[0][4]).toBe(0);
    expect(layout.banks[0][0]).toBe(1);

    // Pin B3 (part 10) and drag A1 (now part 1) onto B1 (part 8) -> cascades skipping B3, overflows into C1!
    togglePin(layout, 10);
    const crossRes = movePart(layout, 0, 0, 1, 0);
    expect(crossRes.ok).toBe(true);
    expect(crossRes.createdBankIdx).toBe(2);
    expect(layout.bankCount).toBe(3);
    expect(layout.banks[1][0]).toBe(1);
    expect(layout.banks[1][2]).toBe(10); // pinned part untouched!
    expect(layout.banks[2][0]).toBe(15); // displaced B8 spilled to C1
  });

  it('aborts atomically on overflow_blocked and supports dropping onto + new bank', () => {
    const layout = createDefaultBankLayout();
    while (layout.bankCount < MAX_BANKS) addBank(layout);
    // Unpin A1 and last slot H8, pin every other part in B..H except B1 -> B..H full/pinned blocks overflow beyond H
    unpinBank(layout, 0);
    unpinBank(layout, 1);
    togglePin(layout, 1); // pin A2..
    // Pin all of B..H
    for (let b = 1; b < MAX_BANKS; ++b) {
      for (let s = 0; s < 8; ++s) {
        const pid = layout.banks[b][s];
        if (pid !== null && !(b === 1 && s === 0)) layout.pinnedParts.add(pid);
      }
    }
    const snapshot = JSON.stringify(layout.banks);
    const blocked = movePart(layout, 0, 0, 1, 0);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe('overflow_blocked');
    expect(JSON.stringify(layout.banks)).toBe(snapshot);

    // Reset to 2 banks and test dropping unpinned B8 onto + (new bank index 2)
    const fresh = createDefaultBankLayout();
    unpinBank(fresh, 1);
    const plusRes = movePartToBank(fresh, 1, 7, 2);
    expect(plusRes.ok).toBe(true);
    expect(fresh.bankCount).toBe(3);
    expect(fresh.banks[2][0]).toBe(15);
    expect(fresh.banks[1][7]).toBeNull();
  });

  it('renders only real OS MIDI ports across INT, EXT, and A+B modes with zero fake ports', () => {
    const ps = createDefaultPartState(0);
    const emptyDevices = { isStandalone: true, inputs: [], outputs: [] };

    // INT mode shows MIDI In & Channel without fake outputs
    ps.routeMode = 0;
    const htmlInt = buildRouteModalHtml(0, ps, DEFAULT_ENGINE_CATALOG, [], emptyDevices);
    expect(htmlInt).toContain('id="mcx-route-in-port"');
    expect(htmlInt).toContain('id="mcx-route-ch"');
    expect(htmlInt).not.toContain('id="mcx-route-port"');
    expect(htmlInt).not.toMatch(/Puerto 2|Port 2|Puerto 8|Port 8/);

    // EXT & A+B modes render exact real OS device names without invented ports
    const realDevices = {
      isStandalone: true,
      inputs: [{ portIndex: 1, id: 'in-um1', name: 'Roland UM-ONE IN', enabled: true }],
      outputs: [{ portIndex: 1, id: 'out-p6', name: 'Sequential Prophet-6', enabled: true }],
    };
    ps.routeMode = 1;
    ps.midiInPortIndex = 1;
    ps.midiPortIndex = 1;
    const htmlExt = buildRouteModalHtml(0, ps, DEFAULT_ENGINE_CATALOG, [], realDevices);
    expect(htmlExt).toContain('Roland UM-ONE IN');
    expect(htmlExt).toContain('Sequential Prophet-6');
    expect(htmlExt).not.toContain('Puerto 2');

    ps.routeMode = 2;
    const htmlDual = buildRouteModalHtml(0, ps, DEFAULT_ENGINE_CATALOG, [], realDevices);
    expect(htmlDual).toContain('id="mcx-route-in-port"');
    expect(htmlDual).toContain('id="mcx-route-port"');
    expect(htmlDual).toContain('Sequential Prophet-6');
  });
});

/**
 * ABDMCX0X -- McxBankLayout.ts
 * Pure 8x8 visual bank layout engine (stable DSP partId 0..63, pins, cascade, compaction, JSON codec).
 */

export const MAX_BANKS = 8;
export const SLOTS_PER_BANK = 8;
export const MAX_PARTS = 64;
export const MAX_BANK_NAME_LEN = 20;
export const BANK_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const BANK_COLOR_VARS = [
  'var(--color-bank-a)', 'var(--color-bank-b)', 'var(--color-bank-c)', 'var(--color-bank-d)',
  'var(--color-bank-e)', 'var(--color-bank-f)', 'var(--color-bank-g)', 'var(--color-bank-h)',
] as const;

export interface McxBankLayoutData {
  bankCount: number;
  activeBank: number;
  banks: Array<Array<number | null>>;
  pinnedParts: Set<number>;
  bankMuteMask: number;
  bankSoloMask: number;
  bankNames: string[];
}

export interface PartLocation { bankIdx: number; slotIdx: number; }
export interface MovePartResult {
  ok: boolean;
  reason?: 'invalid' | 'empty' | 'same' | 'source_pinned' | 'target_pinned' | 'overflow_blocked' | 'max_banks';
  destBank?: number;
  destSlot?: number;
  removedEmptyBank?: boolean;
  createdBankIdx?: number | null;
}

const emptyRow = (): Array<number | null> => Array<number | null>(SLOTS_PER_BANK).fill(null);
const emptyBankNames = (): string[] => Array<string>(MAX_BANKS).fill('');
const isRowEmpty = (row: Array<number | null>): boolean => row.every((cell) => cell === null);
const cloneBanks = (banks: Array<Array<number | null>>): Array<Array<number | null>> => banks.map((r) => [...r]);

export function sanitizeBankName(raw: string): string {
  return String(raw ?? '').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, MAX_BANK_NAME_LEN).trim();
}

export function getBankName(layout: McxBankLayoutData, bankIdx: number): string {
  if (bankIdx < 0 || bankIdx >= MAX_BANKS) return '';
  return sanitizeBankName(layout.bankNames?.[bankIdx] ?? '');
}

export function setBankName(layout: McxBankLayoutData, bankIdx: number, rawName: string): string {
  if (bankIdx < 0 || bankIdx >= MAX_BANKS) return '';
  if (!Array.isArray(layout.bankNames) || layout.bankNames.length < MAX_BANKS) {
    const next = emptyBankNames();
    (layout.bankNames ?? []).forEach((v, i) => { if (i < MAX_BANKS) next[i] = v; });
    layout.bankNames = next;
  }
  const clean = sanitizeBankName(rawName);
  layout.bankNames[bankIdx] = clean;
  return clean;
}

export function formatBankDisplayName(layout: McxBankLayoutData, bankIdx: number, bankLabel: string): string {
  const base = `${bankLabel} ${BANK_LETTERS[bankIdx] ?? '?'}`;
  const custom = getBankName(layout, bankIdx);
  return custom ? `${base} · ${custom}` : base;
}

export function removeBankBit(mask: number, removedBankIdx: number): number {
  const lowMask = (1 << removedBankIdx) - 1;
  const highBits = (mask >>> (removedBankIdx + 1)) << removedBankIdx;
  return ((mask & lowMask) | highBits) & 0xFF;
}

function compactRemovedBankMeta(layout: McxBankLayoutData, bankIdx: number): void {
  if (!Array.isArray(layout.bankNames)) layout.bankNames = emptyBankNames();
  layout.bankNames.splice(bankIdx, 1);
  while (layout.bankNames.length < MAX_BANKS) layout.bankNames.push('');
  layout.bankNames.length = MAX_BANKS;
  layout.bankMuteMask = removeBankBit(layout.bankMuteMask ?? 0, bankIdx);
  layout.bankSoloMask = removeBankBit(layout.bankSoloMask ?? 0, bankIdx);
}

export function isBankMuted(layout: McxBankLayoutData, bankIdx: number): boolean {
  if (bankIdx < 0 || bankIdx >= MAX_BANKS) return false;
  return ((layout.bankMuteMask ?? 0) & (1 << bankIdx)) !== 0;
}

export function setBankMuted(layout: McxBankLayoutData, bankIdx: number, muted: boolean): void {
  if (bankIdx < 0 || bankIdx >= MAX_BANKS) return;
  const bit = 1 << bankIdx;
  layout.bankMuteMask = muted ? ((layout.bankMuteMask ?? 0) | bit) & 0xFF : ((layout.bankMuteMask ?? 0) & ~bit) & 0xFF;
}

export function isBankSoloed(layout: McxBankLayoutData, bankIdx: number): boolean {
  if (bankIdx < 0 || bankIdx >= MAX_BANKS) return false;
  return ((layout.bankSoloMask ?? 0) & (1 << bankIdx)) !== 0;
}

export function setBankSoloed(layout: McxBankLayoutData, bankIdx: number, soloed: boolean): void {
  if (bankIdx < 0 || bankIdx >= MAX_BANKS) return;
  const bit = 1 << bankIdx;
  layout.bankSoloMask = soloed ? ((layout.bankSoloMask ?? 0) | bit) & 0xFF : ((layout.bankSoloMask ?? 0) & ~bit) & 0xFF;
}

export function hasAnyBankSoloed(layout: McxBankLayoutData): boolean {
  for (let b = 0; b < layout.bankCount; ++b) {
    if (isBankSoloed(layout, b) && countOccupiedInBank(layout, b) > 0) return true;
  }
  return false;
}

export function createDefaultBankLayout(): McxBankLayoutData {
  const banks = Array.from({ length: MAX_BANKS }, () => emptyRow());
  for (let s = 0; s < SLOTS_PER_BANK; ++s) {
    banks[0][s] = s;
    banks[1][s] = 8 + s;
  }
  const pinnedParts = new Set<number>();
  for (let i = 0; i < 16; ++i) pinnedParts.add(i);
  return { bankCount: 2, activeBank: 0, banks, pinnedParts, bankMuteMask: 0, bankSoloMask: 0, bankNames: emptyBankNames() };
}

export function createSinglePartBankLayout(): McxBankLayoutData {
  const banks = Array.from({ length: MAX_BANKS }, () => emptyRow());
  banks[0][0] = 0;
  const pinnedParts = new Set<number>();
  pinnedParts.add(0);
  return { bankCount: 1, activeBank: 0, banks, pinnedParts, bankMuteMask: 0, bankSoloMask: 0, bankNames: emptyBankNames() };
}

export function formatSlotLabel(bankIdx: number, slotIdx: number): string {
  return `${BANK_LETTERS[bankIdx] ?? '?'}${slotIdx + 1}`;
}

export function defaultChannelForSlot(bankIdx: number, slotIdx: number): number {
  return (bankIdx % 2 === 0) ? (slotIdx + 1) : (slotIdx + 9);
}

export function findPartLocation(layout: McxBankLayoutData, partId: number): PartLocation | null {
  for (let b = 0; b < layout.bankCount; ++b) {
    for (let s = 0; s < SLOTS_PER_BANK; ++s) {
      if (layout.banks[b][s] === partId) return { bankIdx: b, slotIdx: s };
    }
  }
  return null;
}

export function countOccupiedInBank(layout: McxBankLayoutData, bankIdx: number): number {
  const row = layout.banks[bankIdx];
  return row ? row.reduce<number>((acc, cell) => acc + (cell !== null ? 1 : 0), 0) : 0;
}

export function countTotalOccupied(layout: McxBankLayoutData): number {
  let total = 0;
  for (let b = 0; b < layout.bankCount; ++b) total += countOccupiedInBank(layout, b);
  return total;
}

export function getFirstFreeSlot(layout: McxBankLayoutData, bankIdx: number): number {
  const row = layout.banks[bankIdx];
  return row ? row.findIndex((cell) => cell === null) : -1;
}

export function hasPinnedInBank(layout: McxBankLayoutData, bankIdx: number): boolean {
  const row = layout.banks[bankIdx];
  return row ? row.some((pid) => pid !== null && layout.pinnedParts.has(pid)) : false;
}

export function allocateFreePartId(layout: McxBankLayoutData): number | null {
  const used = new Set<number>();
  for (let b = 0; b < layout.bankCount; ++b) {
    for (let s = 0; s < SLOTS_PER_BANK; ++s) {
      const pid = layout.banks[b][s];
      if (pid !== null) used.add(pid);
    }
  }
  for (let id = 0; id < MAX_PARTS; ++id) {
    if (!used.has(id)) return id;
  }
  return null;
}

export function getTopStripPair(activeBank: number, bankCount: number): { leftBank: number; rightBank: number | null } {
  const count = Math.max(1, Math.min(MAX_BANKS, bankCount));
  const act = Math.max(0, Math.min(count - 1, activeBank));
  if (count <= 1) return { leftBank: 0, rightBank: null };
  const pairBase = act - (act % 2);
  if (pairBase + 1 < count) return { leftBank: pairBase, rightBank: pairBase + 1 };
  return { leftBank: act - 1, rightBank: act };
}

export function serializeBankLayoutJson(layout: McxBankLayoutData): string {
  const bankCount = Math.max(1, Math.min(MAX_BANKS, layout.bankCount));
  const activeBank = Math.max(0, Math.min(bankCount - 1, layout.activeBank));
  const banks = Array.from({ length: bankCount }, (_, b) =>
    Array.from({ length: SLOTS_PER_BANK }, (_, s) => layout.banks[b]?.[s] ?? -1),
  );
  const words = [0, 0, 0, 0];
  layout.pinnedParts.forEach((pid) => {
    if (pid >= 0 && pid < MAX_PARTS) words[Math.floor(pid / 16)] |= (1 << (pid % 16));
  });
  const bankMuteMask = (layout.bankMuteMask ?? 0) & 0xFF;
  const bankSoloMask = (layout.bankSoloMask ?? 0) & 0xFF;
  const bankNames = Array.from({ length: bankCount }, (_, b) => sanitizeBankName(layout.bankNames?.[b] ?? ''));
  return JSON.stringify({ bankCount, activeBank, banks, pinnedMask64: words, bankMuteMask, bankSoloMask, bankNames });
}

export function deserializeBankLayoutJson(jsonText: string | undefined): McxBankLayoutData {
  if (!jsonText) return createDefaultBankLayout();
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || !Array.isArray(parsed.banks) || parsed.banks.length === 0) return createDefaultBankLayout();
    const bankCount = Math.max(1, Math.min(MAX_BANKS, Number(parsed.bankCount ?? parsed.banks.length) || parsed.banks.length));
    const banks = Array.from({ length: MAX_BANKS }, () => emptyRow());
    const seen = new Set<number>();
    for (let b = 0; b < Math.min(bankCount, parsed.banks.length); ++b) {
      const srcRow = parsed.banks[b];
      if (!Array.isArray(srcRow)) continue;
      for (let s = 0; s < Math.min(SLOTS_PER_BANK, srcRow.length); ++s) {
        const pid = Number(srcRow[s]);
        if (Number.isInteger(pid) && pid >= 0 && pid < MAX_PARTS && !seen.has(pid)) {
          seen.add(pid);
          banks[b][s] = pid;
        }
      }
    }
    const pinnedParts = new Set<number>();
    if (Array.isArray(parsed.pinnedMask64)) {
      for (let w = 0; w < Math.min(4, parsed.pinnedMask64.length); ++w) {
        const word = Number(parsed.pinnedMask64[w] ?? 0) & 0xFFFF;
        for (let bit = 0; bit < 16; ++bit) {
          if ((word & (1 << bit)) !== 0) pinnedParts.add(w * 16 + bit);
        }
      }
    } else {
      for (let i = 0; i < 16; ++i) pinnedParts.add(i);
    }
    const bankMuteMask = Math.max(0, Math.min(255, Number(parsed.bankMuteMask ?? 0) || 0)) & 0xFF;
    const bankSoloMask = Math.max(0, Math.min(255, Number(parsed.bankSoloMask ?? 0) || 0)) & 0xFF;
    const bankNames = emptyBankNames();
    if (Array.isArray(parsed.bankNames)) {
      for (let b = 0; b < Math.min(MAX_BANKS, parsed.bankNames.length); ++b) {
        bankNames[b] = sanitizeBankName(String(parsed.bankNames[b] ?? ''));
      }
    }
    return {
      bankCount,
      activeBank: Math.max(0, Math.min(bankCount - 1, Number(parsed.activeBank ?? 0) || 0)),
      banks,
      pinnedParts,
      bankMuteMask,
      bankSoloMask,
      bankNames,
    };
  } catch {
    return createDefaultBankLayout();
  }
}

export function addBank(layout: McxBankLayoutData): { ok: boolean; reason?: 'max_banks' | 'max_parts'; bankIdx?: number; allocated: Array<{ partId: number; slotIdx: number; defaultChannel: number }> } {
  if (layout.bankCount >= MAX_BANKS) return { ok: false, reason: 'max_banks', allocated: [] };
  const newBankIdx = layout.bankCount;
  const allocated: Array<{ partId: number; slotIdx: number; defaultChannel: number }> = [];
  layout.bankCount += 1;
  layout.banks[newBankIdx] = emptyRow();
  setBankName(layout, newBankIdx, '');
  setBankMuted(layout, newBankIdx, false);
  setBankSoloed(layout, newBankIdx, false);
  for (let s = 0; s < SLOTS_PER_BANK; ++s) {
    const pid = allocateFreePartId(layout);
    if (pid === null) break;
    layout.banks[newBankIdx][s] = pid;
    layout.pinnedParts.delete(pid);
    allocated.push({ partId: pid, slotIdx: s, defaultChannel: defaultChannelForSlot(newBankIdx, s) });
  }
  if (allocated.length === 0) {
    layout.bankCount -= 1;
    return { ok: false, reason: 'max_parts', allocated: [] };
  }
  layout.activeBank = newBankIdx;
  return { ok: true, bankIdx: newBankIdx, allocated };
}

export function addPartInFirstFreeSlot(layout: McxBankLayoutData, bankIdx: number): { ok: boolean; reason?: 'bank_full' | 'max_parts'; partId?: number; slotIdx?: number; defaultChannel?: number } {
  const slotIdx = getFirstFreeSlot(layout, bankIdx);
  if (slotIdx < 0) return { ok: false, reason: 'bank_full' };
  const partId = allocateFreePartId(layout);
  if (partId === null) return { ok: false, reason: 'max_parts' };
  layout.banks[bankIdx][slotIdx] = partId;
  layout.pinnedParts.delete(partId);
  return { ok: true, partId, slotIdx, defaultChannel: defaultChannelForSlot(bankIdx, slotIdx) };
}

export function deletePart(layout: McxBankLayoutData, bankIdx: number, slotIdx: number, opts?: { forceUnpin?: boolean }): { ok: boolean; reason?: 'empty' | 'last_part' | 'pinned'; partId?: number; removedBank?: boolean } {
  const pid = layout.banks[bankIdx]?.[slotIdx] ?? null;
  if (pid === null) return { ok: false, reason: 'empty' };
  if (countTotalOccupied(layout) <= 1) return { ok: false, reason: 'last_part', partId: pid };
  if (layout.pinnedParts.has(pid) && !opts?.forceUnpin) return { ok: false, reason: 'pinned', partId: pid };

  layout.pinnedParts.delete(pid);
  layout.banks[bankIdx][slotIdx] = null;
  let removedBank = false;
  if (layout.bankCount > 1 && isRowEmpty(layout.banks[bankIdx])) {
    layout.banks.splice(bankIdx, 1);
    layout.banks.push(emptyRow());
    layout.bankCount -= 1;
    compactRemovedBankMeta(layout, bankIdx);
    if (layout.activeBank > bankIdx) layout.activeBank -= 1;
    if (layout.activeBank >= layout.bankCount) layout.activeBank = layout.bankCount - 1;
    removedBank = true;
  }
  return { ok: true, partId: pid, removedBank };
}

export function togglePin(layout: McxBankLayoutData, partId: number): boolean {
  if (layout.pinnedParts.has(partId)) { layout.pinnedParts.delete(partId); return false; }
  layout.pinnedParts.add(partId);
  return true;
}

export function unpinBank(layout: McxBankLayoutData, bankIdx: number): number {
  const row = layout.banks[bankIdx];
  if (!row) return 0;
  let count = 0;
  for (const pid of row) {
    if (pid !== null && layout.pinnedParts.delete(pid)) ++count;
  }
  return count;
}

export function pinBank(layout: McxBankLayoutData, bankIdx: number): number {
  const row = layout.banks[bankIdx];
  if (!row) return 0;
  let count = 0;
  for (const pid of row) {
    if (pid !== null && !layout.pinnedParts.has(pid)) {
      layout.pinnedParts.add(pid);
      ++count;
    }
  }
  return count;
}

export function areAllPinnedInBank(layout: McxBankLayoutData, bankIdx: number): boolean {
  const row = layout.banks[bankIdx];
  if (!row) return false;
  let occupied = 0;
  for (const pid of row) {
    if (pid === null) continue;
    ++occupied;
    if (!layout.pinnedParts.has(pid)) return false;
  }
  return occupied > 0;
}

export function movePart(layout: McxBankLayoutData, fromBank: number, fromSlot: number, toBank: number, toSlot: number): MovePartResult {
  if (fromBank < 0 || fromBank >= layout.bankCount || toBank < 0 || toBank >= layout.bankCount
    || fromSlot < 0 || fromSlot >= SLOTS_PER_BANK || toSlot < 0 || toSlot >= SLOTS_PER_BANK) {
    return { ok: false, reason: 'invalid' };
  }
  const movingPart = layout.banks[fromBank][fromSlot];
  if (movingPart === null) return { ok: false, reason: 'empty' };
  if (layout.pinnedParts.has(movingPart)) return { ok: false, reason: 'source_pinned' };
  if (fromBank === toBank && fromSlot === toSlot) return { ok: false, reason: 'same' };
  const targetPart = layout.banks[toBank][toSlot];
  if (targetPart !== null && layout.pinnedParts.has(targetPart)) return { ok: false, reason: 'target_pinned' };

  const copy = cloneBanks(layout.banks);
  let nextBankCount = layout.bankCount;
  let createdBankIdx: number | null = null;

  if (targetPart === null) {
    copy[fromBank][fromSlot] = null;
    copy[toBank][toSlot] = movingPart;
  } else if (fromBank === toBank) {
    const step = fromSlot < toSlot ? 1 : -1;
    const unpinnedIdx: number[] = [];
    for (let s = fromSlot; s !== toSlot + step; s += step) {
      const pid = copy[fromBank][s];
      if (pid === null || !layout.pinnedParts.has(pid)) unpinnedIdx.push(s);
    }
    const vals = unpinnedIdx.map((s) => copy[fromBank][s]);
    const shifted = [...vals.slice(1), vals[0]];
    unpinnedIdx.forEach((s, k) => { copy[fromBank][s] = shifted[k]; });
  } else {
    copy[fromBank][fromSlot] = null;
    let carry: number | null = movingPart;
    for (let b = toBank; b < MAX_BANKS && carry !== null; ++b) {
      if (b >= nextBankCount) { nextBankCount = b + 1; if (createdBankIdx === null) createdBankIdx = b; }
      const startS = b === toBank ? toSlot : 0;
      for (let s = startS; s < SLOTS_PER_BANK && carry !== null; ++s) {
        const existing = copy[b][s];
        if (existing === null) { copy[b][s] = carry; carry = null; }
        else if (!layout.pinnedParts.has(existing)) { copy[b][s] = carry; carry = existing; }
      }
    }
    if (carry !== null) return { ok: false, reason: 'overflow_blocked' };
  }

  let destBank = toBank;
  let removedEmptyBank = false;
  if (fromBank !== toBank && nextBankCount > 1 && isRowEmpty(copy[fromBank])) {
    copy.splice(fromBank, 1);
    copy.push(emptyRow());
    nextBankCount -= 1;
    removedEmptyBank = true;
    if (destBank > fromBank) destBank -= 1;
    if (createdBankIdx !== null && createdBankIdx > fromBank) createdBankIdx -= 1;
  }
  layout.banks = copy;
  layout.bankCount = nextBankCount;
  layout.activeBank = destBank;
  if (removedEmptyBank) compactRemovedBankMeta(layout, fromBank);
  return { ok: true, destBank, destSlot: toSlot, removedEmptyBank, createdBankIdx };
}

export function movePartToBank(layout: McxBankLayoutData, fromBank: number, fromSlot: number, targetBank: number): MovePartResult {
  if (targetBank === layout.bankCount) {
    if (layout.bankCount >= MAX_BANKS) return { ok: false, reason: 'max_banks' };
    const movingPart = layout.banks[fromBank]?.[fromSlot] ?? null;
    if (movingPart === null) return { ok: false, reason: 'empty' };
    if (layout.pinnedParts.has(movingPart)) return { ok: false, reason: 'source_pinned' };
    const copy = cloneBanks(layout.banks);
    copy[fromBank][fromSlot] = null;
    copy[targetBank] = emptyRow();
    copy[targetBank][0] = movingPart;
    setBankName(layout, targetBank, '');
    setBankMuted(layout, targetBank, false);
    setBankSoloed(layout, targetBank, false);
    let nextBankCount = layout.bankCount + 1;
    let destBank = targetBank;
    let removedEmptyBank = false;
    if (nextBankCount > 1 && isRowEmpty(copy[fromBank])) {
      copy.splice(fromBank, 1);
      copy.push(emptyRow());
      nextBankCount -= 1;
      destBank -= 1;
      removedEmptyBank = true;
    }
    layout.banks = copy;
    layout.bankCount = nextBankCount;
    layout.activeBank = destBank;
    if (removedEmptyBank) compactRemovedBankMeta(layout, fromBank);
    return { ok: true, destBank, destSlot: 0, removedEmptyBank, createdBankIdx: destBank };
  }
  if (targetBank === fromBank) return { ok: false, reason: 'same' };
  const firstFree = getFirstFreeSlot(layout, targetBank);
  return movePart(layout, fromBank, fromSlot, targetBank, firstFree >= 0 ? firstFree : 0);
}

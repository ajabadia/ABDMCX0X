/**
 * ABDMCX0X -- McxSoundBankManager.ts
 * Central registry, streaming manifest catalog parser, and on-demand .abdbank loader.
 * Strictly < 200 lines.
 */

import type { McxHostBridge } from '../bridge/McxHostBridge';
import type { McxCatalogItem } from '../ui/McxBankDrawer';
import type { McxAppState } from './McxAppState';
import { fetchAbdbankManifestSlice } from './McxAbdbankManifestStream';
import { parseAbdbankArchive, type McxWavePoolItem } from './McxAbdbankParser';

export interface McxSoundBankEntry {
  id: string; name: string; filename: string; slotIndex: number;
  description?: string; author?: string; sizeBytes?: number; coverUrl?: string; items: McxCatalogItem[];
  waves?: McxWavePoolItem[]; isCatalogParsed?: boolean; isLoaded?: boolean; isLoading?: boolean;
}

class SoundBankRegistry {
  private banks = new Map<string, McxSoundBankEntry>();
  private allItems: McxCatalogItem[] = [];

  public registerBank(entry: McxSoundBankEntry): void {
    const existing = this.banks.get(entry.id);
    if (existing) Object.assign(existing, entry);
    else this.banks.set(entry.id, entry);
    entry.items.forEach((it) => {
      const idx = this.allItems.findIndex((x) => x.id === it.id);
      if (idx >= 0) this.allItems[idx] = it; else this.allItems.push(it);
    });
  }

  public registerBanksFromIndex(entries: Array<{ id?: string; name: string; filename: string; author?: string; description?: string; sizeBytes?: number; coverUrl?: string }>): void {
    entries.forEach((e, idx) => {
      const id = e.id || e.filename.replace(/\.abdbank$/i, '').toLowerCase();
      if (!this.banks.has(id)) this.banks.set(id, { id, name: e.name, filename: e.filename, slotIndex: idx, author: e.author, description: e.description, sizeBytes: e.sizeBytes, coverUrl: e.coverUrl, items: [], waves: [], isCatalogParsed: false, isLoaded: false });
    });
  }
  public ingestLibraryItems(items: McxCatalogItem[]): void {
    for (const it of items) {
      const idx = this.allItems.findIndex((x) => x.id === it.id);
      if (idx >= 0) this.allItems[idx] = it; else this.allItems.push(it);
      if (it.itemType !== 1 || (!it.bankId && !it.sublibrary)) continue;
      const bankId = (it.bankId || it.sublibrary || 'bank').toLowerCase();
      let bank = this.banks.get(bankId) || this.getBankByName(it.sublibrary || '');
      if (!bank) { bank = { id: bankId, name: it.sublibrary || bankId, filename: it.filePath || '', slotIndex: it.bankSlotIndex ?? 0, items: [], waves: [], isCatalogParsed: true, isLoaded: typeof it.bankSlotIndex === 'number' }; this.banks.set(bankId, bank); }
      if (!bank.items.some((x) => x.id === it.id)) bank.items.push({ ...it, bankId: bank.id });
      bank.isCatalogParsed = true;
    }
  }

  public getBanks(): McxSoundBankEntry[] { return Array.from(this.banks.values()); }
  public getBankById(id: string): McxSoundBankEntry | undefined { return this.banks.get(id); }
  public getBankByName(name: string): McxSoundBankEntry | undefined {
    const low = (name || '').toLowerCase();
    for (const b of this.banks.values()) if (b.name.toLowerCase() === low || b.id.toLowerCase() === low) return b;
    return undefined;
  }
  public getAllCatalogItems(): McxCatalogItem[] { return this.allItems; }
  public getInstrumentsForBank(bankIdOrName: string): McxCatalogItem[] {
    const bank = this.banks.get(bankIdOrName) || this.getBankByName(bankIdOrName);
    if (bank && bank.items.length > 0) return bank.items.filter((it) => it.itemType === 1);
    return this.allItems.filter((it) => it.itemType === 1 && it.sublibrary === bankIdOrName);
  }
  public getWavesForBank(bankIdOrName: string): McxWavePoolItem[] {
    const bank = this.banks.get(bankIdOrName) || this.getBankByName(bankIdOrName);
    return bank?.waves ? [...bank.waves] : [];
  }
}

export const soundBankRegistry = new SoundBankRegistry();
const catalogPromises = new Map<string, Promise<McxSoundBankEntry | undefined>>();

export async function ensureBankCatalogParsed(bankIdOrName: string): Promise<McxSoundBankEntry | undefined> {
  const bank = soundBankRegistry.getBankById(bankIdOrName) || soundBankRegistry.getBankByName(bankIdOrName);
  if (!bank) return undefined;
  if (bank.isLoaded || bank.isCatalogParsed || !bank.filename) return bank;
  const inflight = catalogPromises.get(bank.id);
  if (inflight) return inflight;
  const p = (async () => {
    const slice = await fetchAbdbankManifestSlice(`/banks/${bank.filename}`);
    let parsed = slice ? parseAbdbankArchive(slice, bank.filename, bank.slotIndex, bank.name) : null;
    if (!parsed || parsed.items.length === 0) {
      const full = typeof fetch === 'function' ? await fetch(`/banks/${bank.filename}`) : null;
      if (full?.ok) parsed = parseAbdbankArchive(await full.arrayBuffer(), bank.filename, bank.slotIndex, bank.name);
    }
    if (!parsed || parsed.items.length === 0) return bank;
    parsed.items.forEach((it) => { it.bankId = bank.id; });
    const entry: McxSoundBankEntry = {
      ...bank, author: parsed.author || bank.author, description: parsed.description || bank.description,
      coverUrl: parsed.coverUrl || bank.coverUrl, items: parsed.items, waves: parsed.waves, isCatalogParsed: true, isLoaded: Boolean(bank.isLoaded),
    };
    soundBankRegistry.registerBank(entry);
    return entry;
  })().finally(() => { catalogPromises.delete(bank.id); });
  catalogPromises.set(bank.id, p);
  return p;
}

export async function indexAndStoreBankBuffer(
  bankMeta: { id?: string; name?: string; filename: string; author?: string; description?: string; sizeBytes?: number }, buf: ArrayBuffer, bridge: McxHostBridge
): Promise<McxSoundBankEntry> {
  if (!bridge.isNative && !(await bridge.enableAudio())) throw new Error('WASM audio engine failed to initialize');
  const parsed = parseAbdbankArchive(buf, bankMeta.filename, 0, bankMeta.name), slot = await bridge.indexBankBuffer(buf);
  if (slot < 0) throw new Error(`Unable to index bank ${bankMeta.filename} in audio engine`);
  const entryId = bankMeta.id || parsed.bankId;
  parsed.items.forEach((it) => { it.bankSlotIndex = slot; it.bankId = entryId; });
  const entry: McxSoundBankEntry = {
    id: entryId, name: bankMeta.name || parsed.bankName, filename: bankMeta.filename,
    author: bankMeta.author || parsed.author, description: bankMeta.description || parsed.description,
    sizeBytes: bankMeta.sizeBytes ?? buf.byteLength, coverUrl: parsed.coverUrl, slotIndex: slot,
    items: parsed.items, waves: parsed.waves, isCatalogParsed: true, isLoaded: true, isLoading: false,
  };
  soundBankRegistry.registerBank(entry);
  return entry;
}

export async function ensureBankLoaded(bankIdOrName: string, bridge: McxHostBridge, state?: McxAppState): Promise<McxSoundBankEntry | undefined> {
  const bank = soundBankRegistry.getBankById(bankIdOrName) || soundBankRegistry.getBankByName(bankIdOrName);
  if (!bank || bank.isLoaded) return bank;
  if (bank.isLoading) { while (bank.isLoading) await new Promise((r) => setTimeout(r, 50)); return bank; }
  bank.isLoading = true;
  state?.setLcdLine2(`CARGANDO LIBRERIA: ${bank.name.toUpperCase()}...`);
  try {
    const res = await fetch(`/banks/${bank.filename}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const updated = await indexAndStoreBankBuffer(bank, await res.arrayBuffer(), bridge);
    state?.setLcdLine2(`LIBRERIA LISTA: ${updated.name.toUpperCase()} (${updated.items.length} INSTR)`);
    return updated;
  } catch (err) {
    bank.isLoaded = false; console.error(`[McxSoundBankManager] Error loading bank ${bank.filename}:`, err);
    state?.setLcdLine2(`ERROR AL CARGAR BANCO ${bank.name}`);
  } finally { bank.isLoading = false; }
  return bank;
}

export function loadInstrumentIntoPart(bridge: McxHostBridge, state: McxAppState | undefined, partIdx: number, item: McxCatalogItem): void {
  const ps = state?.partsState[partIdx], isDrum = item.bankSlotKind === 'drum_kit' || Boolean(item.engineKind?.includes('drum'));
  if (ps) {
    ps.name = item.name; ps.soundBankName = item.sublibrary || ps.soundBankName || 'Default';
    ps.soundBankId = item.bankId; ps.soundBankSlotIndex = item.bankSlotIndex ?? 0; ps.soundBankItemIndex = item.bankItemIndex ?? 0;
    ps.soundBankKind = (item.bankSlotKind as 'tone' | 'drum_kit') ?? (isDrum ? 'drum_kit' : 'tone');
    if (typeof item.categoryId === 'number') ps.categoryId = item.categoryId;
    ps.coverUrl = item.thumbnailUrl || soundBankRegistry.getBankById(item.bankId || '')?.coverUrl || undefined;
    ps.kind = isDrum ? 'drum_map' : 'chromatic'; ps.followTranspose = !isDrum; ps.factoryPresetIndex = undefined;
  }
  bridge.setParam(partIdx, 'partKind', isDrum ? 1 : 0);
  if (bridge.isNative && typeof item.bankSlotIndex !== 'number') bridge.loadCatalogItem(partIdx, item.id, item.filePath ?? '');
  else bridge.loadBankItemOnDemand(partIdx, item.bankSlotIndex ?? 0, (item.bankSlotKind as 'tone' | 'drum_kit') || (isDrum ? 'drum_kit' : 'tone'), item.bankItemIndex ?? 0, 0);
  bridge.setPartPresetName(partIdx, item.name); bridge.requestPartEngineState(partIdx);
  if (state) { state.notifyPartMetadataChanged(partIdx); state.setLcdLine2(`P${String(partIdx + 1).padStart(2, '0')}: [${item.sublibrary || 'Bank'}] > ${item.name}`); }
}

export async function assignWaveIntoPart(
  bridge: McxHostBridge, state: McxAppState | undefined, partIdx: number,
  bankIdOrName: string, waveIndex: number, targetKind: 'partial_wave' | 'drum_wave', targetIndex: number
): Promise<boolean> {
  const bank = await ensureBankLoaded(bankIdOrName, bridge, state);
  if (!bank?.isLoaded) return false;
  const isDrum = targetKind === 'drum_wave', ps = state?.partsState[partIdx];
  if (ps) { ps.soundBankName = bank.name; ps.soundBankId = bank.id; ps.coverUrl = bank.coverUrl || undefined; ps.kind = isDrum ? 'drum_map' : 'chromatic'; ps.followTranspose = !isDrum; }
  bridge.setParam(partIdx, 'partKind', isDrum ? 1 : 0);
  bridge.loadBankItemOnDemand(partIdx, bank.slotIndex, targetKind, waveIndex, targetIndex);
  bridge.requestPartEngineState(partIdx);
  state?.notifyPartMetadataChanged(partIdx);
  return true;
}

export async function loadBankIntoPart(bridge: McxHostBridge, state: McxAppState, partIdx: number, bank: McxSoundBankEntry, itemIndex = 0): Promise<void> {
  const loaded = await ensureBankLoaded(bank.id, bridge, state);
  if (!loaded?.isLoaded) return;
  const instruments = loaded.items.filter((it) => it.itemType === 1);
  const targetItem = instruments[itemIndex] || instruments[0] || loaded.items[0];
  if (targetItem) loadInstrumentIntoPart(bridge, state, partIdx, targetItem);
}

let cm32WavePromise: Promise<void> | null = null;
export function ensureCm32WavePoolLoaded(bridge: McxHostBridge): Promise<void> {
  if (cm32WavePromise) return cm32WavePromise;
  cm32WavePromise = (async () => { try {
    if (!bridge.isNative && !(await bridge.enableAudio())) return;
    const res = await fetch('/banks/PENDING/Roland_CM32L_V102.abdbank');
    if (res.ok) await bridge.indexBankBuffer(await res.arrayBuffer());
  } catch { cm32WavePromise = null; } })();
  return cm32WavePromise;
}

export function ensureEngineWaveDependencies(typeId: string | undefined, bridge: McxHostBridge, state?: McxAppState): void {
  if (typeId === 'la50_synth') void ensureBankLoaded('roland_d50', bridge, state);
  else if (typeId === 'cm32_synth') void ensureCm32WavePoolLoaded(bridge);
  else if (typeId === 'jv880_synth') void ensureBankLoaded('roland_jv880', bridge, state).then((b) => {
    if (b?.isLoaded) state?.partsState.forEach((ps, i) => {
      if (ps.engineTypeId === 'jv880_synth' && (ps.factoryPresetIndex !== undefined || !ps.name)) bridge.loadFactoryPreset(i, ps.factoryPresetIndex ?? 0);
    });
  });
}

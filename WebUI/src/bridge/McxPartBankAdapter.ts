/**
 * ABDMCX0X -- McxPartBankAdapter.ts
 * Multi-engine browser source/item adapter and lazy .abdbank archive integration.
 * Strictly < 200 lines.
 */

import type { EngineBrowserItem, EngineBrowserSource, EnginePanelDescriptor } from '@abdsynths/shared/contracts';
import { classifyBankCategory } from '@abdsynths/shared/components/bank/bankCategories.js';
import { getEngineMetadata } from '@abdsynths/shared/components/synth-engines';
import type { McxHostBridge, McxPartPresetsDto } from './McxHostBridge';
import type { McxPartUiState } from '../ui/McxMixerConsole';
import type { McxAppState } from '../app/McxAppState';
import type { McxCatalogItem } from '../ui/McxBankDrawer';
import { getFallbackPresetsForEngine } from '../ui/McxEngineCatalogDefaults';
import {
  ensureBankCatalogParsed,
  ensureBankLoaded,
  indexAndStoreBankBuffer,
  loadInstrumentIntoPart,
  soundBankRegistry,
} from '../app/McxSoundBankManager';
import {
  assignWaveToPartTarget,
  listAvailableWaveBanks,
  listWavesInWaveBank,
  readPatchMeta,
  runPartPatchInit,
  triggerPartAuditionNote,
} from './McxPartBankWaveOps';

export interface McxPartBankAdapterContext {
  partIndex: number;
  hostBridge: McxHostBridge;
  getPartState: () => McxPartUiState;
  getPartPresets: () => McxPartPresetsDto | undefined;
  getDescriptor: () => EnginePanelDescriptor;
  appState?: McxAppState;
  onHostStateChanged?: () => void;
}

export class McxPartBankAdapter {
  private readonly ctx: McxPartBankAdapterContext;
  private noteOffTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: McxPartBankAdapterContext) {
    this.ctx = ctx;
  }

  public getPatchMeta(lastStateJson: string, fallbackName: string, isDrum: boolean) {
    return readPatchMeta(lastStateJson, fallbackName, isDrum);
  }

  private getFactoryItems(): EngineBrowserItem[] {
    const desc = this.ctx.getDescriptor();
    const ps = this.ctx.getPartState();
    const dto = this.ctx.getPartPresets();
    const rawList: Array<{ index: number; name: string; categoryId?: number; isDrumMode?: boolean }> =
      dto && dto.presets.length > 0
        ? dto.presets
        : getFallbackPresetsForEngine(desc.typeId === 'structured_rompler' ? 0 : (ps.engineTypeIndex ?? 0));

    const meta = getEngineMetadata(desc.typeId), coverUrl = meta?.defaultImage || undefined;
    return rawList.map((p) => {
      const isDrum = typeof p.isDrumMode === 'boolean' ? p.isDrumMode : (desc.typeId === 'structured_rompler' && p.index >= 16);
      const inferred = classifyBankCategory(p.name).paramId;
      const categoryId = typeof p.categoryId === 'number' && p.categoryId >= 0 && p.categoryId <= 9
        ? p.categoryId
        : (isDrum ? (inferred === 9 ? 9 : 8) : inferred);
      return {
        id: `factory:${desc.typeId}:${p.index}`, sourceId: 'factory', name: p.name, categoryId,
        playMode: isDrum ? 'drum_map' : 'chromatic', coverUrl, author: 'ABDSynths Factory ROM', factoryIndex: p.index,
      };
    });
  }

  public async listBrowserSources(): Promise<EngineBrowserSource[]> {
    const desc = this.ctx.getDescriptor(), meta = getEngineMetadata(desc.typeId), fItems = this.getFactoryItems();
    const drumKitCount = fItems.filter((i) => i.playMode === 'drum_map').length;
    const sources: EngineBrowserSource[] = [{
      id: 'factory', label: 'Factory Presets', kind: 'factory', count: fItems.length,
      toneCount: fItems.length - drumKitCount, drumKitCount, coverUrl: meta?.defaultImage || undefined,
      author: 'ABDSynths Factory ROM', description: meta?.description,
      filename: desc.typeId === 'structured_rompler' ? 'RomplerFactoryPatches.cpp (DSP ROM)' : 'Built-in DSP ROM',
      isLoaded: true,
    }];
    if (desc.supportsBankArchives) {
      soundBankRegistry.getBanks().forEach((b) => {
        const insts = b.items.filter((it) => it.itemType === 1);
        const drumKitCount = insts.filter((it) => it.bankSlotKind === 'drum_kit' || Boolean(it.engineKind?.includes('drum'))).length;
        sources.push({
          id: `abdbank:${b.id}`, label: b.name, kind: 'abdbank', count: insts.length,
          toneCount: insts.length - drumKitCount, drumKitCount, waveCount: b.waves?.length ?? 0,
          coverUrl: b.coverUrl, isLoaded: Boolean(b.isLoaded), description: b.description,
          author: b.author, filename: b.filename, sizeBytes: b.sizeBytes,
        });
      });
    }
    return sources;
  }

  private mapCatalogItem(it: McxCatalogItem, sourceId: string, fallbackCover?: string): EngineBrowserItem {
    const isDrum = it.bankSlotKind === 'drum_kit' || Boolean(it.engineKind?.includes('drum'));
    const inferred = classifyBankCategory(`${it.categoryName || ''} ${it.name}`).paramId;
    const categoryId = typeof it.categoryId === 'number' && it.categoryId >= 0 && it.categoryId <= 9
      ? it.categoryId : (isDrum ? (inferred === 9 ? 9 : 8) : inferred);
    return {
      id: it.id, sourceId, name: it.name, subBank: it.subBank, categoryId,
      playMode: isDrum ? 'drum_map' : 'chromatic',
      coverUrl: it.thumbnailUrl || fallbackCover, catalogItem: it,
    };
  }

  public async listBrowserItems(sourceId = 'all'): Promise<EngineBrowserItem[]> {
    const desc = this.ctx.getDescriptor();
    if (sourceId === 'factory') return this.getFactoryItems();
    if (desc.supportsBankArchives && sourceId.startsWith('abdbank:')) {
      const bankId = sourceId.slice(8);
      let bank = await ensureBankCatalogParsed(bankId);
      if (!bank || bank.items.length === 0) bank = await ensureBankLoaded(bankId, this.ctx.hostBridge, this.ctx.appState);
      return bank ? bank.items.filter((it) => it.itemType === 1).map((it) => this.mapCatalogItem(it, sourceId, bank.coverUrl)) : [];
    }
    const all = [...this.getFactoryItems()];
    if (desc.supportsBankArchives) {
      await Promise.all(soundBankRegistry.getBanks().map((b) => ensureBankCatalogParsed(b.id)));
      soundBankRegistry.getBanks().forEach((b) => {
        if (b.items.length === 0) return;
        const srcId = `abdbank:${b.id}`;
        b.items.filter((it) => it.itemType === 1).forEach((it) => all.push(this.mapCatalogItem(it, srcId, b.coverUrl)));
      });
    }
    return all;
  }

  public async selectBrowserItem(item: EngineBrowserItem, loadFactoryFn: (idx: number) => boolean): Promise<boolean> {
    if (typeof item.factoryIndex === 'number') return loadFactoryFn(item.factoryIndex);
    const cat = item.catalogItem as McxCatalogItem | undefined;
    if (!cat) return false;
    if (!this.ctx.hostBridge.isNative && (cat.bankId || cat.sublibrary)) {
      const loaded = await ensureBankLoaded(cat.bankId || cat.sublibrary || '', this.ctx.hostBridge, this.ctx.appState);
      if (!loaded?.isLoaded) return false;
      cat.bankSlotIndex = loaded.slotIndex;
    }
    loadInstrumentIntoPart(this.ctx.hostBridge, this.ctx.appState, this.ctx.partIndex, cat);
    const ps = this.ctx.getPartState();
    const isDrum = item.playMode === 'drum_map';
    ps.name = cat.name; ps.soundBankName = cat.sublibrary || ps.soundBankName;
    ps.soundBankId = cat.bankId; ps.soundBankSlotIndex = cat.bankSlotIndex;
    ps.soundBankItemIndex = cat.bankItemIndex; ps.soundBankKind = isDrum ? 'drum_kit' : 'tone';
    ps.categoryId = item.categoryId; ps.coverUrl = item.coverUrl || undefined;
    ps.kind = isDrum ? 'drum_map' : 'chromatic'; ps.followTranspose = !isDrum; ps.factoryPresetIndex = undefined;
    this.ctx.onHostStateChanged?.();
    return true;
  }

  public async auditionBrowserItem(item: EngineBrowserItem, loadFactoryFn: (i: number) => boolean, note?: number): Promise<void> {
    const ok = await this.selectBrowserItem(item, loadFactoryFn);
    if (!ok) return;
    const is303 = this.ctx.getDescriptor().typeId === 'tb303_synth';
    const targetNote = typeof note === 'number' ? note : (item.playMode === 'drum_map' ? 36 : (is303 ? 45 : 60));
    setTimeout(() => this.auditionNote(targetNote, is303 ? 0.9 : 0.88, is303 ? 380 : 240), 65);
  }

  public async importBankArchive(fileName: string, buffer: ArrayBuffer): Promise<EngineBrowserSource | null> {
    const entry = await indexAndStoreBankBuffer({ filename: fileName }, buffer, this.ctx.hostBridge);
    return {
      id: `abdbank:${entry.id}`, label: entry.name, kind: 'abdbank',
      count: entry.items.filter((it) => it.itemType === 1).length,
      coverUrl: entry.coverUrl, isLoaded: true, description: entry.description,
    };
  }

  public async ensureWaveBankLoaded(bankIdOrName: string): Promise<boolean> {
    const b = await ensureBankLoaded(bankIdOrName, this.ctx.hostBridge, this.ctx.appState);
    return Boolean(b?.isLoaded);
  }
  public listWaveBanks() { return listAvailableWaveBanks(); }
  public listWavesInBank(bankIdOrName: string) { return listWavesInWaveBank(this.ctx, bankIdOrName); }
  public assignWaveToTarget(bankIdOrName: string, waveIdx: number, kind: 'partial_wave' | 'drum_wave', targetIdx: number) {
    return assignWaveToPartTarget(this.ctx, bankIdOrName, waveIdx, kind, targetIdx);
  }
  public auditionNote(note: number, vel = 0.85, ms = 180) {
    this.noteOffTimer = triggerPartAuditionNote(this.ctx, note, vel, ms, this.noteOffTimer);
  }
  public initPatch(mode: 'chromatic' | 'drum_map' | undefined, loadF: (i: number) => boolean, setP: (k: string, v: number) => void, saveP: (n: string) => void) {
    runPartPatchInit(this.ctx, mode, loadF, setP, saveP);
  }
}

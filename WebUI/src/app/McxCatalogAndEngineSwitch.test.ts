/**
 * ABDMCX0X -- McxCatalogAndEngineSwitch.test.ts
 * Tests streaming .abdbank manifest catalog, on-demand WASM mounting failure safety,
 * drum-kit selection routing, and cross-engine stale preset clearing. Strictly < 200 lines.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultPartState } from '../ui/McxPartState';
import { McxPartBankAdapter } from '../bridge/McxPartBankAdapter';
import { McxPartEngineBridge } from '../bridge/McxPartEngineBridge';
import { McxInstrumentRouteModal } from '../ui/McxInstrumentRouteModal';
import { ensureBankCatalogParsed, ensureBankLoaded, soundBankRegistry } from './McxSoundBankManager';
import { parseAbdbankArchive } from './McxAbdbankParser';

function makeStoredZip(manifestObj: Record<string, unknown>, extraBytes = 128): ArrayBuffer {
  return makeMultiEntryZip([{ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifestObj)) }], extraBytes);
}

function makeMultiEntryZip(entries: Array<{ name: string; data: Uint8Array }>, tailBytes = 64): ArrayBuffer {
  const enc = new TextEncoder();
  const chunks = entries.map((e) => ({ name: enc.encode(e.name), data: e.data }));
  const total = chunks.reduce((s, c) => s + 30 + c.name.length + c.data.length, 0) + tailBytes;
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  let off = 0;
  for (const c of chunks) {
    dv.setUint32(off, 0x04034b50, true);
    dv.setUint32(off + 18, c.data.length, true);
    dv.setUint32(off + 22, c.data.length, true);
    dv.setUint16(off + 26, c.name.length, true);
    buf.set(c.name, off + 30);
    buf.set(c.data, off + 30 + c.name.length);
    off += 30 + c.name.length + c.data.length;
  }
  return buf.buffer;
}

describe('Streaming Catalog, Lazy Bank Mount & Cross-Engine Preset Isolation', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
  afterEach(() => { globalThis.fetch = origFetch; });

  it('indexes multiple .abdbank manifests without mounting WAVs and mounts selected drum kit on demand', async () => {
    const trZip = makeStoredZip({
      bankId: 'test_tr_set', bankName: 'Roland TR Rhythm Sets',
      drumKits: [{ id: 'kit_909_dance', name: 'TR-909 Dance Kit', categoryId: 8, slots: [{ midiNote: 36, waveId: 'w0' }] }],
      wavePool: [{ id: 'w0', name: '909 BD', rootKey: 36, playMode: 'oneshot' }],
    });
    const d50Zip = makeStoredZip({
      bankId: 'test_d50_set', bankName: 'Roland D-50 Linear Synthesizer',
      tones: [{ id: 'tone_fantasia', name: 'Fantasia D50', categoryId: 2, partials: [] }],
      wavePool: [],
    });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const ab = url.includes('Test_TR') ? trZip : d50Zip;
      return { ok: true, arrayBuffer: async () => ab.slice(0) } as Response;
    }) as typeof fetch;

    soundBankRegistry.registerBanksFromIndex([
      { id: 'test_tr_stream', name: 'Roland TR Test', filename: 'Test_TR.abdbank' },
      { id: 'test_d50_stream', name: 'Roland D50 Test', filename: 'Test_D50.abdbank' },
    ]);

    const indexBankBuffer = vi.fn(async () => 4);
    const loadBankItemOnDemand = vi.fn();
    const setParam = vi.fn();
    const hostBridge: any = {
      isNative: false, enableAudio: vi.fn(async () => true), indexBankBuffer,
      loadBankItemOnDemand, setParam, setPartPresetName: vi.fn(), requestPartEngineState: vi.fn(),
    };
    const ps = createDefaultPartState(0);
    const adapter = new McxPartBankAdapter({
      partIndex: 0, hostBridge, getPartState: () => ps, getPartPresets: () => undefined,
      getDescriptor: () => ({ typeId: 'structured_rompler', displayName: 'ABD Structured Rompler', supportsDrumMode: true, supportsBankArchives: true, maxRecommendedInstances: 16 }),
    });

    const items = await adapter.listBrowserItems('all');
    expect(items.some((i) => i.name === 'TR-909 Dance Kit')).toBe(true);
    expect(items.some((i) => i.name === 'Fantasia D50')).toBe(true);
    expect(indexBankBuffer).not.toHaveBeenCalled();
    const kitItem = items.find((i) => i.name === 'TR-909 Dance Kit')!;
    const ok = await adapter.selectBrowserItem(kitItem, () => false);
    expect(ok).toBe(true); expect(indexBankBuffer).toHaveBeenCalledTimes(1);
    expect(setParam).toHaveBeenCalledWith(0, 'partKind', 1); expect(loadBankItemOnDemand).toHaveBeenCalledWith(0, 4, 'drum_kit', 0, 0);
    expect(ps.kind).toBe('drum_map');
  });

  it('never marks a bank loaded if WASM indexBankBuffer returns -1', async () => {
    const zip = makeStoredZip({ bankName: 'Fail Bank', tones: [{ id: 't0', name: 'Lead' }] });
    globalThis.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => zip.slice(0) } as Response)) as typeof fetch;
    soundBankRegistry.registerBanksFromIndex([{ id: 'fail_bank_id', name: 'Fail Bank', filename: 'Fail_Bank.abdbank' }]);
    await ensureBankCatalogParsed('fail_bank_id');
    const bank = await ensureBankLoaded('fail_bank_id', { isNative: false, enableAudio: async () => true, indexBankBuffer: async () => -1 } as any);
    expect(bank?.isLoaded).toBe(false);
  });

  it('clears stale preset name when switching engine types in RouteModal and PartEngineBridge', () => {
    HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
    const ps = createDefaultPartState(0);
    ps.engineTypeIndex = 2; ps.engineTypeId = 'mcs48_synth'; ps.name = 'Classic Square (MonoVoice)';
    const hostBridge: any = {
      isNative: false, selectPartEngineType: vi.fn(), setParam: vi.fn(),
      requestPartPresets: vi.fn(), requestPartEngineState: vi.fn(), refreshMidiDevices: vi.fn(), onNoteEvent: vi.fn(() => () => {}),
    };
    const modal = new McxInstrumentRouteModal({
      bridge: hostBridge, getPartState: () => ps, onPartUpdated: vi.fn(), onOpenToneDrawer: vi.fn(), setLcdLine2: vi.fn(),
    });
    modal.setEngineCatalog([
      { index: 0, typeId: 'structured_rompler', displayName: 'ABD Structured Rompler', supportsDrumMode: true, supportsChromaticMode: true, supportsBankArchives: true, maxRecommendedInstances: 16 },
      { index: 2, typeId: 'mcs48_synth', displayName: 'MCS-48', supportsDrumMode: false, supportsChromaticMode: true, supportsBankArchives: false, maxRecommendedInstances: 4 },
    ]);
    modal.open(0);
    const sel = document.querySelector<HTMLSelectElement>('#mcx-route-engine')!;
    sel.value = '0'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(ps.name).toBe('');
    expect(hostBridge.requestPartEngineState).toHaveBeenCalledWith(0);

    const pb = new McxPartEngineBridge({
      partIndex: 0, hostBridge, getPartState: () => ps,
      getCatalog: () => [{ index: 0, typeId: 'structured_rompler', displayName: 'ABD Structured Rompler', supportsDrumMode: true, supportsBankArchives: true, maxRecommendedInstances: 16 }],
      getPartPresets: () => undefined,
    });
    pb.applyRemoteState('mcs48_synth', '{}', 'Classic Square (MonoVoice)');
    expect(pb.getPresetName()).not.toBe('Classic Square (MonoVoice)');
    modal.destroy();
  });

  it('extracts inline & binary ZIP covers cleanly, rejects SVG XSS, and clears cover on Factory/Init', async () => {
    const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const zip = makeMultiEntryZip([
      {
        name: 'manifest.json',
        data: new TextEncoder().encode(JSON.stringify({
          bankId: 'cov_bank', bankName: 'Cover Bank',
          tones: [
            { id: 't0', name: 'Lead ZIP', thumbnailUri: 'covers/tone.png', categoryId: 0 },
            { id: 't1', name: 'Bad SVG', coverWebpDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+', categoryId: 1 },
          ],
          drumKits: [{ id: 'k0', name: 'Kit Inline', coverWebpDataUrl: 'data:image/webp;base64,UklGRhAAAABXRUJQ', categoryId: 8 }],
        })),
      },
      { name: 'cover.webp', data: webpBytes },
      { name: 'covers/tone.png', data: pngBytes },
    ]);
    const parsed = parseAbdbankArchive(zip, 'Cover_Bank.abdbank', 0);
    expect(parsed.coverUrl).toMatch(/^data:image\/webp;base64,/);
    const toneZipItem = parsed.items.find((i) => i.name === 'Lead ZIP')!;
    const badSvgItem = parsed.items.find((i) => i.name === 'Bad SVG')!;
    const kitInlineItem = parsed.items.find((i) => i.name === 'Kit Inline')!;
    expect(toneZipItem.thumbnailUrl).toMatch(/^data:image\/png;base64,/);
    expect(badSvgItem.thumbnailUrl).toBe(parsed.coverUrl);
    expect(kitInlineItem.thumbnailUrl).toBe('data:image/webp;base64,UklGRhAAAABXRUJQ');

    globalThis.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => zip.slice(0) } as Response)) as typeof fetch;
    soundBankRegistry.registerBanksFromIndex([{ id: 'cov_bank', name: 'Cover Bank', filename: 'Cover_Bank.abdbank' }]);
    const ps = createDefaultPartState(0);
    const hostBridge: any = {
      isNative: false, enableAudio: async () => true, indexBankBuffer: async () => 2,
      loadBankItemOnDemand: vi.fn(), loadFactoryPreset: vi.fn(), setParam: vi.fn(), setEngineParam: vi.fn(),
      setPartPresetName: vi.fn(), requestPartPresets: vi.fn(), requestPartEngineState: vi.fn(), onNoteEvent: vi.fn(() => () => {}),
    };
    const pb = new McxPartEngineBridge({
      partIndex: 0, hostBridge, getPartState: () => ps,
      getCatalog: () => [{ index: 0, typeId: 'structured_rompler', displayName: 'ABD Structured Rompler', supportsDrumMode: true, supportsBankArchives: true, maxRecommendedInstances: 16 }],
      getPartPresets: () => undefined,
    });
    const srcItems = await pb.listBrowserItems('abdbank:cov_bank');
    await pb.selectBrowserItem(srcItems.find((i) => i.name === 'Lead ZIP')!);
    expect(pb.getCoverUrl()).toMatch(/^data:image\/png;base64,/);
    pb.loadFactoryPreset(0);
    expect(pb.getCoverUrl()).toBeUndefined();
    expect(ps.soundBankId).toBeUndefined();
    await pb.selectBrowserItem(srcItems.find((i) => i.name === 'Kit Inline')!);
    expect(pb.getCoverUrl()).toBe('data:image/webp;base64,UklGRhAAAABXRUJQ');
    pb.initPatch('chromatic');
    expect(pb.getCoverUrl()).toBeUndefined();
  });

  it('requests >=2MB Range slice for large manifests (SC-55) and falls back to full load if catalog slice is empty', async () => {
    const bigPad = ' '.repeat(1200000);
    const bigZip = makeMultiEntryZip([{ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify({ bankId: 'sc55_big', bankName: 'SC-55 Big', padding: bigPad, tones: [{ id: 't1', name: 'Piano 1', categoryId: 5 }] })) }]);
    const rangeHeaders: string[] = [];
    globalThis.fetch = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const h = (init?.headers as Record<string, string>)?.Range || '';
      rangeHeaders.push(h);
      return { ok: true, arrayBuffer: async () => (h ? new ArrayBuffer(16) : bigZip.slice(0)) } as Response;
    }) as typeof fetch;
    soundBankRegistry.registerBanksFromIndex([{ id: 'sc55_big', name: 'SC-55 Big', filename: 'SC55_Big.abdbank' }]);
    const hostBridge: any = { isNative: false, enableAudio: async () => true, indexBankBuffer: async () => 5, setParam: vi.fn(), loadBankItemOnDemand: vi.fn(), setPartPresetName: vi.fn(), requestPartEngineState: vi.fn() };
    const adapter = new McxPartBankAdapter({ partIndex: 0, hostBridge, getPartState: () => createDefaultPartState(0), getPartPresets: () => undefined, getDescriptor: () => ({ typeId: 'structured_rompler', displayName: 'Rompler', supportsBankArchives: true, supportsDrumMode: true, maxRecommendedInstances: 16 }) });
    const items = await adapter.listBrowserItems('abdbank:sc55_big');
    expect(rangeHeaders[0]).toBe('bytes=0-2621439');
    expect(items.some((i) => i.name === 'Piano 1')).toBe(true);
  });
});

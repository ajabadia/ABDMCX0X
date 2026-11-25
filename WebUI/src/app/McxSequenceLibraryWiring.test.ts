/** ABDMCX0X — native IPC + Storage fallback wiring for .abdseq. */
import { describe, expect, it, vi } from 'vitest';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { nativeSequenceEvents } from '../bridge/McxHostBridgeHelpers';
import type { McxAppState } from './McxAppState';
import { McxSequenceLibrary, type AbdSeqPayload } from './McxSequenceLibrary';
import {
  applySequencePayload, createNativeSequenceFs, createSequenceFs, mountPianoRollSequenceBar,
} from './McxSequenceLibraryWiring';

const payload = (name = 'Lead Melody'): AbdSeqPayload => ({
  formatId: 'abdseq', version: 1, name, bpm: 124, partKind: 'chromatic', bars: 1, ppq: 96,
  notes: [{ midiNote: 60, startTick: 0, durationTicks: 24, velocity: 110 }], savedAt: '2026-01-02T10:00:00.000Z',
});

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}
const bridgeOf = (isNative: boolean, send: (n: any) => void = () => {}) =>
  ({ isNative, sendCommand: (n: any) => send(n) } as unknown as McxHostBridge);
const stateOf = () => ({
  partsState: [{ name: 'Bass', kind: 'chromatic' }], focusedPart: 0,
  refs: { stepStrip: { syncFromSequence: vi.fn() } }, setLcdLine2: vi.fn(),
}) as unknown as McxAppState;

describe('Storage fallback', () => {
  it('saves, lists and loads through the injected Storage', async () => {
    const storage = memoryStorage();
    const lib = new McxSequenceLibrary(createSequenceFs(bridgeOf(false), storage));
    expect((await lib.save(payload())).file).toBe('Sequences/lead-melody.abdseq');
    expect(storage.getItem('abdmcx0x.seq.Sequences/lead-melody.abdseq')).toContain('"abdseq"');
    expect((await lib.refresh()).map((e) => e.slug)).toEqual(['lead-melody']);
    expect((await lib.load('Sequences/lead-melody.abdseq'))?.bpm).toBe(124);
  });
});

describe('native JUCE adapter', () => {
  it('uses sendCommand and the sequence* telemetry bus', async () => {
    nativeSequenceEvents.listeners.clear();
    const commands: any[] = [];
    const json = JSON.stringify(payload('Native Tune'));
    const bridge = bridgeOf(true, (n) => {
      commands.push(n);
      if (n.type === 'listSequences') nativeSequenceEvents.emit({ type: 'sequenceList', catalogJson: '["native-tune"]' });
      else if (n.type === 'saveSequenceFile') nativeSequenceEvents.emit({ type: 'sequenceSaved', ok: true, slug: n.slug });
      else nativeSequenceEvents.emit({ type: 'sequenceLoaded', ok: true, slug: n.slug, content: json });
    });
    const fs = createNativeSequenceFs(bridge);
    expect(await fs.list('Sequences')).toEqual(['Sequences/native-tune.abdseq']);
    await fs.write('Sequences/native-tune.abdseq', json);
    expect(commands[1]).toEqual({ type: 'saveSequenceFile', slug: 'native-tune', content: json });
    expect(await fs.read('Sequences/native-tune.abdseq')).toBe(json);
    expect(commands[2]).toEqual({ type: 'loadSequenceFile', slug: 'native-tune' });
  });

  it('rejects a failed native load', async () => {
    nativeSequenceEvents.listeners.clear();
    const bridge = bridgeOf(true, (n) => nativeSequenceEvents.emit({ type: 'sequenceLoaded', ok: false, slug: n.slug, content: '' }));
    await expect(createNativeSequenceFs(bridge).read('Sequences/missing.abdseq'))
      .rejects.toThrow('sequenceLoadFailed:missing');
  });
});

describe('apply and UI bar', () => {
  it('applies a payload to part, host pattern and editors', () => {
    const state = stateOf();
    const bridge = { setPartPattern: vi.fn() } as unknown as McxHostBridge;
    const modal = { setBars: vi.fn(), setMode: vi.fn(), setNotes: vi.fn() };
    applySequencePayload(payload(), 0, state, bridge, modal);
    expect((state.partsState[0] as any).sequence.notes).toHaveLength(1);
    expect(bridge.setPartPattern).toHaveBeenCalledWith(0, expect.objectContaining({ ppq: 96 }));
    expect(state.refs.stepStrip?.syncFromSequence).toHaveBeenCalled();
    expect(modal.setNotes).toHaveBeenCalled();
  });

  it('mounts SEQ LIB into the Piano Roll and loads/saves from it', async () => {
    const el = document.createElement('div');
    const head = document.createElement('header');
    head.className = 'abd-pianoroll-head'; el.appendChild(head);
    const state = stateOf();
    const bridge = { isNative: false, sendCommand: vi.fn(), setPartPattern: vi.fn() } as unknown as McxHostBridge;
    const storage = memoryStorage();
    await new McxSequenceLibrary(createSequenceFs(bridgeOf(false), storage)).save(payload());
    const modal = {
      el, getSequence: () => ({ bars: 1, ppq: 96, mode: 'chromatic', notes: payload().notes }),
      setBars: vi.fn(), setMode: vi.fn(), setNotes: vi.fn(),
    };
    const handle = mountPianoRollSequenceBar(modal as any, bridge, state, storage);
    await handle.refresh();
    expect(handle.bar.textContent).toContain('SEQ LIB:');
    expect(handle.sel.options).toHaveLength(1);
    await handle.load();
    expect(bridge.setPartPattern).toHaveBeenCalled();
    expect(modal.setNotes).toHaveBeenCalled();
    await handle.save();
    expect(handle.sel.options).toHaveLength(2);
    (modal as any).setLocale = (loc: string) => {
      el.innerHTML = `<header class="abd-pianoroll-head" data-loc="${loc}"></header>`;
    };
    const modal2: any = { ...modal };
    const handle2 = mountPianoRollSequenceBar(modal2, bridge, state, storage);
    modal2.setLocale('en');
    expect(el.querySelector('.abd-seq-lib-bar')).toBe(handle2.bar);
  });
});

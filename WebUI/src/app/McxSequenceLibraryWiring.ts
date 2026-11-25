/** ABDMCX0X — .abdseq disk/storage adapter and compact Piano Roll SEQ LIB bar. */
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { nativeSequenceEvents } from '../bridge/McxHostBridgeHelpers';
import type { McxAppState } from './McxAppState';
import {
  createStorageSequenceFs, McxSequenceLibrary,
  type AbdSeqPayload, type PartKind, type SequenceEntry, type SequenceFsAdapter,
} from './McxSequenceLibrary';

type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
type SequenceModal = {
  el?: HTMLElement | null;
  getSequence?: () => any;
  setBars?: (bars: number) => void;
  setNotes?: (notes: any[]) => void;
  setMode?: (mode: string) => void;
  setLocale?: (locale: string) => void;
};

const slugOf = (file: string): string => file.replace(/\.abdseq$/i, '').split(/[\\/]/).pop() ?? file;
const fileOf = (slug: string): string => `Sequences/${slug}.abdseq`;

/** Native adapter: sendCommand out, sequence* telemetry back through the compact bus. */
export function createNativeSequenceFs(bridge: McxHostBridge): SequenceFsAdapter {
  const waiters = new Map<string, (ev: any) => void>();
  nativeSequenceEvents.on((ev) => {
    const key = ev.type === 'sequenceList' ? ev.type : `${ev.type}:${ev.slug}`;
    const done = waiters.get(key);
    if (done) { waiters.delete(key); done(ev); }
  });
  const wait = <T>(key: string): Promise<T> => new Promise((resolve) => {
    const done = (ev: T): void => { waiters.delete(key); clearTimeout(timer); resolve(ev); };
    const timer = setTimeout(() => { waiters.delete(key); resolve(null as T); }, 2500);
    waiters.set(key, done as (ev: any) => void);
  });
  const send = (msg: Record<string, unknown>): void => bridge.sendCommand(msg, { type: 'SEQUENCE_NOOP' });
  return {
    async list() {
      const pending = wait<{ catalogJson?: string }>('sequenceList');
      send({ type: 'listSequences' });
      const ev = await pending;
      try {
        const parsed: unknown = JSON.parse(ev?.catalogJson ?? '[]');
        return Array.isArray(parsed) ? parsed.map((s) => fileOf(String(s))) : [];
      } catch { return []; }
    },
    async read(file) {
      const slug = slugOf(file);
      const pending = wait<{ ok: boolean; content: string }>(`sequenceLoaded:${slug}`);
      send({ type: 'loadSequenceFile', slug });
      const ev = await pending;
      if (!ev?.ok) throw new Error(`sequenceLoadFailed:${slug}`);
      return ev.content;
    },
    async write(file, text) {
      const slug = slugOf(file);
      const pending = wait<{ ok: boolean }>(`sequenceSaved:${slug}`);
      send({ type: 'saveSequenceFile', slug, content: text });
      const ev = await pending;
      if (!ev?.ok) throw new Error(`sequenceSaveFailed:${slug}`);
    },
  };
}

/** Browser/WASM uses Storage; native uses JUCE IPC. */
export function createSequenceFs(bridge: McxHostBridge, storage?: StorageLike): SequenceFsAdapter {
  if (bridge.isNative) return createNativeSequenceFs(bridge);
  const fallback: StorageLike = storage ?? (typeof localStorage !== 'undefined' ? localStorage : {
    length: 0, key: () => null, getItem: () => null, setItem: () => {}, removeItem: () => {},
  });
  return createStorageSequenceFs(fallback);
}

/** Applies a loaded payload to the active part, host pattern and open editors. */
export function applySequencePayload(payload: AbdSeqPayload, partIdx: number, state: McxAppState,
  bridge: McxHostBridge, modal?: SequenceModal): void {
  const mode: 'chromatic' | 'drum' = payload.partKind === 'drum' ? 'drum' : 'chromatic';
  const seq = { bars: payload.bars, ppq: payload.ppq, mode, notes: payload.notes.map((n) => ({ ...n })), motion: {} };
  const ps = state.partsState[partIdx];
  if (ps) ps.sequence = seq as any;
  bridge.setPartPattern(partIdx, seq);
  state.refs.stepStrip?.syncFromSequence(partIdx, seq);
  modal?.setBars?.(seq.bars); modal?.setMode?.(seq.mode); modal?.setNotes?.(seq.notes);
  state.setLcdLine2(`P${String(partIdx + 1).padStart(2, '0')} SEQ LOAD: ${seq.notes.length} NOTAS`);
}

export function sequenceToPayload(seq: any, name = 'Sequence', bpm = 120): AbdSeqPayload | null {
  const notes = Array.isArray(seq?.notes) ? seq.notes : [];
  const kind: PartKind = seq?.mode === 'drum' ? 'drum' : 'chromatic';
  return {
    formatId: 'abdseq', version: 1, name: String(name || 'Sequence').slice(0, 64),
    bpm: Math.max(40, Math.min(240, Math.round(Number(bpm) || 120))), partKind: kind,
    bars: Math.max(1, Math.min(32, Math.round(Number(seq?.bars) || 1))),
    ppq: Number(seq?.ppq) === 480 ? 480 : 96,
    notes: notes.map((n: any) => ({
      midiNote: Math.round(Number(n.midiNote) || 0), startTick: Math.max(0, Math.round(Number(n.startTick) || 0)),
      durationTicks: Math.max(1, Math.round(Number(n.durationTicks) || 1)), velocity: Math.max(1, Math.min(127, Math.round(Number(n.velocity) || 100))),
    })),
    savedAt: new Date().toISOString(),
  };
}

/** Mounts `SEQ LIB: <select> [Load] [Save]` into the Piano Roll header. */
export function mountPianoRollSequenceBar(modal: SequenceModal, bridge: McxHostBridge,
  state: McxAppState, storage?: StorageLike) {
  const lib = new McxSequenceLibrary(createSequenceFs(bridge, storage));
  const bar = document.createElement('div');
  bar.className = 'abd-seq-lib-bar';
  const caption = document.createElement('span');
  caption.textContent = 'SEQ LIB:';
  const sel = document.createElement('select');
  sel.id = 'abd-seq-lib-sel';
  sel.setAttribute('aria-label', 'Sequence library');
  const button = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.addEventListener('click', onClick);
    return b;
  };
  bar.append(caption, sel, button('Load', () => { void load(); }), button('Save', () => { void save(); }));
  const attach = (): void => { (modal.el?.querySelector?.('.abd-pianoroll-head') ?? modal.el)?.appendChild?.(bar); };
  attach();
  if (typeof modal.setLocale === 'function') {
    const origSetLocale = modal.setLocale.bind(modal);
    modal.setLocale = (loc: string) => { origSetLocale(loc); attach(); };
  }

  let entries: SequenceEntry[] = [];
  const refresh = async (): Promise<void> => {
    entries = await lib.refresh();
    sel.replaceChildren(...entries.map((e) => {
      const opt = document.createElement('option');
      opt.value = e.file; opt.textContent = `${e.name} · ${e.bpm}`;
      return opt;
    }));
  };
  const load = async (): Promise<void> => {
    const payload = await lib.load(sel.value);
    if (payload) applySequencePayload(payload, state.focusedPart, state, bridge, modal);
  };
  const save = async (): Promise<void> => {
    const seq = modal.getSequence?.() ?? state.partsState[state.focusedPart].sequence;
    const payload = sequenceToPayload(seq, state.partsState[state.focusedPart].name || 'Sequence',
      state.globalSettings?.standaloneBpm ?? 120);
    if (!payload) return;
    const res = await lib.save(payload);
    await refresh();
    state.setLcdLine2(res.ok ? `SEQ SAVED: ${res.file ?? ''}` : `SEQ SAVE ERROR: ${res.errors.join(',')}`);
  };
  void refresh();
  return { bar, sel, lib, entries: () => entries, refresh, load, save };
}

/** ABDMCX0X — Vitest coverage for pure .abdseq sequence library. */
import { describe, expect, it } from 'vitest';
import {
  McxSequenceLibrary, createMemorySequenceFs, createStorageSequenceFs, filterSequences,
  parseSequenceJson, sanitizeSequenceSlug, sortSequences, uniqueSequenceSlug,
  validateSequencePayload, type AbdSeqPayload, type SequenceEntry,
} from './McxSequenceLibrary';

const payload = (over: Partial<AbdSeqPayload> = {}): AbdSeqPayload => ({
  formatId: 'abdseq', version: 1, name: 'Lead Melody', bpm: 124, partKind: 'chromatic',
  bars: 2, ppq: 96, notes: [{ midiNote: 60, startTick: 0, durationTicks: 24, velocity: 110 }],
  savedAt: '2026-01-02T10:00:00.000Z', ...over,
});
const entry = (slug: string, name: string, bpm: number, partKind: 'chromatic' | 'drum', modifiedAt: number): SequenceEntry =>
  ({ file: `Sequences/${slug}.abdseq`, slug, name, bpm, partKind, savedAt: '', modifiedAt, size: 10 });

describe('slugs', () => {
  it('sanitizes accents, separators, traversal and empty names', () => {
    expect(sanitizeSequenceSlug('../Café ÉLECTRICO_01!')).toBe('cafe-electrico-01');
    expect(sanitizeSequenceSlug('   ')).toBe('sequence');
    expect(sanitizeSequenceSlug('abc', 2)).toBe('ab');
  });

  it('resolves collisions case-insensitively and deterministically', () => {
    expect(uniqueSequenceSlug('Lead Melody', ['lead-melody'])).toBe('lead-melody-2');
    expect(uniqueSequenceSlug('Lead Melody', ['lead-melody', 'LEAD-MELODY-2'])).toBe('lead-melody-3');
    expect(uniqueSequenceSlug('Other', [])).toBe('other');
  });
});

describe('validation', () => {
  it('accepts and normalizes a valid payload', () => {
    const result = validateSequencePayload(payload({ name: '  Bass  ' }));
    expect(result.ok).toBe(true);
    expect(result.payload?.name).toBe('Bass');
    expect(result.payload?.notes).toEqual([{ midiNote: 60, startTick: 0, durationTicks: 24, velocity: 110 }]);
  });

  it.each([
    [null, 'payload-not-object'],
    [[], 'payload-not-object'],
    [{ ...payload(), formatId: 'abd_pattern' }, 'bad-formatId'],
    [{ ...payload(), version: 2 }, 'bad-version'],
    [{ ...payload(), name: '' }, 'bad-name'],
    [{ ...payload(), bpm: 12 }, 'bad-bpm'],
    [{ ...payload(), partKind: 'bass' }, 'bad-partKind'],
    [{ ...payload(), bars: 0 }, 'bad-bars'],
    [{ ...payload(), ppq: 120 }, 'bad-ppq'],
    [{ ...payload(), notes: 'nope' }, 'bad-notes'],
    [{ ...payload(), notes: [{ midiNote: 128, startTick: 0, durationTicks: 24, velocity: 100 }] }, 'bad-note-0'],
    [{ ...payload(), notes: [{ midiNote: 60, startTick: 0, durationTicks: 0, velocity: 100 }] }, 'bad-note-0'],
  ])('rejects corrupt payload %# with %s', (raw, code) => {
    expect(validateSequencePayload(raw).errors).toContain(code);
  });

  it('does not throw on invalid JSON', () => {
    expect(parseSequenceJson('{').errors).toEqual(['invalid-json']);
    expect(parseSequenceJson(JSON.stringify(payload())).ok).toBe(true);
  });
});

describe('filtering and sorting', () => {
  const list = [
    entry('kick-kit', 'Kick Kit', 90, 'drum', 100),
    entry('lead-melody', 'Lead Melody', 124, 'chromatic', 300),
    entry('bass-line', 'Bass Line', 110, 'chromatic', 200),
  ];

  it('filters by query and partKind', () => {
    expect(filterSequences(list, { query: 'LEAD' }).map((e) => e.slug)).toEqual(['lead-melody']);
    expect(filterSequences(list, { query: 'kick-kit' }).map((e) => e.slug)).toEqual(['kick-kit']);
    expect(filterSequences(list, { partKind: 'chromatic' }).map((e) => e.slug)).toEqual(['lead-melody', 'bass-line']);
    expect(filterSequences(list, { query: 'bass', partKind: 'drum' })).toEqual([]);
  });

  it('sorts by date (default desc), BPM and name', () => {
    expect(sortSequences(list).map((e) => e.slug)).toEqual(['lead-melody', 'bass-line', 'kick-kit']);
    expect(sortSequences(list, 'bpm', 'desc').map((e) => e.slug)).toEqual(['lead-melody', 'bass-line', 'kick-kit']);
    expect(sortSequences(list, 'name').map((e) => e.slug)).toEqual(['bass-line', 'kick-kit', 'lead-melody']);
    expect(list[0].slug).toBe('kick-kit');
  });
});

describe('McxSequenceLibrary', () => {
  it('skips unreadable files, saves unique names and loads from the memory adapter', async () => {
    const fs = createMemorySequenceFs({
      'Sequences/old.abdseq': JSON.stringify(payload({ name: 'Old', bpm: 100 })),
      'Sequences/broken.abdseq': '{not-json',
      'Sequences/readme.txt': 'ignore me',
    });
    const lib = new McxSequenceLibrary(fs);
    expect((await lib.refresh()).map((e) => e.slug)).toEqual(['old']);
    const saved = await lib.save(payload({ name: 'Old' }));
    expect(saved.file).toBe('Sequences/old-2.abdseq');
    expect(lib.list({ partKind: 'chromatic' })).toHaveLength(2);
    expect((await lib.load('Sequences/old-2.abdseq'))?.bpm).toBe(124);
    expect(await lib.load('Sequences/broken.abdseq')).toBeNull();
    expect((await lib.save(payload({ bpm: 999 }))).errors).toContain('bad-bpm');
  });

  it('uses a Storage fallback without touching browser globals', async () => {
    const data = new Map<string, string>();
    const storage = {
      get length() { return data.size; },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); },
    };
    const fs = createStorageSequenceFs(storage);
    await fs.write('Sequences/demo.abdseq', JSON.stringify(payload()));
    const lib = new McxSequenceLibrary(fs);
    expect((await lib.refresh())[0].name).toBe('Lead Melody');
  });
});

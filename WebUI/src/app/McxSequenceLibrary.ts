/** ABDMCX0X — pure .abdseq library: validation, naming, filtering, sortable listing and IO adapter. */

export type PartKind = 'chromatic' | 'drum';
export type SequenceSort = 'date' | 'bpm' | 'name';
export interface AbdSeqNote { midiNote: number; startTick: number; durationTicks: number; velocity: number }
export interface AbdSeqPayload {
  formatId: 'abdseq'; version: 1; name: string; bpm: number; partKind: PartKind;
  bars: number; ppq: number; notes: AbdSeqNote[]; savedAt?: string;
}
export interface SequenceEntry {
  file: string; slug: string; name: string; bpm: number; partKind: PartKind;
  savedAt: string; modifiedAt: number; size: number;
}
export interface SequenceFilter { query?: string; partKind?: PartKind; sortBy?: SequenceSort; dir?: 'asc' | 'desc' }
export interface ValidationResult { ok: boolean; errors: string[]; payload?: AbdSeqPayload }
export interface SequenceFsAdapter {
  list(dir: string): Promise<string[]>;
  read(file: string): Promise<string>;
  write(file: string, text: string): Promise<void>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const inRange = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isInt = (v: unknown, lo: number, hi: number): v is number => inRange(v, lo, hi) && Number.isInteger(v);
const text = (v: unknown, fallback = ''): string => typeof v === 'string' ? v : fallback;

/** Safe, lowercase, ASCII-only file stem; never empty or a path component. */
export function sanitizeSequenceSlug(name: string, maxLen = 48): string {
  const slug = text(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, maxLen).replace(/-+$/, '');
  return slug || 'sequence';
}

/** Deterministic collision resolution, case-insensitive against existing slugs. */
export function uniqueSequenceSlug(name: string, existing: readonly string[]): string {
  const used = new Set(existing.map((s) => sanitizeSequenceSlug(s).toLowerCase()));
  const base = sanitizeSequenceSlug(name);
  if (!used.has(base)) return base;
  for (let i = 2; i <= 9999; i++) { const next = `${base.slice(0, 44)}-${i}`; if (!used.has(next)) return next; }
  return base;
}

/** Strict validation with normalized payload; all errors are returned, none thrown. */
export function validateSequencePayload(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['payload-not-object'] };
  if (raw.formatId !== 'abdseq') errors.push('bad-formatId'); if (raw.version !== 1) errors.push('bad-version');
  const name = text(raw.name).trim();
  if (!name || name.length > 64) errors.push('bad-name'); if (!inRange(raw.bpm, 40, 240)) errors.push('bad-bpm');
  if (raw.partKind !== 'chromatic' && raw.partKind !== 'drum') errors.push('bad-partKind');
  if (!isInt(raw.bars, 1, 32)) errors.push('bad-bars'); if (raw.ppq !== 96 && raw.ppq !== 480) errors.push('bad-ppq');
  if (!Array.isArray(raw.notes) || raw.notes.length > 4096) errors.push('bad-notes');
  const notes: AbdSeqNote[] = [];
  if (Array.isArray(raw.notes)) {
    raw.notes.forEach((n, i) => {
      if (!isObj(n) || !isInt(n.midiNote, 0, 127) || !isInt(n.startTick, 0, 1e9) || !isInt(n.durationTicks, 1, 1e9) || !isInt(n.velocity, 1, 127)) {
        errors.push(`bad-note-${i}`); return;
      }
      notes.push({ midiNote: n.midiNote, startTick: n.startTick, durationTicks: n.durationTicks, velocity: n.velocity });
    });
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true, errors,
    payload: {
      formatId: 'abdseq', version: 1, name, bpm: raw.bpm as number, partKind: raw.partKind as PartKind,
      bars: raw.bars as number, ppq: raw.ppq as 96 | 480, notes,
      ...(typeof raw.savedAt === 'string' ? { savedAt: raw.savedAt } : {}),
    },
  };
}

export function parseSequenceJson(json: string): ValidationResult {
  try { return validateSequencePayload(JSON.parse(json)); }
  catch { return { ok: false, errors: ['invalid-json'] }; }
}

export function filterSequences(entries: readonly SequenceEntry[], filter: SequenceFilter = {}): SequenceEntry[] {
  const q = text(filter.query).trim().toLowerCase();
  return entries.filter((e) => (!filter.partKind || e.partKind === filter.partKind)
    && (!q || e.name.toLowerCase().includes(q) || e.slug.includes(q)));
}

export function sortSequences(entries: readonly SequenceEntry[], sortBy: SequenceSort = 'date',
  dir: 'asc' | 'desc' = sortBy === 'date' ? 'desc' : 'asc'): SequenceEntry[] {
  const sign = dir === 'desc' ? -1 : 1;
  return [...entries].sort((a, b) => {
    const d = sortBy === 'bpm' ? a.bpm - b.bpm : sortBy === 'name' ? a.name.localeCompare(b.name) : a.modifiedAt - b.modifiedAt;
    return (d || a.slug.localeCompare(b.slug)) * sign;
  });
}

/** In-memory adapter; deterministic default for headless tests. */
export function createMemorySequenceFs(files: Record<string, string> = {}): SequenceFsAdapter {
  const store = new Map(Object.entries(files).map(([k, v]) => [k, { text: v, modifiedAt: Date.now() }]));
  return {
    async list() { return [...store.keys()].sort(); },
    async read(file) { const e = store.get(file); if (!e) throw new Error(`missing:${file}`); return e.text; },
    async write(file, value) { store.set(file, { text: value, modifiedAt: Date.now() }); },
  };
}

/** Storage-backed adapter (browser or test double), one JSON string per file. */
export function createStorageSequenceFs(
  storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>,
  prefix = 'abdmcx0x.seq.',
): SequenceFsAdapter {
  const keyOf = (file: string) => prefix + file;
  return {
    async list() {
      const out: string[] = [];
      for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k?.startsWith(prefix)) out.push(k.slice(prefix.length)); }
      return out.sort();
    },
    async read(file) { return storage.getItem(keyOf(file)) ?? ''; },
    async write(file, value) { storage.setItem(keyOf(file), value); },
  };
}

/** Pure facade: IO only through the injected adapter, never through DOM globals. */
export class McxSequenceLibrary {
  private entries: SequenceEntry[] = [];
  constructor(private readonly adapter: SequenceFsAdapter, private readonly dir = 'Sequences') {}

  get cached(): readonly SequenceEntry[] { return this.entries; }

  async refresh(): Promise<SequenceEntry[]> {
    const out: SequenceEntry[] = [];
    for (const file of await this.adapter.list(this.dir)) {
      if (!file.toLowerCase().endsWith('.abdseq')) continue;
      try {
        const raw = await this.adapter.read(file);
        const parsed = parseSequenceJson(raw);
        const p = parsed.payload;
        if (!parsed.ok || !p) continue;
        out.push({
          file, slug: file.replace(/\.abdseq$/i, '').split(/[\\/]/).pop() ?? file,
          name: p.name, bpm: p.bpm, partKind: p.partKind, savedAt: p.savedAt ?? '',
          modifiedAt: p.savedAt ? (Date.parse(p.savedAt) || 0) : 0, size: raw.length,
        });
      } catch { /* unreadable files are skipped */ }
    }
    this.entries = out;
    return out;
  }

  list(filter: SequenceFilter = {}): SequenceEntry[] {
    return sortSequences(filterSequences(this.entries, filter), filter.sortBy, filter.dir);
  }

  async save(payload: AbdSeqPayload, preferredName?: string): Promise<{ ok: boolean; errors: string[]; file?: string }> {
    const checked = validateSequencePayload(payload);
    if (!checked.ok || !checked.payload) return { ok: false, errors: checked.errors };
    const slug = uniqueSequenceSlug(preferredName ?? checked.payload.name, this.entries.map((e) => e.slug));
    const file = `${this.dir}/${slug}.abdseq`;
    await this.adapter.write(file, JSON.stringify(checked.payload, null, 2));
    await this.refresh();
    return { ok: true, errors: [], file };
  }

  async load(file: string): Promise<AbdSeqPayload | null> {
    try {
      const parsed = parseSequenceJson(await this.adapter.read(file));
      return parsed.ok ? parsed.payload ?? null : null;
    } catch { return null; }
  }
}

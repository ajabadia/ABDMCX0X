/** ABDMCX0X — Undo/Redo + Compare A/B over serialized project snapshots. */

export interface HistoryOptions<T> {
  maxSteps?: number; coalesceMs?: number;
  serialize?: (s: T) => string; deserialize?: (raw: string) => T;
}

export interface HistoryStatus {
  canUndo: boolean; canRedo: boolean; undoCount: number; redoCount: number;
  compareMode: 'A' | 'B'; hasBaseline: boolean; undoLabel?: string; redoLabel?: string;
}

export interface HistoryResult<T> { state: T; label: string }
export interface CompareResult<T> { mode: 'A' | 'B'; state: T }

type Entry = { raw: string; label: string };
type Meta = { coalesceKey?: string; nowMs?: number };

/** Keeps state as strings so callers can pass frozen objects or JSON snapshots. */
export class McxHistoryManager<T = unknown> {
  private readonly maxSteps: number;
  private readonly coalesceMs: number;
  private readonly serialize: (s: T) => string;
  private readonly deserialize: (raw: string) => T;

  private undoStack: Entry[] = []; private redoStack: Entry[] = [];
  private current: Entry = { raw: '', label: 'initial' }; private ready = false;
  private baselineRaw: string | null = null; private compareA: string | null = null;
  private compareB: string | null = null; private compareMode: 'A' | 'B' = 'A';
  private lastKey: string | null = null; private lastTime = Number.NEGATIVE_INFINITY;

  constructor(opts: HistoryOptions<T> = {}) {
    this.maxSteps = Math.max(0, Math.floor(opts.maxSteps ?? 40));
    this.coalesceMs = Math.max(0, opts.coalesceMs ?? 350);
    this.serialize = opts.serialize ?? ((s: T) => JSON.stringify(s));
    this.deserialize = opts.deserialize ?? ((raw: string) => JSON.parse(raw) as T);
  }

  /** Resets both stacks; keeps the first baseline for Compare. */
  init(initialState: T): void {
    const raw = this.serialize(initialState);
    this.undoStack = [];
    this.redoStack = [];
    this.current = { raw, label: 'initial' };
    this.ready = true;
    this.resetCoalescing();
    if (this.baselineRaw === null) this.baselineRaw = raw;
    this.compareA = this.baselineRaw;
    this.compareB = null;
    this.compareMode = 'A';
  }

  /** Records a change; same-drag updates replace the current step. */
  push(nextState: T, label = 'change', meta?: Meta): boolean {
    if (!this.ready) {
      this.init(nextState);
      return true;
    }
    const raw = this.serialize(nextState);
    if (raw === this.current.raw) return false;

    const now = meta?.nowMs ?? Date.now();
    const key = meta?.coalesceKey ?? null;
    const coalesce = key !== null && key === this.lastKey
      && now - this.lastTime <= this.coalesceMs
      && this.undoStack.length > 0;

    if (coalesce) {
      this.current = { raw, label };
    } else {
      this.undoStack.push(this.current);
      this.current = { raw, label };
      this.trim();
    }
    this.redoStack = [];
    this.lastKey = key;
    this.lastTime = now;
    if (this.baselineRaw !== null) this.setSlot(this.compareMode, raw);
    return true;
  }

  undo(): HistoryResult<T> | null {
    if (!this.undoStack.length) return null;
    const undone = this.current;
    this.current = this.undoStack.pop() as Entry;
    this.redoStack.push(undone);
    this.resetCoalescing();
    return { state: this.deserialize(this.current.raw), label: undone.label };
  }

  redo(): HistoryResult<T> | null {
    if (!this.redoStack.length) return null;
    const redone = this.redoStack.pop() as Entry;
    this.undoStack.push(this.current);
    this.current = redone;
    this.trim();
    this.resetCoalescing();
    return { state: this.deserialize(this.current.raw), label: redone.label };
  }

  /** Re-anchors the A reference; both compare slots start from it. */
  captureCompareBaseline(state: T): void {
    const raw = this.serialize(state);
    this.baselineRaw = raw;
    this.compareA = raw;
    this.compareB = null;
    this.compareMode = 'A';
    this.resetCoalescing();
  }

  /** Flips A/B, persisting edits made in the slot being left. */
  toggleCompare(currentState: T): CompareResult<T> | null {
    if (this.baselineRaw === null) return null;
    const raw = this.serialize(currentState);
    let next: 'A' | 'B';
    if (this.compareMode === 'A') {
      this.compareA = raw;
      this.compareB ??= raw;
      next = 'B';
    } else {
      this.compareB = raw;
      this.compareA ??= this.baselineRaw;
      next = 'A';
    }
    this.compareMode = next;
    return { mode: next, state: this.deserialize(this.slot(next)) };
  }

  getStatus(): HistoryStatus {
    const undoLabel = this.undoStack.length ? this.current.label : undefined;
    const redoLabel = this.redoStack.length ? this.redoStack[this.redoStack.length - 1].label : undefined;
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      compareMode: this.compareMode,
      hasBaseline: this.baselineRaw !== null,
      ...(undoLabel ? { undoLabel } : {}),
      ...(redoLabel ? { redoLabel } : {}),
    };
  }

  /** Drops history and compare edits; the baseline stays available. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.resetCoalescing();
    if (this.baselineRaw !== null) {
      this.current = { raw: this.baselineRaw, label: 'initial' };
      this.compareA = this.baselineRaw;
      this.compareB = null;
      this.compareMode = 'A';
    }
  }

  private setSlot(mode: 'A' | 'B', raw: string): void {
    if (mode === 'A') this.compareA = raw;
    else this.compareB = raw;
  }

  private slot(mode: 'A' | 'B'): string {
    if (mode === 'A') return this.compareA ?? this.baselineRaw ?? this.current.raw;
    return this.compareB ?? this.current.raw;
  }

  private resetCoalescing(): void {
    this.lastKey = null;
    this.lastTime = Number.NEGATIVE_INFINITY;
  }

  private trim(): void {
    while (this.undoStack.length > this.maxSteps) this.undoStack.shift();
  }
}

export function createHistoryManager<T = unknown>(opts: HistoryOptions<T> = {}): McxHistoryManager<T> {
  return new McxHistoryManager<T>(opts);
}

/** ABDMCX0X — pure printers: chord progression / arpeggio -> abd_pattern note events. */

export type ArpMode = 'up' | 'down' | 'updown' | 'chord';

export interface PrintedNote {
  tick: number; durationTicks: number; note: number; velocity: number; accent: boolean;
}
export interface ChordEvent { step?: number; tick?: number; notes: readonly number[]; velocity?: number }
export interface ChordPrintOptions {
  bars: number; ppq: number; stepDivisionTicks: number;
  events: readonly ChordEvent[]; gateRatio?: number; accentEvery?: number;
}
export type HeldNote = number | { note: number; velocity?: number };
export interface ArpPrintOptions {
  heldNotes: readonly HeldNote[]; mode: ArpMode; octaves?: number;
  stepTicks: number; bars: number; ppq: number; velocity?: number; accentVel?: number;
}

const ACCENT_VEL = 120;
const clampInt = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));
const clampMidi = (n: number): number => clampInt(n, 0, 127);
const clampVel = (v: number): number => clampInt(v, 1, 127);
const ppqOf = (ppq: number): number => clampInt(ppq, 96, 480);
const totalOf = (bars: number, ppq: number): number => clampInt(bars, 1, 32) * 4 * ppqOf(ppq);

/** Roland accent is encoded as velocity > 100. */
function makeNote(tick: number, durationTicks: number, note: number, velocity: number, accentVel = ACCENT_VEL): PrintedNote {
  const raw = clampVel(velocity);
  const vel = raw > 100 ? clampInt(accentVel, 101, 127) : raw;
  return { tick, durationTicks, note: clampMidi(note), velocity: vel, accent: vel > 100 };
}

function eventTick(event: ChordEvent, division: number): number {
  return clampInt(event.tick ?? (event.step ?? 0) * division, 0, Number.MAX_SAFE_INTEGER);
}

/** Prints chord events (step or tick addressed) as gated piano-roll notes. */
export function printChordProgressionToPattern(opts: ChordPrintOptions): PrintedNote[] {
  const total = totalOf(opts.bars, opts.ppq);
  const div = Math.max(1, clampInt(opts.stepDivisionTicks, 1, total));
  const gate = Math.max(0.05, Math.min(1, opts.gateRatio ?? 0.9));
  const accentEvery = Math.max(0, clampInt(opts.accentEvery ?? 0, 0, 128));
  const ordered = [...opts.events].sort((a, b) => eventTick(a, div) - eventTick(b, div));
  const notes: PrintedNote[] = [];
  ordered.forEach((event, i) => {
    const tick = Math.max(0, Math.min(total - 1, eventTick(event, div)));
    const durationTicks = Math.max(1, Math.min(total - tick, Math.round(div * gate)));
    const accented = accentEvery > 0 && (i + 1) % accentEvery === 0;
    const velocity = accented ? ACCENT_VEL : (event.velocity ?? 100);
    for (const note of event.notes) notes.push(makeNote(tick, durationTicks, note, velocity));
  });
  return notes.sort((a, b) => a.tick - b.tick || a.note - b.note);
}

type ArpStep = { note: number; velocity?: number };

/** Builds the note cycle; octave wraps are clamped and de-duplicated. */
function arpSequence(held: readonly HeldNote[], mode: ArpMode, octaves: number): ArpStep[] {
  const layers = Math.max(1, clampInt(octaves, 1, 8));
  const steps: ArpStep[] = [];
  for (const item of held) {
    const note = typeof item === 'number' ? item : item.note;
    const velocity = typeof item === 'number' ? undefined : item.velocity;
    for (let octave = 0; octave < layers; octave++) {
      const midi = clampMidi(note + octave * 12);
      if (!steps.some((s) => s.note === midi)) steps.push({ note: midi, velocity });
    }
  }
  const ascending = [...steps].sort((a, b) => a.note - b.note);
  if (mode === 'down') return ascending.reverse();
  if (mode === 'updown') return [...ascending, ...ascending.slice(1, -1).reverse()];
  return ascending;
}

/** Prints an arpeggio across `bars`; accents land on the first step of each bar. */
export function printArpPatternToPattern(opts: ArpPrintOptions): PrintedNote[] {
  const total = totalOf(opts.bars, opts.ppq);
  const stepTicks = Math.max(1, clampInt(opts.stepTicks, 1, total));
  const stepsPerBar = Math.max(1, Math.round((4 * ppqOf(opts.ppq)) / stepTicks));
  const sequence = arpSequence(opts.heldNotes, opts.mode, opts.octaves ?? 1);
  const accentVel = clampInt(opts.accentVel ?? ACCENT_VEL, 101, 127);
  const notes: PrintedNote[] = [];

  for (let tick = 0, i = 0; tick < total && sequence.length; tick += stepTicks, i++) {
    const durationTicks = Math.max(1, Math.min(stepTicks, total - tick));
    const accent = i % stepsPerBar === 0;
    const fallback = accent ? accentVel : clampVel(opts.velocity ?? 100);
    const emit = (step: ArpStep): void => {
      notes.push(makeNote(tick, durationTicks, step.note, accent ? accentVel : (step.velocity ?? fallback), accentVel));
    };
    if (opts.mode === 'chord') sequence.forEach(emit);
    else emit(sequence[i % sequence.length]);
  }
  return notes.sort((a, b) => a.tick - b.tick || a.note - b.note);
}

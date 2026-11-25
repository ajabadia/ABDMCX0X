/**
 * ABDMCX0X -- McxMidiExporter.ts
 * Pure TypeScript Standard MIDI File (SMF Type 1) exporter for Patterns & Song Arrangements.
 * Strict line limit: < 200 lines.
 */

import type { McxSongScenesStateDto } from '../bridge/McxSongBridge';
import { ensureMuteMask64, isPartMutedInMask64 } from '../ui/McxSongDrawerViews';
import type { McxPartUiState } from '../ui/McxMixerConsole';

export interface MidiTrackInput {
  name: string;
  channel1to16: number;
  notes: Array<{ midiNote: number; startTick: number; durationTicks: number; velocity: number }>;
}

function writeVarLen(val: number): number[] {
  let v = Math.max(0, Math.floor(val));
  const out = [v & 0x7F];
  while ((v >>= 7) > 0) out.unshift((v & 0x7F) | 0x80);
  return out;
}

function pushStr(arr: number[], s: string): void {
  for (let i = 0; i < s.length; i++) arr.push(s.charCodeAt(i) & 0x7F);
}

function pushU16(arr: number[], v: number): void { arr.push((v >> 8) & 0xFF, v & 0xFF); }
function pushU32(arr: number[], v: number): void { arr.push((v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF); }

function buildChunk(tag: string, body: number[]): number[] {
  const res: number[] = [];
  pushStr(res, tag); pushU32(res, body.length);
  for (let i = 0; i < body.length; i++) res.push(body[i]);
  return res;
}

export function encodeMidiFileType1(opts: { ppq?: number; bpm?: number; tracks: MidiTrackInput[] }): Uint8Array {
  const ppq = Math.max(24, Math.min(960, Math.round(opts.ppq || 96)));
  const bpm = Math.max(20, Math.min(300, Number(opts.bpm || 120)));
  const usPerBeat = Math.round(60_000_000 / bpm);

  const tempoBody = [
    0x00, 0xFF, 0x51, 0x03, (usPerBeat >> 16) & 0xFF, (usPerBeat >> 8) & 0xFF, usPerBeat & 0xFF,
    0x00, 0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08,
    0x00, 0xFF, 0x2F, 0x00,
  ];
  const chunks: number[][] = [buildChunk('MTrk', tempoBody)];

  for (const tr of opts.tracks) {
    const ch = Math.max(0, Math.min(15, Math.round((tr.channel1to16 || 1) - 1)));
    const events: Array<{ tick: number; kind: number; note: number; vel: number }> = [];
    for (const n of tr.notes) {
      const start = Math.max(0, Math.round(n.startTick));
      const dur = Math.max(1, Math.round(n.durationTicks || 24));
      const midi = Math.max(0, Math.min(127, Math.round(n.midiNote)));
      const vel = Math.max(1, Math.min(127, Math.round(n.velocity || 100)));
      events.push({ tick: start, kind: 1, note: midi, vel });
      events.push({ tick: start + dur, kind: 0, note: midi, vel: 0 });
    }
    events.sort((a, b) => (a.tick !== b.tick ? a.tick - b.tick : a.kind - b.kind));

    const body: number[] = [0x00, 0xFF, 0x03, Math.min(64, tr.name.length)];
    for (let i = 0; i < Math.min(64, tr.name.length); i++) body.push(tr.name.charCodeAt(i) & 0x7F);
    let prevTick = 0;
    for (const ev of events) {
      const delta = Math.max(0, ev.tick - prevTick);
      prevTick = ev.tick;
      body.push(...writeVarLen(delta));
      body.push((ev.kind === 1 ? 0x90 : 0x80) | ch, ev.note, ev.vel);
    }
    body.push(0x00, 0xFF, 0x2F, 0x00);
    chunks.push(buildChunk('MTrk', body));
  }

  const hdr: number[] = [];
  pushStr(hdr, 'MThd'); pushU32(hdr, 6); pushU16(hdr, 1); pushU16(hdr, chunks.length); pushU16(hdr, ppq);
  const totalLen = hdr.length + chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(totalLen);
  out.set(hdr, 0);
  let off = hdr.length;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

export function exportPatternSequenceToMidi(partIdx: number, name: string, ch: number, seq: any, bpm = 120): Uint8Array {
  return encodeMidiFileType1({
    ppq: seq?.ppq || 96,
    bpm,
    tracks: [{ name: `P${String(partIdx + 1).padStart(2, '0')} ${name || 'Part'}`, channel1to16: ch || 1, notes: seq?.notes || [] }],
  });
}

export function exportProjectToMidi(
  parts: McxPartUiState[],
  songState: McxSongScenesStateDto | null,
  bpm: number,
  scope: 'pattern' | 'song',
  focusedPart?: number,
): Uint8Array {
  const ppq = 96;
  const ticksPerBar = ppq * 4;
  if (scope === 'pattern' || !songState || !songState.blocks.length) {
    const tracks: MidiTrackInput[] = [];
    parts.forEach((ps, idx) => {
      if (focusedPart !== undefined && idx !== focusedPart) return;
      if (ps.enabled === false || !ps.sequence?.notes?.length) return;
      tracks.push({ name: `P${String(idx + 1).padStart(2, '0')} ${ps.name || 'Part'}`, channel1to16: ps.midiChannel || 1, notes: ps.sequence.notes });
    });
    return encodeMidiFileType1({ ppq, bpm, tracks });
  }

  const tracksByPart = new Map<number, MidiTrackInput>();
  let barCursor = 0;
  for (const blk of songState.blocks) {
    const scene = songState.scenes[blk.sceneIndex];
    const m64 = scene ? ensureMuteMask64({ ...scene }) : [0, 0, 0, 0];
    const blkTranspose = Number(blk.transposeOffset || 0) + Number(scene?.transpose || 0);
    const blkBars = Math.max(1, Number(blk.bars || 4));
    for (let b = 0; b < blkBars; b++) {
      const barStart = (barCursor + b) * ticksPerBar;
      parts.forEach((ps, idx) => {
        if (ps.enabled === false || isPartMutedInMask64(m64, idx)) return;
        const notes = ps.sequence?.notes || [];
        if (!notes.length) return;
        const patTicks = Math.max(ticksPerBar, (ps.sequence?.bars || 1) * ticksPerBar);
        const trSemi = (ps.kind === 'chromatic' && ps.followTranspose !== false) ? blkTranspose : 0;
        let entry = tracksByPart.get(idx);
        if (!entry) {
          entry = { name: `P${String(idx + 1).padStart(2, '0')} ${ps.name || 'Part'}`, channel1to16: ps.midiChannel || 1, notes: [] };
          tracksByPart.set(idx, entry);
        }
        const sliceStart = (b * ticksPerBar) % patTicks;
        for (const n of notes) {
          if (n.startTick >= sliceStart && n.startTick < sliceStart + ticksPerBar) {
            entry.notes.push({
              midiNote: Math.max(0, Math.min(127, n.midiNote + trSemi)),
              startTick: barStart + (n.startTick - sliceStart),
              durationTicks: n.durationTicks,
              velocity: n.velocity,
            });
          }
        }
      });
    }
    barCursor += blkBars;
  }
  return encodeMidiFileType1({ ppq, bpm, tracks: Array.from(tracksByPart.values()) });
}

export function makeMidiDataUrl(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:audio/midi;base64,${btoa(bin)}`;
}

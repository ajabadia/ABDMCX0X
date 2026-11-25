/**
 * ABDMCX0X -- McxStepStripTrRec.ts
 * TR-REC Step Sequencer logic distinguishing Drum Mode vs Chromatic/Melodic Mode.
 * Strict line limit: < 200 lines. 100% tokenized.
 */

import { getDrumInstrument, midiToNoteName, type StepStripMode } from './McxStepStripHelpers';
import type { McxPartUiState } from './McxPartState';

export interface StepNote {
  midiNote: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
  slide?: boolean;
}

export function getTicksPerStep(ppq = 96): number {
  return Math.max(1, Math.round((ppq * 4) / 16));
}

export function findNotesAtStep(notes: StepNote[] | undefined, stepIdx: number, ticksPerStep: number): StepNote[] {
  if (!Array.isArray(notes)) return [];
  return notes.filter((n) => Math.floor((n.startTick ?? 0) / ticksPerStep) % 16 === stepIdx);
}

export function buildTrRecPadState(
  mode: StepStripMode,
  stepIdx: number,
  part: McxPartUiState | undefined,
  selectedDrumNote: number,
  _activePitch: number,
) {
  const isDrum = part?.kind === 'drum_map';
  const ppq = part?.sequence?.ppq ?? 96;
  const tps = getTicksPerStep(ppq);
  const notesOnStep = findNotesAtStep(part?.sequence?.notes as StepNote[] | undefined, stepIdx, tps);

  if (isDrum) {
    const drumHit = notesOnStep.find((n) => n.midiNote === selectedDrumNote);
    const drumCode = getDrumInstrument(selectedDrumNote).code;
    const isHit = Boolean(drumHit);
    const isAcc = Boolean(drumHit && (drumHit.velocity ?? 100) >= 112);
    const hasOtherHits = notesOnStep.length > 0 && !isHit;

    if (mode === 'step-accent') {
      return {
        disabled: false, bankColor: null, tooltip: `Step ${stepIdx + 1} Accent`,
        active: isAcc, muted: !isAcc, solo: false,
        legend: String(stepIdx + 1), subval: isAcc ? 'ACC' : (isHit ? drumCode : '---'),
      };
    }
    if (mode === 'step-slide') {
      const isSld = Boolean(drumHit?.slide);
      return {
        disabled: false, bankColor: null, tooltip: `Step ${stepIdx + 1} Slide`,
        active: isSld, muted: !isSld, solo: false,
        legend: String(stepIdx + 1), subval: isSld ? 'SLD' : '---',
      };
    }
    return {
      disabled: false, bankColor: null, tooltip: `Step ${stepIdx + 1}: ${isHit ? drumCode : 'Empty'}`,
      active: isHit, muted: !isHit, solo: false,
      legend: String(stepIdx + 1), subval: isHit ? (isAcc ? 'ACC' : drumCode) : (hasOtherHits ? '·' : '---'),
    };
  }

  // Modo Cromático / Melódico
  const firstNote = notesOnStep[0];
  const hasNote = Boolean(firstNote);
  const isAcc = Boolean(firstNote && (firstNote.velocity ?? 100) >= 112);
  const isSld = Boolean(firstNote?.slide);
  const noteName = hasNote ? midiToNoteName(firstNote.midiNote) : '---';

  if (mode === 'step-accent') {
    return {
      disabled: false, bankColor: null, tooltip: `Step ${stepIdx + 1} Accent`,
      active: isAcc, muted: !isAcc, solo: false,
      legend: String(stepIdx + 1), subval: isAcc ? 'ACC' : noteName,
    };
  }
  if (mode === 'step-slide') {
    return {
      disabled: false, bankColor: null, tooltip: `Step ${stepIdx + 1} Portamento`,
      active: isSld, muted: !isSld, solo: false,
      legend: String(stepIdx + 1), subval: isSld ? 'SLD' : noteName,
    };
  }
  return {
    disabled: false, bankColor: null, tooltip: `Step ${stepIdx + 1}: ${noteName}`,
    active: hasNote, muted: !hasNote, solo: false,
    legend: String(stepIdx + 1), subval: notesOnStep.length > 1 ? `${noteName}+` : noteName,
  };
}

export function toggleTrRecStep(
  part: McxPartUiState,
  partIdx: number,
  stepIdx: number,
  selectedDrumNote: number,
  activePitch: number,
  mode: StepStripMode,
): { seq: any; notice: string; auditionNote: number | null; auditionVel: number } {
  const isDrum = part.kind === 'drum_map';
  const ppq = part.sequence?.ppq ?? 96;
  const bars = part.sequence?.bars ?? 1;
  const tps = getTicksPerStep(ppq);
  const targetTick = stepIdx * tps;
  const currentNotes: StepNote[] = Array.isArray(part.sequence?.notes) ? [...(part.sequence.notes as StepNote[])] : [];

  if (mode === 'step-accent') {
    return toggleAccentOnStep(part, partIdx, stepIdx, selectedDrumNote, currentNotes, tps, isDrum);
  }
  if (mode === 'step-slide') {
    return toggleSlideOnStep(part, partIdx, stepIdx, currentNotes, tps);
  }

  if (isDrum) {
    const existingIdx = currentNotes.findIndex((n) => Math.floor((n.startTick ?? 0) / tps) % 16 === stepIdx && n.midiNote === selectedDrumNote);
    const drum = getDrumInstrument(selectedDrumNote);
    if (existingIdx >= 0) {
      currentNotes.splice(existingIdx, 1);
      const seq = { bars, ppq, mode: 'drum', notes: currentNotes, motion: part.sequence?.motion || {} };
      return { seq, notice: `P${partIdx + 1} [TR-REC] ${drum.name} STEP ${stepIdx + 1}: OFF`, auditionNote: null, auditionVel: 0 };
    }
    currentNotes.push({ midiNote: selectedDrumNote, startTick: targetTick, durationTicks: tps, velocity: 100 });
    const seq = { bars, ppq, mode: 'drum', notes: currentNotes, motion: part.sequence?.motion || {} };
    return { seq, notice: `P${partIdx + 1} [TR-REC] ${drum.name} STEP ${stepIdx + 1}: ON`, auditionNote: selectedDrumNote, auditionVel: 100 };
  }

  // Modo Cromático
  const existingIndices = currentNotes
    .map((n, idx) => (Math.floor((n.startTick ?? 0) / tps) % 16 === stepIdx ? idx : -1))
    .filter((idx) => idx >= 0);

  if (existingIndices.length > 0) {
    // Elimina notas existentes en el paso
    for (let i = existingIndices.length - 1; i >= 0; i--) {
      currentNotes.splice(existingIndices[i], 1);
    }
    const seq = { bars, ppq, mode: 'chromatic', notes: currentNotes, motion: part.sequence?.motion || {} };
    return { seq, notice: `P${partIdx + 1} [TR-REC] STEP ${stepIdx + 1}: OFF`, auditionNote: null, auditionVel: 0 };
  }

  // Agrega nueva nota cromática
  currentNotes.push({ midiNote: activePitch, startTick: targetTick, durationTicks: tps, velocity: 100 });
  const seq = { bars, ppq, mode: 'chromatic', notes: currentNotes, motion: part.sequence?.motion || {} };
  return {
    seq,
    notice: `P${partIdx + 1} [TR-REC] STEP ${stepIdx + 1}: ${midiToNoteName(activePitch)} ON`,
    auditionNote: activePitch,
    auditionVel: 100,
  };
}

function toggleAccentOnStep(
  part: McxPartUiState,
  partIdx: number,
  stepIdx: number,
  selectedDrumNote: number,
  notes: StepNote[],
  tps: number,
  isDrum: boolean,
) {
  const targetNotes = notes.filter((n) =>
    Math.floor((n.startTick ?? 0) / tps) % 16 === stepIdx && (!isDrum || n.midiNote === selectedDrumNote)
  );
  if (targetNotes.length === 0) {
    return { seq: part.sequence, notice: `STEP ${stepIdx + 1}: SIN NOTA PARA ACENTO`, auditionNote: null, auditionVel: 0 };
  }
  const isAcc = targetNotes.every((n) => (n.velocity ?? 100) >= 112);
  const nextVel = isAcc ? 100 : 127;
  targetNotes.forEach((n) => { n.velocity = nextVel; });
  const seq = { ...part.sequence, notes };
  return {
    seq,
    notice: `P${partIdx + 1} STEP ${stepIdx + 1} ACCENT: ${isAcc ? 'OFF (VEL 100)' : 'ON (VEL 127)'}`,
    auditionNote: targetNotes[0].midiNote,
    auditionVel: nextVel,
  };
}

function toggleSlideOnStep(
  part: McxPartUiState,
  partIdx: number,
  stepIdx: number,
  notes: StepNote[],
  tps: number,
) {
  const targetNotes = notes.filter((n) => Math.floor((n.startTick ?? 0) / tps) % 16 === stepIdx);
  if (targetNotes.length === 0) {
    return { seq: part.sequence, notice: `STEP ${stepIdx + 1}: SIN NOTA PARA SLIDE`, auditionNote: null, auditionVel: 0 };
  }
  const nextSlide = !targetNotes[0].slide;
  targetNotes.forEach((n) => { n.slide = nextSlide; });
  const seq = { ...part.sequence, notes };
  return {
    seq,
    notice: `P${partIdx + 1} STEP ${stepIdx + 1} SLIDE: ${nextSlide ? 'ON' : 'OFF'}`,
    auditionNote: targetNotes[0].midiNote,
    auditionVel: targetNotes[0].velocity || 100,
  };
}

import { describe, expect, it } from 'vitest';
import { createDefaultPartState } from '../ui/McxPartState';
import { encodeMidiFileType1, exportProjectToMidi, makeMidiDataUrl } from './McxMidiExporter';
import { encodeStereoWavPcm16 } from './McxWavExporter';

describe('McxMidiExporter & McxWavExporter', () => {
  it('encodes valid SMF Type 1 header and tracks with tempo meta event', () => {
    const mid = encodeMidiFileType1({
      ppq: 96,
      bpm: 120,
      tracks: [
        { name: 'Lead', channel1to16: 2, notes: [{ midiNote: 60, startTick: 0, durationTicks: 48, velocity: 100 }] },
      ],
    });
    expect(String.fromCharCode(...mid.slice(0, 4))).toBe('MThd');
    expect(mid[9]).toBe(1); // format 1
    expect(mid[11]).toBe(2); // 2 tracks (tempo + track 1)
    expect(mid.length).toBeGreaterThan(40);
    expect(makeMidiDataUrl(mid).startsWith('data:audio/midi;base64,')).toBe(true);
  });

  it('unrolls Song Mode blocks respecting Scene mutes and chromatic transpose', () => {
    const parts = Array.from({ length: 4 }, (_, i) => createDefaultPartState(i));
    parts[0].kind = 'chromatic'; parts[0].followTranspose = true; parts[0].enabled = true;
    parts[0].sequence = { bars: 1, ppq: 96, notes: [{ midiNote: 60, startTick: 0, durationTicks: 24, velocity: 100 }] };
    parts[1].enabled = true;
    parts[1].sequence = { bars: 1, ppq: 96, notes: [{ midiNote: 36, startTick: 0, durationTicks: 24, velocity: 110 }] };

    const songState = {
      songMode: true, songLoop: false, activeScene: 0, queuedScene: -1, songBlockIdx: 0, songBarInBlock: 0,
      scenes: [
        { index: 0, name: 'S1', muteMask: 0, muteMask64: [0, 0, 0, 0] as [number, number, number, number], transpose: 2 },
        { index: 1, name: 'S2', muteMask: 1, muteMask64: [1, 0, 0, 0] as [number, number, number, number], transpose: 0 },
      ],
      blocks: [
        { sceneIndex: 0, bars: 1, transposeOffset: 3 }, // part 0 transposed +5 => MIDI 65
        { sceneIndex: 1, bars: 1, transposeOffset: 0 }, // part 0 muted in scene 1
      ],
    };

    const bytes = exportProjectToMidi(parts, songState, 128, 'song');
    expect(bytes[11]).toBe(3); // tempo + 2 part tracks
    expect(bytes.includes(65)).toBe(true);
  });

  it('encodes stereo 16-bit PCM WAV with clamped samples', () => {
    const L = new Float32Array([0, 0.5, 2.0, -2.0]);
    const R = new Float32Array([0, -0.5, 1.0, -1.0]);
    const wav = encodeStereoWavPcm16(L, R, 48000);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(wav.length).toBe(44 + 16);
    const dv = new DataView(wav.buffer);
    expect(dv.getUint32(24, true)).toBe(48000);
    expect(dv.getInt16(44 + 8, true)).toBe(32767); // clamped +2.0
    expect(dv.getInt16(44 + 12, true)).toBe(-32767); // clamped -2.0
  });
});

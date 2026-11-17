/**
 * ABDMCX0X -- McxDrumPads.ts
 * 16-Pad interactive Groovebox Drum Rack triggering Part 10 (Ch 10) with velocity sensing.
 */

import type { McxHostBridge } from '../bridge/McxHostBridge';

interface DrumPadDef {
  note: number;
  code: string;
  name: string;
}

const GROOVEBOX_PADS: DrumPadDef[] = [
  { note: 36, code: 'BD1', name: 'Kick 909' },
  { note: 37, code: 'RIM', name: 'Rim Shot' },
  { note: 38, code: 'SD1', name: 'Snare 1' },
  { note: 39, code: 'CLP', name: 'Hand Clap' },
  { note: 40, code: 'SD2', name: 'Snare 2' },
  { note: 41, code: 'LTM', name: 'Low Tom' },
  { note: 42, code: 'CHH', name: 'Closed HH' },
  { note: 45, code: 'MTM', name: 'Mid Tom' },
  { note: 44, code: 'PHH', name: 'Pedal HH' },
  { note: 48, code: 'HTM', name: 'High Tom' },
  { note: 46, code: 'OHH', name: 'Open HH' },
  { note: 49, code: 'CRS', name: 'Crash' },
  { note: 51, code: 'RDE', name: 'Ride' },
  { note: 56, code: 'CWB', name: 'Cowbell' },
  { note: 54, code: 'TMB', name: 'Tambourine' },
  { note: 60, code: 'PRC', name: 'Hi Bongo' },
];

export function renderDrumPads(
  container: HTMLElement,
  bridge: McxHostBridge,
  getDrumPartIndex: () => number,
  onTrigger?: (label: string, note: number, velocity: number, partIdx: number) => void,
): void {
  container.innerHTML = '';
  for (const pad of GROOVEBOX_PADS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mcx-drum-pad';
    btn.innerHTML = `
      <span class="mcx-pad-led"></span>
      <span class="mcx-pad-code">${pad.code}</span>
      <span class="mcx-pad-name">${pad.name}</span>
      <span class="mcx-pad-note">N${pad.note}</span>
    `;

    let activePart = 9;
    btn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      activePart = getDrumPartIndex();
      const rect = btn.getBoundingClientRect();
      const relY = Math.max(0.25, Math.min(1.0, (ev.clientY - rect.top) / rect.height));
      const vel = Math.round(relY * 100) / 100;
      btn.classList.add('is-hit');
      bridge.noteOn(activePart, pad.note, vel);
      onTrigger?.(`${pad.code} ${pad.name}`, pad.note, vel, activePart);
    });

    const release = () => {
      if (!btn.classList.contains('is-hit')) return;
      btn.classList.remove('is-hit');
      bridge.noteOff(activePart, pad.note);
    };

    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    container.appendChild(btn);
  }
}

/**
 * ABDMCX0X -- McxToneDrawerKnobs.ts
 * Manages the canonical collection of 17 rotary Knobs mounted in McxToneDrawer (Mix + MIDI FX tabs).
 * Aligned with ABDAxionikVS: size 38px, bipolar center ticks, zero-allocation updates.
 * Strict line limit: < 200 lines.
 */

import { Knob } from '@abdsynths/shared/components';
import type { McxParamKey } from '../bridge/McxHostBridge';
import type { McxPartUiState } from './McxMixerConsole';

export interface KnobDef {
  param: McxParamKey; min: number; max: number; def: number; bipolar: boolean; fmt: (v: number) => string;
}

const fmtPctOffset = (v: number) => (Math.abs(v) < 0.01 ? '0%' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`);
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;

export const KNOB_DEFS: KnobDef[] = [
  // Channel Mix Tab (Pitch, EQ 3-Band, Drive, Sends A..D, Pan, Level)
  { param: 'pitchCoarse', min: -24, max: 24, def: 0, bipolar: true, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} st` },
  { param: 'pitchFine', min: -50, max: 50, def: 0, bipolar: true, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct` },
  { param: 'eqLowGain', min: -12, max: 12, def: 0, bipolar: true, fmt: fmtDb },
  { param: 'eqMidGain', min: -12, max: 12, def: 0, bipolar: true, fmt: fmtDb },
  { param: 'eqHighGain', min: -12, max: 12, def: 0, bipolar: true, fmt: fmtDb },
  { param: 'driveAmount', min: 0, max: 1, def: 0, bipolar: false, fmt: (v) => (v < 0.005 ? 'OFF' : fmtPct(v)) },
  { param: 'reverbSend', min: 0, max: 1, def: 0.28, bipolar: false, fmt: fmtPct },
  { param: 'chorusSend', min: 0, max: 1, def: 0.20, bipolar: false, fmt: fmtPct },
  { param: 'delaySend', min: 0, max: 1, def: 0, bipolar: false, fmt: fmtPct },
  { param: 'auxSend', min: 0, max: 1, def: 0, bipolar: false, fmt: fmtPct },
  { param: 'partPan', min: -1, max: 1, def: 0, bipolar: true, fmt: (v) => (Math.abs(v) < 0.03 ? 'C' : v < 0 ? `L${Math.round(-v * 64)}` : `R${Math.round(v * 63)}`) },
  { param: 'partLevel', min: 0, max: 1, def: 0.85, bipolar: false, fmt: fmtPct },
  // MIDI / Macro Tab (Non-destructive semantic offsets)
  { param: 'cutoffOffset', min: -1, max: 1, def: 0, bipolar: true, fmt: fmtPctOffset },
  { param: 'resonanceOffset', min: -1, max: 1, def: 0, bipolar: true, fmt: fmtPctOffset },
  { param: 'envAttackOffset', min: -1, max: 1, def: 0, bipolar: true, fmt: fmtPctOffset },
  { param: 'envReleaseOffset', min: -1, max: 1, def: 0, bipolar: true, fmt: fmtPctOffset },
  { param: 'vibratoOffset', min: -1, max: 1, def: 0, bipolar: true, fmt: fmtPctOffset },
];

export interface KnobItem {
  def: KnobDef; knob: Knob; numEl: HTMLElement | null;
}

export class McxToneDrawerKnobsManager {
  private items = new Map<McxParamKey, KnobItem>();

  public mount(rootEl: HTMLElement, onParamChange: (p: McxParamKey, val: number, fmtTxt: string) => void): void {
    this.destroy();
    for (const d of KNOB_DEFS) {
      const mount = rootEl.querySelector(`#knob-${d.param}`) as HTMLElement | null;
      if (!mount) continue;
      const numEl = rootEl.querySelector(`#val-${d.param}`) as HTMLElement | null;
      const knob = new Knob(mount, {
        size: 38, value: (d.def - d.min) / (d.max - d.min), bipolar: d.bipolar, skin: 'ms2000',
        onChange: (normVal: number) => {
          const raw = d.min + normVal * (d.max - d.min);
          const txt = d.fmt(raw);
          if (numEl) numEl.textContent = txt;
          onParamChange(d.param, raw, txt);
        },
      });
      this.items.set(d.param, { def: d, knob, numEl });
    }
  }

  public syncValues(ps: McxPartUiState): void {
    for (const [key, item] of this.items.entries()) {
      const raw = (ps as unknown as Record<string, number | undefined>)[key] ?? item.def.def;
      const norm = Math.max(0, Math.min(1, (raw - item.def.min) / (item.def.max - item.def.min)));
      item.knob.setValue(norm);
      if (item.numEl) item.numEl.textContent = item.def.fmt(raw);
    }
  }

  public updateSingle(param: McxParamKey, rawVal: number): void {
    const item = this.items.get(param);
    if (!item) return;
    const norm = Math.max(0, Math.min(1, (rawVal - item.def.min) / (item.def.max - item.def.min)));
    item.knob.setValue(norm);
    if (item.numEl) item.numEl.textContent = item.def.fmt(rawVal);
  }

  public destroy(): void {
    for (const item of this.items.values()) item.knob.destroy();
    this.items.clear();
  }
}

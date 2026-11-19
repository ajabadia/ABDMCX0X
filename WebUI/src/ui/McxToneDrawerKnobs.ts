/**
 * ABDMCX0X -- McxToneDrawerKnobs.ts
 * Manages the canonical collection of 23 rotary Knobs in the Tone & FX Drawer.
 * Aligned with ABDAxionikVS: size 38px, bipolar center ticks, zero-allocation updates.
 * Strict line limit: < 200 lines.
 */

import { Knob } from '@abdsynths/shared/components';
import type { McxParamKey } from '../bridge/McxHostBridge';
import type { McxPartUiState } from './McxMixerConsole';

export interface KnobDef {
  param: McxParamKey;
  min: number;
  max: number;
  def: number;
  bipolar: boolean;
  fmt: (v: number) => string;
}

export const LFO_DIVISIONS = [
  '32/1', '16/1', '8/1', '4/1', '2/1', '1/1',
  '1/2D', '1/2', '1/4D', '1/4', '1/8D', '1/8',
  '1/8T', '1/16D', '1/16', '1/16T', '1/32', '1/64',
] as const;

export const KNOB_DEFS: KnobDef[] = [
  // Pitch & Vector
  { param: 'pitchCoarse', min: -24, max: 24, def: 0, bipolar: true, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} st` },
  { param: 'pitchFine', min: -50, max: 50, def: 0, bipolar: true, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct` },
  { param: 'portaTimeMs', min: 0, max: 500, def: 60, bipolar: false, fmt: (v) => `${Math.round(v)} ms` },
  { param: 'vectorX', min: -1, max: 1, def: 0, bipolar: true, fmt: (v) => v.toFixed(2) },
  { param: 'vectorY', min: -1, max: 1, def: 0, bipolar: true, fmt: (v) => v.toFixed(2) },

  // Dual LFO Modulators (LFO 1 & 2)
  { param: 'lfo1Rate', min: 0.05, max: 30, def: 2.4, bipolar: false, fmt: (v) => `${v.toFixed(2)} Hz` },
  { param: 'lfo1Delay', min: 0, max: 2000, def: 0, bipolar: false, fmt: (v) => `${Math.round(v)} ms` },
  { param: 'lfo1Depth', min: -1, max: 1, def: 0, bipolar: true, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` },
  { param: 'lfo2Rate', min: 0.05, max: 30, def: 1.2, bipolar: false, fmt: (v) => `${v.toFixed(2)} Hz` },
  { param: 'lfo2Delay', min: 0, max: 2000, def: 0, bipolar: false, fmt: (v) => `${Math.round(v)} ms` },
  { param: 'lfo2Depth', min: -1, max: 1, def: 0, bipolar: true, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` },

  // Dual Filters & Drive
  { param: 'filterCutoff', min: 0, max: 1, def: 0.72, bipolar: false, fmt: (v) => `${Math.round(20 * Math.pow(1000, v))} Hz` },
  { param: 'filterResonance', min: 0, max: 0.96, def: 0.18, bipolar: false, fmt: (v) => `${Math.round(v * 100)}%` },
  { param: 'filter2Cutoff', min: 0, max: 1, def: 0.85, bipolar: false, fmt: (v) => `${Math.round(20 * Math.pow(1000, v))} Hz` },
  { param: 'filter2Resonance', min: 0, max: 0.96, def: 0.10, bipolar: false, fmt: (v) => `${Math.round(v * 100)}%` },
  { param: 'driveAmount', min: 0, max: 1, def: 0, bipolar: false, fmt: (v) => (v < 0.005 ? 'OFF' : `${Math.round(v * 100)}%`) },

  // Amplitude VCA Envelope
  { param: 'ampAttack', min: 0, max: 1, def: 0.04, bipolar: false, fmt: (v) => `${Math.round(0.5 + v * v * 2500)} ms` },
  { param: 'ampDecay', min: 0, max: 1, def: 0.25, bipolar: false, fmt: (v) => `${Math.round(10 + v * 4000)} ms` },
  { param: 'ampSustain', min: 0, max: 1, def: 0.75, bipolar: false, fmt: (v) => `${Math.round(v * 100)}%` },
  { param: 'ampRelease', min: 0, max: 1, def: 0.18, bipolar: false, fmt: (v) => `${Math.round(10 + v * 5000)} ms` },

  // Channel Strip: EQ 3-Band, Pan, Level
  { param: 'eqLowGain', min: -12, max: 12, def: 0, bipolar: true, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB` },
  { param: 'eqMidGain', min: -12, max: 12, def: 0, bipolar: true, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB` },
  { param: 'eqHighGain', min: -12, max: 12, def: 0, bipolar: true, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB` },
  { param: 'partPan', min: -1, max: 1, def: 0, bipolar: true, fmt: (v) => (Math.abs(v) < 0.03 ? 'C' : v < 0 ? `L${Math.round(-v * 64)}` : `R${Math.round(v * 63)}`) },
  { param: 'partLevel', min: 0, max: 1, def: 0.85, bipolar: false, fmt: (v) => `${Math.round(v * 100)}%` },

  // Auxiliary Sends A..D
  { param: 'reverbSend', min: 0, max: 1, def: 0.28, bipolar: false, fmt: (v) => `${Math.round(v * 100)}%` },
  { param: 'chorusSend', min: 0, max: 1, def: 0.20, bipolar: false, fmt: (v) => `${Math.round(v * 100)}%` },
  { param: 'delaySend', min: 0, max: 1, def: 0, bipolar: false, fmt: (v) => `${Math.round(v * 100)}%` },
  { param: 'auxSend', min: 0, max: 1, def: 0, bipolar: false, fmt: (v) => `${Math.round(v * 100)}%` },

  // Semantic Track Offsets / External Hardware Macros (Non-destructive)
  { param: 'cutoffOffset', min: -1, max: 1, def: 0, bipolar: true, fmt: (v) => (Math.abs(v) < 0.01 ? '0%' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`) },
  { param: 'resonanceOffset', min: -1, max: 1, def: 0, bipolar: true, fmt: (v) => (Math.abs(v) < 0.01 ? '0%' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`) },
  { param: 'envAttackOffset', min: -1, max: 1, def: 0, bipolar: true, fmt: (v) => (Math.abs(v) < 0.01 ? '0%' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`) },
  { param: 'envDecayOffset', min: -1, max: 1, def: 0, bipolar: true, fmt: (v) => (Math.abs(v) < 0.01 ? '0%' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`) },
  { param: 'envSustainOffset', min: -1, max: 1, def: 0, bipolar: true, fmt: (v) => (Math.abs(v) < 0.01 ? '0%' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`) },
  { param: 'envReleaseOffset', min: -1, max: 1, def: 0, bipolar: true, fmt: (v) => (Math.abs(v) < 0.01 ? '0%' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`) },
  { param: 'vibratoOffset', min: -1, max: 1, def: 0, bipolar: true, fmt: (v) => (Math.abs(v) < 0.01 ? '0%' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`) },
];

export interface KnobItem {
  def: KnobDef;
  knob: Knob;
  numEl: HTMLElement | null;
}

export class McxToneDrawerKnobsManager {
  private items = new Map<McxParamKey, KnobItem>();
  private rootEl: HTMLElement | null = null;
  private syncMap: Record<'lfo1Rate' | 'lfo2Rate', boolean> = { lfo1Rate: false, lfo2Rate: false };

  public mount(rootEl: HTMLElement, onParamChange: (p: McxParamKey, val: number, fmtTxt: string) => void): void {
    this.destroy();
    this.rootEl = rootEl;

    for (const d of KNOB_DEFS) {
      const mount = rootEl.querySelector(`#knob-${d.param}`) as HTMLElement | null;
      if (!mount) continue;

      const numEl = rootEl.querySelector(`#val-${d.param}`) as HTMLElement | null;
      const initialVal = d.def;
      const initialNorm = (initialVal - d.min) / (d.max - d.min);

      const knob = new Knob(mount, {
        size: 38,
        value: initialNorm,
        bipolar: d.bipolar,
        skin: 'ms2000',
        onChange: (normVal: number) => {
          let raw: number, txt: string;
          if ((d.param === 'lfo1Rate' || d.param === 'lfo2Rate') && this.syncMap[d.param]) {
            const maxS = LFO_DIVISIONS.length - 1;
            const step = Math.min(maxS, Math.max(0, Math.round(normVal * maxS)));
            raw = step;
            txt = LFO_DIVISIONS[step];
          } else {
            raw = d.min + normVal * (d.max - d.min);
            txt = d.fmt(raw);
          }
          if (numEl) numEl.textContent = txt;
          onParamChange(d.param, raw, txt);
        },
      });

      this.items.set(d.param, { def: d, knob, numEl });
    }
  }

  public setLfoSync(idx: 1 | 2, isSync: boolean, currentVal?: number): void {
    const p: McxParamKey = idx === 1 ? 'lfo1Rate' : 'lfo2Rate';
    this.syncMap[p] = isSync;
    const titleEl = this.rootEl?.querySelector(`[data-param="${p}"] .synth-knob-title`);
    if (titleEl) titleEl.textContent = isSync ? 'DIVISIÓN' : 'VELOCIDAD';
    const item = this.items.get(p);
    if (item && currentVal !== undefined) this.updateRateKnob(p, item, currentVal);
  }

  private updateRateKnob(p: 'lfo1Rate' | 'lfo2Rate', item: KnobItem, raw: number): void {
    if (this.syncMap[p]) {
      const maxS = LFO_DIVISIONS.length - 1;
      const step = Math.min(maxS, Math.max(0, Math.round(raw)));
      item.knob.setValue(step / maxS);
      if (item.numEl) item.numEl.textContent = LFO_DIVISIONS[step];
    } else {
      const norm = Math.max(0, Math.min(1, (raw - item.def.min) / (item.def.max - item.def.min)));
      item.knob.setValue(norm);
      if (item.numEl) item.numEl.textContent = item.def.fmt(raw);
    }
  }

  public syncValues(ps: McxPartUiState): void {
    this.setLfoSync(1, Boolean(ps.lfo1Sync));
    this.setLfoSync(2, Boolean(ps.lfo2Sync));
    for (const [key, item] of this.items.entries()) {
      const raw = (ps as unknown as Record<string, number | undefined>)[key] ?? item.def.def;
      if (key === 'lfo1Rate' || key === 'lfo2Rate') {
        this.updateRateKnob(key, item, raw);
      } else {
        const norm = Math.max(0, Math.min(1, (raw - item.def.min) / (item.def.max - item.def.min)));
        item.knob.setValue(norm);
        if (item.numEl) item.numEl.textContent = item.def.fmt(raw);
      }
    }
  }

  public updateSingle(param: McxParamKey, rawVal: number): void {
    const item = this.items.get(param);
    if (!item) return;
    if (param === 'lfo1Rate' || param === 'lfo2Rate') {
      this.updateRateKnob(param, item, rawVal);
    } else {
      const norm = Math.max(0, Math.min(1, (rawVal - item.def.min) / (item.def.max - item.def.min)));
      item.knob.setValue(norm);
      if (item.numEl) item.numEl.textContent = item.def.fmt(rawVal);
    }
  }

  public destroy(): void {
    for (const item of this.items.values()) {
      item.knob.destroy();
    }
    this.items.clear();
  }
}

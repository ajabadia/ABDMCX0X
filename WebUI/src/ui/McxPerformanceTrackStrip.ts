/**
 * ABDMCX0X -- McxPerformanceTrackStrip.ts
 * Fixed non-assignable per-track Mixer + Motion/Takeover strip mounted in PerformanceDeck footerSlot.
 * Strict line limit: < 120 lines. 0 #hex colors.
 */

import type { MidiTakeoverMode, MotionRecordMode, PlaybackOverrideMode } from '../app/McxPerformanceMotion';
import type { McxParamKey } from '../bridge/McxHostBridge';
import type { McxPartUiState } from './McxPartState';

export interface TrackStripCallbacks {
  onMixerParam: (key: McxParamKey, value: number) => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onCycleOverrideMode: () => void;
  onCycleRecordMode: () => void;
  onCycleTakeoverMode: () => void;
}

export class McxPerformanceTrackStrip {
  private readonly root: HTMLElement;
  private readonly cb: TrackStripCallbacks;

  constructor(host: HTMLElement, cb: TrackStripCallbacks) {
    this.root = host;
    this.cb = cb;
    this.root.innerHTML = `
      <div class="mcx-perf-track-strip" aria-label="Track Mixer &amp; Automation Modes">
        <span class="mcx-perf-strip-badge">TRACK</span>
        <label class="mcx-perf-mini-fader">VOL<input type="range" min="0" max="100" data-tr="partLevel" aria-label="Track Volume" /></label>
        <label class="mcx-perf-mini-fader">PAN<input type="range" min="-100" max="100" data-tr="partPan" aria-label="Track Pan" /></label>
        <label class="mcx-perf-mini-fader">REV<input type="range" min="0" max="100" data-tr="reverbSend" aria-label="Track Reverb Send" /></label>
        <label class="mcx-perf-mini-fader">CHO<input type="range" min="0" max="100" data-tr="chorusSend" aria-label="Track Chorus Send" /></label>
        <button type="button" class="btn btn-xs btn-outline" data-tr-act="mute">M</button>
        <button type="button" class="btn btn-xs btn-outline" data-tr-act="solo">S</button>
        <span class="mcx-perf-strip-sep"></span>
        <button type="button" class="btn btn-xs btn-outline" data-tr-act="ovr-mode" title="Playback Touch Mode">AUTO: OVR</button>
        <button type="button" class="btn btn-xs btn-outline" data-tr-act="rec-mode" title="Motion Write Mode">REC: TCH</button>
        <button type="button" class="btn btn-xs btn-outline" data-tr-act="tkv-mode" title="MIDI Hardware Takeover">HW: SCL</button>
      </div>`;
    this.bind();
  }

  private bind(): void {
    this.root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      const key = el.dataset?.tr as McxParamKey | undefined;
      if (!key) return;
      const val = Number(el.value) / 100;
      this.cb.onMixerParam(key, val);
    });
    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-tr-act]')?.dataset.trAct;
      if (act === 'mute') this.cb.onToggleMute();
      else if (act === 'solo') this.cb.onToggleSolo();
      else if (act === 'ovr-mode') this.cb.onCycleOverrideMode();
      else if (act === 'rec-mode') this.cb.onCycleRecordMode();
      else if (act === 'tkv-mode') this.cb.onCycleTakeoverMode();
    });
  }

  public sync(ps: McxPartUiState, modes: { overrideMode: PlaybackOverrideMode; recordMode: MotionRecordMode; takeoverMode: MidiTakeoverMode }): void {
    const setSlider = (k: string, val: number) => {
      const el = this.root.querySelector<HTMLInputElement>(`[data-tr="${k}"]`);
      if (el) el.value = String(Math.round(val * 100));
    };
    setSlider('partLevel', ps.partLevel ?? 0.85);
    setSlider('partPan', ps.partPan ?? 0);
    setSlider('reverbSend', ps.reverbSend ?? 0.25);
    setSlider('chorusSend', ps.chorusSend ?? 0.1);
    this.root.querySelector('[data-tr-act="mute"]')?.classList.toggle('is-active', Boolean(ps.mute));
    this.root.querySelector('[data-tr-act="solo"]')?.classList.toggle('is-active', Boolean(ps.solo));
    const ovr = this.root.querySelector('[data-tr-act="ovr-mode"]');
    if (ovr) ovr.textContent = `AUTO: ${modes.overrideMode === 'override' ? 'OVR' : 'RET'}`;
    const rec = this.root.querySelector('[data-tr-act="rec-mode"]');
    if (rec) rec.textContent = `REC: ${modes.recordMode === 'touch' ? 'TCH' : 'LTH'}`;
    const tkv = this.root.querySelector('[data-tr-act="tkv-mode"]');
    if (tkv) tkv.textContent = `HW: ${modes.takeoverMode === 'scale' ? 'SCL' : modes.takeoverMode === 'pickup' ? 'PKP' : 'JMP'}`;
  }
}

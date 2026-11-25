/**
 * ABDMCX0X -- McxPerformanceTrackStrip.ts
 * Fixed per-track Mixer, global Transport (Play/Pause/Rec) & Motion/Takeover strip.
 * Strict line limit: < 120 lines. 0 #hex colors.
 */

import type { MidiTakeoverMode, MotionRecordMode, PlaybackOverrideMode } from '../app/McxPerformanceMotion';
import type { McxParamKey } from '../bridge/McxHostBridge';
import type { McxPartUiState } from './McxPartState';

export interface TrackStripCallbacks {
  onMixerParam: (key: McxParamKey, value: number) => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onPlay: () => void;
  onPause: () => void;
  onToggleRecord: () => void;
  onCycleOverrideMode: () => void;
  onCycleRecordMode: () => void;
  onCycleTakeoverMode: () => void;
}

const SVG_PLAY = '<svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><polygon points="3,2 10,6 3,10"/></svg>';
const SVG_PAUSE = '<svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="2.5" y="2" width="2.5" height="8"/><rect x="7" y="2" width="2.5" height="8"/></svg>';
const SVG_REC = '<svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><circle cx="6" cy="6" r="4.5"/></svg>';

export class McxPerformanceTrackStrip {
  private readonly root: HTMLElement;
  private readonly cb: TrackStripCallbacks;

  constructor(host: HTMLElement, cb: TrackStripCallbacks) {
    this.root = host;
    this.cb = cb;
    this.root.innerHTML = `
      <div class="mcx-perf-track-strip" aria-label="Track Mixer, Transport &amp; Automation Modes">
        <span class="mcx-perf-strip-badge">TRACK</span>
        <label class="mcx-perf-mini-fader">VOL<input type="range" min="0" max="100" data-tr="partLevel" aria-label="Track Volume" /></label>
        <label class="mcx-perf-mini-fader">PAN<input type="range" min="-100" max="100" data-tr="partPan" aria-label="Track Pan" /></label>
        <label class="mcx-perf-mini-fader">REV<input type="range" min="0" max="100" data-tr="reverbSend" aria-label="Track Reverb Send" /></label>
        <label class="mcx-perf-mini-fader">CHO<input type="range" min="0" max="100" data-tr="chorusSend" aria-label="Track Chorus Send" /></label>
        <button type="button" class="btn btn-xs btn-outline" data-tr-act="mute">M</button>
        <button type="button" class="btn btn-xs btn-outline" data-tr-act="solo">S</button>
        <span class="mcx-perf-strip-div" aria-hidden="true"></span>
        <button type="button" class="btn btn-xs btn-outline mcx-perf-tr-btn mcx-perf-tr-play" data-tr-act="play" title="Play / Stop">${SVG_PLAY} PLAY</button>
        <button type="button" class="btn btn-xs btn-outline mcx-perf-tr-btn mcx-perf-tr-pause" data-tr-act="pause" title="Pause">${SVG_PAUSE} PAUSE</button>
        <button type="button" class="btn btn-xs btn-outline mcx-perf-tr-btn mcx-perf-tr-rec" data-tr-act="rec" title="Record Motion / Sequencer">${SVG_REC} REC</button>
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
      if (key) this.cb.onMixerParam(key, Number(el.value) / 100);
    });
    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-tr-act]')?.dataset.trAct;
      if (act === 'mute') this.cb.onToggleMute();
      else if (act === 'solo') this.cb.onToggleSolo();
      else if (act === 'play') this.cb.onPlay();
      else if (act === 'pause') this.cb.onPause();
      else if (act === 'rec') this.cb.onToggleRecord();
      else if (act === 'ovr-mode') this.cb.onCycleOverrideMode();
      else if (act === 'rec-mode') this.cb.onCycleRecordMode();
      else if (act === 'tkv-mode') this.cb.onCycleTakeoverMode();
    });
  }

  public syncTransport(playing: boolean, paused: boolean, recording: boolean): void {
    this.root.querySelector('[data-tr-act="play"]')?.classList.toggle('is-active', playing && !paused);
    this.root.querySelector('[data-tr-act="pause"]')?.classList.toggle('is-active', paused);
    this.root.querySelector('[data-tr-act="rec"]')?.classList.toggle('is-active', recording);
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
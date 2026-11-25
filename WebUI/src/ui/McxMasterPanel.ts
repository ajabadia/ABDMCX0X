/**
 * ABDMCX0X -- McxMasterPanel.ts
 * Dedicated collapsible Master & Global Output column on the right side of the mixer,
 * plus MPC-style CompactTransportBar mounted in the SynthNavBar center slot.
 * Strict line limit: < 200 lines.
 */

import { RotaryLedKnob, CompactTransportBar, CompactStereoVu, type CompactTransportBarState } from '@abdsynths/shared/components';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import { t } from '../i18n/mcxI18n';
import { ICON_CHEVRON_LEFT, ICON_CHEVRON_RIGHT } from './mcxIcons';

export interface McxMasterPanelOptions {
  bridge: McxHostBridge; setLcdLine2?: (text: string) => void;
  initialVolume?: number; initialBpm?: number; initialQuantizeSteps?: number;
  getFocusedPart?: () => number; onVolumeChange?: (v: number) => void;
  onRecordChange?: (rec: boolean) => void; onLimiterChange?: (enabled: boolean) => void;
  onCountInChange?: (bars: number) => void; onRecordModeChange?: (mode: 'overdub' | 'replace') => void;
  onQuantizeChange?: (steps: number) => void; onSwingChange?: (pct: number) => void;
  onOpenGlobal?: () => void; onOpenFxRack?: () => void; onOpenGlobalLfo?: () => void;
  onOpenGroove?: (partIndex: number) => void; onOpenSong?: () => void;
  onToggleCollapseMaster?: () => void; onToggleCollapseRight?: () => void;
  onBpmChange?: (bpm: number) => void; onTransportChange?: (state: CompactTransportBarState) => void;
}

function normToDb(v: number): string {
  if (v <= 0.001) return '-∞ dB';
  const db = 20 * Math.log10(v / 0.85);
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

export class McxMasterPanel {
  private container: HTMLElement; private bridge: McxHostBridge; private opts: McxMasterPanelOptions;
  private volumeKnob: RotaryLedKnob | null = null;
  private vuMeter: CompactStereoVu | null = null;
  private transport: CompactTransportBar | null = null;
  private isMuted = false; private limiterEnabled = true; private prevVolume = 0.85;

  constructor(container: HTMLElement, opts: McxMasterPanelOptions) {
    this.container = container; this.bridge = opts.bridge; this.opts = opts;
    this.prevVolume = opts.initialVolume ?? 0.85;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="mcx-col-expand-strip">
        <button type="button" class="mcx-col-expand-btn" id="mcx-master-expand" title="Mostrar Master y Global" aria-label="Mostrar Master">${ICON_CHEVRON_LEFT}</button>
        <span class="mcx-col-expand-lbl">MASTER</span>
      </div>
      <div class="mcx-master-content">
        <div class="mcx-master-head">
          <span class="mcx-master-title" data-i18n="mcx.masterTitle">${t('mcx.masterTitle') || 'MASTER'}</span>
          <button type="button" class="mcx-master-collapse-btn" id="mcx-master-collapse" title="Ocultar Master" aria-label="Ocultar Master">${ICON_CHEVRON_RIGHT}</button>
        </div>
        <div class="mcx-master-body">
          <div class="mcx-master-fx-group">
            <button type="button" class="mcx-master-fx-btn mcx-master-global-btn" id="mcx-global-btn" title="Ajustes Globales y Master Bus">
              <span class="mcx-master-fx-led"></span><span>GLOBAL</span><span class="mcx-master-topo-tag">BUS</span>
            </button>
            <button type="button" class="mcx-master-fx-btn mcx-master-lfo-btn" id="mcx-btn-open-glfo" title="Abrir LFOs Globales">
              <span class="mcx-master-fx-led" id="mcx-glfo-led"></span><span>G-LFO</span><span class="mcx-master-topo-tag" id="mcx-master-glfo-tag">SYNC</span>
            </button>
            <div class="mcx-master-quick-row">
              <button type="button" class="mcx-master-lim-btn is-active" id="mcx-btn-toggle-lim" title="Master Safety Limiter"><span class="mcx-lim-dot"></span>LIM</button>
              <button type="button" class="mcx-master-lim-btn" id="mcx-btn-open-groove" title="Motor de Groove & Shuffle (Master)">SHUFFLE</button>
              <button type="button" class="mcx-master-lim-btn" id="mcx-btn-open-song" title="Song Mode & Live Scenes (Ctrl+M)">SONG</button>
            </div>
          </div>
          <div class="mcx-master-meter-mount" id="mcx-master-vu-mount"></div>
          <div class="mcx-master-vol-section">
            <div class="mcx-master-vol-header">
              <span class="mcx-master-vol-lbl">VOLUME</span>
              <button type="button" class="mcx-master-mute-btn" id="mcx-master-mute" title="${t('mcx.masterMuteHint') || 'Silenciar'}">MUTE</button>
            </div>
            <div class="mcx-master-knob-mount" id="mcx-master-knob-mount" data-param-index="900"></div>
            <span class="mcx-master-vol-readout" id="mcx-master-vol-readout">85%</span>
            <div class="mcx-master-db-divider"></div>
            <span class="mcx-master-db-pill" id="mcx-master-db-pill">0.0 dB</span>
          </div>
        </div>
      </div>`;

    const vuMount = this.container.querySelector('#mcx-master-vu-mount') as HTMLElement | null;
    if (vuMount) {
      this.vuMeter = new CompactStereoVu(vuMount, {
        labelL: 'L', labelR: 'R', title: 'Medidor Estéreo Master (Clic para abrir medidor de estudio)',
        dialogTitle: 'MEDIDOR ESTÉREO MASTER', dialogSubtitle: 'TRUE PEAK / dBFS', segments: 24,
        onNotice: (msg: string) => this.opts.setLcdLine2?.(msg),
      });
    }

    const knobMount = this.container.querySelector('#mcx-master-knob-mount') as HTMLElement | null;
    if (knobMount) {
      this.volumeKnob = new RotaryLedKnob(knobMount, {
        size: 52, value: this.prevVolume, numLeds: 15,
        onChange: (normVal: number) => {
          this.isMuted = false; this.updateMuteState(); this.updateReadouts(normVal);
          this.bridge.setMasterVolume(normVal); this.opts.onVolumeChange?.(normVal);
          this.opts.setLcdLine2?.(`MASTER VOL: ${Math.round(normVal * 100)}% (${normToDb(normVal)})`);
        },
      });
    }

    const trMount = (document.getElementById('mcx-transport-mount') || this.container.querySelector('#mcx-master-transport-mount')) as HTMLElement | null;
    if (trMount) {
      this.transport = new CompactTransportBar(trMount, {
        orientation: 'navbar', showExtendedControls: true, initialBpm: this.opts.initialBpm ?? 120,
        initialQuantizeSteps: this.opts.initialQuantizeSteps ?? 16,
        labels: { play: t('mcx.transportPlay') || 'Play', stop: t('mcx.transportStop') || 'Stop', record: t('mcx.transportRecord') || 'Record', loop: t('mcx.transportLoop') || 'Loop', metro: t('mcx.transportMetro') || 'Metro' },
        onReturnToZero: () => { this.bridge.returnSequencerToZero(); this.opts.setLcdLine2?.('TRANSPORT: RTZ'); },
        onRewind: () => { this.bridge.seekSequencerBars(-1); this.opts.setLcdLine2?.('TRANSPORT: REW -1 BAR'); },
        onPlay: () => { this.bridge.setTempo(this.transport?.getState().bpm ?? 120); this.bridge.setTransportPlaying(true, false); this.opts.setLcdLine2?.('TRANSPORT: PLAY'); },
        onPause: () => { this.bridge.pauseSequencer(); this.opts.setLcdLine2?.('TRANSPORT: PAUSE'); },
        onStop: () => { this.bridge.setTransportPlaying(false, true); this.opts.setLcdLine2?.('TRANSPORT: STOP'); },
        onForward: () => { this.bridge.seekSequencerBars(1); this.opts.setLcdLine2?.('TRANSPORT: FF +1 BAR'); },
        onRecord: (rec) => { this.opts.onRecordChange?.(rec); this.opts.setLcdLine2?.(rec ? 'TRANSPORT: REC ARMED' : 'TRANSPORT: REC OFF'); },
        onCountInChange: (bars) => this.opts.onCountInChange?.(bars),
        onRecordModeChange: (mode) => this.opts.onRecordModeChange?.(mode),
        onQuantizeChange: (steps) => { this.opts.onQuantizeChange?.(steps); this.opts.setLcdLine2?.(`TC QUANTIZE: ${steps > 0 ? `1/${steps}` : 'OFF'}`); },
        onSwingChange: (pct) => { this.opts.onSwingChange?.(pct); this.opts.setLcdLine2?.(`SWING: ${pct}%`); },
        onOpenGroove: () => this.opts.onOpenGroove?.(this.opts.getFocusedPart?.() ?? 0),
        onLoop: (loop) => { this.bridge.setSequencerLoop(loop); this.opts.setLcdLine2?.(loop ? 'LOOP: ON' : 'LOOP: ONE-SHOT'); },
        onMetro: (metro) => this.opts.setLcdLine2?.(metro ? 'METRONOME: ON' : 'METRONOME: OFF'),
        onTempoChange: (bpm) => { this.bridge.setTempo(bpm); this.opts.onBpmChange?.(bpm); this.opts.setLcdLine2?.(`TEMPO: ${bpm.toFixed(1)} BPM`); },
        onTransportChange: this.opts.onTransportChange,
      });
    }

    const onToggleCol = () => (this.opts.onToggleCollapseMaster ?? this.opts.onToggleCollapseRight)?.();
    this.container.querySelector('#mcx-master-collapse')?.addEventListener('click', onToggleCol);
    this.container.querySelector('#mcx-master-expand')?.addEventListener('click', onToggleCol);
    this.container.querySelector('#mcx-global-btn')?.addEventListener('click', () => this.opts.onOpenGlobal?.());
    this.container.querySelector('#mcx-btn-open-glfo')?.addEventListener('click', () => (this.opts.onOpenGlobalLfo ? this.opts.onOpenGlobalLfo() : this.opts.setLcdLine2?.('GLOBAL LFOS MODAL')));
    this.container.querySelector('#mcx-btn-open-groove')?.addEventListener('click', () => (this.opts.onOpenGroove ? this.opts.onOpenGroove(this.opts.getFocusedPart?.() ?? 0) : this.opts.setLcdLine2?.('GROOVE & SHUFFLE MODAL')));
    this.container.querySelector('#mcx-btn-open-song')?.addEventListener('click', () => this.opts.onOpenSong?.());

    this.container.querySelector('#mcx-btn-toggle-lim')?.addEventListener('click', (e) => {
      this.limiterEnabled = !this.limiterEnabled;
      (e.currentTarget as HTMLElement).classList.toggle('is-active', this.limiterEnabled);
      this.bridge.setLimiterEnabled(this.limiterEnabled); this.opts.onLimiterChange?.(this.limiterEnabled);
      this.opts.setLcdLine2?.(`MASTER SAFETY LIMITER: ${this.limiterEnabled ? 'ON (-0.3 dBFS)' : 'BYPASS'}`);
    });

    this.container.querySelector('#mcx-master-mute')?.addEventListener('click', () => {
      this.isMuted = !this.isMuted; this.updateMuteState();
      const v = this.isMuted ? 0 : (this.prevVolume > 0.01 ? this.prevVolume : 0.85);
      if (this.isMuted) this.prevVolume = this.volumeKnob?.getValue() ?? 0.85;
      this.volumeKnob?.setValue(v); this.bridge.setMasterVolume(v); this.opts.onVolumeChange?.(v);
      this.isMuted ? this.updateMutedReadouts() : this.updateReadouts(v);
      if (this.isMuted) this.updateMeter(0, 0);
      this.opts.setLcdLine2?.(this.isMuted ? 'MASTER OUTPUT: MUTED' : `MASTER OUTPUT: UNMUTED (${Math.round(v * 100)}%)`);
    });

    if (!this.bridge.isNative) this.bridge.setMasterVolume(this.prevVolume);
    this.updateReadouts(this.prevVolume);
  }

  private updateMuteState(): void { this.container.querySelector('#mcx-master-mute')?.classList.toggle('is-muted', this.isMuted); }
  private updateReadouts(val: number): void {
    const pct = this.container.querySelector('#mcx-master-vol-readout'), db = this.container.querySelector('#mcx-master-db-pill');
    if (pct) pct.textContent = `${Math.round(val * 100)}%`; if (db) db.textContent = normToDb(val);
  }
  private updateMutedReadouts(): void {
    const pct = this.container.querySelector('#mcx-master-vol-readout'), db = this.container.querySelector('#mcx-master-db-pill');
    if (pct) pct.textContent = 'MUTED'; if (db) db.textContent = '-∞ dB';
  }
  public updateMeter(peakL: number, peakR: number): void { this.vuMeter?.setLevels(this.isMuted ? 0 : peakL, this.isMuted ? 0 : peakR); }
  public setVolume(v: number): void { this.prevVolume = v; this.volumeKnob?.setValue(v); this.updateReadouts(v); }
  public setLimiterEnabled(enabled: boolean): void { this.limiterEnabled = enabled; this.container.querySelector('#mcx-btn-toggle-lim')?.classList.toggle('is-active', enabled); }
  public setBpm(bpm: number): void { this.transport?.setTempo(bpm); }
  public setPlaying(p: boolean): void { this.transport?.setPlaying(p); }
  public setPaused(p: boolean): void { this.transport?.setPaused(p); }
  public setRecording(r: boolean): void { this.transport?.setRecording(r); }
  public setTransportPosition(tick: number, ppq = 96): void { this.transport?.setPosition(tick, ppq); }
  public setQuantizeSteps(steps: number): void { this.transport?.setQuantizeSteps(steps); }
  public setSwingPct(pct: number): void { this.transport?.setSwingPct(pct); }
  public getTransportState(): CompactTransportBarState | undefined { return this.transport?.getState(); }
  public setTopologyTag(name: string): void { const tag = this.container.querySelector('#mcx-master-topo-tag'); if (tag) tag.textContent = name.toUpperCase(); }
  public setSongModeActive(active: boolean): void { this.container.querySelector('#mcx-btn-open-song')?.classList.toggle('is-active', active); }
  public updateGlobalLfoPhase(ph: number): void { this.container.querySelector('#mcx-glfo-led')?.classList.toggle('is-active', ph > 0.05); }
  public destroy(): void { this.volumeKnob?.destroy(); this.vuMeter?.destroy(); this.transport?.destroy(); this.container.innerHTML = ''; }
}

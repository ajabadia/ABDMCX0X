/**
 * ABDMCX0X -- McxPerformanceModal.ts
 * Modeless PerformanceDeck dialog reactive to Banks A-H, 16 tracks, MIDI Learn & Motion Rec.
 * Strict line limit: < 195 lines. 0 #hex colors.
 */

import '@abdsynths/shared/components/PerformanceDeck/performanceDeck.css';
import '../styles/mcx-perf-modal.css';
import { PerformanceDeck } from '@abdsynths/shared/components';
import {
  applyTargetCurve, invertTargetCurve, resolvePerformanceMap, type PerformanceMapState,
} from '@abdsynths/shared/components/performance-map';
import {
  findParameterById, getParameterAutomationInterp, getParameterSpec, type ParameterSpecDocument,
} from '@abdsynths/shared/contracts/parameter-catalog';
import type { McxAppState } from '../app/McxAppState';
import { McxPerformanceMotionController } from '../app/McxPerformanceMotion';
import {
  dispatchDeckParamToPart, loadUserEngineDefault, partMapStorageKey,
  readInitialPartParamValues, runPerformancePresetAction,
} from '../app/McxPerformancePersistence';
import type { McxEngineDescriptorDto, McxHostBridge } from '../bridge/McxHostBridge';
import { BANK_COLOR_VARS, BANK_LETTERS, findPartLocation } from './McxBankLayout';
import { McxPerformanceTrackStrip } from './McxPerformanceTrackStrip';

export interface McxPerformanceModalOptions { bridge: McxHostBridge; state: McxAppState; getCatalog: () => McxEngineDescriptorDto[]; onToggleOpen?: (open: boolean) => void; }

export class McxPerformanceModal {
  public readonly deck: PerformanceDeck;
  public readonly motion = new McxPerformanceMotionController();
  private readonly bridge: McxHostBridge;
  private readonly state: McxAppState;
  private readonly getCatalog: () => McxEngineDescriptorDto[];
  private readonly trackStrip: McxPerformanceTrackStrip;
  private readonly onToggleOpen?: (open: boolean) => void;
  private pinnedPart: number | null = null;
  private currentSpec: ParameterSpecDocument | null = null;
  private currentMap: PerformanceMapState | null = null;
  private liveValues: Record<string, number> = {};
  private lastPartKey = '';
  private lastTick = 0;
  private lastTotalTicks = 384;
  private isPlaying = false;
  private isPaused = false;
  private lastRec = false;

  constructor(opts: McxPerformanceModalOptions) {
    this.bridge = opts.bridge; this.state = opts.state; this.getCatalog = opts.getCatalog; this.onToggleOpen = opts.onToggleOpen;
    this.deck = new PerformanceDeck(document.body, {
      layout: 'modeless', inlineEdit: true, hasPinToggle: true, hasFooterSlot: true, hasVoiceLimit: false,
      stickOptions: { variant: 'nuke-orb', size: 210, hasRecorder: false, showHeader: false, showLayers: false, readout: true },
      onClose: () => this.onToggleOpen?.(false),
      onPinChange: (pinned) => { this.pinnedPart = pinned ? this.state.focusedPart : null; this.syncFromAppState(); },
      onReEnableAuto: () => this.reEnableAutomationOverrides(),
      onSlotDragStart: (_i, id) => { if (id) { this.motion.beginGesture(this.getTargetPart(), id, this.isPlaying, this.state.isRecording); this.deck.setAutomationOverride(this.motion.hasOverrides(this.getTargetPart())); } },
      onSlotDragEnd: (_i, id) => { if (id) this.finishParamGesture(id); },
      onStickDragStart: () => this.beginXyGesture(),
      onStickDragEnd: () => { const xy = this.currentMap?.xyPad; if (xy?.x) this.finishParamGesture(xy.x.paramId); if (xy?.y) this.finishParamGesture(xy.y.paramId); },
      onParamChange: (paramId, mapped) => this.handleDeckParamChange(paramId, mapped),
      onMapChange: (map) => this.persistPartMap(map),
      onPresetAction: (act, map) => runPerformancePresetAction(act, map, this.currentSpec, this.state, this.bridge, this.getTargetPart(), (m) => { this.persistPartMap(m); this.syncFromAppState(); }, () => this.syncFromAppState()),
    });

    const cbs = this.state.getPanelCallbacks();
    this.trackStrip = new McxPerformanceTrackStrip(this.deck.getFooterSlot(), {
      onMixerParam: (k, val) => { const p = this.getTargetPart(); (this.state.partsState[p] as any)[k] = val; this.bridge.setParam(p, k, val); },
      onToggleMute: () => cbs.onToggleMute(this.getTargetPart()),
      onToggleSolo: () => cbs.onToggleSolo(this.getTargetPart()),
      onPlay: () => { if (this.isPlaying && !this.isPaused) { this.isPlaying = false; this.isPaused = false; this.bridge.setTransportPlaying(false, true); } else { this.bridge.setTempo(this.state.globalSettings.standaloneBpm || 120); this.isPlaying = true; this.isPaused = false; this.bridge.setTransportPlaying(true, false); } this.syncTransportUi(); },
      onPause: () => { this.isPaused = !this.isPaused; this.bridge.pauseSequencer(); this.syncTransportUi(); },
      onToggleRecord: () => { this.state.setSequencerRecording(!this.state.isRecording); this.syncTransportUi(); },
      onCycleOverrideMode: () => { this.motion.setOverrideMode(this.motion.overrideMode === 'override' ? 'auto-return' : 'override'); this.syncStrip(); },
      onCycleRecordMode: () => { this.motion.setRecordMode(this.motion.recordMode === 'touch' ? 'latch' : 'touch'); this.syncStrip(); },
      onCycleTakeoverMode: () => { this.motion.setTakeoverMode(this.motion.takeoverMode === 'scale' ? 'pickup' : (this.motion.takeoverMode === 'pickup' ? 'jump' : 'scale')); this.syncStrip(); },
    });
    this.syncFromAppState();
  }

  public getTargetPart(): number { return this.pinnedPart !== null ? this.pinnedPart : this.state.focusedPart; }
  public isOpen(): boolean { return this.deck.isOpen; }
  public open(): void { this.syncFromAppState(); this.deck.open(); this.onToggleOpen?.(true); }
  public close(): void { this.deck.close(); }
  public toggle(): void { if (this.deck.isOpen) this.close(); else this.open(); }
  public syncTheme(): void { this.deck.syncTheme(); }

  private beginXyGesture(): void {
    const xy = this.currentMap?.xyPad, p = this.getTargetPart();
    if (xy?.x) this.motion.beginGesture(p, xy.x.paramId, this.isPlaying, this.state.isRecording);
    if (xy?.y) this.motion.beginGesture(p, xy.y.paramId, this.isPlaying, this.state.isRecording);
    this.deck.setAutomationOverride(this.motion.hasOverrides(p));
  }

  public syncFromAppState(): void {
    const p = this.getTargetPart(), ps = this.state.partsState[p]; if (!ps) return;
    const engineId = ps.engineTypeId || 'structured_rompler', nextKey = partMapStorageKey(p, engineId);
    if (nextKey !== this.lastPartKey) { this.lastPartKey = nextKey; this.motion.resetTakeoverCatch(); }
    this.currentSpec = getParameterSpec(engineId);
    const desc = this.getCatalog().find((e) => e.typeId === engineId || e.index === ps.engineTypeIndex);
    const loc = findPartLocation(this.state.bankLayout, p), bIdx = loc?.bankIdx ?? this.state.bankLayout.activeBank;
    const slotTag = loc ? `${BANK_LETTERS[bIdx] ?? 'A'}${loc.slotIdx + 1}` : `P${String(p + 1).padStart(2, '0')}`;
    this.currentMap = resolvePerformanceMap(this.currentSpec, loadUserEngineDefault(engineId), this.state.performanceMaps[nextKey]);
    this.liveValues = readInitialPartParamValues(this.currentSpec, ps, engineId);
    this.deck.setPinned(this.pinnedPart !== null, this.pinnedPart !== null ? `PIN P${String(p + 1).padStart(2, '0')}` : 'FOLLOW');
    this.deck.setAutomationOverride(this.motion.hasOverrides(p));
    this.deck.setEngineContext({
      badge: `${slotTag} · ${engineId.replace(/_synth$/, '').toUpperCase()}`,
      title: `P${String(p + 1).padStart(2, '0')} · ${ps.name || 'Tone'}`,
      caption: desc?.displayName || engineId, accentColorVar: BANK_COLOR_VARS[bIdx] || 'var(--color-accent)',
      spec: this.currentSpec, map: this.currentMap, values: this.liveValues,
    });
    this.syncStrip();
  }

  public syncTransportUi(): void { this.lastRec = this.state.isRecording; this.trackStrip.syncTransport(this.isPlaying, this.isPaused, this.state.isRecording); }

  private syncStrip(): void {
    const ps = this.state.partsState[this.getTargetPart()];
    if (ps) this.trackStrip.sync(ps, { overrideMode: this.motion.overrideMode, recordMode: this.motion.recordMode, takeoverMode: this.motion.takeoverMode });
    this.syncTransportUi();
  }

  private persistPartMap(map: PerformanceMapState): void {
    const p = this.getTargetPart(), ps = this.state.partsState[p]; if (!ps) return;
    this.currentMap = map;
    this.state.performanceMaps[partMapStorageKey(p, ps.engineTypeId || 'structured_rompler')] = map;
  }

  private handleDeckParamChange(paramId: string, mapped01: number): void {
    const p = this.getTargetPart(), ps = this.state.partsState[p]; if (!ps) return;
    this.liveValues[paramId] = mapped01;
    dispatchDeckParamToPart(this.state, this.bridge, this.currentSpec, p, paramId, mapped01);
    if (this.isPlaying && this.state.isRecording) {
      if (!ps.sequence) ps.sequence = { bars: 1, ppq: 96, mode: ps.kind === 'drum_map' ? 'drum' : 'chromatic', notes: [], motion: {} };
      this.motion.recordPoint(p, paramId, mapped01, this.lastTick, this.lastTotalTicks, ps.sequence.motion ?? (ps.sequence.motion = {}));
    }
  }

  private finishParamGesture(paramId: string): void {
    const p = this.getTargetPart(), ps = this.state.partsState[p]; if (!ps) return;
    const interp = getParameterAutomationInterp(findParameterById(this.currentSpec, paramId));
    const targetAuto = McxPerformanceMotionController.evaluateLane(ps.sequence?.motion?.[paramId], this.lastTick, this.lastTotalTicks, interp);
    this.motion.endGesture(p, paramId, this.liveValues[paramId] ?? 0.5, targetAuto, Date.now(), this.state.isRecording);
    if (this.state.isRecording && ps.sequence) this.bridge.setPartPattern(p, ps.sequence);
  }

  private reEnableAutomationOverrides(): void {
    const p = this.getTargetPart(), ps = this.state.partsState[p], targets: Record<string, number | null> = {};
    for (const [pid, pts] of Object.entries(ps?.sequence?.motion ?? {})) {
      targets[pid] = McxPerformanceMotionController.evaluateLane(pts, this.lastTick, this.lastTotalTicks, getParameterAutomationInterp(findParameterById(this.currentSpec, pid)));
    }
    this.motion.reEnableAllOverrides(p, this.liveValues, targets);
    this.deck.setAutomationOverride(false);
  }

  public onTelemetryTick(tick: number, playing: boolean, totalTicks = 384, paused = false): void {
    const chg = playing !== this.isPlaying || paused !== this.isPaused || this.state.isRecording !== this.lastRec;
    this.lastTick = tick; this.isPlaying = playing; this.isPaused = paused; this.lastTotalTicks = Math.max(1, totalTicks);
    if (chg) this.syncTransportUi();
    if (!playing) return;
    const p = this.getTargetPart(), motionStore = this.state.partsState[p]?.sequence?.motion; if (!motionStore) return;
    const updates = this.motion.stepPlayback(p, tick, this.lastTotalTicks, motionStore,
      (id) => getParameterAutomationInterp(findParameterById(this.currentSpec, id)), Date.now(), this.state.isRecording);
    for (const { paramId, value } of updates) {
      this.liveValues[paramId] = value;
      dispatchDeckParamToPart(this.state, this.bridge, this.currentSpec, p, paramId, value);
      if (this.deck.isOpen && this.currentMap) {
        for (const m of this.currentMap.macros) if (m.enabled && m.targets[0]?.paramId === paramId) this.deck.setSlotValue(m.index, invertTargetCurve(value, m.targets[0]));
      }
    }
    if (this.deck.isOpen) this.deck.setAutomationOverride(this.motion.hasOverrides(p));
  }

  public handleExternalParamTouched(partIdx: number, paramId: string): boolean {
    if (!this.deck.isOpen || partIdx !== this.getTargetPart()) return false;
    const ok = this.deck.completeLearn(paramId);
    if (ok) this.state.setLcdLine2(`PERF LEARN -> ${paramId}`);
    return ok;
  }

  public applyExternalMidiTarget(targetKey: string, incomingNorm: number): boolean {
    if (!this.currentMap) return false;
    const isMacro = targetKey.startsWith('perf.macro.');
    const slotIdx = isMacro ? Number(targetKey.slice(11)) - 1 : -1;
    const tgt = isMacro ? (this.currentMap.macros[slotIdx]?.enabled ? this.currentMap.macros[slotIdx].targets[0] : null)
      : (targetKey === 'perf.xy.x' || targetKey === 'perf.xy.y') && this.currentMap.xyPad?.enabled
        ? this.currentMap.xyPad[targetKey.endsWith('.x') ? 'x' : 'y'] : null;
    if (!tgt) return false;
    const out = this.motion.applyMidiTakeover(targetKey, incomingNorm, invertTargetCurve(this.liveValues[tgt.paramId] ?? 0.5, tgt));
    if (out === null) return false;
    if (isMacro && this.deck.isOpen) this.deck.setSlotValue(slotIdx, out);
    this.handleDeckParamChange(tgt.paramId, applyTargetCurve(out, tgt));
    return true;
  }
}

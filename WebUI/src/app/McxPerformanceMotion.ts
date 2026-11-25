/**
 * ABDMCX0X -- McxPerformanceMotion.ts
 * Pure anti-jump motion recording (TOUCH/LATCH), playback overrides & MIDI takeover.
 * Strict line limit: < 180 lines. 0 #hex colors.
 */

export type MotionRecordMode = 'touch' | 'latch';
export type PlaybackOverrideMode = 'override' | 'auto-return';
export type MidiTakeoverMode = 'scale' | 'pickup' | 'jump';
export interface MotionPoint { tick: number; value: number; }
export type MotionStore = Record<string, MotionPoint[]>;

interface ActiveRamp { from: number; to: number; startMs: number; durationMs: number; }
interface TrackerState { lastPhys: number | null; caught: boolean; }

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const laneKey = (partIdx: number, paramId: string): string => `${partIdx}:${paramId}`;

export class McxPerformanceMotionController {
  public recordMode: MotionRecordMode = 'touch';
  public overrideMode: PlaybackOverrideMode = 'override';
  public takeoverMode: MidiTakeoverMode = 'scale';

  private readonly activeGestures = new Set<string>();
  private readonly latchedValues = new Map<string, number>();
  private readonly overriddenLanes = new Set<string>();
  private readonly activeRamps = new Map<string, ActiveRamp>();
  private readonly hwTrackers = new Map<string, TrackerState>();

  public setRecordMode(mode: MotionRecordMode): void { this.recordMode = mode; }
  public setOverrideMode(mode: PlaybackOverrideMode): void { this.overrideMode = mode; }
  public setTakeoverMode(mode: MidiTakeoverMode): void { this.takeoverMode = mode; }

  public hasOverrides(partIdx: number): boolean {
    const prefix = `${partIdx}:`;
    for (const k of this.overriddenLanes) if (k.startsWith(prefix)) return true;
    return false;
  }

  public clearPartState(partIdx: number): void {
    const prefix = `${partIdx}:`;
    for (const set of [this.activeGestures, this.overriddenLanes]) {
      for (const k of [...set]) if (k.startsWith(prefix)) set.delete(k);
    }
    for (const k of [...this.latchedValues.keys()]) if (k.startsWith(prefix)) this.latchedValues.delete(k);
    for (const k of [...this.activeRamps.keys()]) if (k.startsWith(prefix)) this.activeRamps.delete(k);
  }

  public beginGesture(partIdx: number, paramId: string, isPlaying: boolean, isRecording: boolean): void {
    const key = laneKey(partIdx, paramId);
    this.activeGestures.add(key);
    this.activeRamps.delete(key);
    if (isPlaying && !isRecording && this.overrideMode === 'override') {
      this.overriddenLanes.add(key);
    }
  }

  public recordPoint(partIdx: number, paramId: string, value: number, tick: number,
    totalTicks: number, store: MotionStore): void {
    const key = laneKey(partIdx, paramId);
    const val = clamp01(value);
    if (this.recordMode === 'latch') this.latchedValues.set(key, val);
    const t = ((Math.round(tick) % Math.max(1, totalTicks)) + Math.max(1, totalTicks)) % Math.max(1, totalTicks);
    const list = store[paramId] ?? (store[paramId] = []);
    if (list.some((p) => Math.abs(p.tick - t) < 6 && Math.abs(p.value - val) < 0.004)) return;
    const sameIdx = list.findIndex((p) => p.tick === t);
    if (sameIdx >= 0) list[sameIdx].value = val;
    else {
      list.push({ tick: t, value: val });
      if (list.length > 256) list.shift();
      list.sort((a, b) => a.tick - b.tick);
    }
  }

  public endGesture(partIdx: number, paramId: string, currentVal: number, targetAutomatedVal: number | null,
    nowMs = Date.now(), isRecording = false): void {
    const key = laneKey(partIdx, paramId);
    this.activeGestures.delete(key);
    const shouldRamp = (isRecording && this.recordMode === 'touch') || (!isRecording && this.overrideMode === 'auto-return');
    if (shouldRamp && targetAutomatedVal !== null && Math.abs(targetAutomatedVal - currentVal) > 0.002) {
      this.activeRamps.set(key, { from: clamp01(currentVal), to: clamp01(targetAutomatedVal), startMs: nowMs, durationMs: 60 });
    }
  }

  public reEnableAllOverrides(partIdx: number, currentValues: Record<string, number>,
    targetValues: Record<string, number | null>, nowMs = Date.now()): void {
    const prefix = `${partIdx}:`;
    for (const key of [...this.overriddenLanes]) {
      if (!key.startsWith(prefix)) continue;
      this.overriddenLanes.delete(key);
      const paramId = key.slice(prefix.length);
      const tgt = targetValues[paramId];
      if (tgt !== null && tgt !== undefined) {
        const cur = currentValues[paramId] ?? tgt;
        this.activeRamps.set(key, { from: clamp01(cur), to: clamp01(tgt), startMs: nowMs, durationMs: 60 });
      }
    }
  }

  public static evaluateLane(points: readonly MotionPoint[] | undefined, tick: number,
    totalTicks: number, interp: 'linear' | 'step' = 'linear'): number | null {
    if (!points || points.length === 0) return null;
    if (points.length === 1) return clamp01(points[0].value);
    const span = Math.max(1, totalTicks);
    const t = ((tick % span) + span) % span;
    let prev = points[points.length - 1];
    let next = points[0];
    for (let i = 0; i < points.length; ++i) {
      if (points[i].tick <= t) prev = points[i];
      if (points[i].tick > t) { next = points[i]; break; }
    }
    if (interp === 'step' || prev.tick === next.tick) return clamp01(prev.value);
    const dist = next.tick > prev.tick ? (next.tick - prev.tick) : (span - prev.tick + next.tick);
    const into = t >= prev.tick ? (t - prev.tick) : (span - prev.tick + t);
    const alpha = dist > 0 ? clamp01(into / dist) : 0;
    return clamp01(prev.value + alpha * (next.value - prev.value));
  }

  public stepPlayback(partIdx: number, tick: number, totalTicks: number, store: MotionStore,
    getInterp: (paramId: string) => 'linear' | 'step', nowMs = Date.now(),
    isRecording = false): Array<{ paramId: string; value: number }> {
    const out: Array<{ paramId: string; value: number }> = [];
    for (const [paramId, points] of Object.entries(store || {})) {
      const key = laneKey(partIdx, paramId);
      if (isRecording && this.recordMode === 'latch' && this.latchedValues.has(key)) {
        const lv = this.latchedValues.get(key)!;
        this.recordPoint(partIdx, paramId, lv, tick, totalTicks, store);
        out.push({ paramId, value: lv });
        continue;
      }
      if (this.activeGestures.has(key) || this.overriddenLanes.has(key)) continue;
      const ramp = this.activeRamps.get(key);
      if (ramp) {
        const frac = clamp01((nowMs - ramp.startMs) / Math.max(1, ramp.durationMs));
        const liveAuto = McxPerformanceMotionController.evaluateLane(points, tick, totalTicks, getInterp(paramId));
        const dest = liveAuto ?? ramp.to;
        const val = clamp01(ramp.from + frac * (dest - ramp.from));
        if (frac >= 1) this.activeRamps.delete(key);
        out.push({ paramId, value: val });
        continue;
      }
      const ev = McxPerformanceMotionController.evaluateLane(points, tick, totalTicks, getInterp(paramId));
      if (ev !== null) out.push({ paramId, value: ev });
    }
    return out;
  }

  public applyMidiTakeover(slotKey: string, incomingNorm: number, currentNorm: number): number | null {
    const phys = clamp01(incomingNorm);
    const cur = clamp01(currentNorm);
    if (this.takeoverMode === 'jump') return phys;
    const prev = this.hwTrackers.get(slotKey) ?? { lastPhys: null, caught: false };
    if (this.takeoverMode === 'pickup') {
      const close = Math.abs(phys - cur) <= 0.03;
      const crossed = prev.lastPhys !== null && ((prev.lastPhys < cur && phys >= cur) || (prev.lastPhys > cur && phys <= cur));
      if (!prev.caught && !close && !crossed) {
        this.hwTrackers.set(slotKey, { lastPhys: phys, caught: false });
        return null;
      }
      this.hwTrackers.set(slotKey, { lastPhys: phys, caught: true });
      return phys;
    }
    if (prev.lastPhys === null || Math.abs(phys - cur) <= 0.01) {
      this.hwTrackers.set(slotKey, { lastPhys: phys, caught: true });
      return Math.abs(phys - cur) <= 0.01 ? phys : cur;
    }
    const delta = phys - prev.lastPhys;
    let out = cur;
    if (delta > 0 && prev.lastPhys < 1) out = cur + (delta / Math.max(0.001, 1 - prev.lastPhys)) * (1 - cur);
    else if (delta < 0 && prev.lastPhys > 0) out = cur + (delta / Math.max(0.001, prev.lastPhys)) * cur;
    this.hwTrackers.set(slotKey, { lastPhys: phys, caught: true });
    return clamp01(out);
  }

  public resetTakeoverCatch(slotKey?: string): void {
    if (slotKey) this.hwTrackers.delete(slotKey);
    else this.hwTrackers.clear();
  }
}

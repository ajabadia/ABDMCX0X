import { describe, expect, it } from 'vitest';
import { McxPerformanceMotionController, type MotionStore } from './McxPerformanceMotion';

describe('McxPerformanceMotionController (anti-jump & motion recording)', () => {
  it('records with thinning in touch mode and ramps smoothly back on release', () => {
    const ctrl = new McxPerformanceMotionController();
    const store: MotionStore = { cutoff: [{ tick: 0, value: 0.2 }, { tick: 96, value: 0.8 }] };

    ctrl.beginGesture(0, 'cutoff', true, true);
    ctrl.recordPoint(0, 'cutoff', 0.9, 24, 384, store);
    ctrl.recordPoint(0, 'cutoff', 0.901, 25, 384, store); // thinned (< 0.004 diff & < 6 ticks)
    expect(store.cutoff).toHaveLength(3);

    const interpAuto = McxPerformanceMotionController.evaluateLane(store.cutoff, 48, 384, 'linear');
    expect(interpAuto).toBeCloseTo(0.8666, 2);

    ctrl.endGesture(0, 'cutoff', 0.9, 0.2, 1000, true);
    const mid = ctrl.stepPlayback(0, 48, 384, store, () => 'linear', 1030, false);
    const valMid = mid.find((u) => u.paramId === 'cutoff')?.value ?? 0;
    expect(valMid).toBeGreaterThan(0.5);
    expect(valMid).toBeLessThan(0.9);
  });

  it('evaluates step interpolation cleanly for discrete parameters and holds latch writes', () => {
    const ctrl = new McxPerformanceMotionController();
    ctrl.setRecordMode('latch');
    const store: MotionStore = { wave: [{ tick: 0, value: 0 }, { tick: 48, value: 1 }] };

    expect(McxPerformanceMotionController.evaluateLane(store.wave, 36, 96, 'step')).toBe(0);
    expect(McxPerformanceMotionController.evaluateLane(store.wave, 60, 96, 'step')).toBe(1);

    ctrl.beginGesture(0, 'wave', true, true);
    ctrl.recordPoint(0, 'wave', 0.7, 12, 96, store);
    ctrl.endGesture(0, 'wave', 0.7, 0, 1000, true);
    const held = ctrl.stepPlayback(0, 24, 96, store, () => 'linear', 1050, true);
    expect(held.find((u) => u.paramId === 'wave')?.value).toBeCloseTo(0.7);
  });

  it('supports override + reEnableAllOverrides smooth ramp and auto-return mode', () => {
    const ctrl = new McxPerformanceMotionController();
    const store: MotionStore = { cutoff: [{ tick: 0, value: 0.2 }, { tick: 96, value: 0.2 }] };

    ctrl.beginGesture(0, 'cutoff', true, false);
    expect(ctrl.hasOverrides(0)).toBe(true);
    expect(ctrl.stepPlayback(0, 48, 384, store, () => 'linear', 1000, false)).toEqual([]);

    ctrl.endGesture(0, 'cutoff', 0.9, 0.2, 1000, false);
    expect(ctrl.hasOverrides(0)).toBe(true);
    ctrl.reEnableAllOverrides(0, { cutoff: 0.9 }, { cutoff: 0.2 }, 2000);
    expect(ctrl.hasOverrides(0)).toBe(false);
    const rampStart = ctrl.stepPlayback(0, 48, 384, store, () => 'linear', 2030, false)[0];
    expect(rampStart.value).toBeGreaterThan(0.2);
    expect(rampStart.value).toBeLessThan(0.9);
    const rampEnd = ctrl.stepPlayback(0, 48, 384, store, () => 'linear', 2065, false)[0];
    expect(rampEnd.value).toBeCloseTo(0.2);

    ctrl.setOverrideMode('auto-return');
    ctrl.beginGesture(1, 'res', true, false);
    expect(ctrl.hasOverrides(1)).toBe(false);
    ctrl.endGesture(1, 'res', 0.8, 0.2, 3000, false);
    const ret = ctrl.stepPlayback(1, 48, 384, { res: [{ tick: 0, value: 0.2 }] }, () => 'linear', 3030, false)[0];
    expect(ret.value).toBeCloseTo(0.5);
  });

  it('eliminates physical MIDI jumps with scale, pickup and jump takeover modes', () => {
    const ctrl = new McxPerformanceMotionController();
    ctrl.setTakeoverMode('pickup');
    expect(ctrl.applyMidiTakeover('perf.macro.1', 0.1, 0.8)).toBeNull();
    expect(ctrl.applyMidiTakeover('perf.macro.1', 0.5, 0.8)).toBeNull();
    expect(ctrl.applyMidiTakeover('perf.macro.1', 0.85, 0.8)).toBeCloseTo(0.85);

    ctrl.resetTakeoverCatch();
    ctrl.setTakeoverMode('scale');
    expect(ctrl.applyMidiTakeover('perf.macro.1', 0.2, 0.8)).toBeCloseTo(0.8);
    const scaled = ctrl.applyMidiTakeover('perf.macro.1', 0.6, 0.8);
    expect(scaled).toBeGreaterThan(0.8);
    expect(scaled).toBeLessThanOrEqual(1);

    ctrl.setTakeoverMode('jump');
    expect(ctrl.applyMidiTakeover('perf.macro.1', 0.1, 0.8)).toBeCloseTo(0.1);
  });
});

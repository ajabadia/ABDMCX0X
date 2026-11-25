/**
 * ABDMCX0X -- McxProjectTemplates.ts
 * Starter templates and clean slate project initializers.
 * Strict line limit: < 200 lines.
 */

import type { McxHostBridge } from '../bridge/McxHostBridge';
import { McxSongBridge } from '../bridge/McxSongBridge';
import { createDefaultBankLayout, createSinglePartBankLayout } from '../ui/McxBankLayout';
import { createDefaultPartState } from '../ui/McxPartState';
import type { McxAppState } from './McxAppState';

/** Resets the groovebox to a clean slate: 1 track (Part 0), FX Rack cleared. */
export function resetToEmptyProject(state: McxAppState, bridge: McxHostBridge): void {
  state.partsState[0] = {
    ...createDefaultPartState(0),
    enabled: true, name: 'Init Tone', kind: 'chromatic', midiChannel: 1, routeMode: 0,
    factoryPresetIndex: undefined, sequence: undefined, mute: false, solo: false,
    partLevel: 0.85, partPan: 0, reverbSend: 0, chorusSend: 0, delaySend: 0, auxSend: 0,
    insertSlot: -1, filterCutoff: 0.8, filterResonance: 0.1, driveAmount: 0,
    eqLowGain: 0, eqMidGain: 0, eqHighGain: 0,
  };
  bridge.setParam(0, 'partEnabled', 1);
  bridge.setParam(0, 'partKind', 0);
  bridge.setParam(0, 'partLevel', 0.85);
  bridge.setParam(0, 'partPan', 0);
  bridge.setParam(0, 'reverbSend', 0);
  bridge.setParam(0, 'chorusSend', 0);
  bridge.setParam(0, 'delaySend', 0);
  bridge.setParam(0, 'auxSend', 0);
  bridge.setPartInsertSlot?.(0, -1);
  bridge.setPartPresetName?.(0, 'Init Tone');
  bridge.setPartPattern(0, { bars: 1, ppq: 96, mode: 'chromatic', notes: [], motion: {} });

  for (let i = 1; i < state.partsState.length; ++i) {
    state.partsState[i] = {
      ...createDefaultPartState(i),
      enabled: false, name: `Part ${i + 1}`, kind: 'chromatic',
      factoryPresetIndex: undefined, sequence: undefined, mute: false, solo: false,
      partLevel: 0.85, partPan: 0, reverbSend: 0, chorusSend: 0, delaySend: 0, auxSend: 0, insertSlot: -1,
    };
    bridge.setParam(i, 'partEnabled', 0);
    bridge.setParam(i, 'partKind', 0);
    bridge.setPartInsertSlot?.(i, -1);
    bridge.setPartPattern(i, { bars: 1, ppq: 96, mode: 'chromatic', notes: [], motion: {} });
  }

  for (let s = 0; s < 8; ++s) {
    bridge.removeRackSlot(s);
    bridge.setRackSlotBypass(s, false);
  }
  for (let b = 0; b < 4; ++b) {
    bridge.setSendSlotTarget(b, -1);
    bridge.setSendBusMute(b, false);
  }
  state.refs.rackColumn?.clearAllSlots?.();

  const songBridge = new McxSongBridge(bridge);
  for (let sc = 0; sc < 8; ++sc) songBridge.updateScene(sc, 0, 0, `Scene ${sc + 1}`);
  songBridge.setSongMode(false);
  songBridge.setSongLoop(false);

  state.bankLayout = createSinglePartBankLayout();
  state.clearPreSoloMemory();
  bridge.clearLocalBankLayoutFallback?.();
  state.focusedPart = 0;
  state.syncBankLayoutToHost();

  bridge.allNotesOff();
  state.setTransportPlaying(false);

  state.refreshPartList();
  state.updateLcdLine1(0);
  state.setLcdLine2('NEW PROJECT: 1 EMPTY TRACK (BANK A)');
}

function applyDefs(state: McxAppState, bridge: McxHostBridge, defs: Array<{ name: string; kind: 'chromatic' | 'drum_map'; ch: number; cat: number }>): void {
  state.bankLayout = createDefaultBankLayout();
  state.bankLayout.bankCount = 1;
  defs.forEach((def, i) => {
    const ps = state.partsState[i];
    ps.enabled = true; ps.name = def.name; ps.kind = def.kind; ps.midiChannel = def.ch; ps.categoryId = def.cat;
    bridge.setParam(i, 'partEnabled', 1);
    bridge.setParam(i, 'partKind', def.kind === 'drum_map' ? 1 : 0);
  });
}

/** Applies a starter template inspired by modern DAWs (Logic Pro / Akai MPC). */
export function applyStarterTemplate(
  templateId: 'empty' | 'factory' | 'starter8' | 'electronic' | 'live64',
  state: McxAppState,
  bridge: McxHostBridge
): void {
  if (templateId === 'empty') {
    resetToEmptyProject(state, bridge);
    return;
  }
  if (templateId === 'factory') {
    state.resetToFactoryLayout();
    bridge.resetToFactory();
    state.refs.rackColumn?.resetToFactoryRack?.();
    state.uploadInitialPatterns();
    state.refreshPartList();
    state.updateLcdLine1(0);
    state.setLcdLine2('TEMPLATE: 16-TRACK FACTORY (MC-303)');
    return;
  }

  resetToEmptyProject(state, bridge);

  if (templateId === 'starter8') {
    applyDefs(state, bridge, [
      { name: 'Kick Drum', kind: 'drum_map', ch: 10, cat: 9 },
      { name: 'Snare Drum', kind: 'drum_map', ch: 10, cat: 9 },
      { name: 'Hi-Hats', kind: 'drum_map', ch: 10, cat: 9 },
      { name: 'Perc / Clap', kind: 'drum_map', ch: 10, cat: 9 },
      { name: 'Sub Bass', kind: 'chromatic', ch: 1, cat: 1 },
      { name: 'Chords / Keys', kind: 'chromatic', ch: 2, cat: 3 },
      { name: 'Lead Synth', kind: 'chromatic', ch: 3, cat: 0 },
      { name: 'Atmosphere Pad', kind: 'chromatic', ch: 4, cat: 4 },
    ]);
    state.syncBankLayoutToHost();
    state.refreshPartList();
    state.setLcdLine2('TEMPLATE: 8-TRACK STARTER');
    return;
  }

  if (templateId === 'electronic') {
    applyDefs(state, bridge, [
      { name: 'TR-Kick', kind: 'drum_map', ch: 10, cat: 9 },
      { name: 'TR-Snare', kind: 'drum_map', ch: 10, cat: 9 },
      { name: 'TR-OpenHat', kind: 'drum_map', ch: 10, cat: 9 },
      { name: 'Clap / Rim', kind: 'drum_map', ch: 10, cat: 9 },
      { name: 'Acid Bass', kind: 'chromatic', ch: 1, cat: 1 },
      { name: 'Rave Stab', kind: 'chromatic', ch: 2, cat: 0 },
      { name: 'Dark Pad', kind: 'chromatic', ch: 3, cat: 4 },
      { name: 'Noise FX', kind: 'chromatic', ch: 4, cat: 8 },
    ]);
    state.partsState[0].sequence = {
      bars: 1, ppq: 96, mode: 'drum',
      notes: [0, 96, 192, 288].map((startTick) => ({ midiNote: 36, startTick, durationTicks: 24, velocity: 120 })),
      motion: {},
    };
    state.partsState[2].sequence = {
      bars: 1, ppq: 96, mode: 'drum',
      notes: [48, 144, 240, 336].map((startTick) => ({ midiNote: 46, startTick, durationTicks: 24, velocity: 100 })),
      motion: {},
    };
    state.uploadInitialPatterns();
    state.syncBankLayoutToHost();
    state.refreshPartList();
    state.setLcdLine2('TEMPLATE: ELECTRONIC / SYNTHWAVE');
    return;
  }

  if (templateId === 'live64') {
    state.bankLayout = createDefaultBankLayout();
    state.bankLayout.bankCount = 8;
    for (let i = 0; i < state.partsState.length; ++i) {
      const ps = state.partsState[i];
      ps.enabled = true; ps.name = `EXT MIDI P${String(i + 1).padStart(2, '0')}`;
      ps.routeMode = 1; ps.midiChannel = (i % 16) + 1;
      bridge.setParam(i, 'partEnabled', 1);
      bridge.setParam(i, 'routeMode', 1);
    }
    state.syncBankLayoutToHost();
    state.refreshPartList();
    state.setLcdLine2('TEMPLATE: LIVE PERFORMANCE 64P (EXT MIDI)');
  }
}

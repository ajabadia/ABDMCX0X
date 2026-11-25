/**
 * ABDMCX0X -- McxMidiLearnAutoDetect.test.ts
 * Vitest integration tests for MIDI Learn disk profiles & port/SysEx auto-detection.
 * Strict line limit: < 160 lines.
 */

import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMidiLearnStore } from '@abdsynths/shared/components/midiLearn.js';
import {
  createMidiLearnAutoDetector,
  matchProfileByIdentityReply,
  matchProfileByPortName,
  parseMidiLearnCatalogJson,
} from './McxMidiLearnAutoDetect';

function buildDiskCatalogFromRepo(): string {
  const dir = path.resolve(process.cwd(), 'MidiLearn');
  const profiles = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((fn) => {
      const profile = JSON.parse(fs.readFileSync(path.join(dir, fn), 'utf8'));
      return {
        device: profile.device,
        displayName: profile.displayName,
        portMatchHints: profile.portMatchHints,
        mappingCount: profile.mappings.length,
        source: 'factory',
        profile,
      };
    });
  return JSON.stringify({ profiles });
}

describe('McxMidiLearnAutoDetect', () => {
  beforeEach(() => { localStorage.clear(); });

  it('carga e importa en midiLearnStore los 5 perfiles JSON reales de MidiLearn/', () => {
    const catalogJson = buildDiskCatalogFromRepo();
    const profiles = parseMidiLearnCatalogJson(catalogJson);
    expect(profiles).toHaveLength(5);

    const store = createMidiLearnStore({ persist: false });
    for (const prof of profiles) {
      const res = store.importJson(prof.rawJson);
      expect(res.ok).toBe(true);
      expect(store.getState().mappings.length).toBe(prof.mappingCount);
    }
  });

  it('empareja puertos hardware específicos antes del fallback generic_cc', () => {
    const profiles = parseMidiLearnCatalogJson(buildDiskCatalogFromRepo());
    expect(matchProfileByPortName(profiles, 'Roland MC-303 Port 1')?.device).toBe('roland_mc303');
    expect(matchProfileByPortName(profiles, 'BOSS DR-5 USB')?.device).toBe('boss_dr5');
    expect(matchProfileByPortName(profiles, 'EMAX II MIDI')?.device).toBe('emu_emax2');
    expect(matchProfileByPortName(profiles, 'Mackie Control MIDI')?.device).toBe('generic_cc');
    expect(matchProfileByPortName(profiles, 'Unrelated Port')).toBeNull();
  });

  it('autodetección por Universal Identity Reply SysEx y por conexión MIDI aplica al store una sola vez', () => {
    const profiles = parseMidiLearnCatalogJson(buildDiskCatalogFromRepo());
    expect(matchProfileByIdentityReply(profiles, [0xF0, 0x7E, 0x10, 0x06, 0x02, 0x41, 0x46, 0x00, 0x00, 0x00, 0xF7])?.device)
      .toBe('roland_mc303');
    expect(matchProfileByIdentityReply(profiles, [0xF0, 0x7E, 0x00, 0x06, 0x02, 0x18, 0x01, 0x00, 0x00, 0x00, 0xF7])?.device)
      .toBe('emu_emax2');

    const store = createMidiLearnStore({ persist: false });
    const onApplied = vi.fn();
    const detector = createMidiLearnAutoDetector({
      store,
      bridge: { isNative: false, sendCommand: vi.fn() } as never,
      onApplied,
    });
    detector.setCatalogJson(buildDiskCatalogFromRepo());

    detector.handleMidiDevices({
      isStandalone: true,
      inputs: [{ portIndex: 1, id: 'p1', name: 'BOSS DR-5 MIDI', enabled: true }],
      outputs: [],
    });
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(detector.getLastAppliedDevice()).toBe('boss_dr5');
    expect(store.getState().mappings.length).toBe(10);

    // Repeating same device does not re-import unnecessarily
    detector.handleMidiDevices({
      isStandalone: true,
      inputs: [{ portIndex: 1, id: 'p1', name: 'BOSS DR-5 MIDI', enabled: true }],
      outputs: [],
    });
    expect(onApplied).toHaveBeenCalledTimes(1);

    // Identity reply from E-mu switches active learn map cleanly
    detector.handleSysEx(new Uint8Array([0xF0, 0x7E, 0x00, 0x06, 0x02, 0x18, 0x01, 0x00, 0x00, 0x00, 0xF7]));
    expect(detector.getLastAppliedDevice()).toBe('emu_emax2');
    expect(store.getState().mappings.length).toBe(12);
  });
});

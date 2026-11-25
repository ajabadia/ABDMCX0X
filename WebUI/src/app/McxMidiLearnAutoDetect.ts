/**
 * ABDMCX0X -- McxMidiLearnAutoDetect.ts
 * Disk profile catalog & automatic matching by MIDI port name or Universal Identity Reply SysEx.
 * Strict line limit: < 180 lines. 100% tokenized.
 */

import type { McxHostBridge, McxMidiDevicesDto } from '../bridge/McxHostBridge';

export interface MidiLearnDiskProfile {
  device: string;
  displayName: string;
  portMatchHints: string[];
  mappingCount: number;
  source: 'workingDir' | 'factory';
  rawJson: string;
}

const STORAGE_AUTO_DETECT = 'abdmcx0x.midiLearn.autoDetect.v1';

const normId = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function parseMidiLearnCatalogJson(catalogJson: string): MidiLearnDiskProfile[] {
  if (!catalogJson) return [];
  try {
    const parsed = JSON.parse(catalogJson);
    const arr = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
    const out: MidiLearnDiskProfile[] = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const profileObj = item.profile && typeof item.profile === 'object' ? item.profile : null;
      const rawJson = typeof item.rawJson === 'string'
        ? item.rawJson
        : (profileObj ? JSON.stringify(profileObj) : '');
      const dev = String(item.device || profileObj?.device || '').trim();
      if (!dev || !rawJson) continue;
      out.push({
        device: dev,
        displayName: String(item.displayName || profileObj?.displayName || dev),
        portMatchHints: Array.isArray(item.portMatchHints) ? item.portMatchHints.map(String).filter(Boolean) : [],
        mappingCount: Number(item.mappingCount ?? profileObj?.mappings?.length ?? 0),
        source: item.source === 'workingDir' ? 'workingDir' : 'factory',
        rawJson,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function matchProfileByDeviceId(
  profiles: MidiLearnDiskProfile[],
  deviceId: string,
): MidiLearnDiskProfile | null {
  const target = normId(deviceId);
  if (!target) return null;
  for (const p of profiles) {
    if (normId(p.device) === target) return p;
  }
  return null;
}

export function matchProfileByPortName(
  profiles: MidiLearnDiskProfile[],
  portName: string,
): MidiLearnDiskProfile | null {
  const lower = portName.trim().toLowerCase();
  if (!lower) return null;
  let best: MidiLearnDiskProfile | null = null;
  let bestLen = 0;
  let bestGeneric = true;
  for (const p of profiles) {
    const isGen = p.device === 'generic_cc';
    for (const hint of p.portMatchHints) {
      const h = hint.trim().toLowerCase();
      if (!h || !lower.includes(h)) continue;
      if (!best || (bestGeneric && !isGen) || (bestGeneric === isGen && h.length > bestLen)) {
        best = p;
        bestLen = h.length;
        bestGeneric = isGen;
      }
    }
  }
  return best;
}

export function matchProfileByIdentityReply(
  profiles: MidiLearnDiskProfile[],
  bytes: Uint8Array | number[],
): MidiLearnDiskProfile | null {
  // Universal Device Inquiry Reply: F0 7E <dev> 06 02 <mfg> <famLSB> <famMSB> <modLSB> <modMSB> ... F7
  if (!bytes || bytes.length < 11) return null;
  if (bytes[0] !== 0xF0 || bytes[1] !== 0x7E || bytes[3] !== 0x06 || bytes[4] !== 0x02) return null;
  const mfg = bytes[5] & 0x7F;
  const fam = (bytes[6] & 0x7F) | ((bytes[7] & 0x7F) << 7);
  if (mfg === 0x41) {
    if (fam === 0x0046 || (bytes[6] & 0x7F) === 0x46) return matchProfileByDeviceId(profiles, 'roland_mc303');
    if (fam === 0x003B || (bytes[6] & 0x7F) === 0x3B) return matchProfileByDeviceId(profiles, 'boss_dr5');
    return matchProfileByDeviceId(profiles, 'roland_mc303');
  }
  if (mfg === 0x18) return matchProfileByDeviceId(profiles, 'emu_emax2');
  return null;
}

export interface MidiLearnAutoDetectorOpts {
  store: { importJson: (raw: string) => { ok: boolean; count?: number } };
  bridge: McxHostBridge;
  onApplied?: (prof: MidiLearnDiskProfile, reason: string, portName?: string) => void;
  onCatalogChanged?: (profiles: MidiLearnDiskProfile[]) => void;
}

export function createMidiLearnAutoDetector(opts: MidiLearnAutoDetectorOpts) {
  let profiles: MidiLearnDiskProfile[] = [];
  let lastAppliedDevice = '';
  let autoEnabled = true;
  try {
    const saved = localStorage.getItem(STORAGE_AUTO_DETECT);
    if (saved === '0' || saved === 'false') autoEnabled = false;
  } catch { /* ignore */ }

  const applyProfile = (prof: MidiLearnDiskProfile, reason: string, portName = ''): boolean => {
    const res = opts.store.importJson(prof.rawJson);
    if (!res?.ok) return false;
    lastAppliedDevice = prof.device;
    opts.onApplied?.(prof, reason, portName);
    return true;
  };

  const setCatalogJson = (json: string): MidiLearnDiskProfile[] => {
    profiles = parseMidiLearnCatalogJson(json);
    opts.onCatalogChanged?.(profiles);
    return profiles;
  };

  const refreshProfiles = async (): Promise<MidiLearnDiskProfile[]> => {
    if (opts.bridge.isNative) {
      opts.bridge.sendCommand({ type: 'getMidiLearnProfiles' }, { type: 'GET_MIDILEARN_PROFILES' });
      return profiles;
    }
    try {
      const resp = await fetch('./midilearn/index.json');
      if (resp.ok) setCatalogJson(await resp.text());
    } catch { /* ignore in offline/vitest without server */ }
    return profiles;
  };

  const handleMidiDevices = (dto: McxMidiDevicesDto): MidiLearnDiskProfile | null => {
    if (!autoEnabled || profiles.length === 0) return null;
    for (const dev of dto.inputs ?? []) {
      if (!dev.enabled || !dev.name) continue;
      const match = matchProfileByPortName(profiles, dev.name);
      if (match && match.device !== lastAppliedDevice && applyProfile(match, 'port_name', dev.name)) {
        return match;
      }
    }
    return null;
  };

  const handleSysEx = (bytes: Uint8Array | number[]): MidiLearnDiskProfile | null => {
    if (!autoEnabled || profiles.length === 0) return null;
    const match = matchProfileByIdentityReply(profiles, bytes);
    if (match && match.device !== lastAppliedDevice && applyProfile(match, 'identity_reply')) {
      return match;
    }
    return null;
  };

  const handleNativeAutoDetect = (ev: { device: string; displayName: string; reason: string; portName: string; profileJson: string }): boolean => {
    if (!autoEnabled || !ev.profileJson || ev.device === lastAppliedDevice) return false;
    const existing = matchProfileByDeviceId(profiles, ev.device);
    const prof: MidiLearnDiskProfile = existing ?? {
      device: ev.device,
      displayName: ev.displayName || ev.device,
      portMatchHints: [],
      mappingCount: 0,
      source: 'workingDir',
      rawJson: ev.profileJson,
    };
    return applyProfile({ ...prof, rawJson: ev.profileJson }, ev.reason || 'identity_reply', ev.portName);
  };

  return {
    getProfiles: () => profiles, isAutoEnabled: () => autoEnabled, getLastAppliedDevice: () => lastAppliedDevice,
    setAutoEnabled: (next: boolean) => { autoEnabled = Boolean(next); try { localStorage.setItem(STORAGE_AUTO_DETECT, autoEnabled ? '1' : '0'); } catch { /* ignore */ } },
    setCatalogJson, refreshProfiles,
    applyByDeviceId: (deviceId: string) => { const f = matchProfileByDeviceId(profiles, deviceId); return f ? applyProfile(f, 'manual') : false; },
    handleMidiDevices, handleSysEx, handleNativeAutoDetect,
  };
}

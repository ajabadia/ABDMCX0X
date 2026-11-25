/**
 * ABDMCX0X -- McxHostBridgeHelpers.ts
 * Native message dispatch and ArrayBuffer Base64 encoding helpers for McxHostBridge.
 * Strictly < 200 lines.
 */

import type {
  McxEngineDescriptorDto,
  McxExportCompleteDto,
  McxMidiDevicesDto,
  McxPartEngineStateDto,
  McxPartPresetsDto,
  McxSessionStateDto,
  McxSidechainConfigDto,
  McxWavRenderedDto,
} from './BridgeWasmTypes';

export const STORAGE_SETTINGS = 'abdmcx0x.systemSettings';
export const STORAGE_BANK_LAYOUT = 'abdmcx0x.bankLayout.v1';
export const STORAGE_SIDECHAIN = 'abdmcx0x.sidechain.v1';

export function readLocalJson<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
export function writeLocalStr(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* ignore */ }
}
export function readLocalSidechain(): McxSidechainConfigDto | null { return readLocalJson<McxSidechainConfigDto>(STORAGE_SIDECHAIN); }

export interface NativeBridgeCallbacks {
  dispatchTelemetry: (data: any) => void;
  onBankLoaded?: ((ok: boolean, sizeBytes: number) => void) | null;
  onBankIndexed?: ((ok: boolean, slot: number) => void) | null;
  onEngineCatalog?: ((engines: McxEngineDescriptorDto[]) => void) | null;
  onPartPresets?: ((dto: McxPartPresetsDto) => void) | null;
  onPartEngineState?: ((dto: McxPartEngineStateDto) => void) | null;
  onSongScenesState?: ((stateJson: string) => void) | null;
  onSessionState?: ((dto: McxSessionStateDto) => void) | null;
  onLibraryCatalog?: ((catalogJson: string) => void) | null;
  onRackState?: ((rackJson: string) => void) | null;
  onSystemSettings?: ((s: any) => void) | null;
  onMidiDevices?: ((dto: McxMidiDevicesDto) => void) | null;
  onPartPatternState?: ((part: number, patternJson: string) => void) | null;
  onExportComplete?: ((dto: McxExportCompleteDto) => void) | null;
  onWavRendered?: ((dto: McxWavRenderedDto) => void) | null;
  onMidiLearnProfiles?: ((catalogJson: string) => void) | null;
  onMidiLearnAutoDetect?: ((ev: { device: string; displayName: string; reason: string; portName: string; profileJson: string }) => void) | null;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function routeNativeBridgeEvent(data: any, cbs: NativeBridgeCallbacks): void {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'telemetry') {
    cbs.dispatchTelemetry(data);
  } else if (data.type === 'bankLoaded') {
    cbs.onBankLoaded?.(Boolean(data.ok), Number(data.sizeBytes ?? 0));
  } else if (data.type === 'bankIndexed') {
    cbs.onBankIndexed?.(Boolean(data.ok), Number(data.slot ?? -1));
  } else if (data.type === 'engineCatalog' && Array.isArray(data.engines)) {
    cbs.onEngineCatalog?.(data.engines);
  } else if (data.type === 'partPresets') {
    cbs.onPartPresets?.(data as McxPartPresetsDto);
  } else if (data.type === 'partEngineState') {
    cbs.onPartEngineState?.(data as McxPartEngineStateDto);
  } else if (data.type === 'songScenesState') {
    cbs.onSongScenesState?.(String(data.stateJson ?? ''));
  } else if (data.type === 'sessionState') {
    cbs.onSessionState?.(data as McxSessionStateDto);
  } else if (data.type === 'libraryCatalog') {
    cbs.onLibraryCatalog?.(String(data.catalogJson ?? ''));
  } else if (data.type === 'partPatternState') {
    cbs.onPartPatternState?.(Number(data.part ?? 0), String(data.patternJson ?? '{}'));
  } else if (data.type === 'exportComplete') {
    cbs.onExportComplete?.({
      ok: Boolean(data.ok), kind: String(data.kind ?? ''),
      path: data.path ? String(data.path) : undefined, count: data.count !== undefined ? Number(data.count) : undefined,
    });
  } else if (data.type === 'midiDevices') {
    cbs.onMidiDevices?.({
      isStandalone: Boolean(data.isStandalone),
      inputs: Array.isArray(data.inputs) ? data.inputs : [],
      outputs: Array.isArray(data.outputs) ? data.outputs : [],
    });
  } else if (data.type === 'midiLearnProfiles') {
    cbs.onMidiLearnProfiles?.(String(data.catalogJson ?? '{"profiles":[]}'));
  } else if (data.type === 'midiLearnAutoDetect') {
    cbs.onMidiLearnAutoDetect?.({
      device: String(data.device ?? ''), displayName: String(data.displayName ?? ''),
      reason: String(data.reason ?? ''), portName: String(data.portName ?? ''),
      profileJson: String(data.profileJson ?? ''),
    });
  } else if (data.type === 'systemSettings') {
    cbs.onSystemSettings?.({
      workingDirectory: String(data.workingDirectory ?? ''),
      maxPolyphony: Number(data.maxPolyphony ?? 64),
      masterTuneHz: Number(data.masterTuneHz ?? 440),
      standaloneBpm: Number(data.standaloneBpm ?? 120),
      themeFamily: data.themeFamily,
      colorScheme: data.colorScheme,
      locale: data.locale,
    });
  }
}

export function routeWasmWorkletEvent(msg: any, cbs: NativeBridgeCallbacks): void {
  if (!msg || typeof msg !== 'object') return;
  try {
    if (msg.type === 'ENGINE_CATALOG' && typeof msg.catalogJson === 'string') {
      const parsed = JSON.parse(msg.catalogJson);
      if (Array.isArray(parsed)) cbs.onEngineCatalog?.(parsed);
    } else if (msg.type === 'PART_PRESETS' && typeof msg.presetsJson === 'string') {
      const parsed = JSON.parse(msg.presetsJson);
      if (parsed && typeof parsed.part === 'number') cbs.onPartPresets?.(parsed as McxPartPresetsDto);
    } else if (msg.type === 'RACK_STATE' && typeof msg.rackJson === 'string') {
      cbs.onRackState?.(msg.rackJson);
    } else if (msg.type === 'PART_PATTERN_STATE') {
      cbs.onPartPatternState?.(Number(msg.part ?? 0), String(msg.patternJson ?? '{}'));
    } else if (msg.type === 'BANK_INDEXED') {
      cbs.onBankIndexed?.(Boolean(msg.ok), Number(msg.slot ?? -1));
    } else if (msg.type === 'WAV_RENDERED') {
      cbs.onWavRendered?.({
        ok: Boolean(msg.ok), requestId: msg.requestId !== undefined ? Number(msg.requestId) : undefined,
        sampleRate: Number(msg.sampleRate ?? 44100),
        left: msg.left instanceof Float32Array ? msg.left : new Float32Array(0),
        right: msg.right instanceof Float32Array ? msg.right : new Float32Array(0),
      });
    }
  } catch { /* ignore malformed worklet JSON */ }
}

export function readLocalSettingsJson(storageKey: string): {
  workingDirectory: string; maxPolyphony: number; masterTuneHz: number; standaloneBpm: number;
  themeFamily?: string; colorScheme?: string; locale?: string;
} {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return { workingDirectory: '', maxPolyphony: 64, masterTuneHz: 440, standaloneBpm: 120, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { workingDirectory: '', maxPolyphony: 64, masterTuneHz: 440, standaloneBpm: 120 };
}

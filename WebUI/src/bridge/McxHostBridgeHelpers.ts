/**
 * ABDMCX0X -- McxHostBridgeHelpers.ts
 * Native message dispatch and ArrayBuffer Base64 encoding helpers for McxHostBridge.
 * Strictly < 200 lines.
 */

import type {
  McxEngineDescriptorDto,
  McxPartEngineStateDto,
  McxPartPresetsDto,
  McxSessionStateDto,
} from './BridgeWasmTypes';

export interface NativeBridgeCallbacks {
  dispatchTelemetry: (data: any) => void;
  onBankLoaded?: ((ok: boolean, sizeBytes: number) => void) | null;
  onEngineCatalog?: ((engines: McxEngineDescriptorDto[]) => void) | null;
  onPartPresets?: ((dto: McxPartPresetsDto) => void) | null;
  onPartEngineState?: ((dto: McxPartEngineStateDto) => void) | null;
  onSongScenesState?: ((stateJson: string) => void) | null;
  onSessionState?: ((dto: McxSessionStateDto) => void) | null;
  onLibraryCatalog?: ((catalogJson: string) => void) | null;
  onRackState?: ((rackJson: string) => void) | null;
  onSystemSettings?: ((s: any) => void) | null;
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

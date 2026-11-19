/**
 * ABDMCX0X -- McxHostBridgeHelpers.ts
 * Native message dispatch and ArrayBuffer Base64 encoding helpers for McxHostBridge.
 * Strictly < 200 lines.
 */

import type {
  McxEngineDescriptorDto,
  McxPartEngineStateDto,
  McxPartPresetsDto,
} from './BridgeWasmTypes';

export interface NativeBridgeCallbacks {
  dispatchTelemetry: (data: any) => void;
  onBankLoaded?: ((ok: boolean, sizeBytes: number) => void) | null;
  onEngineCatalog?: ((engines: McxEngineDescriptorDto[]) => void) | null;
  onPartPresets?: ((dto: McxPartPresetsDto) => void) | null;
  onPartEngineState?: ((dto: McxPartEngineStateDto) => void) | null;
  onSongScenesState?: ((stateJson: string) => void) | null;
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

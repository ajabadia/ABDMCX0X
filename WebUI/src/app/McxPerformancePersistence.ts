/**
 * ABDMCX0X -- McxPerformancePersistence.ts
 * 4-layer persistence helpers (.abdperf.json, defaults, .mcxprj import) & param routing.
 * Strict line limit: < 145 lines. 0 #hex colors.
 */

import {
  deserializePerformancePreset, extractPartMapsFromProjectJson,
  serializePerformancePreset, type PerformanceMapState,
} from '@abdsynths/shared/components/performance-map';
import {
  findParameterById, getParameterSpec, resolveCanonicalSpecId, type ParameterSpecDocument,
} from '@abdsynths/shared/contracts/parameter-catalog';
import type { McxHostBridge, McxParamKey } from '../bridge/McxHostBridge';
import type { McxAppState } from './McxAppState';
import type { McxPartUiState } from '../ui/McxPartState';

const DEFAULT_KEY_PREFIX = 'abdmcx0x.perfDefault.v1.';

export const ROMPLER_TO_PART_KEY: Record<string, McxParamKey> = {
  tvfCutoffOffset: 'filterCutoff',
  tvfResonanceOffset: 'filterResonance',
  envAttackOffset: 'ampAttack',
  envDecayOffset: 'ampDecay',
  envReleaseOffset: 'ampRelease',
  partDrive: 'driveAmount',
  partReverbSend: 'reverbSend',
  partChorusSend: 'chorusSend',
  partLevel: 'partLevel',
  partPan: 'partPan',
  vectorX: 'vectorX',
  vectorY: 'vectorY',
};

export function partMapStorageKey(partIdx: number, engineId: string): string {
  return `${partIdx}:${resolveCanonicalSpecId(engineId) ?? engineId}`;
}

export function loadUserEngineDefault(engineId: string): PerformanceMapState | null {
  try {
    const canon = resolveCanonicalSpecId(engineId) ?? engineId;
    const raw = localStorage.getItem(`${DEFAULT_KEY_PREFIX}${canon}`);
    if (!raw) return null;
    const spec = getParameterSpec(canon);
    const res = deserializePerformancePreset(raw, spec);
    return res.ok && res.preset ? res.preset : null;
  } catch { return null; }
}

export function saveUserEngineDefault(engineId: string, map: PerformanceMapState, bridge?: McxHostBridge): void {
  const canon = resolveCanonicalSpecId(engineId) ?? engineId;
  const json = serializePerformancePreset({ ...map, engineId: canon }, `${canon} Default`);
  try { localStorage.setItem(`${DEFAULT_KEY_PREFIX}${canon}`, json); } catch { /* ignore */ }
  if (bridge?.isNative) {
    bridge.sendCommand({ type: 'savePerformanceMap', engineId: canon, slug: '_default', content: json }, { type: 'NOOP' });
  }
}

export function savePerformancePresetFile(map: PerformanceMapState, name: string, bridge?: McxHostBridge): void {
  const canon = resolveCanonicalSpecId(map.engineId) ?? map.engineId;
  const slug = String(name || 'preset').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'preset';
  const json = serializePerformancePreset({ ...map, engineId: canon }, name);
  if (bridge?.isNative) {
    bridge.sendCommand({ type: 'savePerformanceMap', engineId: canon, slug, content: json }, { type: 'NOOP' });
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${slug}.abdperf.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function pickJsonFile(accept: string, onText: (text: string, filename: string) => void): void {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = accept; input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) { input.remove(); return; }
    const reader = new FileReader();
    reader.onload = () => { onText(String(reader.result ?? ''), file.name); input.remove(); };
    reader.onerror = () => { input.remove(); };
    reader.readAsText(file);
  };
  input.click();
}

export function importPerformancePresetFromFile(spec: ParameterSpecDocument,
  onDone: (res: ReturnType<typeof deserializePerformancePreset>) => void): void {
  pickJsonFile('.abdperf.json,.json', (txt) => onDone(deserializePerformancePreset(txt, spec)));
}

export function importPartMapFromExternalProject(activeEngineId: string,
  onFound: (entries: ReturnType<typeof extractPartMapsFromProjectJson>) => void): void {
  pickJsonFile('.mcxprj,.json', (txt) => onFound(extractPartMapsFromProjectJson(txt, activeEngineId)));
}

export function readInitialPartParamValues(spec: ParameterSpecDocument | null,
  ps: McxPartUiState, engineTypeId: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!spec) return out;
  for (const p of spec.parameters) {
    if (engineTypeId === 'structured_rompler' && ROMPLER_TO_PART_KEY[p.id]) {
      const k = ROMPLER_TO_PART_KEY[p.id];
      const v = (ps as any)[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        out[p.id] = k === 'partPan' ? (v + 1) * 0.5 : Math.max(0, Math.min(1, v));
        continue;
      }
    }
    const span = (p.max ?? 1) - (p.min ?? 0);
    out[p.id] = span > 0 ? Math.max(0, Math.min(1, ((p.default ?? p.min ?? 0) - (p.min ?? 0)) / span)) : 0.5;
  }
  return out;
}

export function dispatchDeckParamToPart(state: McxAppState, bridge: McxHostBridge,
  spec: ParameterSpecDocument | null, partIdx: number, paramId: string, norm01: number): void {
  const ps = state.partsState[partIdx];
  if (!ps) return;
  const engineId = ps.engineTypeId || 'structured_rompler';
  if (engineId === 'structured_rompler' && ROMPLER_TO_PART_KEY[paramId]) {
    const k = ROMPLER_TO_PART_KEY[paramId];
    const out = k === 'partPan' ? (norm01 * 2 - 1) : norm01;
    (ps as any)[k] = out;
    bridge.setParam(partIdx, k, out);
    state.refs.toneDrawer?.updateParamLive?.(k, out);
    return;
  }
  const pDef = findParameterById(spec, paramId);
  const val = (pDef && (pDef.max ?? 1) > (pDef.min ?? 0) && (pDef.max ?? 1) > 1.001)
    ? (pDef.min + norm01 * (pDef.max - pDef.min)) : norm01;
  bridge.setEngineParam(partIdx, paramId, val);
}

export function runPerformancePresetAction(action: string, map: PerformanceMapState | null,
  spec: ParameterSpecDocument | null, state: McxAppState, bridge: McxHostBridge,
  partIdx: number, onApplyMap: (next: PerformanceMapState) => void, onReset: () => void): void {
  const ps = state.partsState[partIdx];
  if (!ps) return;
  const eng = ps.engineTypeId || 'structured_rompler';
  if (action === 'reset') { delete state.performanceMaps[partMapStorageKey(partIdx, eng)]; onReset(); }
  else if (action === 'save-default' && map) { saveUserEngineDefault(eng, map, bridge); state.setLcdLine2(`PERF DEFAULT SAVED: ${eng}`); }
  else if (action === 'save-preset' && map) { const n = window.prompt('Performance Preset:', ps.name || eng); if (n) savePerformancePresetFile(map, n, bridge); }
  else if (action === 'load-preset' && spec) { importPerformancePresetFromFile(spec, (res) => { if (res.ok && res.preset) onApplyMap(res.preset); }); }
  else if (action === 'import-project') { importPartMapFromExternalProject(eng, (entries) => { if (entries[0]) { onApplyMap(entries[0].map); state.setLcdLine2(`IMPORTED PERF: ${entries[0].partName}`); } }); }
}

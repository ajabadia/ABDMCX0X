/**
 * ABDMCX0X -- McxSessionHydrator.ts
 * Session state hydration (DAW <-> WebUI), disk/local preset persistence, and Multi-Bus FX Rack bridge.
 * Strict line limit: < 200 lines.
 */

import type { FxRackBridgeAdapter } from '@abdsynths/shared/components';
import type { McxHostBridge, McxParamKey, McxSessionStateDto } from '../bridge/McxHostBridge';
import type { McxCatalogItem } from '../ui/McxBankDrawer';
import type { McxPartUiState } from '../ui/McxMixerConsole';
import type { McxAppState } from './McxAppState';

const USER_PRESETS_KEY = 'abdmcx0x.userPresets.v1';
const SNAP_PARAMS: McxParamKey[] = [
  'partLevel', 'partPan', 'reverbSend', 'chorusSend', 'delaySend', 'auxSend',
  'filterCutoff', 'filterResonance', 'filterModel', 'structureMode', 'pitchCoarse', 'pitchFine',
  'driveType', 'driveAmount', 'eqLowGain', 'eqMidGain', 'eqHighGain', 'lfo1Depth', 'lfo2Depth',
];

export interface McxSavePresetPayload {
  type: 'part' | 'multi'; partIndex?: number; name: string; sublibrary: string;
  categoryId: number; author: string; isSelfContained: boolean;
}

export function loadUserPresetsLocal(): McxCatalogItem[] {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveUserPresetLocal(item: McxCatalogItem): McxCatalogItem[] {
  const list = [item, ...loadUserPresetsLocal().filter((x) => x.id !== item.id)].slice(0, 128);
  try { localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  return list;
}

export function parseLibraryCatalogJson(catalogJson: string): McxCatalogItem[] {
  if (!catalogJson) return [];
  try {
    const parsed = JSON.parse(catalogJson);
    if (!Array.isArray(parsed?.items)) return [];
    return parsed.items.map((it: any) => ({
      id: String(it.id ?? ''), name: String(it.name ?? 'Unnamed'),
      sublibrary: String(it.sublibrary ?? 'Library'), categoryName: String(it.categoryName ?? 'General'),
      categoryId: Number(it.categoryId ?? 0), engineKind: String(it.engineKind ?? 'rompler_chromatic'),
      itemType: Number(it.itemType ?? 1), filePath: it.filePath ? String(it.filePath) : undefined,
      isFavorite: Boolean(it.isFavorite), bankId: it.bankId ? String(it.bankId) : undefined,
      bankSlotKind: it.bankSlotKind ? String(it.bankSlotKind) : undefined,
      bankItemIndex: typeof it.bankItemIndex === 'number' ? it.bankItemIndex : undefined,
    }));
  } catch { return []; }
}

export function persistAndNotifyPresetSave(bridge: McxHostBridge, state: McxAppState, payload: McxSavePresetPayload): void {
  const idx = payload.partIndex ?? state.focusedPart;
  const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'preset';
  if (payload.type === 'part') {
    const ps = state.partsState[idx];
    ps.name = payload.name; ps.categoryId = payload.categoryId; ps.factoryPresetIndex = undefined;
    const snapshot: Partial<McxPartUiState> = { kind: ps.kind, engineTypeIndex: ps.engineTypeIndex, engineTypeId: ps.engineTypeId };
    SNAP_PARAMS.forEach((k) => { (snapshot as any)[k] = (ps as any)[k]; });
    bridge.savePartPreset(idx, payload.name, payload.sublibrary, payload.categoryId);
    const items = saveUserPresetLocal({
      id: `user_part_${slug}`, name: payload.name, sublibrary: payload.sublibrary || 'User',
      categoryName: payload.sublibrary || 'User', categoryId: payload.categoryId, itemType: 1,
      engineKind: ps.kind === 'drum_map' ? 'rompler_drum_map' : 'rompler_chromatic', snapshot,
    });
    state.refs.bankDrawer?.setUserItems(items);
    state.notifyPartMetadataChanged(idx);
  } else {
    bridge.saveMultiPreset(payload.name, payload.sublibrary, payload.categoryId);
    const items = saveUserPresetLocal({
      id: `user_multi_${slug}`, name: payload.name, sublibrary: payload.sublibrary || 'User',
      categoryName: payload.sublibrary || 'User', categoryId: payload.categoryId, itemType: 2, engineKind: 'multi_setup',
    });
    state.refs.bankDrawer?.setUserItems(items);
  }
  state.setLcdLine2(`SAVED ${payload.name} [${payload.sublibrary}]`);
}

export function loadBankDrawerItem(bridge: McxHostBridge, state: McxAppState, partIdx: number, item: McxCatalogItem): void {
  const p = `P${String(partIdx + 1).padStart(2, '0')}`;
  if (item.itemType === 2) {
    if (bridge.isNative && (item.filePath || item.id)) {
      bridge.loadCatalogItem(0, item.id, item.filePath ?? ''); bridge.requestSessionState();
    }
    state.setLcdLine2(`LOADED MULTI: ${item.name}`);
    return;
  }
  const ps = state.partsState[partIdx];
  if (bridge.isNative && (item.filePath || item.bankId)) {
    bridge.loadCatalogItem(partIdx, item.id, item.filePath ?? '');
  } else if (typeof item.factoryPresetIndex === 'number') {
    ps.factoryPresetIndex = item.factoryPresetIndex;
    bridge.loadFactoryPreset(partIdx, item.factoryPresetIndex);
    bridge.setPartPresetName(partIdx, item.name);
  } else if (item.snapshot) {
    ps.factoryPresetIndex = undefined;
    Object.assign(ps, item.snapshot);
    if (typeof item.snapshot.engineTypeIndex === 'number') bridge.selectPartEngineType(partIdx, item.snapshot.engineTypeIndex);
    SNAP_PARAMS.forEach((k) => { const v = (ps as any)[k]; if (typeof v === 'number') bridge.setParam(partIdx, k, v); });
    bridge.setPartPresetName(partIdx, item.name);
  } else {
    bridge.setPartPresetName(partIdx, item.name);
  }
  ps.name = item.name;
  if (typeof item.categoryId === 'number') ps.categoryId = item.categoryId;
  if (item.engineKind?.includes('drum')) { ps.kind = 'drum_map'; bridge.setParam(partIdx, 'partKind', 1); }
  else if (item.engineKind?.includes('chromatic')) { ps.kind = 'chromatic'; bridge.setParam(partIdx, 'partKind', 0); }
  state.notifyPartMetadataChanged(partIdx);
  state.setLcdLine2(`${p} PRESET: ${item.name}`);
}

export function createFxRackBridge(bridge: McxHostBridge, state: McxAppState): FxRackBridgeAdapter {
  const busLbl = ['REV (A)', 'CHO (B)', 'DEL (C)', 'AUX (D)'];
  const gateLbl = ['DUCK', 'GATE REV', 'FREEZE', 'KILL'];
  return {
    setTopology: (topo) => { bridge.setFxTopology(topo); state.setLcdLine2(`FX RACK TOPOLOGY: ${topo}`); },
    setMacro: (slot, m) => bridge.setParam(state.focusedPart, slot === 0 ? 'reverbMacro' : 'chorusMacro', m),
    setCascadeInjections: (cho, del) => { bridge.setFxCascade(cho, del); state.setLcdLine2(`CASCADE: CHO ${Math.round(cho * 100)}% | DEL ${Math.round(del * 100)}%`); },
    muteSendBus: (b, m) => { bridge.setSendBusMute(b, m); state.setLcdLine2(`BUS ${busLbl[b] ?? b} ${m ? 'MUTED' : 'ACTIVE'}`); },
    setMute: (b, m) => { bridge.setSendBusMute(b, m); state.setLcdLine2(`BUS ${busLbl[b] ?? b} ${m ? 'MUTED' : 'ACTIVE'}`); },
    setGate: (g, v) => { bridge.setFxGate(g, v); state.setLcdLine2(`FX GATE [${gateLbl[g] ?? g}]: ${v >= 0.5 ? 'ON' : 'OFF'}`); },
    setTempoSync: (en) => { bridge.setFxTempoSync(en); state.setLcdLine2(`FX TEMPO SYNC: ${en ? 'ON' : 'FREE'}`); },
    setLimiterEnabled: (en) => { bridge.setLimiterEnabled(en); state.refs.masterPanel?.setLimiterEnabled(en); state.setLcdLine2(`LIMITER: ${en ? 'ON' : 'BYPASS'}`); },
    setLimiterCeilingDb: (db) => { bridge.setLimiterCeilingDb(db); state.setLcdLine2(`LIMITER CEILING: ${db.toFixed(1)} dB`); },
    setParam: (p, v) => {
      if (p === 'masterTempoBpm') {
        state.globalSettings.standaloneBpm = v; bridge.setTempo(v);
        state.refs.masterPanel?.setBpm(v); state.refs.stepStrip?.setBpm(v); state.refs.globalLfoModal?.setBpm(v);
      } else if (p === 'limCeiling') bridge.setLimiterCeilingDb(v);
      else if (p === 'limEnabled') { bridge.setLimiterEnabled(v >= 0.5); state.refs.masterPanel?.setLimiterEnabled(v >= 0.5); }
      else if (p === 'tempoSync') bridge.setFxTempoSync(v >= 0.5);
      else if (p === 'duckManual') bridge.setDuckMode(0, v >= 0.5);
      else if (p === 'duckAudio') bridge.setDuckMode(1, v >= 0.5);
      else if (p === 'duckMidi') bridge.setDuckMode(2, v >= 0.5);
      state.setLcdLine2(`FX ${p}: ${Number(v).toFixed(2).replace(/\.00$/, '')}`);
    },
  };
}

export function hydrateSessionState(state: McxAppState, dto: McxSessionStateDto): void {
  if (!dto || !Array.isArray(dto.parts)) return;
  for (const p of dto.parts) {
    const ps = state.partsState[p.index];
    if (!ps) continue;
    Object.assign(ps, {
      name: p.name || ps.name, kind: p.kind === 'drum_map' ? 'drum_map' : 'chromatic',
      midiChannel: p.midiChannel, midiPortIndex: p.midiPortIndex, routeMode: p.routeMode,
      mute: p.mute, solo: p.solo, followTranspose: p.followTranspose,
      engineTypeIndex: p.engineTypeIndex, engineTypeId: p.engineTypeId,
      partLevel: p.partLevel, partPan: p.partPan, reverbSend: p.reverbSend, chorusSend: p.chorusSend,
      delaySend: p.delaySend, auxSend: p.auxSend, sendAPre: p.sendAPre, sendBPre: p.sendBPre,
      sendCPre: p.sendCPre, sendDPre: p.sendDPre, insertSlot: p.insertSlot,
      driveType: p.driveType, driveAmount: p.driveAmount, eqLowGain: p.eqLowGain, eqMidGain: p.eqMidGain, eqHighGain: p.eqHighGain,
      filterCutoff: p.filterCutoff, filterResonance: p.filterResonance, filterModel: p.filterModel,
      structureMode: p.structureMode, pitchCoarse: p.pitchCoarse, pitchFine: p.pitchFine,
      lfo1Shape: p.lfo1Shape, lfo1Sync: p.lfo1Sync, lfo1Rate: p.lfo1Rate, lfo1Depth: p.lfo1Depth, lfo1Target: p.lfo1Target,
      lfo2Shape: p.lfo2Shape, lfo2Sync: p.lfo2Sync, lfo2Rate: p.lfo2Rate, lfo2Depth: p.lfo2Depth, lfo2Target: p.lfo2Target,
    });
  }
  state.refs.rackColumn?.hydrateFromHost(dto.rackJson, dto.sendTargets);
  state.refs.masterPanel?.setVolume(dto.masterGain);
  state.refs.masterPanel?.setLimiterEnabled(dto.limiterEnabled);
  state.refs.globalDrawer?.syncFromSession(dto);
  state.refs.settingsModal?.syncGlobalTranspose(dto.globalTranspose);
  state.refs.fxRackModal?.hydrateFromHost?.({
    fxTopology: dto.fxTopology, limiterEnabled: dto.limiterEnabled,
    limiterCeilingDb: dto.limiterCeilingDb, sendTargets: dto.sendTargets,
  });
  state.notifyPartMetadataChanged(state.focusedPart);
}

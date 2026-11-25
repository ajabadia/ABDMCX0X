/**
 * ABDMCX0X -- McxProjectManager.ts
 * Project management, recent list, and .mcxprj serialization.
 * Strict line limit: < 200 lines.
 */

import type { McxHostBridge } from '../bridge/McxHostBridge';
import { deserializeBankLayoutJson, serializeBankLayoutJson } from '../ui/McxBankLayout';
import type { McxPartUiState } from '../ui/McxPartState';
import type { McxAppState } from './McxAppState';

export { applyStarterTemplate, resetToEmptyProject } from './McxProjectTemplates';

const RECENT_PROJECTS_KEY = 'abdmcx0x.recentProjects.v1';

export interface RecentProjectEntry {
  name: string;
  date: string;
  bpm: number;
}

export interface McxProjectDto {
  version: 1;
  name: string;
  timestamp: string;
  bpm: number;
  bankLayoutJson?: string;
  parts: McxPartUiState[];
  rackJson?: string;
  songState?: any;
}

export function getRecentProjectsList(): RecentProjectEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordRecentProject(name: string, bpm: number): void {
  const list = [
    { name, date: new Date().toLocaleDateString(), bpm: Math.round(bpm) },
    ...getRecentProjectsList().filter((p) => p.name !== name),
  ].slice(0, 8);
  try {
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/**
 * Serializes the current project state to a JSON string.
 */
export function exportProjectJson(state: McxAppState, projectName = 'ABDMCX0X Project'): string {
  const dto: McxProjectDto = {
    version: 1,
    name: projectName,
    timestamp: new Date().toISOString(),
    bpm: state.globalSettings.standaloneBpm,
    bankLayoutJson: serializeBankLayoutJson(state.bankLayout),
    parts: state.partsState,
    songState: state.refs.getSongState?.() ?? null,
  };
  return JSON.stringify(dto, null, 2);
}

/**
 * Hydrates a project from a JSON string.
 */
export function importProjectJson(state: McxAppState, bridge: McxHostBridge, rawJson: string): boolean {
  try {
    const dto = JSON.parse(rawJson);
    if (!dto || !Array.isArray(dto.parts)) return false;

    if (dto.bpm && typeof dto.bpm === 'number') {
      state.globalSettings.standaloneBpm = dto.bpm;
      bridge.setTempo(dto.bpm);
      state.refs.masterPanel?.setBpm(dto.bpm);
    }

    if (dto.bankLayoutJson) {
      state.bankLayout = deserializeBankLayoutJson(dto.bankLayoutJson);
      state.syncBankLayoutToHost();
    }

    for (let i = 0; i < state.partsState.length && i < dto.parts.length; ++i) {
      const src = dto.parts[i];
      if (src) {
        Object.assign(state.partsState[i], src);
        if (src.sequence) {
          bridge.setPartPattern(i, src.sequence);
        }
      }
    }

    state.refreshPartList();
    state.updateLcdLine1(0);
    const projName = dto.name || 'Project';
    recordRecentProject(projName, state.globalSettings.standaloneBpm);
    state.setLcdLine2(`PROJECT LOADED: ${projName}`);
    return true;
  } catch (err) {
    console.error('[McxProjectManager] Failed to import project:', err);
    state.setLcdLine2('ERROR: INVALID PROJECT FILE');
    return false;
  }
}

/**
 * Triggers a browser download of the current project (.mcxprj).
 */
export function saveProjectToFile(state: McxAppState, defaultName = 'Project_1'): void {
  const json = exportProjectJson(state, defaultName);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${defaultName}.mcxprj`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  recordRecentProject(defaultName, state.globalSettings.standaloneBpm);
  state.setLcdLine2(`PROJECT SAVED: ${defaultName}.mcxprj`);
}

/**
 * Opens a file picker dialog to load a .mcxprj file.
 */
export function openProjectFromFilePicker(state: McxAppState, bridge: McxHostBridge): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.mcxprj,.json';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) {
      document.body.removeChild(input);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? '');
      importProjectJson(state, bridge, text);
      document.body.removeChild(input);
    };
    reader.onerror = () => {
      document.body.removeChild(input);
      state.setLcdLine2('ERROR READING PROJECT FILE');
    };
    reader.readAsText(file);
  };

  input.click();
}

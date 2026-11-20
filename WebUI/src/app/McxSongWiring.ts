/**
 * ABDMCX0X -- McxSongWiring.ts
 * Connects McxSongBridge, McxSceneBar (top LCD strip), and McxSongDrawer (bottom drawer).
 * Strict line limit: < 200 lines.
 */

import type { McxHostBridge, McxTelemetry } from '../bridge/McxHostBridge';
import { McxSongBridge, type McxSongScenesStateDto } from '../bridge/McxSongBridge';
import { McxSceneBar } from '../ui/McxSceneBar';
import { McxSongDrawer } from '../ui/McxSongDrawer';
import type { McxAppState } from './McxAppState';

function createDefaultSongState(): McxSongScenesStateDto {
  const names = ['Full', 'Drums+Bass', 'Breakdown', 'Lift +5', 'Bridge +7', 'Minor -3', 'Solo Drums', 'Drop'];
  const masks = [0x0000, 0xFDFE, 0x0200, 0x0000, 0x0000, 0x0000, 0xFDFF, 0x0000];
  const trs = [0, 0, 0, 5, 7, -3, 0, 0];
  return {
    songMode: false, songLoop: true, activeScene: 0, queuedScene: -1, songBlockIdx: 0, songBarInBlock: 0,
    scenes: names.map((name, index) => ({ index, name, muteMask: masks[index], transpose: trs[index] })),
    blocks: [
      { sceneIndex: 1, bars: 2, transposeOffset: 0 },
      { sceneIndex: 0, bars: 2, transposeOffset: 0 },
      { sceneIndex: 3, bars: 2, transposeOffset: 0 },
      { sceneIndex: 2, bars: 2, transposeOffset: 0 },
    ],
  };
}

export function mountSongAndScenesUi(bridge: McxHostBridge, state: McxAppState): void {
  const songBridge = new McxSongBridge(bridge);
  let songState: McxSongScenesStateDto = createDefaultSongState();
  let lastApplySeq = 0;
  let lastLiveKey = '';

  const barHost = document.getElementById('mcx-scene-bar-host');
  const mainCol = document.querySelector<HTMLElement>('.mcx-main-col');

  const openSongDrawer = (focusScene?: number, forceToggle = false) => {
    const d = state.refs.songDrawer;
    if (!d) return;
    if (forceToggle && d.isOpen()) { d.close(); return; }
    if (state.refs.toneDrawer?.isOpen()) state.refs.toneDrawer.close();
    d.open(focusScene);
    state.refs.sceneBar?.setDrawerOpen(true);
    state.refreshPartList();
  };

  if (mainCol) {
    state.refs.songDrawer = new McxSongDrawer({
      hostEl: mainCol,
      songBridge,
      getState: () => songState,
      onStateMutated: () => {
        state.refs.sceneBar?.setScenes(songState.scenes);
        state.refs.sceneBar?.updateLiveState(songState.activeScene, songState.queuedScene, songState.songMode, songState.songBlockIdx, songState.songBarInBlock, songState.blocks.length);
      },
      onClose: () => state.refs.sceneBar?.setDrawerOpen(false),
    });
  }

  if (barHost) {
    state.refs.sceneBar = new McxSceneBar({
      hostEl: barHost,
      onTriggerScene: (idx, imm) => {
        songBridge.triggerScene(idx, imm);
        state.setLcdLine2(`SCENE S${idx + 1} (${songState.scenes[idx]?.name ?? ''}) ${state.refs.masterPanel?.getTransportState()?.playing ? 'QUEUED @ BAR' : 'ACTIVE'}`);
      },
      onCaptureScene: (idx) => {
        songBridge.captureScene(idx);
        state.setLcdLine2(`SCENE S${idx + 1} CAPTURED FROM MIXER`);
      },
      onToggleSongMode: () => {
        songState.songMode = !songState.songMode;
        songBridge.setSongMode(songState.songMode);
        state.refs.masterPanel?.setSongModeActive?.(songState.songMode);
        state.refs.sceneBar?.updateLiveState(songState.activeScene, songState.queuedScene, songState.songMode, songState.songBlockIdx, songState.songBarInBlock, songState.blocks.length);
        state.refs.songDrawer?.syncLiveStatus();
        state.setLcdLine2(songState.songMode ? 'SONG MODE: ON (ARRANGEMENT)' : 'SONG MODE: OFF (LIVE SCENES)');
      },
      onToggleSongDrawer: () => openSongDrawer(undefined, true),
      onEditScene: (idx) => openSongDrawer(idx, false),
    });
    state.refs.sceneBar.setScenes(songState.scenes);
  }

  songBridge.onState((incoming) => {
    songState = incoming;
    state.refs.sceneBar?.setScenes(songState.scenes);
    state.refs.sceneBar?.updateLiveState(songState.activeScene, songState.queuedScene, songState.songMode, songState.songBlockIdx, songState.songBarInBlock, songState.blocks.length);
    state.refs.masterPanel?.setSongModeActive?.(songState.songMode);
    state.refs.songDrawer?.renderAll();
  });

  state.refs.toggleSongDrawer = () => openSongDrawer(undefined, true);
  state.refs.triggerLiveScene = (idx: number, immediate = false) => songBridge.triggerScene(idx, immediate);
  state.refs.refreshSongLocale = () => {
    state.refs.sceneBar?.refreshLocale();
    state.refs.songDrawer?.refreshLocale();
  };

  state.refs.onSongTelemetry = (tel: McxTelemetry) => {
    if (tel.activeScene === undefined) return;
    songState.activeScene = tel.activeScene;
    songState.queuedScene = tel.queuedScene ?? -1;
    songState.songMode = Boolean(tel.songMode);
    songState.songLoop = tel.songLoop !== false;
    songState.songBlockIdx = tel.songBlockIdx ?? 0;
    songState.songBarInBlock = tel.songBarInBlock ?? 0;
    const key = `${songState.activeScene}:${songState.queuedScene}:${songState.songMode}:${songState.songBlockIdx}:${songState.songBarInBlock}:${songState.blocks.length}`;
    if (key !== lastLiveKey) {
      lastLiveKey = key;
      state.refs.sceneBar?.updateLiveState(songState.activeScene, songState.queuedScene, songState.songMode, songState.songBlockIdx, songState.songBarInBlock, songState.blocks.length);
      state.refs.masterPanel?.setSongModeActive?.(songState.songMode);
      state.refs.songDrawer?.syncLiveStatus();
    }
    if (tel.sceneApplySeq && tel.sceneApplySeq !== lastApplySeq) {
      lastApplySeq = tel.sceneApplySeq;
      if (tel.appliedMuteMask64 && tel.appliedMuteMask64.length >= 4) {
        for (let p = 0; p < state.partsState.length; ++p) {
          const word = tel.appliedMuteMask64[Math.floor(p / 16)] ?? 0;
          state.partsState[p].mute = ((word & (1 << (p % 16))) !== 0);
        }
        state.refreshPartList();
      } else if (tel.appliedMuteMask !== undefined) {
        for (let p = 0; p < 16; ++p) state.partsState[p].mute = ((tel.appliedMuteMask & (1 << p)) !== 0);
        state.refreshPartList();
      }
      if (state.refs.toneDrawer?.isOpen()) state.refs.toneDrawer.syncPart(state.focusedPart, state.partsState[state.focusedPart]);
      if (state.refs.padModal?.isOpen()) state.refs.padModal.syncPart(state.focusedPart, state.partsState[state.focusedPart]);
      const scName = songState.scenes[songState.activeScene]?.name ?? `S${songState.activeScene + 1}`;
      const tr = tel.appliedTranspose ?? 0;
      state.setLcdLine2(`SCENE S${songState.activeScene + 1} (${scName}) · TR ${tr >= 0 ? '+' : ''}${tr} st`);
    }
  };

  bridge.onAudioStatus((status) => { if (status === 'ready') songBridge.requestState(); });
  songBridge.requestState();
}

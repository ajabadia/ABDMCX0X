/**
 * ABDMCX0X -- McxSongBridge.ts
 * Typed facade over McxHostBridge for Bar-Quantized Live Scenes (1..8) and Song Mode.
 * Strict line limit: < 200 lines.
 */

import { parseSongScenesStateJson, type McxSongBlockDto, type McxSongScenesStateDto } from './BridgeWasmTypes';
import type { McxHostBridge } from './McxHostBridge';

export type { McxSceneSlotDto, McxSongBlockDto, McxSongScenesStateDto } from './BridgeWasmTypes';

export class McxSongBridge {
  private readonly host: McxHostBridge;

  constructor(host: McxHostBridge) {
    this.host = host;
  }

  public triggerScene(sceneIndex: number, immediate = false): void {
    this.host.sendCommand(
      { type: 'triggerScene', sceneIndex, immediate },
      { type: 'TRIGGER_SCENE', sceneIndex, immediate },
    );
  }

  public captureScene(sceneIndex: number): void {
    this.host.sendCommand(
      { type: 'captureScene', sceneIndex },
      { type: 'CAPTURE_SCENE', sceneIndex },
    );
  }

  public updateScene(
    sceneIndex: number,
    muteMask: number,
    transpose: number,
    name: string,
    muteMask64?: [number, number, number, number],
  ): void {
    const mask64 = muteMask64 ?? [muteMask & 0xFFFF, 0, 0, 0];
    this.host.sendCommand(
      { type: 'updateScene', sceneIndex, muteMask, muteMask64: mask64, transpose, name },
      { type: 'UPDATE_SCENE', sceneIndex, muteMask, muteMask64: mask64, transpose, name },
    );
  }

  public setSongMode(enabled: boolean): void {
    this.host.sendCommand(
      { type: 'setSongMode', enabled },
      { type: 'SET_SONG_MODE', enabled },
    );
  }

  public setSongLoop(loop: boolean): void {
    this.host.sendCommand(
      { type: 'setSongLoop', loop },
      { type: 'SET_SONG_LOOP', loop },
    );
  }

  public jumpSongBlock(blockIndex: number, immediate = false): void {
    this.host.sendCommand(
      { type: 'jumpSongBlock', blockIndex, immediate },
      { type: 'JUMP_SONG_BLOCK', blockIndex, immediate },
    );
  }

  public setSongArrangement(blocks: McxSongBlockDto[], loop: boolean): void {
    this.host.sendCommand(
      { type: 'setSongArrangement', blocks, loop },
      { type: 'SET_SONG_ARRANGEMENT', blocks, loop },
    );
  }

  public requestState(): void {
    this.host.sendCommand({ type: 'getSongScenesState' }, { type: 'GET_SONG_STATE' });
  }

  public setMuteQuantize(enabled: boolean): void {
    this.host.sendCommand({ type: 'setMuteQuantize', enabled }, { type: 'SET_MUTE_QUANTIZE', enabled });
  }

  public togglePartMuteQuantized(partIdx: number, immediate = false): void {
    this.host.sendCommand(
      { type: 'togglePartMuteQuantized', partIdx, immediate },
      { type: 'TOGGLE_PART_MUTE_Q', partIdx, immediate },
    );
  }

  public toggleBankMuteQuantized(bankIdx: number, immediate = false): void {
    this.host.sendCommand(
      { type: 'toggleBankMuteQuantized', bankIdx, immediate },
      { type: 'TOGGLE_BANK_MUTE_Q', bankIdx, immediate },
    );
  }

  public onState(cb: (state: McxSongScenesStateDto) => void): void {
    this.host.onSongScenesState((json) => {
      const parsed = parseSongScenesStateJson(json);
      if (parsed) cb(parsed);
    });
  }
}

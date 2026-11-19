/**
 * ABDMCX0X -- McxSceneBar.ts
 * Compact always-visible Bar-Quantized Live Scene Bar (S1..S8) inside the top LCD strip.
 * Strict line limit: < 200 lines.
 */

import type { McxSceneSlotDto } from '../bridge/McxSongBridge';
import { t } from '../i18n/mcxI18n';
import { ICON_CLOCK, ICON_MENU } from './mcxIcons';

export interface McxSceneBarOptions {
  hostEl: HTMLElement;
  onTriggerScene: (sceneIdx: number, immediate: boolean) => void;
  onCaptureScene: (sceneIdx: number) => void;
  onToggleSongMode: () => void;
  onToggleSongDrawer: () => void;
  onEditScene: (sceneIdx: number) => void;
}

export class McxSceneBar {
  private readonly root: HTMLElement;
  private readonly opts: McxSceneBarOptions;
  private scenes: McxSceneSlotDto[] = [];
  private activeScene = 0;
  private queuedScene = -1;
  private songMode = false;
  private blockIdx = 0;
  private barInBlock = 0;
  private blockCount = 0;
  private drawerOpen = false;

  constructor(opts: McxSceneBarOptions) {
    this.opts = opts;
    this.root = document.createElement('div');
    this.root.className = 'mcx-scene-bar';
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Live Scenes 1..8');
    this.renderShell();
    opts.hostEl.appendChild(this.root);
    this.bindEvents();
  }

  private renderShell(): void {
    const pads = Array.from({ length: 8 }, (_, i) =>
      `<button type="button" class="mcx-scene-pad${i === 0 ? ' is-active' : ''}" data-scene-pad="${i}" aria-pressed="${i === 0 ? 'true' : 'false'}" title="${t('mcx.sceneBarHint')}">${i + 1}</button>`
    ).join('');

    this.root.innerHTML = `
      <div class="mcx-sbar-top">
        <button type="button" class="mcx-sbar-mode-btn" id="mcx-sbar-mode" aria-pressed="false" title="${t('mcx.songOpenBtnHint')}">${t('mcx.liveModeShort')}</button>
        <span class="mcx-sbar-status" id="mcx-sbar-status">S1 · Full</span>
        <button type="button" class="mcx-sbar-drawer-btn" id="mcx-sbar-drawer" aria-expanded="false" title="${t('mcx.songOpenBtnHint')}">SONG ${ICON_MENU}</button>
      </div>
      <div class="mcx-sbar-pads" role="group" aria-label="Scenes 1 to 8">${pads}</div>
    `;
  }

  private bindEvents(): void {
    this.root.querySelector('#mcx-sbar-mode')?.addEventListener('click', () => this.opts.onToggleSongMode());
    this.root.querySelector('#mcx-sbar-drawer')?.addEventListener('click', () => this.opts.onToggleSongDrawer());
    this.root.querySelector('.mcx-sbar-pads')?.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-scene-pad]');
      if (!btn) return;
      const idx = Number(btn.dataset.scenePad);
      if (Number.isNaN(idx)) return;
      if ((ev as MouseEvent).shiftKey) this.opts.onCaptureScene(idx);
      else this.opts.onTriggerScene(idx, false);
    });
    this.root.querySelector('.mcx-sbar-pads')?.addEventListener('dblclick', (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-scene-pad]');
      if (!btn) return;
      const idx = Number(btn.dataset.scenePad);
      if (!Number.isNaN(idx)) this.opts.onEditScene(idx);
    });
  }

  public setScenes(scenes: McxSceneSlotDto[]): void {
    this.scenes = scenes;
    this.syncDom();
  }

  public setDrawerOpen(open: boolean): void {
    this.drawerOpen = open;
    const btn = this.root.querySelector('#mcx-sbar-drawer');
    btn?.classList.toggle('is-open', open);
    btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  public updateLiveState(active: number, queued: number, songMode: boolean, blockIdx: number, barInBlock: number, blockCount: number): void {
    this.activeScene = active;
    this.queuedScene = queued;
    this.songMode = songMode;
    this.blockIdx = blockIdx;
    this.barInBlock = barInBlock;
    this.blockCount = blockCount;
    this.syncDom();
  }

  public refreshLocale(): void {
    const modeBtn = this.root.querySelector('#mcx-sbar-mode');
    if (modeBtn) modeBtn.setAttribute('title', t('mcx.songOpenBtnHint'));
    this.root.querySelector('#mcx-sbar-drawer')?.setAttribute('title', t('mcx.songOpenBtnHint'));
    this.root.querySelectorAll<HTMLElement>('[data-scene-pad]').forEach((el, i) => {
      const sc = this.scenes[i];
      const name = sc ? `${sc.name} (${sc.transpose >= 0 ? '+' : ''}${sc.transpose}st)` : `Scene ${i + 1}`;
      el.title = `S${i + 1}: ${name} — ${t('mcx.sceneBarHint')}`;
    });
    this.syncDom();
  }

  private syncDom(): void {
    const modeBtn = this.root.querySelector('#mcx-sbar-mode');
    if (modeBtn) {
      modeBtn.textContent = this.songMode ? t('mcx.songModeShort') : t('mcx.liveModeShort');
      modeBtn.classList.toggle('is-song', this.songMode);
      modeBtn.setAttribute('aria-pressed', this.songMode ? 'true' : 'false');
    }
    const status = this.root.querySelector('#mcx-sbar-status');
    if (status) {
      const sc = this.scenes[this.activeScene];
      const scName = sc?.name ?? `S${this.activeScene + 1}`;
      if (this.queuedScene >= 0) {
        status.innerHTML = `S${this.activeScene + 1} -> S${this.queuedScene + 1} ${ICON_CLOCK}`;
      } else if (this.songMode && this.blockCount > 0) {
        status.textContent = `BLK ${this.blockIdx + 1}/${this.blockCount} · ${t('mcx.barWord')}${this.barInBlock + 1}`;
      } else {
        status.textContent = `S${this.activeScene + 1} · ${scName}`;
      }
      status.classList.toggle('is-queued', this.queuedScene >= 0);
    }
    this.root.querySelectorAll<HTMLElement>('[data-scene-pad]').forEach((btn, idx) => {
      const isAct = idx === this.activeScene;
      const isQ = idx === this.queuedScene;
      btn.classList.toggle('is-active', isAct);
      btn.classList.toggle('is-queued', isQ);
      btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');
    });
  }

  public destroy(): void {
    this.root.remove();
  }
}

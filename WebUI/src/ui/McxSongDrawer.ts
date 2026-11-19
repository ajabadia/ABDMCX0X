/**
 * ABDMCX0X -- McxSongDrawer.ts
 * Bottom-up sliding Song Mode & Live Scenes Manager (mutually exclusive with Tone/Pads drawers).
 * Strict line limit: < 200 lines.
 */

import type { McxSceneSlotDto, McxSongBridge, McxSongScenesStateDto } from '../bridge/McxSongBridge';
import { t } from '../i18n/mcxI18n';
import { applySongBlockListAction, buildSceneCardsHtml, buildSceneInspectorHtml, buildSongBlocksHtml, buildSongDrawerShellHtml } from './McxSongDrawerViews';

export interface McxSongDrawerOptions {
  hostEl: HTMLElement;
  songBridge: McxSongBridge;
  getState: () => McxSongScenesStateDto;
  onStateMutated: () => void;
  onClose?: () => void;
}

export class McxSongDrawer {
  private readonly el: HTMLElement;
  private readonly opts: McxSongDrawerOptions;
  private opened = false;
  private selectedScene = 0;
  private selectedBlock = 0;

  constructor(opts: McxSongDrawerOptions) {
    this.opts = opts;
    this.el = document.createElement('div');
    this.el.className = 'mcx-bottom-drawer mcx-song-drawer';
    this.el.id = 'mcx-song-drawer';
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', 'Song Mode & Live Scenes');
    this.el.innerHTML = buildSongDrawerShellHtml();
    opts.hostEl.appendChild(this.el);
    this.bindEvents();
  }

  public isOpen(): boolean { return this.opened; }
  public toggle(focusScene?: number): void { if (this.opened) this.close(); else this.open(focusScene); }

  public open(focusScene?: number): void {
    if (typeof focusScene === 'number' && focusScene >= 0 && focusScene < 8) this.selectedScene = focusScene;
    this.opened = true;
    this.el.classList.add('is-open');
    this.opts.songBridge.requestState();
    this.renderAll();
  }

  public close(): void { this.opened = false; this.el.classList.remove('is-open'); this.opts.onClose?.(); }

  public refreshLocale(): void {
    if (document.activeElement?.id === 'mcx-sc-name-input') return;
    this.el.innerHTML = buildSongDrawerShellHtml();
    this.bindEvents();
    this.renderAll();
  }

  public renderAll(): void {
    if (!this.opened) return;
    const st = this.opts.getState();
    this.selectedScene = Math.max(0, Math.min(7, this.selectedScene));
    this.selectedBlock = st.blocks.length > 0 ? Math.max(0, Math.min(st.blocks.length - 1, this.selectedBlock)) : 0;

    const grid = this.el.querySelector('#mcx-scenes-grid');
    if (grid) grid.innerHTML = buildSceneCardsHtml(st, this.selectedScene);
    const insp = this.el.querySelector('#mcx-scene-inspector');
    const sc: McxSceneSlotDto = st.scenes[this.selectedScene] ?? { index: this.selectedScene, name: `S${this.selectedScene + 1}`, muteMask: 0, transpose: 0 };
    if (insp && document.activeElement?.id !== 'mcx-sc-name-input') insp.innerHTML = buildSceneInspectorHtml(sc, this.selectedScene);
    const list = this.el.querySelector('#mcx-song-blocks-list');
    if (list) list.innerHTML = buildSongBlocksHtml(st.blocks, st.scenes, st.songBlockIdx, st.songBarInBlock, st.songMode, this.selectedBlock);
    this.syncLiveStatus();
  }

  public syncLiveStatus(): void {
    if (!this.opened) return;
    const st = this.opts.getState();
    this.el.querySelector('#mcx-song-mode-live')?.classList.toggle('is-active', !st.songMode);
    this.el.querySelector('#mcx-song-mode-song')?.classList.toggle('is-active', st.songMode);
    const loopBtn = this.el.querySelector('#mcx-song-loop-btn');
    loopBtn?.classList.toggle('is-active', st.songLoop);
    loopBtn?.setAttribute('aria-pressed', st.songLoop ? 'true' : 'false');

    const totalEl = this.el.querySelector('#mcx-song-total-bars');
    if (totalEl) totalEl.textContent = `${t('mcx.totalBars')}: ${st.blocks.reduce((sum, b) => sum + b.bars, 0)}`;

    const pill = this.el.querySelector('#mcx-song-live-status');
    if (pill) {
      const qTxt = st.queuedScene >= 0 ? ` → S${st.queuedScene + 1} (${t('mcx.queuedLabel')})` : '';
      pill.textContent = st.songMode && st.blocks.length > 0
        ? `BLK ${st.songBlockIdx + 1}/${st.blocks.length} · ${t('mcx.barWord')} ${st.songBarInBlock + 1} · S${st.activeScene + 1}`
        : `S${st.activeScene + 1} · ${st.scenes[st.activeScene]?.name ?? ''}${qTxt}`;
    }

    this.el.querySelectorAll<HTMLElement>('[data-scene-card]').forEach((c, i) => {
      c.classList.toggle('is-active', i === st.activeScene);
      c.classList.toggle('is-queued', i === st.queuedScene);
    });
    this.el.querySelectorAll<HTMLElement>('[data-blk-row]').forEach((row, i) => {
      const playingBlk = st.songMode && i === st.songBlockIdx;
      row.classList.toggle('is-playing', playingBlk);
      const prog = row.querySelector<HTMLElement>('[data-blk-prog]');
      if (prog && st.blocks[i]) prog.textContent = playingBlk ? `${st.songBarInBlock + 1}/${st.blocks[i].bars}` : '';
    });
  }

  private commitSceneEdit(sc: McxSceneSlotDto): void {
    this.opts.songBridge.updateScene(this.selectedScene, sc.muteMask, sc.transpose, sc.name);
    this.opts.onStateMutated();
    this.renderAll();
  }

  private commitArrangement(renderNow = true): void {
    const st = this.opts.getState();
    this.opts.songBridge.setSongArrangement(st.blocks, st.songLoop);
    this.opts.onStateMutated();
    if (renderNow) this.renderAll();
  }

  private bindEvents(): void {
    const b = this.opts.songBridge;
    this.el.querySelector('#mcx-song-close-btn')?.addEventListener('click', () => this.close());
    this.el.querySelector('#mcx-song-mode-live')?.addEventListener('click', () => { b.setSongMode(false); this.opts.getState().songMode = false; this.syncLiveStatus(); this.opts.onStateMutated(); });
    this.el.querySelector('#mcx-song-mode-song')?.addEventListener('click', () => { b.setSongMode(true); this.opts.getState().songMode = true; this.syncLiveStatus(); this.opts.onStateMutated(); });
    this.el.querySelector('#mcx-song-loop-btn')?.addEventListener('click', () => { const st = this.opts.getState(); st.songLoop = !st.songLoop; b.setSongLoop(st.songLoop); this.syncLiveStatus(); this.opts.onStateMutated(); });

    this.el.querySelector('#mcx-song-add-blk')?.addEventListener('click', () => {
      const st = this.opts.getState();
      if (st.blocks.length >= 64) return;
      st.blocks.push({ sceneIndex: this.selectedScene, bars: 4, transposeOffset: 0 });
      this.selectedBlock = st.blocks.length - 1;
      this.commitArrangement();
    });
    this.el.querySelector('#mcx-song-dup-blk')?.addEventListener('click', () => {
      const st = this.opts.getState();
      if (st.blocks.length >= 64 || st.blocks.length === 0) return;
      st.blocks.splice(this.selectedBlock + 1, 0, { ...(st.blocks[this.selectedBlock] ?? st.blocks[st.blocks.length - 1]) });
      this.selectedBlock = Math.min(st.blocks.length - 1, this.selectedBlock + 1);
      this.commitArrangement();
    });
    this.el.querySelector('#mcx-song-clear-blks')?.addEventListener('click', () => {
      this.opts.getState().blocks = [{ sceneIndex: 0, bars: 4, transposeOffset: 0 }];
      this.selectedBlock = 0;
      this.commitArrangement();
    });

    this.el.querySelector('#mcx-scenes-grid')?.addEventListener('click', (ev) => {
      const launch = (ev.target as HTMLElement).closest<HTMLElement>('[data-scene-launch]');
      if (launch) { b.triggerScene(Number(launch.dataset.sceneLaunch), false); return; }
      const card = (ev.target as HTMLElement).closest<HTMLElement>('[data-scene-card]');
      if (!card) return;
      this.selectedScene = Number(card.dataset.sceneCard);
      if ((ev as MouseEvent).shiftKey) b.captureScene(this.selectedScene);
      this.renderAll();
    });
    this.el.querySelector('#mcx-scenes-grid')?.addEventListener('dblclick', (ev) => {
      const card = (ev.target as HTMLElement).closest<HTMLElement>('[data-scene-card]');
      if (card) b.triggerScene(Number(card.dataset.sceneCard), false);
    });

    this.el.querySelector('#mcx-scene-inspector')?.addEventListener('click', (ev) => {
      const tgt = ev.target as HTMLElement, sc = this.opts.getState().scenes[this.selectedScene];
      if (!sc) return;
      const muteBtn = tgt.closest<HTMLElement>('[data-sc-part-mute]');
      if (muteBtn) { sc.muteMask ^= (1 << Number(muteBtn.dataset.scPartMute)); this.commitSceneEdit(sc); return; }
      if (tgt.id === 'mcx-sc-tr-dec') { sc.transpose = Math.max(-24, sc.transpose - 1); this.commitSceneEdit(sc); }
      else if (tgt.id === 'mcx-sc-tr-inc') { sc.transpose = Math.min(24, sc.transpose + 1); this.commitSceneEdit(sc); }
      else if (tgt.id === 'mcx-sc-capture') b.captureScene(this.selectedScene);
      else if (tgt.id === 'mcx-sc-queue') b.triggerScene(this.selectedScene, false);
      else if (tgt.id === 'mcx-sc-now') b.triggerScene(this.selectedScene, true);
    });
    this.el.querySelector('#mcx-scene-inspector')?.addEventListener('change', (ev) => {
      if ((ev.target as HTMLElement).id !== 'mcx-sc-name-input') return;
      const sc = this.opts.getState().scenes[this.selectedScene];
      if (sc) { sc.name = (ev.target as HTMLInputElement).value.trim().slice(0, 18) || `Scene ${this.selectedScene + 1}`; this.commitSceneEdit(sc); }
    });

    this.el.querySelector('#mcx-song-blocks-list')?.addEventListener('click', (ev) => {
      const res = applySongBlockListAction(ev.target as HTMLElement, this.opts.getState().blocks, this.selectedBlock);
      this.selectedBlock = res.selectedBlock;
      if (res.jumpIdx >= 0) b.jumpSongBlock(res.jumpIdx, false);
      else if (res.changed) this.commitArrangement();
    });
    this.el.querySelector('#mcx-song-blocks-list')?.addEventListener('change', (ev) => {
      const sel = (ev.target as HTMLElement).closest<HTMLSelectElement>('[data-blk-scene]');
      const blk = sel ? this.opts.getState().blocks[Number(sel.dataset.blkScene)] : undefined;
      if (blk && sel) { blk.sceneIndex = Number(sel.value); this.commitArrangement(false); }
    });
  }
}

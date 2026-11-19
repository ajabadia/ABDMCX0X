/**
 * ABDMCX0X -- McxSongDrawerViews.ts
 * Stateless HTML template builders for Song Mode & Bar-Quantized Live Scenes Drawer.
 * Strict line limit: < 200 lines.
 */

import type { McxSceneSlotDto, McxSongBlockDto, McxSongScenesStateDto } from '../bridge/McxSongBridge';
import { t } from '../i18n/mcxI18n';
import { ICON_CLOSE, ICON_DOWN, ICON_PLAY, ICON_UP } from './mcxIcons';

export function escHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function countMutedParts(mask: number): number {
  let c = 0;
  for (let i = 0; i < 16; ++i) if ((mask & (1 << i)) !== 0) ++c;
  return c;
}

function fmtSigned(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function buildSongDrawerShellHtml(): string {
  return `
    <div class="mcx-drawer-head mcx-song-head">
      <div class="mcx-drawer-title-row">
        <span class="mcx-drawer-title-accent">SONG / SCENES</span>
        <h3 class="mcx-drawer-title" id="mcx-song-title">${t('mcx.songDrawerTitle')}</h3>
        <span class="mcx-song-live-pill" id="mcx-song-live-status">S1 · LIVE</span>
      </div>
      <div class="mcx-song-head-actions">
        <div class="mcx-song-mode-seg" role="group" aria-label="Mode">
          <button type="button" class="mcx-seg-btn is-active" id="mcx-song-mode-live">${t('mcx.liveModeLabel')}</button>
          <button type="button" class="mcx-seg-btn" id="mcx-song-mode-song">${t('mcx.songModeLabel')}</button>
        </div>
        <button type="button" class="mcx-song-pill-btn is-active" id="mcx-song-loop-btn" aria-pressed="true">${t('mcx.songLoopLabel')}</button>
        <button type="button" class="mcx-drawer-close-btn" id="mcx-song-close-btn" title="${t('mcx.closeDrawer')}">${ICON_CLOSE}</button>
      </div>
    </div>
    <div class="mcx-drawer-body mcx-song-body">
      <section class="mcx-song-pane" aria-label="Live Scenes">
        <div class="mcx-song-pane-title">${t('mcx.liveScenes')}</div>
        <div class="mcx-scenes-grid" id="mcx-scenes-grid"></div>
        <div class="mcx-scene-inspector" id="mcx-scene-inspector"></div>
      </section>
      <section class="mcx-song-pane" aria-label="Song Blocks">
        <div class="mcx-song-pane-bar">
          <span class="mcx-song-pane-title">${t('mcx.songBlocksTitle')}</span>
          <span class="mcx-song-total-pill" id="mcx-song-total-bars">${t('mcx.totalBars')}: 8</span>
        </div>
        <div class="mcx-song-toolbar">
          <button type="button" class="mcx-song-tool-btn is-accent" id="mcx-song-add-blk">${t('mcx.addBlock')}</button>
          <button type="button" class="mcx-song-tool-btn" id="mcx-song-dup-blk">${t('mcx.duplicateBlock')}</button>
          <button type="button" class="mcx-song-tool-btn is-danger" id="mcx-song-clear-blks">${t('mcx.clearSong')}</button>
        </div>
        <div class="mcx-song-blocks-list" id="mcx-song-blocks-list"></div>
      </section>
    </div>
  `;
}

export function buildSceneCardsHtml(state: McxSongScenesStateDto, selectedScene: number): string {
  return state.scenes.map((sc, i) => {
    const isAct = i === state.activeScene;
    const isQ = i === state.queuedScene;
    const isSel = i === selectedScene;
    const muted = countMutedParts(sc.muteMask);
    const cls = ['mcx-scene-card', isAct ? 'is-active' : '', isQ ? 'is-queued' : '', isSel ? 'is-selected' : ''].filter(Boolean).join(' ');
    return `
      <div class="${cls}" data-scene-card="${i}" tabindex="0" role="button" aria-label="Scene ${i + 1}: ${escHtml(sc.name)}">
        <div class="mcx-sc-card-top">
          <span class="mcx-sc-idx">S${i + 1}</span>
          <span class="mcx-sc-tr">${fmtSigned(sc.transpose)} st</span>
          <button type="button" class="mcx-sc-play-mini" data-scene-launch="${i}" title="${t('mcx.queueAtBar')}">${ICON_PLAY}</button>
        </div>
        <div class="mcx-sc-name">${escHtml(sc.name)}</div>
        <div class="mcx-sc-meta">${muted === 0 ? '16/16 ON' : `${16 - muted}/16 · ${muted} ${t('mcx.mutedCountUnit')}`}</div>
      </div>
    `;
  }).join('');
}

export function buildSceneInspectorHtml(sc: McxSceneSlotDto, idx: number): string {
  const mutes = Array.from({ length: 16 }, (_, p) => {
    const isMuted = (sc.muteMask & (1 << p)) !== 0;
    return `<button type="button" class="mcx-sc-mute-btn ${isMuted ? 'is-muted' : 'is-audible'}" data-sc-part-mute="${p}" aria-pressed="${isMuted ? 'true' : 'false'}" title="Part ${p + 1}">P${String(p + 1).padStart(2, '0')}</button>`;
  }).join('');

  return `
    <div class="mcx-sc-insp-head">
      <span class="mcx-sc-insp-badge">S${idx + 1}</span>
      <input type="text" class="mcx-sc-name-input" id="mcx-sc-name-input" maxlength="18" value="${escHtml(sc.name)}" aria-label="${t('mcx.sceneName')}" />
      <div class="mcx-sc-tr-ctrl" title="${t('mcx.sceneTranspose')}">
        <button type="button" class="mcx-sc-step-btn" id="mcx-sc-tr-dec">-</button>
        <span class="mcx-sc-tr-val" id="mcx-sc-tr-val">${fmtSigned(sc.transpose)} st</span>
        <button type="button" class="mcx-sc-step-btn" id="mcx-sc-tr-inc">+</button>
      </div>
    </div>
    <div class="mcx-sc-insp-actions">
      <button type="button" class="mcx-song-tool-btn is-accent" id="mcx-sc-capture">${t('mcx.captureMixer')}</button>
      <button type="button" class="mcx-song-tool-btn" id="mcx-sc-queue">${t('mcx.queueAtBar')}</button>
      <button type="button" class="mcx-song-tool-btn" id="mcx-sc-now">${t('mcx.launchNow')}</button>
    </div>
    <div class="mcx-sc-mutes-label">${t('mcx.sceneMutes')}</div>
    <div class="mcx-sc-mutes-grid">${mutes}</div>
  `;
}

export function buildSongBlocksHtml(blocks: McxSongBlockDto[], scenes: McxSceneSlotDto[], activeBlock: number, barInBlock: number, songMode: boolean, selectedBlock: number): string {
  return blocks.map((blk, i) => {
    const isPlayingBlk = songMode && i === activeBlock;
    const isSel = i === selectedBlock;
    const cls = ['mcx-song-blk-row', isPlayingBlk ? 'is-playing' : '', isSel ? 'is-selected' : ''].filter(Boolean).join(' ');
    const opts = Array.from({ length: 8 }, (_, sIdx) => {
      const sName = scenes[sIdx]?.name ?? `Scene ${sIdx + 1}`;
      return `<option value="${sIdx}"${blk.sceneIndex === sIdx ? ' selected' : ''}>S${sIdx + 1}: ${escHtml(sName)}</option>`;
    }).join('');
    return `
      <div class="${cls}" data-blk-row="${i}">
        <button type="button" class="mcx-blk-jump" data-blk-jump="${i}" title="${t('mcx.queueAtBar')}">${String(i + 1).padStart(2, '0')} ${isPlayingBlk ? ICON_PLAY : ''}</button>
        <select class="mcx-blk-scene-sel" data-blk-scene="${i}" aria-label="Scene">${opts}</select>
        <div class="mcx-blk-step" title="Bars">
          <button type="button" class="mcx-sc-step-btn" data-blk-bars-dec="${i}">-</button>
          <span class="mcx-blk-val">${blk.bars}b</span>
          <button type="button" class="mcx-sc-step-btn" data-blk-bars-inc="${i}">+</button>
        </div>
        <div class="mcx-blk-step" title="Transpose Offset">
          <button type="button" class="mcx-sc-step-btn" data-blk-tr-dec="${i}">-</button>
          <span class="mcx-blk-val">${fmtSigned(blk.transposeOffset)}</span>
          <button type="button" class="mcx-sc-step-btn" data-blk-tr-inc="${i}">+</button>
        </div>
        <span class="mcx-blk-progress" data-blk-prog="${i}">${isPlayingBlk ? `${barInBlock + 1}/${blk.bars}` : ''}</span>
        <div class="mcx-blk-ops">
          <button type="button" class="mcx-sc-step-btn" data-blk-up="${i}" title="Up">${ICON_UP}</button>
          <button type="button" class="mcx-sc-step-btn" data-blk-dn="${i}" title="Down">${ICON_DOWN}</button>
          <button type="button" class="mcx-sc-step-btn is-danger" data-blk-del="${i}" title="Delete">${ICON_CLOSE}</button>
        </div>
      </div>
    `;
  }).join('');
}

export function applySongBlockListAction(tgt: HTMLElement, blocks: McxSongBlockDto[], selectedBlock: number): { changed: boolean; jumpIdx: number; selectedBlock: number } {
  const row = tgt.closest<HTMLElement>('[data-blk-row]');
  let nextSel = row ? Number(row.dataset.blkRow) : selectedBlock;
  const num = (attr: string) => Number(tgt.closest<HTMLElement>(`[${attr}]`)?.getAttribute(attr));
  if (tgt.closest('[data-blk-jump]')) return { changed: false, jumpIdx: num('data-blk-jump'), selectedBlock: nextSel };
  if (tgt.closest('[data-blk-bars-dec]')) { const b = blocks[num('data-blk-bars-dec')]; if (b) { b.bars = Math.max(1, b.bars - 1); return { changed: true, jumpIdx: -1, selectedBlock: nextSel }; } }
  if (tgt.closest('[data-blk-bars-inc]')) { const b = blocks[num('data-blk-bars-inc')]; if (b) { b.bars = Math.min(32, b.bars + 1); return { changed: true, jumpIdx: -1, selectedBlock: nextSel }; } }
  if (tgt.closest('[data-blk-tr-dec]')) { const b = blocks[num('data-blk-tr-dec')]; if (b) { b.transposeOffset = Math.max(-12, b.transposeOffset - 1); return { changed: true, jumpIdx: -1, selectedBlock: nextSel }; } }
  if (tgt.closest('[data-blk-tr-inc]')) { const b = blocks[num('data-blk-tr-inc')]; if (b) { b.transposeOffset = Math.min(12, b.transposeOffset + 1); return { changed: true, jumpIdx: -1, selectedBlock: nextSel }; } }
  if (tgt.closest('[data-blk-up]')) { const idx = num('data-blk-up'); if (idx > 0) { [blocks[idx - 1], blocks[idx]] = [blocks[idx], blocks[idx - 1]]; nextSel = idx - 1; return { changed: true, jumpIdx: -1, selectedBlock: nextSel }; } }
  if (tgt.closest('[data-blk-dn]')) { const idx = num('data-blk-dn'); if (idx < blocks.length - 1) { [blocks[idx], blocks[idx + 1]] = [blocks[idx + 1], blocks[idx]]; nextSel = idx + 1; return { changed: true, jumpIdx: -1, selectedBlock: nextSel }; } }
  if (tgt.closest('[data-blk-del]')) { const idx = num('data-blk-del'); if (blocks.length > 1) { blocks.splice(idx, 1); nextSel = Math.max(0, Math.min(nextSel, blocks.length - 1)); return { changed: true, jumpIdx: -1, selectedBlock: nextSel }; } }
  return { changed: false, jumpIdx: -1, selectedBlock: nextSel };
}


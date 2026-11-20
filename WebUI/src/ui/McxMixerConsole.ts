/**
 * ABDMCX0X -- McxMixerConsole.ts
 * 16-Part Horizontal Mixer Console featuring 16 Vertical Channel Strips,
 * Informative routing badges (CH, TR, PAN, SENDS) opening Part Settings,
 * M/S toggles, vertical level fader, and 8-segment discrete LED VU meter.
 * Strict line limit: < 200 lines.
 */

import type { McxEngineDescriptorDto, McxHostBridge } from '../bridge/McxHostBridge';
import { getCategoryIconSvg } from '@abdsynths/shared/components/bank/bankIcons.js';
import { t } from '../i18n/mcxI18n';
import { getShortEngineBadge } from './McxEngineCatalogDefaults';
import type { McxPartUiState } from './McxPartState';

export { createDefaultPartState, type McxPartUiState } from './McxPartState';

export interface McxMixerCallbacks {
  getFocusedPart: () => number; setFocusedPart: (idx: number) => void;
  getPartsState: () => McxPartUiState[];
  getEngineCatalog?: () => McxEngineDescriptorDto[];
  onTogglePartKind: (idx: number) => void; onChangePartChannel: (idx: number, ch: number) => void;
  onToggleFollowTranspose: (idx: number) => void; onToggleMute: (idx: number) => void; onToggleSolo: (idx: number) => void;
  onOpenRouteForPart?: (idx: number) => void;
  onOpenSynthForPart?: (idx: number) => void;
  onOpenBankForPart?: (idx: number) => void; onOpenToneForPart?: (idx: number, focusSection?: string) => void; onOpenPadsForPart?: (idx: number) => void;
  onOpenArpForPart?: (idx: number) => void;
  onOpenPianoRollForPart?: (idx: number) => void; onOpenNukeForPart?: (idx: number) => void;
  onChangeGlide?: (idx: number, ms: number) => void; onChangeLevel?: (idx: number, lvl: number) => void;
  onChangePan?: (idx: number, pan: number) => void; onChangeSendA?: (idx: number, send: number) => void;
  onChangeSendB?: (idx: number, send: number) => void; setLcdLine2: (text: string) => void;
}

export function updatePartMeter(container: HTMLElement, partIdx: number, peak: number, isMidiMode = false): void {
  const vu = container.querySelector(`.mcx-strip-vumeter[data-vu-part="${partIdx}"]`);
  if (!vu) return;
  vu.classList.toggle('is-midi-mode', isMidiMode);
  const segs = vu.children;
  const activeCount = Math.round(Math.min(1, Math.max(0, peak)) * segs.length);
  for (let s = 0; s < segs.length; ++s) {
    segs[s].classList.toggle('is-lit', s < activeCount);
  }
}

export function renderMixerConsole(container: HTMLElement, cb: McxMixerCallbacks, bridge?: McxHostBridge): void {
  container.innerHTML = '';
  const focused = cb.getFocusedPart();
  const parts = cb.getPartsState();
  const catalog = cb.getEngineCatalog?.();

  for (let i = 0; i < 16; ++i) {
    const ps = parts[i], isDrum = ps.kind === 'drum_map', catId = ps.categoryId ?? (isDrum ? 9 : 3);
    const soundName = ps.name || (isDrum ? 'TR-909 Kit' : `Sound P${i + 1}`);
    const level = ps.partLevel ?? 0.85;
    const badge = getShortEngineBadge(ps, catalog);

    const strip = document.createElement('div');
    strip.className = `mcx-strip cat-${catId}${i === focused ? ' is-active' : ''}${isDrum ? ' is-drum' : ''}${ps.mute ? ' is-muted' : ''}${ps.routeMode === 1 ? ' is-midi-ext' : ''}`;
    strip.dataset.part = String(i);

    strip.innerHTML = `
      <div class="mcx-strip-head">
        <span class="mcx-strip-num"><span class="mcx-strip-led"></span>P${String(i + 1).padStart(2, '0')}</span>
        <span class="mcx-strip-ch-mini">C${String(ps.midiChannel).padStart(2, '0')}</span>
      </div>
      <button type="button" class="mcx-strip-route-badge is-${badge.variant}" data-act="route" title="${badge.tooltip}">
        <span class="mcx-route-mode-tag">${badge.routeTag}</span>
        <span class="mcx-route-eng-tag">${badge.engineTag}</span>
      </button>
      <button type="button" class="mcx-strip-sound-btn cat-${catId}" data-act="sound" title="${soundName}">
        ${ps.coverUrl ? `<img src="${ps.coverUrl}" class="mcx-strip-cover-thumb" alt="" />` : `<span class="mcx-strip-cat-icon">${getCategoryIconSvg(catId)}</span>`}
        <span class="mcx-strip-sound-name">${soundName}</span>
      </button>
      <div class="mcx-strip-drawers-row">
        <button type="button" class="mcx-strip-drawer-btn is-tone" data-act="open-part" title="${t('mcx.toneDrawerBtn')}">${t('mcx.toneShort') || 'PART'}</button>
        <button type="button" class="mcx-strip-drawer-btn is-pads" data-act="pads" title="${t('mcx.padsDrawerBtn')}">${t('mcx.padsShort') || 'PAD'}</button>
        <button type="button" class="mcx-strip-drawer-btn is-seq" data-act="seq" title="${t('mcx.seqDrawerBtn')}">SEQ</button>
        <button type="button" class="mcx-strip-drawer-btn is-arp" data-act="arp" title="${t('mcx.arpDrawerBtn')}">${t('mcx.arpShort')}</button>
      </div>
      <div class="mcx-strip-fader-section">
        <div class="mcx-strip-fader-row">
          <input type="range" class="mcx-strip-fader" orient="vertical" min="0" max="1" step="0.01" value="${level}" title="${t('mcx.partVolumeHint')}" />
          <div class="mcx-strip-vumeter" data-vu-part="${i}" aria-hidden="true">
            <span class="mcx-vu-seg is-low"></span><span class="mcx-vu-seg is-low"></span>
            <span class="mcx-vu-seg is-low"></span><span class="mcx-vu-seg is-low"></span>
            <span class="mcx-vu-seg is-mid"></span><span class="mcx-vu-seg is-mid"></span>
            <span class="mcx-vu-seg is-hot"></span><span class="mcx-vu-seg is-peak"></span>
          </div>
        </div>
        <span class="mcx-strip-lvl-val">${Math.round(level * 100)}%</span>
      </div>
      <div class="mcx-strip-ms-row">
        <button type="button" class="mcx-strip-ms-btn${ps.solo ? ' is-solo' : ''}" data-act="solo" title="${t('mcx.solo')}">S</button>
        <button type="button" class="mcx-strip-ms-btn${ps.mute ? ' is-mute' : ''}" data-act="mute" title="${t('mcx.mute')}">M</button>
      </div>
    `;

    strip.addEventListener('click', (ev) => {
      const tgt = (ev.target as HTMLElement).closest('[data-act]');
      const act = tgt?.getAttribute('data-act');
      const sec = tgt?.getAttribute('data-section') || undefined;
      if (!act) {
        cb.setFocusedPart(i);
        container.querySelectorAll('.mcx-strip').forEach((el, idx) => el.classList.toggle('is-active', idx === i));
        cb.setLcdLine2(`PART ${String(i + 1).padStart(2, '0')} [${badge.routeTag}·${badge.engineTag} · CH${ps.midiChannel}] ${soundName}`);
        return;
      }
      ev.stopPropagation();
      if (act === 'route') { cb.setFocusedPart(i); cb.onOpenRouteForPart?.(i); }
      else if (act === 'kind') cb.onTogglePartKind(i);
      else if (act === 'sound') { cb.setFocusedPart(i); (cb.onOpenSynthForPart ?? cb.onOpenBankForPart)?.(i); }
      else if (act === 'tone' || act === 'open-part') { cb.setFocusedPart(i); cb.onOpenToneForPart?.(i, sec); }
      else if (act === 'pads') { cb.setFocusedPart(i); cb.onOpenPadsForPart?.(i); }
      else if (act === 'seq') { cb.setFocusedPart(i); cb.onOpenPianoRollForPart?.(i); }
      else if (act === 'arp') { cb.setFocusedPart(i); cb.onOpenArpForPart?.(i); }
      else if (act === 'mute') cb.onToggleMute(i);
      else if (act === 'solo') cb.onToggleSolo(i);
    });

    const lvlVal = strip.querySelector('.mcx-strip-lvl-val');
    const fader = strip.querySelector('.mcx-strip-fader') as HTMLInputElement | null;
    fader?.addEventListener('click', (e) => e.stopPropagation());
    fader?.addEventListener('input', () => {
      const v = parseFloat(fader.value);
      if (lvlVal) lvlVal.textContent = `${Math.round(v * 100)}%`;
      ps.partLevel = v; if (cb.onChangeLevel) cb.onChangeLevel(i, v); else bridge?.setParam(i, 'partLevel', v);
      cb.setLcdLine2(`P${String(i + 1).padStart(2, '0')} LEVEL: ${Math.round(v * 100)}%`);
    });

    container.appendChild(strip);
  }
}

export function updatePartFaderDom(container: HTMLElement, partIdx: number, lvl: number): void {
  const strip = container.querySelectorAll('.mcx-strip')[partIdx];
  if (!strip) return;
  const fader = strip.querySelector<HTMLInputElement>('.mcx-strip-fader'), val = strip.querySelector('.mcx-strip-lvl-val');
  if (fader) fader.value = String(lvl);
  if (val) val.textContent = `${Math.round(lvl * 100)}%`;
}

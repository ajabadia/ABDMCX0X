/**
 * ABDMCX0X -- McxMixerConsole.ts
 * 8-Slot Active-Bank Mixer Console (8x8 Architecture, up to 64 stable DSP parts).
 * Supports Pin/Delete/Add(+), Drag&Drop + Popover Move, real MIDI Port+Channel badges, and VU meters.
 */

import type { McxEngineDescriptorDto, McxHostBridge, McxMidiDevicesDto } from '../bridge/McxHostBridge';
import { getCategoryIconSvg } from '@abdsynths/shared/components/bank/bankIcons.js';
import { t } from '../i18n/mcxI18n';
import {
  BANK_COLOR_VARS,
  countOccupiedInBank,
  createDefaultBankLayout,
  formatBankDisplayName,
  formatSlotLabel,
  getFirstFreeSlot,
  hasAnyBankSoloed,
  hasPinnedInBank,
  isBankMuted,
  isBankSoloed,
  type McxBankLayoutData,
  SLOTS_PER_BANK,
} from './McxBankLayout';
import { hasActivePartDrag, readPartDragPayload, setActivePartDrag } from './McxBankRail';
import { getShortEngineBadge } from './McxEngineCatalogDefaults';
import { ICON_MOVE, ICON_PENCIL, ICON_PIN, ICON_PIN_FILLED, ICON_PLUS, ICON_TRASH } from './mcxIcons';
import { openMovePartPopover } from './McxMixerPopovers';
import type { McxPartUiState } from './McxPartState';

export { createDefaultPartState, type McxPartUiState } from './McxPartState';

export interface McxMixerCallbacks {
  getFocusedPart: () => number; setFocusedPart: (idx: number) => void;
  getPartsState: () => McxPartUiState[];
  getBankLayout?: () => McxBankLayoutData;
  getMidiDevices?: () => McxMidiDevicesDto;
  getEngineCatalog?: () => McxEngineDescriptorDto[];
  onTogglePartKind: (idx: number) => void; onChangePartChannel: (idx: number, ch: number) => void;
  onToggleFollowTranspose: (idx: number) => void; onToggleMute: (idx: number) => void; onToggleSolo: (idx: number) => void;
  onTogglePin?: (partId: number) => void;
  onDeletePart?: (bankIdx: number, slotIdx: number, forceUnpin?: boolean) => void;
  onMovePart?: (fromBank: number, fromSlot: number, toBank: number, toSlot: number) => void;
  onAddPartInFirstFreeSlot?: (bankIdx: number) => void;
  onOpenRouteForPart?: (idx: number) => void;
  onOpenSynthForPart?: (idx: number) => void;
  onOpenBankForPart?: (idx: number) => void; onOpenToneForPart?: (idx: number, focusSection?: string) => void; onOpenPadsForPart?: (idx: number) => void;
  onOpenArpForPart?: (idx: number) => void; onOpenPianoRollForPart?: (idx: number) => void; onOpenNukeForPart?: (idx: number) => void;
  onChangeGlide?: (idx: number, ms: number) => void; onChangeLevel?: (idx: number, lvl: number) => void;
  onChangePan?: (idx: number, pan: number) => void; onChangeSendA?: (idx: number, send: number) => void;
  onChangeSendB?: (idx: number, send: number) => void; setLcdLine2: (text: string) => void;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function formatMidiPortSummary(ps: McxPartUiState, devices?: McxMidiDevicesDto): { shortLabel: string; fullLabel: string } {
  const ch = `C${String(ps.midiChannel || 1).padStart(2, '0')}`;
  const isOut = (ps.routeMode ?? 0) === 1 || (ps.routeMode ?? 0) === 2;
  if (isOut) {
    const outIdx = ps.midiPortIndex ?? 0;
    const raw = outIdx === 0 ? 'DAW' : (devices?.outputs.find((d) => d.portIndex === outIdx)?.name || ps.midiOutDeviceName || `OUT${outIdx}`);
    return { shortLabel: `${raw.slice(0, 6)}·${ch}`, fullLabel: `${raw} · CH ${ps.midiChannel}` };
  }
  const inIdx = ps.midiInPortIndex ?? 0;
  if (inIdx < 0) return { shortLabel: `SEQ·${ch}`, fullLabel: `SEQ/UI · CH ${ps.midiChannel}` };
  if (inIdx === 0) return { shortLabel: `DAW·${ch}`, fullLabel: `DAW Host MIDI · CH ${ps.midiChannel}` };
  const raw = devices?.inputs.find((d) => d.portIndex === inIdx)?.name || ps.midiInDeviceName || `IN${inIdx}`;
  return { shortLabel: `${raw.slice(0, 6)}·${ch}`, fullLabel: `${raw} · CH ${ps.midiChannel}` };
}

function wireDropTarget(el: HTMLElement, activeBank: number, slotIdx: number, cb: McxMixerCallbacks): void {
  el.addEventListener('dragover', (ev) => {
    if (!hasActivePartDrag(ev)) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    el.classList.add('is-drop-target');
  });
  el.addEventListener('dragleave', () => el.classList.remove('is-drop-target'));
  el.addEventListener('drop', (ev) => {
    el.classList.remove('is-drop-target');
    const payload = readPartDragPayload(ev);
    if (!payload) return;
    ev.preventDefault();
    setActivePartDrag(null);
    cb.onMovePart?.(payload.fromBank, payload.fromSlot, activeBank, slotIdx);
  });
}

export function updatePartMeter(container: HTMLElement, partIdx: number, peak: number, isMidiMode = false): void {
  const vu = container.querySelector(`.mcx-strip-vumeter[data-vu-part="${partIdx}"]`);
  if (!vu) return;
  vu.classList.toggle('is-midi-mode', isMidiMode);
  const segs = vu.children;
  const activeCount = Math.round(Math.min(1, Math.max(0, peak)) * segs.length);
  for (let s = 0; s < segs.length; ++s) segs[s].classList.toggle('is-lit', s < activeCount);
}

export function renderMixerConsole(container: HTMLElement, cb: McxMixerCallbacks, bridge?: McxHostBridge): void {
  container.innerHTML = '';
  const focused = cb.getFocusedPart(), parts = cb.getPartsState(), catalog = cb.getEngineCatalog?.();
  const layout = cb.getBankLayout?.() ?? createDefaultBankLayout(), devices = cb.getMidiDevices?.();
  const activeBank = layout.activeBank, bankColor = BANK_COLOR_VARS[activeBank] ?? BANK_COLOR_VARS[0];
  container.style.setProperty('--active-bank-color', bankColor);

  const bankPill = document.getElementById('mcx-active-bank-pill');
  if (bankPill) {
    bankPill.textContent = formatBankDisplayName(layout, activeBank, t('mcx.bankLabel'));
    bankPill.style.setProperty('--bank-color', bankColor);
  }
  const renameBtn = document.getElementById('mcx-rename-bank-btn') as HTMLButtonElement | null;
  if (renameBtn) {
    renameBtn.innerHTML = `${ICON_PENCIL}<span>${esc(t('mcx.bankRenameBtn'))}</span>`;
    renameBtn.title = t('mcx.bankRenameTitle');
    renameBtn.setAttribute('aria-label', t('mcx.bankRenameTitle'));
  }
  const anySoloGlobal = hasAnyBankSoloed(layout) || parts.some((pt) => pt.enabled !== false && pt.solo);
  const bankMuted = isBankMuted(layout, activeBank);
  const bankSoloed = isBankSoloed(layout, activeBank);
  const unpinBtn = document.getElementById('mcx-unpin-bank-btn') as HTMLButtonElement | null;
  if (unpinBtn) {
    const hasAnyParts = countOccupiedInBank(layout, activeBank) > 0;
    const anyPinned = hasPinnedInBank(layout, activeBank);
    unpinBtn.hidden = !hasAnyParts;
    unpinBtn.classList.toggle('is-pinned', anyPinned);
    unpinBtn.setAttribute('aria-pressed', anyPinned ? 'true' : 'false');
    unpinBtn.innerHTML = `${anyPinned ? ICON_PIN_FILLED : ICON_PIN}<span>${esc(anyPinned ? t('mcx.bankUnpinAll') : t('mcx.bankPinAll'))}</span>`;
    unpinBtn.title = anyPinned ? t('mcx.bankUnpinAllHint') : t('mcx.bankPinAllHint');
  }

  const firstFreeSlot = getFirstFreeSlot(layout, activeBank);
  const bankRow = layout.banks[activeBank] ?? [];

  for (let slotIdx = 0; slotIdx < SLOTS_PER_BANK; ++slotIdx) {
    const partId = bankRow[slotIdx] ?? null, slotLabel = formatSlotLabel(activeBank, slotIdx);
    if (partId === null || !parts[partId]) {
      const emptyEl = document.createElement('div');
      emptyEl.className = `mcx-strip-empty${slotIdx === firstFreeSlot ? ' is-first-free' : ''}`;
      emptyEl.dataset.slot = String(slotIdx);
      emptyEl.innerHTML = slotIdx === firstFreeSlot
        ? `<span class="mcx-strip-empty-tag">${slotLabel}</span><button type="button" class="mcx-strip-add-btn" data-act="add-part" aria-label="${esc(t('mcx.bankAddPart'))} (${slotLabel})">${ICON_PLUS}<span>${esc(t('mcx.bankAddPart'))}</span></button>`
        : `<span class="mcx-strip-empty-tag">${slotLabel}</span><span class="mcx-strip-empty-lbl">${esc(t('mcx.bankFreeSlot'))}</span>`;
      emptyEl.querySelector('[data-act="add-part"]')?.addEventListener('click', () => cb.onAddPartInFirstFreeSlot?.(activeBank));
      wireDropTarget(emptyEl, activeBank, slotIdx, cb);
      container.appendChild(emptyEl);
      continue;
    }

    const ps = parts[partId], isDrum = ps.kind === 'drum_map', catId = ps.categoryId ?? (isDrum ? 9 : 3);
    const soundName = ps.name || (isDrum ? 'TR-909 Kit' : 'Init Tone'), level = ps.partLevel ?? 0.85;
    const isPinned = layout.pinnedParts.has(partId), badge = getShortEngineBadge(ps, catalog), midiInfo = formatMidiPortSummary(ps, devices);
    const silencedByGroup = !ps.mute && ((!anySoloGlobal && bankMuted) || (anySoloGlobal && !ps.solo && !bankSoloed));

    const strip = document.createElement('div');
    strip.className = `mcx-strip cat-${catId}${partId === focused ? ' is-active' : ''}${isDrum ? ' is-drum' : ''}${ps.mute ? ' is-muted' : ''}${silencedByGroup ? ' is-bank-silenced' : ''}${ps.routeMode === 1 ? ' is-midi-ext' : ''}${isPinned ? ' is-pinned' : ''}`;
    strip.dataset.part = String(partId);
    strip.dataset.bank = String(activeBank);
    strip.dataset.slot = String(slotIdx);
    strip.draggable = !isPinned;

    strip.innerHTML = `
      <div class="mcx-strip-head">
        <span class="mcx-strip-num" title="P${String(partId + 1).padStart(2, '0')} · ${esc(midiInfo.fullLabel)}"><span class="mcx-strip-led"></span>${slotLabel}</span>
        <div class="mcx-strip-actions">
          <button type="button" class="mcx-strip-act-btn${isPinned ? ' is-pinned' : ''}" data-act="pin" aria-pressed="${isPinned ? 'true' : 'false'}" title="${esc(isPinned ? t('mcx.bankPinnedLocked') : t('mcx.bankPinPart'))}">${isPinned ? ICON_PIN_FILLED : ICON_PIN}</button>
          <button type="button" class="mcx-strip-act-btn" data-act="move" ${isPinned ? 'disabled' : ''} title="${esc(isPinned ? t('mcx.bankPinnedLocked') : t('mcx.bankMovePart'))}">${ICON_MOVE}</button>
          <button type="button" class="mcx-strip-act-btn is-del" data-act="delete" ${isPinned ? 'disabled' : ''} title="${esc(isPinned ? t('mcx.bankDeletePinnedDisabled') : t('mcx.bankDeletePart'))}">${ICON_TRASH}</button>
        </div>
      </div>
      <button type="button" class="mcx-strip-route-badge is-${badge.variant}" data-act="route" title="${esc(`${badge.tooltip} · ${midiInfo.fullLabel}`)}">
        <span class="mcx-route-mode-tag">${badge.routeTag}·${badge.engineTag}</span>
        <span class="mcx-route-eng-tag">${esc(midiInfo.shortLabel)}</span>
      </button>
      <button type="button" class="mcx-strip-sound-btn cat-${catId}" data-act="sound" title="${esc(soundName)}">
        ${ps.coverUrl ? `<img src="${ps.coverUrl}" class="mcx-strip-cover-thumb" alt="" />` : `<span class="mcx-strip-cat-icon">${getCategoryIconSvg(catId)}</span>`}
        <span class="mcx-strip-sound-name">${esc(soundName)}</span>
      </button>
      <div class="mcx-strip-drawers-row">
        <button type="button" class="mcx-strip-drawer-btn is-tone" data-act="open-part" title="${esc(t('mcx.toneDrawerBtn'))}">${t('mcx.toneShort') || 'PART'}</button>
        <button type="button" class="mcx-strip-drawer-btn is-pads" data-act="pads" title="${esc(t('mcx.padsDrawerBtn'))}">${t('mcx.padsShort') || 'PADS'}</button>
        <button type="button" class="mcx-strip-drawer-btn is-seq" data-act="seq" title="${esc(t('mcx.seqDrawerBtn'))}">SEQ</button>
        <button type="button" class="mcx-strip-drawer-btn is-arp" data-act="arp" title="${esc(t('mcx.arpDrawerBtn'))}">${t('mcx.arpShort')}</button>
      </div>
      <div class="mcx-strip-fader-section">
        <div class="mcx-strip-fader-row">
          <input type="range" class="mcx-strip-fader" min="0" max="1" step="0.01" value="${level}" aria-label="${esc(slotLabel)} ${esc(soundName)} ${esc(t('mcx.partVolumeHint'))}" aria-valuetext="${Math.round(level * 100)}%" style="--control-value:${level};--attr-min:0;--attr-max:1" title="${esc(t('mcx.partVolumeHint'))}" />
          <div class="mcx-strip-vumeter" data-vu-part="${partId}" aria-hidden="true">
            <span class="mcx-vu-seg is-low"></span><span class="mcx-vu-seg is-low"></span><span class="mcx-vu-seg is-low"></span><span class="mcx-vu-seg is-low"></span>
            <span class="mcx-vu-seg is-mid"></span><span class="mcx-vu-seg is-mid"></span><span class="mcx-vu-seg is-hot"></span><span class="mcx-vu-seg is-peak"></span>
          </div>
        </div>
        <span class="mcx-strip-lvl-val">${Math.round(level * 100)}%</span>
      </div>
      <div class="mcx-strip-ms-row">
        <button type="button" class="mcx-strip-ms-btn${ps.solo ? ' is-solo' : ''}" data-act="solo" title="${esc(t('mcx.solo'))}">S</button>
        <button type="button" class="mcx-strip-ms-btn${ps.mute ? ' is-mute' : ''}" data-act="mute" title="${esc(t('mcx.mute'))}">M</button>
      </div>`;

    if (!isPinned) {
      strip.addEventListener('dragstart', (ev) => {
        if ((ev.target as HTMLElement | null)?.closest('input, button, select')) {
          ev.preventDefault();
          return;
        }
        setActivePartDrag({ fromBank: activeBank, fromSlot: slotIdx });
        ev.dataTransfer?.setData('application/x-mcx-part', JSON.stringify({ fromBank: activeBank, fromSlot: slotIdx }));
        ev.dataTransfer?.setData('text/plain', slotLabel);
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
        strip.classList.add('is-dragging');
      });
      strip.addEventListener('dragend', () => {
        setActivePartDrag(null);
        strip.classList.remove('is-dragging');
        container.querySelectorAll('.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
      });
    }
    wireDropTarget(strip, activeBank, slotIdx, cb);

    strip.addEventListener('click', (ev) => {
      const tgt = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
      const act = tgt?.dataset.act;
      if (!act) {
        cb.setFocusedPart(partId);
        container.querySelectorAll('.mcx-strip').forEach((el) => el.classList.toggle('is-active', el.getAttribute('data-part') === String(partId)));
        cb.setLcdLine2(`${slotLabel} · P${String(partId + 1).padStart(2, '0')} [${badge.routeTag} · ${midiInfo.fullLabel}] ${soundName}`);
        return;
      }
      ev.stopPropagation();
      if (act === 'pin') cb.onTogglePin?.(partId);
      else if (act === 'move' && tgt && !isPinned) openMovePartPopover(tgt, layout, activeBank, slotIdx, soundName, (toB, toS) => cb.onMovePart?.(activeBank, slotIdx, toB, toS));
      else if (act === 'delete' && !isPinned) cb.onDeletePart?.(activeBank, slotIdx, false);
      else if (act === 'route') { cb.setFocusedPart(partId); cb.onOpenRouteForPart?.(partId); }
      else if (act === 'sound') { cb.setFocusedPart(partId); (cb.onOpenSynthForPart ?? cb.onOpenBankForPart)?.(partId); }
      else if (act === 'open-part') { cb.setFocusedPart(partId); cb.onOpenToneForPart?.(partId); }
      else if (act === 'pads') { cb.setFocusedPart(partId); cb.onOpenPadsForPart?.(partId); }
      else if (act === 'seq') { cb.setFocusedPart(partId); cb.onOpenPianoRollForPart?.(partId); }
      else if (act === 'arp') { cb.setFocusedPart(partId); cb.onOpenArpForPart?.(partId); }
      else if (act === 'mute') cb.onToggleMute(partId);
      else if (act === 'solo') cb.onToggleSolo(partId);
    });

    const lvlVal = strip.querySelector('.mcx-strip-lvl-val');
    const fader = strip.querySelector<HTMLInputElement>('.mcx-strip-fader');
    fader?.addEventListener('click', (e) => e.stopPropagation());
    if (fader) {
      fader.draggable = true;
      fader.addEventListener('dragstart', (e) => { e.preventDefault(); e.stopPropagation(); });
    }
    fader?.addEventListener('input', () => {
      const v = parseFloat(fader.value);
      fader.style.setProperty('--control-value', String(v));
      fader.setAttribute('aria-valuetext', `${Math.round(v * 100)}%`);
      if (lvlVal) lvlVal.textContent = `${Math.round(v * 100)}%`;
      ps.partLevel = v; if (cb.onChangeLevel) cb.onChangeLevel(partId, v); else bridge?.setParam(partId, 'partLevel', v);
      cb.setLcdLine2(`${slotLabel} · P${String(partId + 1).padStart(2, '0')} LEVEL: ${Math.round(v * 100)}%`);
    });
    container.appendChild(strip);
  }
}

export function updatePartFaderDom(container: HTMLElement, partIdx: number, lvl: number): void {
  const strip = container.querySelector(`.mcx-strip[data-part="${partIdx}"]`);
  if (!strip) return;
  const fader = strip.querySelector<HTMLInputElement>('.mcx-strip-fader'), val = strip.querySelector('.mcx-strip-lvl-val');
  if (fader) {
    fader.value = String(lvl);
    fader.style.setProperty('--control-value', String(lvl));
    fader.setAttribute('aria-valuetext', `${Math.round(lvl * 100)}%`);
  }
  if (val) val.textContent = `${Math.round(lvl * 100)}%`;
}

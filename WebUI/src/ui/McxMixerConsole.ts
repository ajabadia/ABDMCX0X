/**
 * ABDMCX0X -- McxMixerConsole.ts
 * 16-Part Full-Height Horizontal Mixer Console featuring 16 Vertical Channel Strips,
 * per-part DRM/CHR, sound selection, TONE/PADS drawer launchers, MIDI CH, TR,
 * sends A/B, PAN, M/S, Glide time, and Long-Throw Fader with peak meter.
 */

import type { McxHostBridge } from '../bridge/McxHostBridge';
import { getCategoryIconSvg } from '@abdsynths/shared/components/bank/bankIcons.js';
import { t } from '../i18n/mcxI18n';

export interface McxPartUiState {
  kind: 'chromatic' | 'drum_map';
  midiChannel: number;
  mute: boolean;
  solo: boolean;
  followTranspose?: boolean;
  name?: string;
  categoryId?: number;
  thumbnailUri?: string;
  portaTimeMs?: number; portaLegatoOnly?: boolean; routeMode?: number;
  vectorX?: number; vectorY?: number;
  partLevel?: number; partPan?: number;
  reverbSend?: number; chorusSend?: number; delaySend?: number; auxSend?: number;
  sendAPre?: boolean; sendBPre?: boolean; sendCPre?: boolean; sendDPre?: boolean;
  filterCutoff?: number; filterResonance?: number; filterModel?: number;
  filter2Enabled?: boolean; filter2Model?: number; filter2Mode?: number; filter2Cutoff?: number; filter2Resonance?: number;
  pitchCoarse?: number; pitchFine?: number; structureMode?: number; dacCharacter?: number;
  ampAttack?: number; ampDecay?: number; ampSustain?: number; ampRelease?: number;
  driveAmount?: number; eqLowGain?: number; eqMidGain?: number; eqHighGain?: number;
}

export function createDefaultPartState(i: number): McxPartUiState {
  const isDrum = i === 9;
  return {
    kind: isDrum ? 'drum_map' : 'chromatic', midiChannel: i + 1, mute: false, solo: false,
    followTranspose: !isDrum, name: isDrum ? 'TR-909 Kit' : `Sound P${i + 1}`, categoryId: isDrum ? 9 : 3,
    portaTimeMs: 60, portaLegatoOnly: true, routeMode: 0, vectorX: 0, vectorY: 0,
    partLevel: 0.85, partPan: 0,
    reverbSend: 0.28, chorusSend: 0.20, delaySend: 0.0, auxSend: 0.0,
    sendAPre: false, sendBPre: false, sendCPre: false, sendDPre: false,
    filterCutoff: 0.72, filterResonance: 0.18, filterModel: 0,
    filter2Enabled: false, filter2Model: 0, filter2Mode: 1, filter2Cutoff: 0.85, filter2Resonance: 0.10,
    pitchCoarse: 0, pitchFine: 0,
    structureMode: 0, dacCharacter: 0, ampAttack: 0.04, ampDecay: 0.25, ampSustain: 0.75, ampRelease: 0.18,
    driveAmount: 0.0, eqLowGain: 0.0, eqMidGain: 0.0, eqHighGain: 0.0,
  };
}

export interface McxMixerCallbacks {
  getFocusedPart: () => number;
  setFocusedPart: (idx: number) => void;
  getPartsState: () => McxPartUiState[];
  onTogglePartKind: (idx: number) => void;
  onChangePartChannel: (idx: number, ch: number) => void;
  onToggleFollowTranspose: (idx: number) => void;
  onToggleMute: (idx: number) => void;
  onToggleSolo: (idx: number) => void;
  onOpenBankForPart?: (idx: number) => void;
  onOpenToneForPart?: (idx: number) => void;
  onOpenPadsForPart?: (idx: number) => void;
  onChangeGlide?: (idx: number, ms: number) => void;
  onChangeLevel?: (idx: number, lvl: number) => void;
  onChangePan?: (idx: number, pan: number) => void;
  onChangeSendA?: (idx: number, send: number) => void;
  onChangeSendB?: (idx: number, send: number) => void;
  setLcdLine2: (text: string) => void;
}

function fmtPan(v: number): string {
  if (Math.abs(v) < 0.05) return 'C';
  return v < 0 ? `L${Math.round(-v * 64)}` : `R${Math.round(v * 63)}`;
}

export function renderMixerConsole(container: HTMLElement, cb: McxMixerCallbacks, bridge?: McxHostBridge): void {
  container.innerHTML = '';
  const focused = cb.getFocusedPart();
  const parts = cb.getPartsState();

  for (let i = 0; i < 16; ++i) {
    const ps = parts[i];
    const isDrum = ps.kind === 'drum_map';
    const catId = ps.categoryId ?? (isDrum ? 9 : 3);
    const soundName = ps.name || (isDrum ? 'TR-909 Kit' : `Sound P${i + 1}`);
    const portaMs = ps.portaTimeMs ?? 60;
    const level = ps.partLevel ?? 0.85;
    const pan = ps.partPan ?? 0;
    const sendA = ps.reverbSend ?? 0.28;
    const sendB = ps.chorusSend ?? 0.20;

    const strip = document.createElement('div');
    strip.className = `mcx-strip cat-${catId}${i === focused ? ' is-active' : ''}${isDrum ? ' is-drum' : ''}${ps.mute ? ' is-muted' : ''}`;
    strip.dataset.part = String(i);

    const chOpts = Array.from({ length: 16 }, (_, c) =>
      `<option value="${c + 1}"${ps.midiChannel === c + 1 ? ' selected' : ''}>CH${c + 1}</option>`
    ).join('');

    strip.innerHTML = `
      <div class="mcx-strip-head">
        <span class="mcx-strip-num"><span class="mcx-strip-led"></span>P${String(i + 1).padStart(2, '0')}</span>
        <button type="button" class="mcx-strip-kind-btn${isDrum ? ' is-drum' : ''}" data-act="kind" title="${t('mcx.partKindToggle')}">${isDrum ? 'DRM' : 'CHR'}</button>
      </div>
      <button type="button" class="mcx-strip-sound-btn cat-${catId}" data-act="sound" title="${soundName}">
        <span class="mcx-strip-cat-icon">${getCategoryIconSvg(catId)}</span>
        <span class="mcx-strip-sound-name">${soundName}</span>
      </button>
      <div class="mcx-strip-drawers-row">
        <button type="button" class="mcx-strip-drawer-btn is-tone" data-act="tone" title="${t('mcx.toneDrawerBtn')}">${t('mcx.toneShort')}</button>
        <button type="button" class="mcx-strip-drawer-btn is-pads" data-act="pads" title="${t('mcx.padsDrawerBtn')}">${t('mcx.padsShort')}</button>
      </div>
      <div class="mcx-strip-routing">
        <select class="mcx-strip-ch-select" data-act="ch" aria-label="${t('mcx.midiChannel')}">${chOpts}</select>
        <button type="button" class="mcx-strip-tr-btn${ps.followTranspose !== false && !isDrum ? ' is-active' : ''}${isDrum ? ' is-disabled' : ''}" data-act="tr" title="${t('mcx.partFollowTranspose')}" ${isDrum ? 'disabled' : ''}>TR</button>
      </div>
      <div class="mcx-strip-glide${isDrum ? ' is-disabled' : ''}" title="${t('mcx.portaTimeHint')}">
        <span class="mcx-strip-glide-lbl">GLD</span>
        <input type="range" class="mcx-strip-glide-slider" min="0" max="500" step="5" value="${portaMs}" ${isDrum ? 'disabled' : ''} />
        <span class="mcx-strip-glide-val">${Math.round(portaMs)}</span>
      </div>
      <div class="mcx-strip-sends-row">
        <div class="mcx-strip-mini-knob" title="${t('mcx.revSend')}"><span class="mcx-strip-mini-lbl">${t('mcx.sendAShort')}</span><input type="range" class="mcx-strip-send-a" min="0" max="1" step="0.02" value="${sendA}" /></div>
        <div class="mcx-strip-mini-knob" title="${t('mcx.choSend')}"><span class="mcx-strip-mini-lbl">${t('mcx.sendBShort')}</span><input type="range" class="mcx-strip-send-b" min="0" max="1" step="0.02" value="${sendB}" /></div>
      </div>
      <div class="mcx-strip-pan-row" title="${t('mcx.partPan')}"><span class="mcx-strip-pan-lbl">${t('mcx.panShort')}</span><input type="range" class="mcx-strip-pan-slider" min="-1" max="1" step="0.04" value="${pan}" /><span class="mcx-strip-pan-val">${fmtPan(pan)}</span></div>
      <div class="mcx-strip-ms-row">
        <button type="button" class="mcx-strip-ms-btn${ps.mute ? ' is-mute' : ''}" data-act="mute" title="${t('mcx.mute')}">M</button>
        <button type="button" class="mcx-strip-ms-btn${ps.solo ? ' is-solo' : ''}" data-act="solo" title="${t('mcx.solo')}">S</button>
      </div>
      <div class="mcx-strip-fader-section">
        <div class="mcx-strip-fader-row">
          <input type="range" class="mcx-strip-fader" orient="vertical" min="0" max="1" step="0.01" value="${level}" title="${t('mcx.partVolumeHint')}" />
          <div class="mcx-strip-vumeter" aria-hidden="true"><span class="mcx-vu-seg is-peak"></span><span class="mcx-vu-seg is-hot"></span><span class="mcx-vu-seg is-mid"></span><span class="mcx-vu-seg is-low"></span></div>
        </div>
        <span class="mcx-strip-lvl-val">${Math.round(level * 100)}%</span>
      </div>
    `;

    strip.addEventListener('click', (ev) => {
      const act = (ev.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
      if (act === 'kind') { ev.stopPropagation(); cb.onTogglePartKind(i); return; }
      if (act === 'sound') { ev.stopPropagation(); cb.onOpenBankForPart?.(i); return; }
      if (act === 'tone') { ev.stopPropagation(); cb.setFocusedPart(i); cb.onOpenToneForPart?.(i); return; }
      if (act === 'pads') { ev.stopPropagation(); cb.setFocusedPart(i); cb.onOpenPadsForPart?.(i); return; }
      if (act === 'tr') { ev.stopPropagation(); if (!isDrum) cb.onToggleFollowTranspose(i); return; }
      if (act === 'mute') { ev.stopPropagation(); cb.onToggleMute(i); return; }
      if (act === 'solo') { ev.stopPropagation(); cb.onToggleSolo(i); return; }
      if (act === 'ch') return;
      cb.setFocusedPart(i);
      container.querySelectorAll('.mcx-strip').forEach((el, idx) => el.classList.toggle('is-active', idx === i));
      cb.setLcdLine2(`PART ${String(i + 1).padStart(2, '0')} [${isDrum ? 'DRM' : 'CHR'} · CH${ps.midiChannel}] ${soundName}`);
    });

    const bindInput = (sel: string, onVal: (v: number) => void) => {
      const el = strip.querySelector(sel) as HTMLInputElement | null;
      el?.addEventListener('click', (ev) => ev.stopPropagation());
      el?.addEventListener('input', () => onVal(parseFloat(el.value)));
    };

    const chSel = strip.querySelector('select[data-act="ch"]') as HTMLSelectElement | null;
    chSel?.addEventListener('click', (ev) => ev.stopPropagation());
    chSel?.addEventListener('change', () => cb.onChangePartChannel(i, parseInt(chSel.value, 10)));

    const glideVal = strip.querySelector('.mcx-strip-glide-val');
    bindInput('.mcx-strip-glide-slider', (ms) => {
      if (glideVal) glideVal.textContent = String(Math.round(ms));
      ps.portaTimeMs = ms; bridge?.setParam(i, 'portaTimeMs', ms);
      cb.onChangeGlide?.(i, ms); cb.setLcdLine2(`P${String(i + 1).padStart(2, '0')} GLIDE: ${Math.round(ms)} ms`);
    });

    bindInput('.mcx-strip-send-a', (v) => {
      ps.reverbSend = v; bridge?.setParam(i, 'reverbSend', v); cb.onChangeSendA?.(i, v);
      cb.setLcdLine2(`P${String(i + 1).padStart(2, '0')} REV SEND: ${Math.round(v * 100)}%`);
    });

    bindInput('.mcx-strip-send-b', (v) => {
      ps.chorusSend = v; bridge?.setParam(i, 'chorusSend', v); cb.onChangeSendB?.(i, v);
      cb.setLcdLine2(`P${String(i + 1).padStart(2, '0')} CHO/DEL SEND: ${Math.round(v * 100)}%`);
    });

    const panVal = strip.querySelector('.mcx-strip-pan-val');
    bindInput('.mcx-strip-pan-slider', (v) => {
      if (panVal) panVal.textContent = fmtPan(v);
      ps.partPan = v; bridge?.setParam(i, 'partPan', v); cb.onChangePan?.(i, v);
      cb.setLcdLine2(`P${String(i + 1).padStart(2, '0')} PAN: ${fmtPan(v)}`);
    });

    const lvlVal = strip.querySelector('.mcx-strip-lvl-val');
    bindInput('.mcx-strip-fader', (v) => {
      if (lvlVal) lvlVal.textContent = `${Math.round(v * 100)}%`;
      ps.partLevel = v; bridge?.setParam(i, 'partLevel', v); cb.onChangeLevel?.(i, v);
      cb.setLcdLine2(`P${String(i + 1).padStart(2, '0')} LEVEL: ${Math.round(v * 100)}%`);
    });

    container.appendChild(strip);
  }
}

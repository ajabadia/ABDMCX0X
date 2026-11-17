/**
 * ABDMCX0X -- McxPanels.ts
 * Renders the 16-Part Groove Mixer, Voice LED Strip, Tone & Macro Deck,
 * Vector 2D Pad, and Master GS/MC-303 FX controls.
 */

import type { McxHostBridge, McxParamKey } from '../bridge/McxHostBridge';
import { t } from '../i18n/mcxI18n';

const REVERB_MACROS = ['Room 1', 'Room 2', 'Room 3', 'Hall 1', 'Hall 2', 'Plate', 'Delay', 'Pan Delay'];
const CHORUS_MACROS = ['Chorus 1', 'Chorus 2', 'Chorus 3', 'Chorus 4', 'FB Chorus', 'Flanger', 'Short Dly', 'Short Dly FB'];
const FILTER_MODELS = ['SVF Clean', 'Roland TVF ZDF', 'MS-20 Acid', 'Ladder Drive', 'Z-Plane Morph', 'TC6116AF TVF'];
const STRUCTURE_MODES = ['Parallel', 'RingMod 1-2', 'Booster 1-2', 'Vector 2D'];
const DAC_MODES = ['HD Studio', '90s 16-bit', 'Vintage 12-bit'];

export interface McxPartUiState {
  kind: 'chromatic' | 'drum_map';
  midiChannel: number;
  mute: boolean;
  solo: boolean;
}

export interface McxPanelCallbacks {
  getFocusedPart: () => number;
  setFocusedPart: (idx: number) => void;
  getPartsState: () => McxPartUiState[];
  onTogglePartKind: (idx: number) => void;
  onChangePartChannel: (idx: number, ch: number) => void;
  onToggleMute: (idx: number) => void;
  onToggleSolo: (idx: number) => void;
  setLcdLine2: (text: string) => void;
}

export function renderPartMixer(container: HTMLElement, cb: McxPanelCallbacks): void {
  container.innerHTML = '';
  const focused = cb.getFocusedPart();
  const parts = cb.getPartsState();

  for (let i = 0; i < 16; ++i) {
    const ps = parts[i];
    const isDrum = ps.kind === 'drum_map';
    const row = document.createElement('div');
    row.className = `mcx-part-row${i === focused ? ' is-active' : ''}${isDrum ? ' is-drum' : ''}${ps.mute ? ' is-muted' : ''}`;
    row.dataset.part = String(i);

    const chOpts = Array.from({ length: 16 }, (_, c) => `<option value="${c + 1}"${ps.midiChannel === c + 1 ? ' selected' : ''}>CH${c + 1}</option>`).join('');
    row.innerHTML = `
      <span class="mcx-part-num">P${String(i + 1).padStart(2, '0')}</span>
      <button type="button" class="mcx-part-kind-btn${isDrum ? ' is-drum' : ''}" data-act="kind" title="${t('mcx.partKindToggle')}">${isDrum ? 'DRM' : 'CHR'}</button>
      <select class="mcx-part-ch-select" data-act="ch" aria-label="${t('mcx.midiChannel')}">${chOpts}</select>
      <button type="button" class="mcx-part-ms-btn${ps.mute ? ' is-mute' : ''}" data-act="mute" title="${t('mcx.mute')}">M</button>
      <button type="button" class="mcx-part-ms-btn${ps.solo ? ' is-solo' : ''}" data-act="solo" title="${t('mcx.solo')}">S</button>
    `;

    row.addEventListener('click', (ev) => {
      const act = (ev.target as HTMLElement).dataset.act;
      if (act === 'kind') { ev.stopPropagation(); cb.onTogglePartKind(i); return; }
      if (act === 'mute') { ev.stopPropagation(); cb.onToggleMute(i); return; }
      if (act === 'solo') { ev.stopPropagation(); cb.onToggleSolo(i); return; }
      if (act === 'ch') return;
      cb.setFocusedPart(i);
      container.querySelectorAll('.mcx-part-row').forEach((el, idx) => el.classList.toggle('is-active', idx === i));
      cb.setLcdLine2(`PART ${String(i + 1).padStart(2, '0')} [${isDrum ? 'DRM' : 'CHR'} · CH${ps.midiChannel}]`);
    });
    const chSel = row.querySelector('select[data-act="ch"]') as HTMLSelectElement | null;
    chSel?.addEventListener('click', (ev) => ev.stopPropagation());
    chSel?.addEventListener('change', () => cb.onChangePartChannel(i, parseInt(chSel.value, 10)));
    container.appendChild(row);
  }
}

export function renderVoiceLedStrip(container: HTMLElement, budget: number, activeCount: number): void {
  const shown = Math.min(budget, 32);
  if (container.childElementCount !== shown) {
    container.innerHTML = '';
    for (let i = 0; i < shown; ++i) { const led = document.createElement('span'); led.className = 'mcx-voice-led'; container.appendChild(led); }
  }
  const lit = budget > 32 ? Math.round((activeCount / budget) * shown) : activeCount;
  for (let i = 0; i < shown; ++i) {
    const el = container.children[i] as HTMLElement;
    el.classList.toggle('is-on', i < lit);
    el.classList.toggle('is-hot', i < lit && i >= shown - 4);
  }
}

export function renderMacroDeck(container: HTMLElement, bridge: McxHostBridge, cb: McxPanelCallbacks): void {
  const sliders: Array<{ key: McxParamKey; i18n: string; min: number; max: number; step: number; val: number; fmt: (v: number) => string }> = [
    { key: 'filterCutoff', i18n: 'mcx.cutoff', min: 0, max: 1, step: 0.01, val: 0.72, fmt: (v) => `${Math.round(20 * Math.pow(1000, v))} Hz` },
    { key: 'filterResonance', i18n: 'mcx.resonance', min: 0, max: 0.96, step: 0.01, val: 0.18, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'ampAttack', i18n: 'mcx.attack', min: 0, max: 1, step: 0.01, val: 0.04, fmt: (v) => `${Math.round(0.5 + v * v * 2500)} ms` },
    { key: 'ampDecay', i18n: 'mcx.decay', min: 0, max: 1, step: 0.01, val: 0.25, fmt: (v) => `${Math.round(10 + v * 4000)} ms` },
    { key: 'ampSustain', i18n: 'mcx.sustain', min: 0, max: 1, step: 0.01, val: 0.75, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'ampRelease', i18n: 'mcx.release', min: 0, max: 1, step: 0.01, val: 0.18, fmt: (v) => `${Math.round(10 + v * 5000)} ms` },
    { key: 'partLevel', i18n: 'mcx.partLevel', min: 0, max: 1, step: 0.01, val: 0.85, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'partPan', i18n: 'mcx.partPan', min: -1, max: 1, step: 0.02, val: 0, fmt: (v) => (Math.abs(v) < 0.03 ? 'C' : v < 0 ? `L${Math.round(-v * 64)}` : `R${Math.round(v * 63)}`) },
    { key: 'reverbSend', i18n: 'mcx.revSend', min: 0, max: 1, step: 0.01, val: 0.28, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'chorusSend', i18n: 'mcx.choSend', min: 0, max: 1, step: 0.01, val: 0.20, fmt: (v) => `${Math.round(v * 100)}%` },
  ];

  container.innerHTML = '';
  for (const s of sliders) {
    const card = document.createElement('label');
    card.className = 'mcx-control-card';
    card.innerHTML = `
      <span class="mcx-control-label" data-i18n="${s.i18n}">${t(s.i18n)}</span>
      <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.val}" />
      <span class="mcx-control-val">${s.fmt(s.val)}</span>
    `;
    const input = card.querySelector('input')!;
    const valEl = card.querySelector('.mcx-control-val')!;
    input.addEventListener('input', () => {
      const num = parseFloat(input.value);
      const txt = s.fmt(num);
      valEl.textContent = txt;
      bridge.setParam(cb.getFocusedPart(), s.key, num);
      cb.setLcdLine2(`${t(s.i18n)}: ${txt}`);
    });
    container.appendChild(card);
  }
}

export function renderFxAndSelectors(container: HTMLElement, bridge: McxHostBridge, cb: McxPanelCallbacks): void {
  const makeSelect = (i18nKey: string, paramKey: McxParamKey, options: string[], defIdx: number) => {
    const wrap = document.createElement('label');
    wrap.className = 'mcx-select-card';
    const optsHtml = options.map((o, idx) => `<option value="${idx}"${idx === defIdx ? ' selected' : ''}>${o}</option>`).join('');
    wrap.innerHTML = `<span class="mcx-control-label" data-i18n="${i18nKey}">${t(i18nKey)}</span><select>${optsHtml}</select>`;
    const sel = wrap.querySelector('select')!;
    sel.addEventListener('change', () => {
      const idx = parseInt(sel.value, 10);
      bridge.setParam(cb.getFocusedPart(), paramKey, idx);
      cb.setLcdLine2(`${t(i18nKey)}: ${options[idx]}`);
    });
    return wrap;
  };

  container.innerHTML = '';
  container.appendChild(makeSelect('mcx.filterModel', 'filterModel', FILTER_MODELS, 5));
  container.appendChild(makeSelect('mcx.structureMode', 'structureMode', STRUCTURE_MODES, 0));
  container.appendChild(makeSelect('mcx.dacMode', 'dacCharacter', DAC_MODES, 0));
  container.appendChild(makeSelect('mcx.reverbMacro', 'reverbMacro', REVERB_MACROS, 3));
  container.appendChild(makeSelect('mcx.chorusMacro', 'chorusMacro', CHORUS_MACROS, 1));

  const timeCard = document.createElement('label');
  timeCard.className = 'mcx-select-card';
  timeCard.innerHTML = `<span class="mcx-control-label" data-i18n="mcx.reverbTime">${t('mcx.reverbTime')}</span><input type="range" min="0" max="1" step="0.01" value="0.55" />`;
  timeCard.querySelector('input')!.addEventListener('input', (ev) => {
    const v = parseFloat((ev.target as HTMLInputElement).value);
    bridge.setParam(cb.getFocusedPart(), 'reverbTime', v);
    cb.setLcdLine2(`${t('mcx.reverbTime')}: ${Math.round(v * 100)}%`);
  });
  container.appendChild(timeCard);
}

export function bindVectorPad(pad: HTMLElement, dot: HTMLElement, bridge: McxHostBridge, cb: McxPanelCallbacks): void {
  let dragging = false;
  const update = (ev: PointerEvent) => {
    const rect = pad.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
    dot.style.left = `${nx * 100}%`;
    dot.style.top = `${ny * 100}%`;
    const vx = nx * 2 - 1;
    const vy = (1 - ny) * 2 - 1;
    bridge.setParam(cb.getFocusedPart(), 'vectorX', vx);
    bridge.setParam(cb.getFocusedPart(), 'vectorY', vy);
    cb.setLcdLine2(`VECTOR 2D : X ${vx >= 0 ? '+' : ''}${vx.toFixed(2)}  Y ${vy >= 0 ? '+' : ''}${vy.toFixed(2)}`);
  };
  pad.addEventListener('pointerdown', (ev) => { dragging = true; pad.setPointerCapture(ev.pointerId); update(ev); });
  pad.addEventListener('pointermove', (ev) => { if (dragging) update(ev); });
  pad.addEventListener('pointerup', () => { dragging = false; });
}

export function wireBankDropZone(
  dropZone: HTMLElement,
  fileInput: HTMLInputElement,
  bridge: McxHostBridge,
  setLcdLine2: (text: string) => void,
): void {
  const loadFile = async (file: File) => {
    bridge.loadBankBuffer(await file.arrayBuffer());
    setLcdLine2(`${t('mcx.loadBank')}: ${file.name}`);
  };
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files?.[0]) void loadFile(fileInput.files[0]); });
  ['dragenter', 'dragover'].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('is-drag'); }),
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('is-drag'); }),
  );
  dropZone.addEventListener('drop', (e) => {
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (file) void loadFile(file);
  });
  bridge.onBankLoaded((ok, sizeBytes) => {
    setLcdLine2(ok ? `${t('mcx.bankLoaded')} (${Math.round(sizeBytes / 1024)} KB)` : t('mcx.bankFailed'));
  });
}

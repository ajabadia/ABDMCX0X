/**
 * ABDMCX0X -- McxToneDrawerSync.ts
 * Shell HTML, DOM synchronization, and send toggle helpers for McxToneDrawer.
 * Strict line limit: < 200 lines.
 */

import type { McxEngineDescriptorDto, McxHostBridge, McxParamKey } from '../bridge/McxHostBridge';
import { t } from '../i18n/mcxI18n';
import { getShortEngineBadge } from './McxEngineCatalogDefaults';
import type { McxPartUiState } from './McxMixerConsole';
import { buildMixTabHtml } from './McxToneTabMix';
import { buildMidiFxTabHtml } from './McxToneTabMidiFx';
import type { McxToneDrawerKnobsManager } from './McxToneDrawerKnobs';


const PRE_KEYS = ['sendAPre', 'sendBPre', 'sendCPre', 'sendDPre'] as const;
const SEND_KEYS: McxParamKey[] = ['reverbSend', 'chorusSend', 'delaySend', 'auxSend'];
const OFFSET_KEYS: McxParamKey[] = ['cutoffOffset', 'resonanceOffset', 'envAttackOffset', 'envDecayOffset', 'envSustainOffset', 'envReleaseOffset', 'vibratoOffset'];
const SEG_KEYS = ['portaMode', 'driveType'] as const;

export function resetPartSemanticOffsets(bridge: McxHostBridge, partIdx: number, ps: McxPartUiState): void {
  for (const ok of OFFSET_KEYS) {
    (ps as any)[ok] = 0;
    bridge.setParam(partIdx, ok, 0);
  }
}

export function buildToneDrawerShellHtml(): string {
  return `
    <div class="mcx-drawer-head">
      <div class="mcx-drawer-title-row">
        <span class="mcx-drawer-title-accent" id="mcx-drawer-part-badge">P01</span>
        <span class="mcx-drawer-part-name" id="mcx-drawer-part-name">Part 01</span>
        <button type="button" class="mcx-drawer-route-pill" id="mcx-drawer-route-pill" data-act="open-route" title="${t('mcx.drawerRoutingTitle')}">${t('mcx.drawerRoutingBtn')}</button>
        <button type="button" class="mcx-drawer-route-pill" id="mcx-drawer-synth-pill" data-act="open-synth" title="${t('mcx.drawerEditSynthTitle')}">${t('mcx.drawerEditSynthBtn')}</button>
        <span class="mcx-drawer-mute-badge is-hidden" id="mcx-drawer-mute-badge">${t('mcx.mute')}</span>
      </div>
      <div class="mcx-drawer-tablist" role="tablist" focusgroup="tablist nomemory" aria-label="${t('mcx.drawerDefaultTitle')}">
        <button type="button" role="tab" class="mcx-drawer-tab" id="mcx-tab-mix" data-drawer-tab="mix" aria-selected="true" tabindex="0" focusgroupstart>${t('mcx.drawerTabMixLabel')}</button>
        <button type="button" role="tab" class="mcx-drawer-tab" id="mcx-tab-midifx" data-drawer-tab="midifx" aria-selected="false" tabindex="-1">${t('mcx.drawerTabMidiFxLabel')}</button>
      </div>
      <button type="button" class="mcx-drawer-close-btn" data-act="close" title="${t('mcx.closeDrawer')}" aria-label="${t('mcx.closeDrawer')}"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
    </div>
    <div class="mcx-drawer-body">
      <div class="mcx-tab-panels">
        <div class="mcx-tab-panel" role="tabpanel" data-tab-panel="mix" aria-labelledby="mcx-tab-mix" tabindex="0">
          <div class="mcx-tab-pane-inner">${buildMixTabHtml()}</div>
        </div>
        <div class="mcx-tab-panel" role="tabpanel" data-tab-panel="midifx" aria-labelledby="mcx-tab-midifx" hidden="until-found">
          <div class="mcx-tab-pane-inner">${buildMidiFxTabHtml()}</div>
        </div>
      </div>
    </div>
  `;
}

export function bindDrawerSendButtons(
  el: HTMLElement,
  bridge: McxHostBridge,
  getPart: () => number,
  getPartState: (idx: number) => McxPartUiState,
  knobsMgr: McxToneDrawerKnobsManager,
  setLcdLine2: (text: string) => void
): void {
  el.querySelectorAll<HTMLButtonElement>('.mcx-pre-post-btn').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation(); const pk = b.dataset.sendPre as typeof PRE_KEYS[number]; if (!pk) return;
      const p = getPart(), ps = getPartState(p), n = !ps[pk]; ps[pk] = n;
      b.textContent = n ? 'PRE' : 'POST'; b.classList.toggle('is-pre', n);
      bridge.setParam(p, pk, n ? 1 : 0);
      setLcdLine2(`P${String(p + 1).padStart(2, '0')} ${pk.toUpperCase()}: ${n ? 'PRE' : 'POST'}`);
    });
  });
  el.querySelectorAll<HTMLButtonElement>('[data-ch-mute]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation(); const p = getPart(), idx = parseInt(b.dataset.chMute ?? '-1', 10), ps = getPartState(p) as any;
      const mKey = `send${String.fromCharCode(65 + idx)}Mute`, n = !ps[mKey], pKey = SEND_KEYS[idx];
      ps[mKey] = n; b.classList.toggle('is-muted', n);
      const r = n ? (ps[`_mem_${pKey}`] = ps[pKey] ?? 0.25, 0) : (ps[`_mem_${pKey}`] ?? 0.25);
      ps[pKey] = r; bridge.setParam(p, pKey, r); knobsMgr.syncValues(ps);
      setLcdLine2(`P${String(p + 1).padStart(2, '0')} SEND ${String.fromCharCode(65 + idx)}: ${n ? 'MUTED' : 'ACTIVE'}`);
    });
  });
}

export function updateDrawerSendLabels(el: HTMLElement, labels?: { sendA: string; sendB: string; sendC: string; sendD: string }): void {
  if (!labels) return;
  const names = [labels.sendA, labels.sendB, labels.sendC, labels.sendD];
  el.querySelectorAll<HTMLElement>('[data-send-target]').forEach((n) => {
    const b = parseInt(n.dataset.sendTarget ?? '-1', 10);
    if (b >= 0 && b < names.length && names[b]) n.textContent = names[b].toUpperCase();
  });
}

export function updateDrawerSendTelemetry(el: HTMLElement, peaks: number[], busMutes?: boolean[]): void {
  el.querySelectorAll<HTMLElement>('[data-send-led]').forEach((led) => led.classList.toggle('is-active', (peaks[parseInt(led.dataset.sendLed ?? '-1', 10)] ?? 0) > 0.005));
  if (!busMutes) return;
  el.querySelectorAll<HTMLElement>('[data-bus-badge]').forEach((badge) => {
    const isMuted = Boolean(busMutes[parseInt(badge.dataset.busBadge ?? '-1', 10)]);
    badge.classList.toggle('is-muted', isMuted); badge.textContent = isMuted ? 'MUTE' : 'BUS';
  });
}

export function syncToneDrawerDom(
  el: HTMLElement, partIdx: number, ps: McxPartUiState, catalog: McxEngineDescriptorDto[]
): void {
  const isDrum = ps.kind === 'drum_map', routeMode = ps.routeMode ?? 0;
  const engIdx = ps.engineTypeIndex ?? (routeMode === 1 ? 1 : 0);
  const badge = getShortEngineBadge(ps, catalog);
  const partName = ps.name || (isDrum ? 'TR-909 Kit' : `Sound P${partIdx + 1}`);

  const setText = (sel: string, txt: string) => { const n = el.querySelector(sel); if (n) n.textContent = txt; };
  setText('#mcx-drawer-part-badge', `P${String(partIdx + 1).padStart(2, '0')}`);
  setText('#mcx-drawer-part-name', partName);
  const rPill = el.querySelector<HTMLElement>('#mcx-drawer-route-pill');
  if (rPill) { rPill.textContent = `${badge.routeTag} · CH ${String(ps.midiChannel || 1).padStart(2, '0')}`; rPill.className = `mcx-drawer-route-pill is-${badge.variant}`; }
  const sPill = el.querySelector<HTMLElement>('#mcx-drawer-synth-pill');
  if (sPill) { sPill.textContent = `${badge.engineTag} · ${t('mcx.drawerEditSynthBtn')}`; sPill.className = `mcx-drawer-route-pill is-${badge.variant}`; }
  el.querySelector('#mcx-drawer-mute-badge')?.classList.toggle('is-hidden', !ps.mute);
  el.querySelectorAll<HTMLElement>('[data-learnable]').forEach((c) => { c.dataset.part = String(partIdx); });

  const desc = catalog.find((e) => e.index === engIdx);
  setText('#mcx-drawer-engine-lbl', desc?.displayName || (routeMode === 1 ? 'External MIDI / Null Slot' : 'ABD Structured Rompler'));

  const isExternal = routeMode === 1 || engIdx === 1 || ps.engineTypeId === 'external_midi';
  el.querySelector('#mcx-engine-panel-slot')?.classList.toggle('is-hidden', isExternal);
  el.querySelector('#mcx-motor-external')?.classList.toggle('is-hidden', !isExternal);
  setText('#mcx-ext-midi-summary', `Puerto ${(ps.midiPortIndex ?? 0) + 1} · Canal ${String(ps.midiChannel || 1).padStart(2, '0')}`);

  const insertSel = el.querySelector<HTMLSelectElement>('#mcx-track-insert-select');
  if (insertSel) {
    insertSel.disabled = isExternal;
    insertSel.value = String(isExternal ? -1 : (ps.insertSlot ?? -1));
  }

  setText('#drawer-ch-val', `CH ${String(ps.midiChannel || 1).padStart(2, '0')}`);
  const trActive = ps.followTranspose !== false && !isDrum;
  el.querySelectorAll<HTMLButtonElement>('[data-act="drawer-tr"]').forEach((btn) => {
    btn.classList.toggle('is-active', trActive); btn.disabled = isDrum;
    if (btn.id === 'mcx-midifx-tr-btn') btn.textContent = trActive ? t('mcx.midiTrOn') : t('mcx.midiTrOff');
  });
  el.querySelector<HTMLButtonElement>('[data-act="drawer-mute"]')?.classList.toggle('is-mute', Boolean(ps.mute));
  el.querySelector<HTMLButtonElement>('[data-act="drawer-solo"]')?.classList.toggle('is-solo', Boolean(ps.solo));

  const arpBtn = el.querySelector<HTMLButtonElement>('#mcx-drawer-arp-btn');
  if (arpBtn) {
    const arpOn = Boolean(ps.arpEnabled); arpBtn.classList.toggle('is-active', arpOn);
    arpBtn.textContent = arpOn ? t('mcx.midiArpOn') : t('mcx.midiArpOff');
  }
  const seq = ps.sequence, sw = Math.round((ps.patternSwing ?? 0.5) * 100);
  setText('#mcx-midifx-seq-summary', `${seq?.bars ?? 1} bar · ${seq?.notes?.length ?? 0} notes · Swing ${sw}%`);

  for (const k of SEG_KEYS) {
    const v = k === 'portaMode' ? (!ps.portaEnabled ? 0 : (ps.portaLegatoOnly ? 2 : 1)) : ((ps as any)[k] ?? 0);
    el.querySelectorAll<HTMLButtonElement>(`.mcx-seg-btn[data-param="${k}"]`).forEach((b) => b.classList.toggle('is-active', parseInt(b.dataset.val ?? '-1', 10) === v));
  }
  for (const pk of PRE_KEYS) {
    const btn = el.querySelector<HTMLButtonElement>(`[data-send-pre="${pk}"]`);
    if (btn) { const p = Boolean(ps[pk]); btn.textContent = p ? 'PRE' : 'POST'; btn.classList.toggle('is-pre', p); }
  }
  el.querySelectorAll<HTMLButtonElement>('[data-ch-mute]').forEach((btn) => {
    const b = parseInt(btn.dataset.chMute ?? '-1', 10);
    btn.classList.toggle('is-muted', Boolean((ps as any)[`send${String.fromCharCode(65 + b)}Mute`]));
  });
}

export function syncInsertSelectOptions(el: HTMLElement, rackSlots?: Array<{ slot: number; engine: number; name?: string; algoId?: string }>, curSlot = -1): void {
  const sel = el.querySelector<HTMLSelectElement>('#mcx-track-insert-select');
  if (!sel) return;
  if (Array.isArray(rackSlots)) {
    const active = rackSlots.filter((b) => b && b.engine !== 0);
    sel.innerHTML = [
      `<option value="-1"${curSlot === -1 ? ' selected' : ''}>${t('mcx.mixNoInsert')}</option>`,
      ...active.map((b) => `<option value="${b.slot}"${b.slot === curSlot ? ' selected' : ''}>${t('mcx.rackBay')} ${b.slot + 1}: ${b.name || b.algoId}</option>`),
    ].join('');
  }
  sel.value = String(curSlot);
}

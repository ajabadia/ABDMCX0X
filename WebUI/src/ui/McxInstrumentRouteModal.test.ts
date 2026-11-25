/**
 * ABDMCX0X -- McxInstrumentRouteModal.test.ts
 * Verifies sequential route layout, derived vs fixed mode readout, External MIDI controls,
 * working footer [data-act="open-tone"] handoff, and multi-engine track cover popups.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McxInstrumentRouteModal } from './McxInstrumentRouteModal';
import { createDefaultPartState, type McxPartUiState } from './McxPartState';
import { createDefaultBankLayout } from './McxBankLayout';
import { renderMixerConsole } from './McxMixerConsole';
import { closeTrackCoverPopups, resolveTrackCoverAndEngine } from './McxTrackCoverPopup';
import { soundBankRegistry } from '../app/McxSoundBankManager';
import { syncToneDrawerDom } from './McxToneDrawerSync';

function setupDialogPolyfill() {
  Object.defineProperty(HTMLDialogElement.prototype, 'open', {
    configurable: true,
    get(this: HTMLDialogElement) { return this.hasAttribute('open'); },
    set(this: HTMLDialogElement, v: boolean) { if (v) this.setAttribute('open', ''); else this.removeAttribute('open'); },
  });
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open'); this.dispatchEvent(new Event('close'));
  });
}

function makeMockBridge() {
  return {
    isNative: false,
    requestPartPresets: vi.fn(),
    refreshMidiDevices: vi.fn(),
    setParam: vi.fn(),
    selectPartEngineType: vi.fn(),
    setPartMidiDevice: vi.fn(),
    enableAudio: vi.fn(async () => true),
    noteOn: vi.fn(),
    noteOff: vi.fn(),
    requestPartEngineState: vi.fn(),
  };
}

describe('McxInstrumentRouteModal layout and Edit Instrument CTA', () => {
  beforeEach(() => { document.body.innerHTML = ''; setupDialogPolyfill(); });

  it('closes route modal and opens synth editor when clicking primary footer Edit Instrument button', () => {
    const parts: McxPartUiState[] = [createDefaultPartState(0)];
    const onOpenToneDrawer = vi.fn();
    const b = makeMockBridge();
    const modal = new McxInstrumentRouteModal({
      bridge: b as never,
      getPartState: (i) => parts[i],
      onPartUpdated: vi.fn(),
      onOpenToneDrawer,
      setLcdLine2: vi.fn(),
    });

    modal.open(0);
    expect(document.querySelector('#mcx-route-engine')?.hasAttribute('hidden')).toBe(true);
    const jvCard = document.querySelector<HTMLButtonElement>('.mcx-route-dialog .mcx-route-engine-card[data-engine-idx="5"]');
    expect(jvCard?.querySelector('[data-cover-engine]')?.getAttribute('data-cover-engine')).toBe('jv880_synth');
    expect(jvCard?.querySelector('img')?.getAttribute('src')).toBe('/assets/models/roland-jv880.webp');
    jvCard?.click();
    expect(b.selectPartEngineType).toHaveBeenCalledWith(0, 5);
    const editBtns = document.querySelectorAll<HTMLElement>('.mcx-route-dialog [data-act="open-tone"]');
    expect(editBtns.length).toBe(1);
    const sectionLabels = [...document.querySelectorAll('.mcx-route-section > .mcx-route-label, .mcx-route-midi-head-row .mcx-route-label')]
      .map((el) => el.textContent?.trim() || '');
    expect(sectionLabels.some((s) => s.startsWith('1.'))).toBe(true);
    expect(sectionLabels.some((s) => s.startsWith('2.'))).toBe(true);
    expect(sectionLabels.some((s) => s.startsWith('3.'))).toBe(true);
    expect(sectionLabels.some((s) => s.startsWith('4.'))).toBe(true);

    editBtns[0].click();
    expect(onOpenToneDrawer).toHaveBeenCalledWith(0);
    modal.destroy();
  });

  it('renders derived-from-preset label for dual-mode engines and manual format toggles only for External MIDI', () => {
    const parts: McxPartUiState[] = [createDefaultPartState(0), createDefaultPartState(1)];
    parts[1].routeMode = 1;
    parts[1].engineTypeIndex = 1;
    parts[1].engineTypeId = 'external_midi';

    const modal = new McxInstrumentRouteModal({
      bridge: makeMockBridge() as never,
      getPartState: (i) => parts[i],
      onPartUpdated: vi.fn(),
      onOpenToneDrawer: vi.fn(),
      setLcdLine2: vi.fn(),
    });

    modal.open(0);
    expect(document.querySelectorAll('.mcx-route-dialog [data-kind]').length).toBe(0);
    expect(document.querySelector('.mcx-route-format-tag')?.textContent).toMatch(/preset/i);

    modal.open(1);
    expect(document.querySelectorAll('.mcx-route-dialog [data-kind]').length).toBe(2);
    expect(document.querySelectorAll('.mcx-route-dialog [data-act="open-tone"]').length).toBe(0);
    modal.destroy();
  });

  it('resolves per-engine default faceplates, isolates non-rompler engines from rompler bank covers, and opens track popups', () => {
    const rompler = createDefaultPartState(0);
    expect(resolveTrackCoverAndEngine(rompler).coverUrl).toBe('/assets/engines/rompler_faceplate.webp');

    const mcs = createDefaultPartState(1); mcs.engineTypeIndex = 2; mcs.engineTypeId = 'mcs48_synth';
    expect(resolveTrackCoverAndEngine(mcs).coverUrl).toBe('/assets/engines/mcs48_faceplate.webp');

    const abyss = createDefaultPartState(2); abyss.engineTypeIndex = 5; abyss.engineTypeId = 'abyssmind_synth';
    expect(resolveTrackCoverAndEngine(abyss).coverUrl).toBe('/assets/models/abyssmind.webp');

    const la50 = createDefaultPartState(4); la50.engineTypeIndex = 3; la50.engineTypeId = 'la50_synth';
    expect(resolveTrackCoverAndEngine(la50).coverUrl).toBe('/assets/models/roland-d50.webp');

    const cm32 = createDefaultPartState(5); cm32.engineTypeIndex = 4; cm32.engineTypeId = 'cm32_synth';
    expect(resolveTrackCoverAndEngine(cm32).coverUrl).toBe('/assets/models/roland-cm32.webp');

    const ext = createDefaultPartState(3); ext.routeMode = 1; ext.engineTypeIndex = 1;
    expect(resolveTrackCoverAndEngine(ext).coverUrl).toBe('/assets/engines/abdmcx0x_faceplate.webp');

    const bankCov = 'data:image/png;base64,iVBORw0KGgo=';
    soundBankRegistry.registerBank({
      id: 'd50_cover_test', name: 'Roland D-50', filename: 'Roland_D50.abdbank',
      slotIndex: 0, author: 'Roland', sizeBytes: 1697825, coverUrl: bankCov,
      items: [{ id: 't1', name: 'Fantasia', itemType: 1 }] as never,
    });
    rompler.soundBankId = 'd50_cover_test'; rompler.soundBankName = 'Roland D-50'; rompler.name = 'Fantasia';
    expect(resolveTrackCoverAndEngine(rompler).coverUrl).toBe(bankCov);
    la50.soundBankId = 'd50_cover_test'; la50.soundBankName = 'Roland D-50';
    expect(resolveTrackCoverAndEngine(la50).coverUrl).toBe('/assets/models/roland-d50.webp');
    expect(resolveTrackCoverAndEngine(la50).bankLabel).toBe('LA50');

    const host = document.createElement('div'); document.body.appendChild(host);
    const parts = Array.from({ length: 16 }, (_, i) => i === 0 ? rompler : (i === 1 ? mcs : createDefaultPartState(i)));
    renderMixerConsole(host, {
      getFocusedPart: () => 0, setFocusedPart: vi.fn(), getPartsState: () => parts, getBankLayout: () => createDefaultBankLayout(),
      onTogglePartKind: vi.fn(), onChangePartChannel: vi.fn(), onToggleFollowTranspose: vi.fn(),
      onToggleMute: vi.fn(), onToggleSolo: vi.fn(), setLcdLine2: vi.fn(),
    });
    const thumb = host.querySelector<HTMLImageElement>('.mcx-strip[data-part="0"] .mcx-strip-cover-thumb');
    expect(thumb?.getAttribute('src')).toBe(bankCov);
    const mcsThumb = host.querySelector<HTMLImageElement>('.mcx-strip[data-part="1"] .mcx-strip-cover-thumb');
    expect(mcsThumb?.getAttribute('src')).toBe('/assets/engines/mcs48_faceplate.webp');

    const covBtn = host.querySelector<HTMLElement>('.mcx-strip[data-part="0"] [data-act="cover-popup"]')!;
    covBtn.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.querySelector('.mcx-track-cover-popover')?.textContent).toContain('Structured Rompler');
    expect(document.querySelector('.mcx-track-cover-popover')?.textContent).toContain('Roland D-50');
    covBtn.click();
    expect(document.querySelector('.mcx-track-cover-modal')?.textContent).toContain('Fantasia');
    expect(document.querySelector('.mcx-track-cover-modal')?.textContent).toContain('1.6 MB');
    closeTrackCoverPopups();
    expect(document.querySelector('.mcx-track-cover-modal')).toBeNull();
  });

  it('disables unsupported macro and mix cells in syncToneDrawerDom for mcs48_synth and EXT MIDI', () => {
    const el = document.createElement('div');
    const keys = ['cutoffOffset', 'resonanceOffset', 'vibratoOffset', 'envDecayOffset', 'envAttackOffset', 'partPan', 'reverbSend', 'chorusSend', 'delaySend'];
    el.innerHTML = keys.map((p) => `<div class="synth-knob-cell" data-param="${p}"></div>`).join('');
    const cat = [
      { index: 0, typeId: 'structured_rompler', displayName: 'Structured Rompler' },
      { index: 2, typeId: 'mcs48_synth', displayName: 'MCS-48 Chiptune' },
    ] as never;
    const mcs = createDefaultPartState(1); mcs.engineTypeIndex = 2; mcs.engineTypeId = 'mcs48_synth';
    syncToneDrawerDom(el, 1, mcs, cat);
    expect(el.querySelector('[data-param="cutoffOffset"]')?.classList.contains('is-disabled')).toBe(true);
    expect(el.querySelector('[data-param="resonanceOffset"]')?.getAttribute('aria-disabled')).toBe('true');
    expect(el.querySelector('[data-param="vibratoOffset"]')?.classList.contains('is-disabled')).toBe(true);
    expect(el.querySelector('[data-param="envDecayOffset"]')?.classList.contains('is-disabled')).toBe(true);
    expect(el.querySelector('[data-param="envAttackOffset"]')?.classList.contains('is-disabled')).toBe(false);
    const rom = createDefaultPartState(0); rom.engineTypeIndex = 0; rom.engineTypeId = 'structured_rompler';
    syncToneDrawerDom(el, 0, rom, cat);
    expect(el.querySelector('[data-param="cutoffOffset"]')?.classList.contains('is-disabled')).toBe(false);
    expect(el.querySelector('[data-param="cutoffOffset"]')?.getAttribute('aria-disabled')).toBe('false');
    const ext = createDefaultPartState(2); ext.routeMode = 1; ext.engineTypeId = 'external_midi';
    syncToneDrawerDom(el, 2, ext, cat);
    for (const p of ['partPan', 'reverbSend', 'chorusSend', 'delaySend']) {
      expect(el.querySelector(`[data-param="${p}"]`)?.classList.contains('is-disabled')).toBe(true);
    }
  });
});

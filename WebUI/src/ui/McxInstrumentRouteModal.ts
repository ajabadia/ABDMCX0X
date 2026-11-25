/**
 * ABDMCX0X -- McxInstrumentRouteModal.ts
 * Native <dialog> modal to configure per-part format (CHR/DRM), route (INT/EXT/A+B),
 * synthesis engine slot, factory preset, and external MIDI port/channel.
 * Strict line limit: < 200 lines.
 */

import { hideCoverHoverPopover } from '@abdsynths/shared/components';
import { attachDialogDrag, bringToFront } from '@abdsynths/shared/diagnostic-probe';
import { ensureEngineWaveDependencies } from '../app/McxSoundBankManager';
import type { McxEngineDescriptorDto, McxHostBridge, McxMidiDevicesDto, McxPartPresetsDto } from '../bridge/McxHostBridge';
import { DEFAULT_ENGINE_CATALOG } from './McxEngineCatalogDefaults';
import { buildRouteModalHtml, wireRouteCoverPopups } from './McxInstrumentRouteModalView';
import type { McxPartUiState } from './McxMixerConsole';

export interface McxInstrumentRouteModalOptions {
  bridge: McxHostBridge;
  getPartState: (idx: number) => McxPartUiState;
  getMidiDevices?: () => McxMidiDevicesDto;
  onPartUpdated: (idx: number) => void;
  onOpenToneDrawer: (idx: number) => void;
  setLcdLine2: (text: string) => void;
}

export class McxInstrumentRouteModal {
  private readonly dialog: HTMLDialogElement;
  private readonly opts: McxInstrumentRouteModalOptions;
  private currentPart = 0;
  private catalog: McxEngineDescriptorDto[] = [...DEFAULT_ENGINE_CATALOG];
  private presetsByPart = new Map<number, McxPartPresetsDto>();
  private cachedDevices?: McxMidiDevicesDto;
  private readonly onEscKey: (ev: KeyboardEvent) => void;

  constructor(opts: McxInstrumentRouteModalOptions) {
    this.opts = opts;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'mcx-route-dialog';
    this.dialog.setAttribute('aria-labelledby', 'mcx-route-title');
    document.body.appendChild(this.dialog);
    this.onEscKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && this.dialog.open) this.close(); };

    this.dialog.addEventListener('close', () => {
      this.dialog.returnValue = ''; window.removeEventListener('keydown', this.onEscKey); this.opts.onPartUpdated(this.currentPart);
    });
  }

  public syncTheme(): void {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme) this.dialog.setAttribute('data-theme', theme);
    if (this.dialog.open) {
      this.render();
    }
  }

  public open(partIdx: number): void {
    this.currentPart = partIdx;
    this.syncTheme();
    this.opts.bridge.requestPartPresets(partIdx);
    this.opts.bridge.refreshMidiDevices();
    this.render();
    if (!this.dialog.open) {
      if (typeof this.dialog.show === 'function') this.dialog.show();
      else this.dialog.setAttribute('open', '');
    }
    window.addEventListener('keydown', this.onEscKey);
    bringToFront(this.dialog);
  }

  public setMidiDevices(dto: McxMidiDevicesDto): void {
    this.cachedDevices = dto;
    if (this.dialog.open) this.render();
  }

  public close(): void {
    hideCoverHoverPopover();
    window.removeEventListener('keydown', this.onEscKey);
    if (!this.dialog.open) return;
    if (typeof this.dialog.close === 'function') this.dialog.close();
    else this.dialog.removeAttribute('open');
  }
  public setLocale(): void { if (this.dialog.open) this.render(); }
  public destroy(): void { hideCoverHoverPopover(); window.removeEventListener('keydown', this.onEscKey); this.dialog.remove(); }
  public getEngineCatalog(): McxEngineDescriptorDto[] { return this.catalog; }
  public setEngineCatalog(engines: McxEngineDescriptorDto[]): void {
    if (engines.length > 0) this.catalog = engines;
    if (this.dialog.open) this.render();
  }

  public setPartPresets(dto: McxPartPresetsDto): void {
    this.presetsByPart.set(dto.part, dto);
    const ps = this.opts.getPartState(dto.part);
    if (ps) { ps.engineTypeIndex = dto.engineTypeIndex; ps.engineTypeId = dto.engineTypeId; }
    if (this.dialog.open && dto.part === this.currentPart) this.render();
  }

  private getDevices(): McxMidiDevicesDto {
    return this.opts.getMidiDevices?.() ?? this.cachedDevices ?? { isStandalone: !this.opts.bridge.isNative, inputs: [], outputs: [] };
  }

  private render(): void {
    const p = this.currentPart, ps = this.opts.getPartState(p);
    this.dialog.innerHTML = buildRouteModalHtml(p, ps, this.catalog, [], this.getDevices());
    wireRouteCoverPopups(this.dialog, this.catalog);
    const head = this.dialog.querySelector<HTMLElement>('.mcx-route-head');
    if (head) attachDialogDrag(this.dialog, head);
    this.bindEvents();
  }

  private bindEvents(): void {
    const p = this.currentPart, ps = this.opts.getPartState(p), b = this.opts.bridge;
    const tag = `P${String(p + 1).padStart(2, '0')}`;
    this.dialog.querySelectorAll<HTMLElement>('[data-act="close"]').forEach((el) => el.addEventListener('click', () => this.close()));
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.kind === 'drum_map' ? 'drum_map' : 'chromatic';
        ps.kind = next; b.setParam(p, 'partKind', next === 'drum_map' ? 1 : 0);
        b.requestPartEngineState(p);
        this.opts.setLcdLine2(`${tag} FORMAT: ${next === 'drum_map' ? 'DRUM' : 'CHROMATIC'}`);
        this.opts.onPartUpdated(p); this.render();
      });
    });
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-route]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = parseInt(btn.dataset.route ?? '0', 10);
        ps.routeMode = mode; b.setParam(p, 'routeMode', mode);
        if (mode === 1) {
          ps.engineTypeIndex = 1; ps.engineTypeId = 'external_midi';
          ps.name = 'External MIDI'; ps.coverUrl = undefined; ps.soundBankId = undefined; ps.soundBankName = undefined; ps.factoryPresetIndex = undefined;
          b.selectPartEngineType(p, 1);
        } else if (ps.engineTypeIndex === 1 || ps.engineTypeId === 'external_midi') {
          ps.engineTypeIndex = 0; ps.engineTypeId = 'structured_rompler';
          ps.name = ''; ps.coverUrl = undefined; ps.soundBankId = undefined; ps.soundBankName = undefined; ps.factoryPresetIndex = undefined;
          b.selectPartEngineType(p, 0); b.requestPartEngineState(p);
        }
        b.requestPartPresets(p);
        this.opts.setLcdLine2(`${tag} DESTINO: ${mode === 1 ? 'EXT MIDI' : mode === 2 ? 'A+B LAYER' : 'INTERNAL'}`);
        this.opts.onPartUpdated(p); this.render();
      });
    });
    const selectEngine = (idx: number): void => {
      const desc = this.catalog.find((e) => e.index === idx);
      ps.engineTypeIndex = idx; ps.engineTypeId = desc?.typeId || ps.engineTypeId;
      ps.name = ''; ps.coverUrl = undefined; ps.soundBankId = undefined; ps.soundBankName = undefined; ps.factoryPresetIndex = undefined;
      b.selectPartEngineType(p, idx); ensureEngineWaveDependencies(desc?.typeId, b);
      if (desc?.supportsDrumMode === false) { ps.kind = 'chromatic'; b.setParam(p, 'partKind', 0); }
      else if (desc?.supportsChromaticMode === false) { ps.kind = 'drum_map'; b.setParam(p, 'partKind', 1); }
      b.requestPartPresets(p); b.requestPartEngineState(p);
      this.opts.setLcdLine2(`${tag} MOTOR: ${desc?.displayName ?? idx}`);
      this.opts.onPartUpdated(p); this.render();
    };
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-engine-idx]').forEach((btn) => btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.engineIdx ?? '', 10); if (!Number.isNaN(idx)) selectEngine(idx);
    }));
    this.dialog.querySelector<HTMLSelectElement>('#mcx-route-engine')?.addEventListener('change', (ev) => {
      selectEngine(parseInt((ev.target as HTMLSelectElement).value, 10));
    });
    this.dialog.querySelector<HTMLSelectElement>('#mcx-route-in-port')?.addEventListener('change', (ev) => {
      const portIdx = parseInt((ev.target as HTMLSelectElement).value, 10);
      const dev = portIdx > 0 ? this.getDevices().inputs.find((d) => d.portIndex === portIdx) : undefined;
      ps.midiInPortIndex = portIdx; ps.midiInDeviceName = dev?.name ?? '';
      if (dev && !dev.enabled && b.isNative) b.setMidiDeviceEnabled('input', dev.id, true);
      b.setPartMidiDevice(p, 'input', portIdx, dev?.name ?? '');
      this.opts.setLcdLine2(`${tag} MIDI IN: ${dev ? dev.name : portIdx === 0 ? 'DAW' : 'SEQ'}`);
      this.opts.onPartUpdated(p); this.render();
    });
    this.dialog.querySelector<HTMLSelectElement>('#mcx-route-port')?.addEventListener('change', (ev) => {
      const portIdx = parseInt((ev.target as HTMLSelectElement).value, 10);
      const dev = portIdx > 0 ? this.getDevices().outputs.find((d) => d.portIndex === portIdx) : undefined;
      ps.midiPortIndex = portIdx; ps.midiOutDeviceName = dev?.name ?? '';
      if (dev && !dev.enabled && b.isNative) b.setMidiDeviceEnabled('output', dev.id, true);
      b.setPartMidiDevice(p, 'output', portIdx, dev?.name ?? '');
      this.opts.setLcdLine2(`${tag} MIDI OUT: ${dev ? dev.name : 'DAW'}`);
      this.opts.onPartUpdated(p); this.render();
    });
    this.dialog.querySelector('[data-act="refresh-midi"]')?.addEventListener('click', () => b.refreshMidiDevices());
    this.dialog.querySelector<HTMLSelectElement>('#mcx-route-ch')?.addEventListener('change', (ev) => {
      const ch = parseInt((ev.target as HTMLSelectElement).value, 10);
      ps.midiChannel = ch; b.setParam(p, 'partMidiChannel', ch);
      this.opts.setLcdLine2(`${tag} MIDI CH ${ch}`);
      this.opts.onPartUpdated(p); this.render();
    });
    this.dialog.querySelector('[data-act="toggle-tr"]')?.addEventListener('click', () => {
      const next = ps.followTranspose === false;
      ps.followTranspose = next; b.setParam(p, 'partFollowTranspose', next ? 1 : 0);
      this.render();
    });
    this.dialog.querySelector('[data-act="audition"]')?.addEventListener('click', () => {
      void b.enableAudio();
      const note = ps.kind === 'drum_map' ? 36 : 60;
      b.noteOn(p, note, 0.85); setTimeout(() => b.noteOff(p, note), 280);
    });
    this.dialog.querySelectorAll<HTMLElement>('[data-act="open-tone"]').forEach((el) => el.addEventListener('click', () => {
      this.close(); this.opts.onOpenToneDrawer(p);
    }));
  }
}

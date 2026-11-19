/**
 * ABDMCX0X -- McxInstrumentRouteModal.ts
 * Native <dialog> modal to configure per-part format (CHR/DRM), route (INT/EXT/A+B),
 * synthesis engine slot, factory preset, and external MIDI port/channel.
 * Strict line limit: < 200 lines.
 */

import type { McxEngineDescriptorDto, McxHostBridge, McxPartPresetsDto } from '../bridge/McxHostBridge';
import { DEFAULT_ENGINE_CATALOG, getFallbackPresetsForEngine } from './McxEngineCatalogDefaults';
import { buildRouteModalHtml } from './McxInstrumentRouteModalView';
import type { McxPartUiState } from './McxMixerConsole';
import { webMidiService } from '../midi/McxWebMidiService';


export interface McxInstrumentRouteModalOptions {
  bridge: McxHostBridge;
  getPartState: (idx: number) => McxPartUiState;
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

  constructor(opts: McxInstrumentRouteModalOptions) {
    this.opts = opts;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'mcx-route-dialog';
    this.dialog.setAttribute('closedby', 'any');
    this.dialog.setAttribute('aria-labelledby', 'mcx-route-title');
    document.body.appendChild(this.dialog);

    this.dialog.addEventListener('close', () => {
      this.dialog.returnValue = '';
      this.opts.onPartUpdated(this.currentPart);
    });

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e: PointerEvent): boolean => {
        const r = this.dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      this.dialog.addEventListener('pointerdown', (e) => { pressedOutside = isOutside(e); });
      this.dialog.addEventListener('pointerup', (e) => { if (pressedOutside && isOutside(e)) this.dialog.close(); });
    }
  }

  public syncTheme(): void {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme) this.dialog.setAttribute('data-theme', theme);
  }

  public open(partIdx: number): void {
    this.currentPart = partIdx;
    this.syncTheme();
    this.opts.bridge.requestPartPresets(partIdx);
    void webMidiService.init().then(() => { if (this.dialog.open) this.render(); });
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
  }

  public close(): void {
    if (this.dialog.open) this.dialog.close();
  }

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

  private render(): void {
    const p = this.currentPart, ps = this.opts.getPartState(p);
    const engIdx = ps.engineTypeIndex ?? ((ps.routeMode ?? 0) === 1 ? 1 : 0);
    const presets = this.presetsByPart.get(p)?.presets ?? getFallbackPresetsForEngine(engIdx);
    this.dialog.innerHTML = buildRouteModalHtml(p, ps, this.catalog, presets, webMidiService.getOutputs());
    this.bindEvents(presets);
  }

  private bindEvents(presets: Array<{ index: number; name: string }>): void {
    const p = this.currentPart, ps = this.opts.getPartState(p), b = this.opts.bridge;
    const tag = `P${String(p + 1).padStart(2, '0')}`;
    this.dialog.querySelectorAll<HTMLElement>('[data-act="close"]').forEach((el) => el.addEventListener('click', () => this.close()));
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.kind === 'drum_map' ? 'drum_map' : 'chromatic';
        ps.kind = next; b.setParam(p, 'partKind', next === 'drum_map' ? 1 : 0);
        this.opts.setLcdLine2(`${tag} FORMAT: ${next === 'drum_map' ? 'DRUM' : 'CHROMATIC'}`);
        this.opts.onPartUpdated(p); this.render();
      });
    });
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-route]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = parseInt(btn.dataset.route ?? '0', 10);
        ps.routeMode = mode; b.setParam(p, 'routeMode', mode);
        if (mode === 1) {
          ps.engineTypeIndex = 1; ps.engineTypeId = 'external_midi'; b.selectPartEngineType(p, 1);
        } else if (ps.engineTypeIndex === 1 || ps.engineTypeId === 'external_midi') {
          ps.engineTypeIndex = 0; ps.engineTypeId = 'structured_rompler'; b.selectPartEngineType(p, 0);
        }
        b.requestPartPresets(p);
        this.opts.setLcdLine2(`${tag} DESTINO: ${mode === 1 ? 'EXT MIDI' : mode === 2 ? 'A+B LAYER' : 'INTERNAL'}`);
        this.opts.onPartUpdated(p); this.render();
      });
    });
    this.dialog.querySelector<HTMLSelectElement>('#mcx-route-engine')?.addEventListener('change', (ev) => {
      const idx = parseInt((ev.target as HTMLSelectElement).value, 10), desc = this.catalog.find((e) => e.index === idx);
      ps.engineTypeIndex = idx; ps.engineTypeId = desc?.typeId || ps.engineTypeId;
      b.selectPartEngineType(p, idx);
      if (desc?.supportsDrumMode === false) { ps.kind = 'chromatic'; b.setParam(p, 'partKind', 0); }
      else if (desc?.supportsChromaticMode === false) { ps.kind = 'drum_map'; b.setParam(p, 'partKind', 1); }
      b.requestPartPresets(p);
      this.opts.setLcdLine2(`${tag} MOTOR: ${desc?.displayName ?? idx}`);
      this.opts.onPartUpdated(p); this.render();
    });
    this.dialog.querySelector<HTMLSelectElement>('#mcx-route-preset')?.addEventListener('change', (ev) => {
      const presetIdx = parseInt((ev.target as HTMLSelectElement).value, 10);
      if (presetIdx < 0) return;
      b.loadFactoryPreset(p, presetIdx);
      ps.factoryPresetIndex = presetIdx;
      const found = presets.find((pr) => pr.index === presetIdx);
      if (found) ps.name = found.name;
      if ((ps.engineTypeIndex ?? 0) === 0) {
        ps.kind = presetIdx >= 16 ? 'drum_map' : 'chromatic';
        b.setParam(p, 'partKind', presetIdx >= 16 ? 1 : 0);
      }
      this.opts.setLcdLine2(`${tag} PRESET: ${ps.name || presetIdx}`);
      this.opts.onPartUpdated(p); this.render();
    });
    this.dialog.querySelector<HTMLSelectElement>('#mcx-route-port')?.addEventListener('change', (ev) => {
      const port = parseInt((ev.target as HTMLSelectElement).value, 10);
      ps.midiPortIndex = port; b.setParam(p, 'partMidiPort', port);
      this.opts.setLcdLine2(`${tag} MIDI PORT ${port + 1}`);
    });
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
    this.dialog.querySelector('[data-act="open-tone"]')?.addEventListener('click', () => {
      this.close(); this.opts.onOpenToneDrawer(p);
    });
  }
}

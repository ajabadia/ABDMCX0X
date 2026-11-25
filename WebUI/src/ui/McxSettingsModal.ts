/**
 * ABDMCX0X -- McxSettingsModal.ts (Slice 1)
 * Level-1 Global Synth Settings modal (floating draggable <dialog>, 100% ABDShared tokenized + i18n).
 */

import { attachDialogDrag } from '@abdsynths/shared/diagnostic-probe/DiagnosticProbeI18n.js';
import type { McxHostBridge, McxMidiDevicesDto, McxSystemSettingsDto } from '../bridge/McxHostBridge';
import { buildSettingsModalHtml } from './McxSettingsModalView';

export interface SettingsModalCallbacks {
  bridge: McxHostBridge;
  onSettingsApplied: (settings: McxSystemSettingsDto) => void;
  onGlobalTransposeChange?: (st: number) => void;
  onScaleChange?: (root: number, type: number) => void;
}

export class McxSettingsModal {
  private dialog: HTMLDialogElement;
  private cb: SettingsModalCallbacks;
  private state: McxSystemSettingsDto;
  private midiDevices: McxMidiDevicesDto = { isStandalone: true, inputs: [], outputs: [] };
  private globalTranspose = 0; private scaleRoot = 0; private scaleType = 0;

  constructor(cb: SettingsModalCallbacks) {
    this.cb = cb;
    this.state = cb.bridge.loadLocalSettingsFallback();
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'abd-probe-dialog mcx-settings-dialog';
    this.dialog.setAttribute('aria-labelledby', 'mcx-settings-title');
    document.body.appendChild(this.dialog);
    this.render();
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && this.dialog.open) this.dialog.close();
    });
  }

  public getState(): McxSystemSettingsDto { return { ...this.state }; }

  public syncGlobalTranspose(st: number): void {
    this.globalTranspose = Math.max(-24, Math.min(24, Math.round(st)));
    const lbl = this.dialog.querySelector('#val-trans');
    const transIn = this.dialog.querySelector('#set-trans') as HTMLInputElement | null;
    if (lbl) lbl.textContent = `${this.globalTranspose > 0 ? '+' : ''}${this.globalTranspose} st`;
    if (transIn) transIn.value = String(this.globalTranspose);
  }

  public syncScale(root: number, type: number): void {
    this.scaleRoot = ((Math.round(root) % 12) + 12) % 12;
    this.scaleType = Math.max(0, Math.min(14, Math.round(type)));
    const rSel = this.dialog.querySelector('#set-scale-root') as HTMLSelectElement | null;
    const tSel = this.dialog.querySelector('#set-scale-type') as HTMLSelectElement | null;
    if (rSel) rSel.value = String(this.scaleRoot);
    if (tSel) tSel.value = String(this.scaleType);
  }

  public syncFromHost(next: McxSystemSettingsDto): void {
    this.state = { ...this.state, ...next };
    this.render();
    this.cb.onSettingsApplied(this.getState());
  }

  public setMidiDevices(dto: McxMidiDevicesDto): void {
    this.midiDevices = dto;
    if (this.dialog.open) this.render();
  }

  public refreshLocale(): void { this.render(); }

  public open(): void {
    this.syncTheme();
    this.cb.bridge.refreshMidiDevices();
    this.render();
    if (!this.dialog.open) this.dialog.show();
  }

  public toggle(): void {
    if (this.dialog.open) this.dialog.close();
    else this.open();
  }

  public syncTheme(): void {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme) this.dialog.setAttribute('data-theme', theme);
  }

  private render(): void {
    const sr = Math.round(this.cb.bridge.getSampleRate());
    this.dialog.innerHTML = buildSettingsModalHtml(
      this.state, sr, this.cb.bridge.isNative, this.globalTranspose, this.scaleRoot, this.scaleType, this.midiDevices,
    );

    attachDialogDrag(this.dialog, this.dialog.querySelector('.abd-probe-header'));
    this.dialog.querySelector('[data-role="close"]')?.addEventListener('click', () => this.dialog.close());

    const commit = () => {
      this.cb.bridge.updateSystemSettings(this.state);
      this.cb.onSettingsApplied(this.getState());
    };

    const dirInput = this.dialog.querySelector('#set-workdir') as HTMLInputElement | null;
    dirInput?.addEventListener('change', () => { this.state.workingDirectory = dirInput.value.trim(); commit(); });
    this.dialog.querySelector('#btn-browse-dir')?.addEventListener('click', () => this.cb.bridge.chooseWorkingDir());

    const polyIn = this.dialog.querySelector('#set-poly') as HTMLInputElement | null;
    polyIn?.addEventListener('input', () => {
      this.state.maxPolyphony = parseInt(polyIn.value, 10);
      const lbl = this.dialog.querySelector('#val-poly');
      if (lbl) lbl.textContent = String(this.state.maxPolyphony);
      commit();
    });

    const tuneIn = this.dialog.querySelector('#set-tune') as HTMLInputElement | null;
    const applyTune = (hz: number) => {
      this.state.masterTuneHz = hz;
      if (tuneIn) tuneIn.value = String(hz);
      const lbl = this.dialog.querySelector('#val-tune');
      if (lbl) lbl.textContent = `${hz.toFixed(1)} Hz`;
      commit();
    };
    tuneIn?.addEventListener('input', () => applyTune(parseFloat(tuneIn.value)));
    this.dialog.querySelector('#btn-tune-440')?.addEventListener('click', () => applyTune(440.0));

    const bpmIn = this.dialog.querySelector('#set-bpm') as HTMLInputElement | null;
    bpmIn?.addEventListener('input', () => {
      this.state.standaloneBpm = parseFloat(bpmIn.value);
      const lbl = this.dialog.querySelector('#val-bpm');
      if (lbl) lbl.textContent = String(Math.round(this.state.standaloneBpm));
      commit();
    });

    const transIn = this.dialog.querySelector('#set-trans') as HTMLInputElement | null;
    transIn?.addEventListener('input', () => {
      this.globalTranspose = parseInt(transIn.value, 10);
      const lbl = this.dialog.querySelector('#val-trans');
      if (lbl) lbl.textContent = `${this.globalTranspose > 0 ? '+' : ''}${this.globalTranspose} st`;
      this.cb.bridge.setParam(0, 'globalTranspose', this.globalTranspose);
      this.cb.onGlobalTransposeChange?.(this.globalTranspose);
    });
    const scaleRoot = this.dialog.querySelector('#set-scale-root') as HTMLSelectElement | null;
    scaleRoot?.addEventListener('change', () => {
      this.scaleRoot = parseInt(scaleRoot.value, 10);
      this.cb.bridge.setParam(0, 'globalScaleRoot', this.scaleRoot);
      this.cb.onScaleChange?.(this.scaleRoot, this.scaleType);
    });
    const scaleType = this.dialog.querySelector('#set-scale-type') as HTMLSelectElement | null;
    scaleType?.addEventListener('change', () => {
      this.scaleType = parseInt(scaleType.value, 10);
      this.cb.bridge.setParam(0, 'globalScale', this.scaleType);
      this.cb.bridge.setParam(0, 'globalScaleQuantize', this.scaleType > 0 ? 1 : 0);
      this.cb.onScaleChange?.(this.scaleRoot, this.scaleType);
    });

    this.dialog.querySelector('#btn-refresh-midi')?.addEventListener('click', () => {
      this.cb.bridge.refreshMidiDevices();
    });
    this.dialog.querySelectorAll<HTMLInputElement>('input[data-midi-dir]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const dir = inp.dataset.midiDir === 'output' ? 'output' : 'input';
        const id = inp.dataset.midiId ?? '';
        if (id) this.cb.bridge.setMidiDeviceEnabled(dir, id, inp.checked);
      });
    });
  }
}

/**
 * ABDMCX0X -- McxPadsDrawer.ts
 * Bottom-up sliding drawer embedding the canonical ABDShared::MpcPadMatrix.
 * Sychronized with the 16-channel mixer and 16-step strip (PART SEL / PART MUTE).
 * Strict line limit: < 200 lines.
 */

import { MpcPadMatrix } from '@abdsynths/shared/components';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import type { McxPartUiState } from './McxMixerConsole';
import { buildPadsHeaderHtml, buildPadsDrawerBodyHtml } from './McxPadsDrawerViews';

export interface McxPadsDrawerOptions {
  hostEl: HTMLElement;
  bridge: McxHostBridge;
  getPartState: (idx: number) => McxPartUiState;
  setLcdLine2: (text: string) => void;
  onClose?: () => void;
  onPadNote?: (note: number, vel: number, isRelease: boolean) => void;
}

export class McxPadsDrawer {
  private el: HTMLElement;
  private currentPart = 0;
  private opened = false;
  private bridge: McxHostBridge;
  private getPartState: (idx: number) => McxPartUiState;
  private setLcdLine2: (text: string) => void;
  private onClose?: () => void;
  private onPadNote?: (note: number, vel: number, isRelease: boolean) => void;
  private matrix: MpcPadMatrix | null = null;

  constructor(opts: McxPadsDrawerOptions) {
    this.bridge = opts.bridge;
    this.getPartState = opts.getPartState;
    this.setLcdLine2 = opts.setLcdLine2;
    this.onClose = opts.onClose;
    this.onPadNote = opts.onPadNote;

    this.el = document.createElement('div');
    this.el.className = 'mcx-bottom-drawer mcx-pads-drawer';
    this.el.id = 'mcx-pads-drawer';
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', 'MPC Pads Drawer');
    this.el.innerHTML = `
      <div class="mcx-drawer-head-host"></div>
      <div class="mcx-drawer-body mcx-pads-drawer-body">
        ${buildPadsDrawerBodyHtml()}
      </div>
    `;

    opts.hostEl.appendChild(this.el);
    this.initMatrix();
    this.bindEvents();
  }

  private initMatrix(): void {
    const mount = this.el.querySelector('.mcx-matrix-mount-point') as HTMLElement;
    if (!mount) return;

    this.matrix = new MpcPadMatrix(mount, {
      mode: 'drum',
      fullLevel: true,
      onPadTrigger: (idx: number, note: number, vel: number, meta: { name: string }) => {
        void this.bridge.enableAudio();
        this.bridge.noteOn(this.currentPart, note, vel / 127);
        this.onPadNote?.(note, vel, false);
        this.setLcdLine2(`P${String(this.currentPart + 1).padStart(2, '0')} PAD ${idx + 1}: ${meta.name} (MIDI ${note})`);
        this.updateActivePadBadge(idx, note, meta.name);
      },
      onPadRelease: (_idx: number, note: number) => {
        this.bridge.noteOff(this.currentPart, note);
        this.onPadNote?.(note, 0, true);
      },
    });
  }

  private updateActivePadBadge(idx: number, note: number, name: string): void {
    const badge = this.el.querySelector('#mcx-pad-target-lbl');
    if (badge) badge.textContent = `PAD ${String(idx + 1).padStart(2, '0')}: ${name} (${note})`;
  }

  public open(partIdx: number): void {
    this.currentPart = partIdx;
    this.opened = true;
    this.el.classList.add('is-open');
    this.syncPart(partIdx, this.getPartState(partIdx));
    this.setLcdLine2(`MPC PADS DRAWER [P${String(partIdx + 1).padStart(2, '0')}]`);
  }

  public close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.el.classList.remove('is-open');
    this.onClose?.();
  }

  public toggle(partIdx: number): void {
    if (this.opened && this.currentPart === partIdx) this.close();
    else this.open(partIdx);
  }

  public isOpen(): boolean { return this.opened; }
  public getPart(): number { return this.currentPart; }

  public syncPart(partIdx: number, ps: McxPartUiState): void {
    this.currentPart = partIdx;
    const headHost = this.el.querySelector('.mcx-drawer-head-host');
    if (headHost) headHost.innerHTML = buildPadsHeaderHtml(partIdx, ps);

    if (this.matrix) {
      if (ps.kind === 'drum_map') {
        this.matrix.setMode('drum');
      } else {
        this.matrix.setMode('chromatic');
      }
    }
  }

  public highlightNote(midiNote: number, active: boolean): void {
    if (!this.matrix) return;
    for (let i = 0; i < 16; i++) {
      if (this.matrix.padData[i]?.note === midiNote) {
        this.matrix.highlightPad(i, active);
      }
    }
  }

  private bindEvents(): void {
    this.el.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      const act = target.closest('[data-act]')?.getAttribute('data-act');
      if (act === 'close') { ev.stopPropagation(); this.close(); return; }

      // Side panel button toggles (keymap, dynamics, roll)
      const btn = target.closest('button');
      if (!btn) return;
      if (btn.dataset.keymap) {
        this.el.querySelectorAll('[data-keymap]').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        this.setLcdLine2(`KEYMAP: ${btn.textContent?.trim()}`);
      } else if (btn.dataset.dyn) {
        this.el.querySelectorAll('[data-dyn]').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        this.setLcdLine2(`PAD VEL CURVE: ${btn.dataset.dyn.toUpperCase()}`);
      } else if (btn.dataset.roll) {
        this.el.querySelectorAll('[data-roll]').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        this.setLcdLine2(`PAD ROLL: ${btn.textContent?.trim()}`);
      } else if (btn.id === 'mcx-pad-flam-btn') {
        btn.classList.toggle('is-active');
        this.setLcdLine2(`PAD FLAM: ${btn.classList.contains('is-active') ? 'ON' : 'OFF'}`);
      }
    });

    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && this.opened) this.close();
    });
  }

  public destroy(): void {
    this.matrix?.destroy();
    this.el.remove();
  }
}

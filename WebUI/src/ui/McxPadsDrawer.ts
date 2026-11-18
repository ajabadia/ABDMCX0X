/**
 * ABDMCX0X -- McxPadsDrawer.ts
 * Bottom-up sliding drawer embedding the canonical ABDShared::MpcPadMatrix.
 * Sychronized with the 16-channel mixer and 16-step strip (PART SEL / PART MUTE).
 */

import { MpcPadMatrix } from '@abdsynths/shared/components';
import type { McxHostBridge } from '../bridge/McxHostBridge';
import type { McxPartUiState } from './McxMixerConsole';
import { t } from '../i18n/mcxI18n';

export interface McxPadsDrawerOptions {
  hostEl: HTMLElement;
  bridge: McxHostBridge;
  getPartState: (idx: number) => McxPartUiState;
  setLcdLine2: (text: string) => void;
  onClose?: () => void;
}

export class McxPadsDrawer {
  private el: HTMLElement;
  private currentPart = 0;
  private opened = false;
  private bridge: McxHostBridge;
  private getPartState: (idx: number) => McxPartUiState;
  private setLcdLine2: (text: string) => void;
  private onClose?: () => void;
  private matrix: MpcPadMatrix | null = null;

  constructor(opts: McxPadsDrawerOptions) {
    this.bridge = opts.bridge;
    this.getPartState = opts.getPartState;
    this.setLcdLine2 = opts.setLcdLine2;
    this.onClose = opts.onClose;

    this.el = document.createElement('div');
    this.el.className = 'mcx-bottom-drawer mcx-pads-drawer';
    this.el.id = 'mcx-pads-drawer';
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', 'MPC Pads Drawer');
    this.el.innerHTML = `
      <div class="mcx-drawer-head-host"></div>
      <div class="mcx-drawer-body mcx-pads-drawer-body">
        <div class="mcx-matrix-mount-point"></div>
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
        this.setLcdLine2(`P${String(this.currentPart + 1).padStart(2, '0')} PAD ${idx + 1}: ${meta.name} (MIDI ${note})`);
      },
      onPadRelease: (_idx: number, note: number) => {
        this.bridge.noteOff(this.currentPart, note);
      },
    });
  }

  private buildHeaderHtml(partIdx: number, ps: McxPartUiState): string {
    const isDrum = ps.kind === 'drum_map';
    const name = ps.name || (isDrum ? 'TR-909 Kit' : `Sound P${partIdx + 1}`);
    const kindBadge = isDrum ? t('mcx.partDrumMap') : t('mcx.partChromatic');

    return `
      <div class="mcx-drawer-head">
        <div class="mcx-drawer-title-row">
          <span class="mcx-drawer-title-accent">P${String(partIdx + 1).padStart(2, '0')}</span>
          <h3 class="mcx-drawer-title" data-i18n="mcx.padsDrawerTitle">${t('mcx.padsDrawerTitle') || 'MATRIZ DE PADS MPC'}</h3>
          <span class="mcx-drawer-part-name">${name}</span>
          <span class="mcx-drawer-kind-badge${isDrum ? ' is-drum' : ''}">${kindBadge}</span>
          ${ps.mute ? `<span class="mcx-drawer-mute-badge">${t('mcx.mute')}</span>` : ''}
        </div>
        <button type="button" class="mcx-drawer-close-btn" data-act="close" title="${t('mcx.closeDrawer')}" aria-label="${t('mcx.closeDrawer')}">✕</button>
      </div>
    `;
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
    if (headHost) headHost.innerHTML = this.buildHeaderHtml(partIdx, ps);

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
      const act = (ev.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
      if (act === 'close') { ev.stopPropagation(); this.close(); }
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

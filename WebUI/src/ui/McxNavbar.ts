/**
 * ABDMCX0X -- McxNavbar.ts (Slice 1)
 * Desktop menu bar built on @abdsynths/shared SynthNavBar + AboutDialog + History A/B controls.
 * Strict line limit: < 160 lines.
 */

import { createSynthNavBar } from '@abdsynths/shared/components';
import type { HistoryStatus } from '../app/McxHistoryManager';
import { getLocale, setLocale, t } from '../i18n/mcxI18n';
import { buildMcxNavbarMenus } from './McxNavbarMenus';
import { type ThemeFamilyKey, type ThemeManager } from './ThemeManager';

export interface McxNavbarCallbacks {
  themeMgr: ThemeManager;
  onNewProject?: () => void; onNewFromTemplate?: (tpl: 'empty' | 'factory' | 'starter8' | 'electronic' | 'live64') => void;
  onSaveProject?: () => void; onSaveProjectAs?: () => void; onOpenProject?: () => void;
  onUndo?: () => void; onRedo?: () => void; onToggleCompare?: () => void; onCaptureCompare?: () => void;
  onConfigureFolder: () => void; onOpenSettings: () => void; onOpenBankManager: () => void;
  onSavePartPreset: () => void; onSaveMultiPreset: () => void; onLoadBank: () => void;
  onFactoryReset: () => void; onPanic: () => void; onEnableAudio: () => void; onToggleProbe: () => void;
  onOpenFxRack?: () => void; onOpenGlobalLfo?: () => void; onOpenPianoRoll?: () => void;
  onOpenGroove?: () => void; onOpenSong?: () => void; onOpenExport?: () => void; onOpenMidiLearn?: () => void;
  onSelectTab?: (tab: 'tone' | 'drums') => void;
}

export class McxNavbar {
  private container: HTMLElement;
  private cb: McxNavbarCallbacks;
  private navBar: ReturnType<typeof createSynthNavBar> | null = null;
  private centerMountEl: HTMLElement;
  private audioStatus: { state: 'idle' | 'loading' | 'ready' | 'error'; detail?: string } = { state: 'idle' };
  private historyStatus: HistoryStatus = { canUndo: false, canRedo: false, undoCount: 0, redoCount: 0, compareMode: 'A', hasBaseline: false };

  constructor(container: HTMLElement, cb: McxNavbarCallbacks) {
    this.container = container;
    this.cb = cb;
    this.centerMountEl = document.createElement('div');
    this.centerMountEl.id = 'mcx-transport-mount';
    this.centerMountEl.className = 'mcx-navbar-transport';
    this.mount();
  }

  public getTransportMount(): HTMLElement { return this.centerMountEl; }

  private createRightSlot(): HTMLElement {
    const slot = document.createElement('div');
    slot.className = 'mcx-nav-group';
    slot.innerHTML = `
      <span class="mcx-nav-hist-group">
        <button type="button" class="mcx-nav-hist-btn" id="mcx-btn-undo" title="Deshacer (Ctrl+Z)" disabled>↶</button>
        <button type="button" class="mcx-nav-hist-btn" id="mcx-btn-redo" title="Rehacer (Ctrl+Y)" disabled>↷</button>
        <button type="button" class="mcx-nav-hist-btn" id="mcx-btn-compare" title="Comparar A/B (Ctrl+Shift+B)">A</button>
      </span>
      <button type="button" class="mcx-btn mcx-btn--audio" id="btn-audio"></button>
    `;
    slot.querySelector('#mcx-btn-undo')?.addEventListener('click', () => this.cb.onUndo?.());
    slot.querySelector('#mcx-btn-redo')?.addEventListener('click', () => this.cb.onRedo?.());
    slot.querySelector('#mcx-btn-compare')?.addEventListener('click', () => this.cb.onToggleCompare?.());
    slot.querySelector('#btn-audio')?.addEventListener('click', () => this.cb.onEnableAudio());
    return slot;
  }

  public closeMenu(): void { this.navBar?.closeDropdown?.(); }

  private dispatch(action: string, value?: unknown): void {
    try {
      const map: Record<string, (() => void) | undefined> = {
        newProject: () => this.cb.onNewProject?.(), template: () => this.cb.onNewFromTemplate?.(value as any),
        saveProject: () => this.cb.onSaveProject?.(), saveProjectAs: () => this.cb.onSaveProjectAs?.(),
        openProject: () => this.cb.onOpenProject?.(), undo: () => this.cb.onUndo?.(), redo: () => this.cb.onRedo?.(),
        toggleCompare: () => this.cb.onToggleCompare?.(), captureCompare: () => this.cb.onCaptureCompare?.(),
        openBankManager: () => this.cb.onOpenBankManager(), savePartPreset: () => this.cb.onSavePartPreset(),
        saveMultiPreset: () => this.cb.onSaveMultiPreset(), configureFolder: () => this.cb.onConfigureFolder(),
        openSettings: () => this.cb.onOpenSettings(), loadBank: () => this.cb.onLoadBank(),
        factoryReset: () => this.cb.onFactoryReset(), panic: () => this.cb.onPanic(),
        toggleScheme: () => this.cb.themeMgr.toggleScheme(), themeFamily: () => this.cb.themeMgr.setFamily(value as ThemeFamilyKey),
        openFxRack: () => this.cb.onOpenFxRack?.(), openGlobalLfo: () => this.cb.onOpenGlobalLfo?.(),
        openPianoRoll: () => this.cb.onOpenPianoRoll?.(), openGroove: () => this.cb.onOpenGroove?.(),
        openSong: () => this.cb.onOpenSong?.(), openExport: () => this.cb.onOpenExport?.(),
        openMidiLearn: () => this.cb.onOpenMidiLearn?.(), toggleProbe: () => this.cb.onToggleProbe(),
      };
      if (action === 'locale' && (value === 'es' || value === 'en')) setLocale(value);
      else if (action === 'tab' && (value === 'tone' || value === 'drums')) this.cb.onSelectTab?.(value);
      else map[action]?.();
    } finally {
      this.closeMenu();
    }
  }

  public mount(): void {
    this.navBar?.destroy?.();
    this.container.innerHTML = '';
    this.navBar = createSynthNavBar({
      container: this.container,
      locale: getLocale(),
      brand: { title: 'ABDMCX0X', subtitle: '' },
      brandPosition: 'right',
      menus: buildMcxNavbarMenus(),
      centerSlot: this.centerMountEl,
      rightSlot: this.createRightSlot(),
      enableGlobalShortcuts: false,
      activeValues: { themeFamily: this.cb.themeMgr.getFamily(), locale: getLocale() },
      aboutDialog: {
        appName: 'ABDMCX0X', subtitle: t('mcx.subtitle'), version: '1.0.0',
        repo: 'ajabadia/ABDMCX0X', buildInfo: t('mcx.aboutBuildInfo'), author: 'ABDSynths', copyright: '© 2026 ABDSynths',
      },
      onAction: (action: string, value?: unknown) => this.dispatch(action, value),
    });
    this.sync();
  }

  public setAudioStatus(state: 'idle' | 'loading' | 'ready' | 'error', detail?: string): void {
    this.audioStatus = { state, detail };
    this.sync();
  }

  public setHistoryStatus(status: HistoryStatus): void {
    this.historyStatus = status;
    this.sync();
  }

  public sync(): void {
    const family = this.cb.themeMgr.getFamily();
    const btnUndo = this.container.querySelector('#mcx-btn-undo') as HTMLButtonElement | null;
    const btnRedo = this.container.querySelector('#mcx-btn-redo') as HTMLButtonElement | null;
    const btnCmp = this.container.querySelector('#mcx-btn-compare') as HTMLButtonElement | null;
    if (btnUndo) {
      btnUndo.disabled = !this.historyStatus.canUndo;
      btnUndo.title = this.historyStatus.undoLabel ? `Deshacer: ${this.historyStatus.undoLabel} (Ctrl+Z)` : 'Deshacer (Ctrl+Z)';
    }
    if (btnRedo) {
      btnRedo.disabled = !this.historyStatus.canRedo;
      btnRedo.title = this.historyStatus.redoLabel ? `Rehacer: ${this.historyStatus.redoLabel} (Ctrl+Y)` : 'Rehacer (Ctrl+Y)';
    }
    if (btnCmp) {
      const isB = this.historyStatus.compareMode === 'B';
      btnCmp.textContent = isB ? 'B' : 'A';
      btnCmp.classList.toggle('is-compare-b', isB);
      btnCmp.disabled = !this.historyStatus.hasBaseline;
    }
    const btnAudio = this.container.querySelector('#btn-audio');
    if (btnAudio) {
      const { state, detail } = this.audioStatus;
      btnAudio.classList.toggle('is-ready', state === 'ready');
      const key = state === 'ready' ? 'mcx.audioReady' : state === 'loading' ? 'mcx.audioLoading' : state === 'error' ? 'mcx.audioError' : 'mcx.audioIdle';
      btnAudio.textContent = detail && state === 'ready' ? `${t(key)} (${detail})` : t(key);
    }
    this.navBar?.setActiveValues?.({ themeFamily: family, locale: getLocale() });
  }
}

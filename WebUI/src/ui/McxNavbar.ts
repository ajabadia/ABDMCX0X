/**
 * ABDMCX0X -- McxNavbar.ts (Slice 1)
 * Desktop menu bar built on @abdsynths/shared SynthNavBar + AboutDialog:
 * Pure visual Theme selector (8 ABDShared/ABDNeuModMakr families x Light/Dark),
 * File (Working Dir / Bank / Reset), Edit (Settings / Theme / Language / Panic),
 * Tools (440 Hz Probe / Decks), Help (Updates & AboutDialog).
 */

import { createSynthNavBar } from '@abdsynths/shared/components';
import { getLocale, setLocale, t } from '../i18n/mcxI18n';
import { THEME_FAMILIES, type ThemeFamilyKey, type ThemeManager } from './ThemeManager';

export interface McxNavbarCallbacks {
  themeMgr: ThemeManager;
  onConfigureFolder: () => void;
  onOpenSettings: () => void;
  onOpenBankManager: () => void;
  onSavePartPreset: () => void;
  onSaveMultiPreset: () => void;
  onLoadBank: () => void;
  onFactoryReset: () => void;
  onPanic: () => void;
  onEnableAudio: () => void;
  onToggleProbe: () => void;
  onOpenFxRack?: () => void;
  onOpenGlobalLfo?: () => void;
  onOpenPianoRoll?: () => void;
  onOpenGroove?: () => void;
  onSelectTab?: (tab: 'tone' | 'drums') => void;
}

function buildMenus() {
  return [
    { name: 'File', nameEs: 'Archivo', items: [
        { id: 98, label: 'Bank Manager...', labelEs: 'Navegador de Bancos...', action: 'openBankManager', shortcut: 'B' },
        { id: 99, label: 'Save Part Preset (.abdpart)...', labelEs: 'Guardar Preset de Parte (.abdpart)...', action: 'savePartPreset', shortcut: 'Ctrl+S' },
        { id: 105, label: 'Save Multi Preset (.abdmulti)...', labelEs: 'Guardar Multi Preset (.abdmulti)...', action: 'saveMultiPreset' },
        { separator: true },
        { id: 100, label: 'Configure Working Folder...', labelEs: 'Configurar Directorio de Trabajo...', action: 'configureFolder' },
        { id: 101, label: 'Load Soundbank (.abdbank)...', labelEs: 'Cargar Banco (.abdbank)...', action: 'loadBank', shortcut: 'Ctrl+O' },
        { separator: true },
        { id: 102, label: 'Factory Preset Reset', labelEs: 'Restablecer Fábrica', action: 'factoryReset' },
      ],
    },
    {
      name: 'Edit', nameEs: 'Edición',
      items: [
        { id: 200, label: 'Global Settings...', labelEs: 'Ajustes Globales...', action: 'openSettings', shortcut: 'Ctrl+,' },
        { id: 201, label: 'All Notes Off (Panic)', labelEs: 'Silenciar Todo (Pánico)', action: 'panic', shortcut: 'Esc' },
        { separator: true },
        {
          id: 203, label: 'Visual Theme', labelEs: 'Tema Visual',
          submenu: [
            { id: 220, label: 'Toggle Light / Dark', labelEs: 'Cambiar Claro / Oscuro', action: 'toggleScheme' },
            { separator: true },
            ...THEME_FAMILIES.map((f, idx) => ({
              id: 221 + idx, label: f.label, labelEs: f.label, action: 'themeFamily', value: f.key,
            })),
          ],
        },
        {
          id: 204, label: 'Language', labelEs: 'Idioma',
          submenu: [
            { id: 241, label: 'Español (ES)', labelEs: 'Español (ES)', action: 'locale', value: 'es' },
            { id: 242, label: 'English (EN)', labelEs: 'English (EN)', action: 'locale', value: 'en' },
          ],
        },
      ],
    },
    {
      name: 'Tools', nameEs: 'Herramientas',
      items: [
        { id: 300, label: 'Master Multi-Bus FX Rack...', labelEs: 'Rack Multibus de Efectos...', action: 'openFxRack', shortcut: 'Ctrl+F' },
        { id: 302, label: 'Master Global LFOs...', labelEs: 'LFOs Globales (Master)...', action: 'openGlobalLfo', shortcut: 'Ctrl+L' },
        { id: 303, label: 'Piano Roll Sequencer...', labelEs: 'Secuenciador Rollo Pianola...', action: 'openPianoRoll', shortcut: 'Ctrl+P' },
        { id: 304, label: 'Master Groove & Shuffle...', labelEs: 'Groove y Shuffle Maestro...', action: 'openGroove', shortcut: 'Ctrl+G' },
        { id: 301, label: '440 Hz Signal Probe...', labelEs: 'Sonda de Señal 440 Hz...', action: 'toggleProbe', shortcut: 'Ctrl+4' },
      ],
    },
    {
      name: 'Help', nameEs: 'Ayuda',
      items: [
        { id: 901, label: 'Check for Updates...', labelEs: 'Buscar Actualizaciones...', action: 'checkForUpdates' },
        { separator: true },
        { id: 902, label: 'About ABDMCX0X...', labelEs: 'Acerca de ABDMCX0X...', action: 'about' },
      ],
    },
  ];
}

export class McxNavbar {
  private container: HTMLElement;
  private cb: McxNavbarCallbacks;
  private navBar: ReturnType<typeof createSynthNavBar> = null;
  private audioStatus: { state: 'idle' | 'loading' | 'ready' | 'error'; detail?: string } = { state: 'idle' };

  constructor(container: HTMLElement, cb: McxNavbarCallbacks) {
    this.container = container;
    this.cb = cb;
    this.mount();
  }

  private createCenterSlot(): HTMLElement {
    const slot = document.createElement('div');
    slot.className = 'mcx-nav-group';
    const opts = THEME_FAMILIES.map((f) => `<option value="${f.key}">${f.label}</option>`).join('');
    slot.innerHTML = `
      <select class="mcx-nav-select" id="nav-theme-select" aria-label="${t('mcx.visualTheme')}">${opts}</select>
      <button type="button" class="mcx-btn" id="btn-scheme"></button>
      <button type="button" class="mcx-btn" id="btn-settings"></button>
    `;
    const sel = slot.querySelector('#nav-theme-select') as HTMLSelectElement | null;
    sel?.addEventListener('change', () => this.cb.themeMgr.setFamily(sel.value as ThemeFamilyKey));
    slot.querySelector('#btn-scheme')?.addEventListener('click', () => this.cb.themeMgr.toggleScheme());
    slot.querySelector('#btn-settings')?.addEventListener('click', () => this.cb.onOpenSettings());
    return slot;
  }

  private createRightSlot(): HTMLElement {
    const slot = document.createElement('div');
    slot.className = 'mcx-nav-group';
    slot.innerHTML = `
      <button type="button" class="mcx-btn" id="btn-locale"></button>
      <button type="button" class="mcx-btn mcx-btn--audio" id="btn-audio"></button>
      <button type="button" class="mcx-btn mcx-btn--panic" id="btn-panic"></button>
    `;
    slot.querySelector('#btn-locale')?.addEventListener('click', () => setLocale(getLocale() === 'es' ? 'en' : 'es'));
    slot.querySelector('#btn-audio')?.addEventListener('click', () => this.cb.onEnableAudio());
    slot.querySelector('#btn-panic')?.addEventListener('click', () => this.cb.onPanic());
    return slot;
  }

  private dispatch(action: string, value?: unknown): void {
    if (action === 'openBankManager') this.cb.onOpenBankManager();
    else if (action === 'savePartPreset') this.cb.onSavePartPreset();
    else if (action === 'saveMultiPreset') this.cb.onSaveMultiPreset();
    else if (action === 'configureFolder') this.cb.onConfigureFolder();
    else if (action === 'openSettings') this.cb.onOpenSettings();
    else if (action === 'loadBank') this.cb.onLoadBank();
    else if (action === 'factoryReset') this.cb.onFactoryReset();
    else if (action === 'panic') this.cb.onPanic();
    else if (action === 'toggleScheme') this.cb.themeMgr.toggleScheme();
    else if (action === 'themeFamily') this.cb.themeMgr.setFamily(value as ThemeFamilyKey);
    else if (action === 'locale' && (value === 'es' || value === 'en')) setLocale(value);
    else if (action === 'openFxRack') this.cb.onOpenFxRack?.();
    else if (action === 'openGlobalLfo') this.cb.onOpenGlobalLfo?.();
    else if (action === 'openPianoRoll') this.cb.onOpenPianoRoll?.();
    else if (action === 'openGroove') this.cb.onOpenGroove?.();
    else if (action === 'toggleProbe') this.cb.onToggleProbe();
    else if (action === 'tab' && (value === 'tone' || value === 'drums')) this.cb.onSelectTab?.(value);
  }

  public mount(): void {
    this.navBar?.destroy?.();
    this.container.innerHTML = '';
    this.navBar = createSynthNavBar({
      container: this.container, locale: getLocale(), brand: { title: 'ABDMCX0X', subtitle: '' },
      menus: buildMenus(), centerSlot: this.createCenterSlot(), rightSlot: this.createRightSlot(),
      enableGlobalShortcuts: false, activeValues: { themeFamily: this.cb.themeMgr.getFamily(), locale: getLocale() },
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

  public sync(): void {
    const family = this.cb.themeMgr.getFamily(), scheme = this.cb.themeMgr.getRenderedScheme();
    const sel = this.container.querySelector('#nav-theme-select') as HTMLSelectElement | null;
    if (sel) sel.value = family;
    const q = (s: string) => this.container.querySelector(s);
    const bSch = q('#btn-scheme'), bSet = q('#btn-settings'), bLoc = q('#btn-locale'), bPan = q('#btn-panic');
    if (bSch) bSch.textContent = scheme === 'dark' ? t('mcx.themeLight') : t('mcx.themeDark');
    if (bSet) bSet.textContent = t('mcx.settingsBtn'); if (bLoc) bLoc.textContent = getLocale().toUpperCase(); if (bPan) bPan.textContent = t('mcx.panic');
    const btnAudio = q('#btn-audio');
    if (btnAudio) {
      const { state, detail } = this.audioStatus;
      btnAudio.classList.toggle('is-ready', state === 'ready');
      const key = state === 'ready' ? 'mcx.audioReady' : state === 'loading' ? 'mcx.audioLoading' : state === 'error' ? 'mcx.audioError' : 'mcx.audioIdle';
      btnAudio.textContent = detail && state === 'ready' ? `${t(key)} (${detail})` : t(key);
    }
    this.navBar?.setActiveValues?.({ themeFamily: family, locale: getLocale() });
  }
}

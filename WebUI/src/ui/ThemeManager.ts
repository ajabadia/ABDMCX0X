/**
 * ABDMCX0X -- ThemeManager.ts (Slice 1)
 * Pure visual theme switcher (no artificial DSP voice/filter limits):
 * 8 ABDShared + ABDNeuModMakr families x Light/Dark = 16 tokenized themes over bg_neutral.webp.
 */

export type ThemeFamilyKey =
  | 'ms2000'
  | 'neuron'
  | 'mc303'
  | 'dr5'
  | 'virus-snow'
  | 'audiolab'
  | 'advanced'
  | 'cz101';

export type ColorSchemeMode = 'light' | 'dark';

export interface ThemeFamilyMeta {
  key: ThemeFamilyKey;
  label: string;
  darkTheme: string;
  lightTheme: string;
}

const STORAGE_SCHEME = 'color-scheme';
const STORAGE_FAMILY = 'abdmcx0x.themeFamily';

export const THEME_FAMILIES: readonly ThemeFamilyMeta[] = [
  { key: 'ms2000', label: 'MS2000 Teal', darkTheme: 'ms2000', lightTheme: 'ms2000-light' },
  { key: 'neuron', label: 'Axionik / Neuron', darkTheme: 'neuron-dark', lightTheme: 'neuron-light' },
  { key: 'mc303', label: 'MC-303 Groovebox', darkTheme: 'mc303', lightTheme: 'mc303-light' },
  { key: 'dr5', label: 'Boss DR-5', darkTheme: 'dr5', lightTheme: 'dr5-light' },
  { key: 'virus-snow', label: 'Virus Snow', darkTheme: 'virus-snow-dark', lightTheme: 'virus-snow' },
  { key: 'audiolab', label: 'AudioLab Pro', darkTheme: 'audiolab', lightTheme: 'audiolab-light' },
  { key: 'advanced', label: 'Advanced Amber', darkTheme: 'advanced', lightTheme: 'advanced-light' },
  { key: 'cz101', label: 'CZ-101 Heritage', darkTheme: 'cz101', lightTheme: 'cz101-light' },
] as const;

export class ThemeManager {
  private family: ThemeFamilyKey = 'ms2000';
  private onChangeCb: ((family: ThemeFamilyKey, scheme: ColorSchemeMode, themeId: string) => void) | null = null;

  constructor() {
    try {
      const saved = localStorage.getItem(STORAGE_FAMILY) as ThemeFamilyKey | null;
      if (saved && THEME_FAMILIES.some((f) => f.key === saved)) this.family = saved;
    } catch { /* ignore */ }

    window.addEventListener('storage', (ev) => {
      if (ev.key === STORAGE_SCHEME) this.apply();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.apply());
  }

  public onChange(cb: (family: ThemeFamilyKey, scheme: ColorSchemeMode, themeId: string) => void): void {
    this.onChangeCb = cb;
  }

  public getFamily(): ThemeFamilyKey { return this.family; }
  public getFamilyMeta(): ThemeFamilyMeta {
    return THEME_FAMILIES.find((f) => f.key === this.family) ?? THEME_FAMILIES[0];
  }

  public getSystemScheme(): ColorSchemeMode {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  public getRenderedScheme(): ColorSchemeMode {
    try {
      const stored = localStorage.getItem(STORAGE_SCHEME);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch { /* ignore */ }
    return this.getSystemScheme();
  }

  public setScheme(target: ColorSchemeMode): void {
    const sys = this.getSystemScheme();
    try {
      if (target === sys) localStorage.removeItem(STORAGE_SCHEME);
      else localStorage.setItem(STORAGE_SCHEME, target);
    } catch { /* ignore */ }
    this.apply(target);
  }

  public toggleScheme(): ColorSchemeMode {
    const target: ColorSchemeMode = this.getRenderedScheme() === 'dark' ? 'light' : 'dark';
    this.setScheme(target);
    return target;
  }

  public setFamily(key: ThemeFamilyKey): void {
    if (!THEME_FAMILIES.some((f) => f.key === key)) return;
    this.family = key;
    try { localStorage.setItem(STORAGE_FAMILY, key); } catch { /* ignore */ }
    this.apply();
  }

  public apply(explicitScheme?: ColorSchemeMode): void {
    const scheme = explicitScheme ?? this.getRenderedScheme();
    const meta = document.querySelector('meta[name="color-scheme"]');
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_SCHEME); } catch { /* ignore */ }
    if (meta) meta.setAttribute('content', stored === 'light' || stored === 'dark' ? stored : 'light dark');

    const fm = this.getFamilyMeta();
    const themeId = scheme === 'dark' ? fm.darkTheme : fm.lightTheme;
    document.documentElement.setAttribute('data-theme', themeId);
    document.body.setAttribute('data-theme', themeId);
    this.onChangeCb?.(this.family, scheme, themeId);
  }
}

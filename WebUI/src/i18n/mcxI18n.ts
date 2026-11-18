/**
 * ABDMCX0X -- mcxI18n.ts
 * Complete ES / EN internationalization built on @abdsynths/shared/i18n.
 */

import { createSynthI18n } from '@abdsynths/shared/i18n';
import { mcxEn } from './locales/en';
import { mcxEs } from './locales/es';

export const mcxI18n = createSynthI18n({
  locales: { en: mcxEn, es: mcxEs },
  defaultLocale: 'es',
  storageKey: 'abdsynths.locale',
  detectBrowserLocale: true,
});

export const { t, setLocale, getLocale, onLocaleChange, applyI18n } = mcxI18n;

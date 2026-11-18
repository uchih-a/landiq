/**
 * Locale helper (P3b/P4b/P5b): the single place that maps the app's
 * active i18n language to a BCP-47 locale for number formatting, so
 * `toLocaleString` never gets a hard-coded 'en-KE' per call site.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/** The non-regional locale for each supported language. */
const LOCALES: Record<string, string> = {
  en: 'en-KE',
  sw: 'sw-KE',
};

/** Map an i18n language to its locale (default en-KE). */
export function localeForLanguage(lang: string | undefined): string {
  if (!lang) return LOCALES['en'];
  return LOCALES[lang.split('-')[0]] ?? LOCALES['en'];
}

/** Hook: the active locale, updated when the language changes. */
export function useLocale(): string {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return localeForLanguage(lang);
}

/** Non-hook variant for module-level callers (rare). */
export { localeForLanguage as localeFor };

/** Format an integer with the active locale's grouping (hook form). */
export function useFormatNumber(): (n: number) => string {
  const locale = useLocale();
  return useCallback((n: number) => n.toLocaleString(locale), [locale]);
}

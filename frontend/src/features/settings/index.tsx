/**
 * Settings screen — language, currency, default county, about/help.
 *
 * Web settings surface: the web design export does NOT include a settings
 * screen — settings is mobile-only via the "More" screen (m15_more). On
 * web, settings is reachable from the left rail's "Settings" button
 * (F0's LayoutShell). This screen serves both breakpoints.
 *
 * P8b:
 *  - Currency: the USD pill is DISABLED with a tooltip while no
 *    backend-configured rate exists (/meta fx null — no typed fallback
 *    rate anywhere). A stored USD preference then renders as KSh without
 *    being deleted (the display-level fallback lives in the shared
 *    currency module). The rate note is built from the response and
 *    clearly says the rate is fixed / manually maintained vs live.
 *  - Language options are built from the i18n resources actually
 *    registered, with native names from Intl.DisplayNames — never typed.
 *  - County options come from /counties/row_counts (n_listings > 0,
 *    sorted) plus "All counties". A stale stored county (no longer in
 *    the list) is cleared back to "All counties" with an honest note,
 *    never a blank select.
 *  - Every storage read/write goes through the shared safe-storage
 *    helper; all copy renders from i18n (en + sw).
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ValuationCard } from '@/components/ValuationCard';
import { PillButton } from '@/components/PillButton';
import { PillDropdown } from '@/components/PillDropdown';
import { useCurrency, setCurrency, type Currency } from '@/lib/currency/format';
import { useCountyRowCounts } from '@/lib/api/hooks';
import {
  getStoredDefaultCounty,
  setStoredDefaultCounty,
} from '@/lib/county-preference';
import { storageSet } from '@/lib/storage';

/** Native language names via Intl.DisplayNames (no typed names). */
function nativeLanguageName(lang: string): string {
  try {
    const dn = new Intl.DisplayNames([lang], { type: 'language' });
    return dn.of(lang) ?? lang;
  } catch {
    // Intl.DisplayNames unavailable (old engine) — the code is readable.
    return lang;
  }
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { currency, kshPerUsd, asOf, source } = useCurrency();
  const [lang, setLang] = useState(i18n.language);
  // The county list comes from /counties/row_counts (data-driven, never
  // typed); the rate lives in the shared currency store (pushed from
  // /meta by the LayoutShell — no typed fallback anywhere).
  const rowCountsQ = useCountyRowCounts();
  const [defaultCounty, setDefaultCounty] = useState(() => getStoredDefaultCounty());
  const [staleCleared, setStaleCleared] = useState(false);

  // Language options from the ACTUALLY registered i18n resources
  // (Object.keys of resourceStore.data — the brief's literal source),
  // falling back to i18n.languages. Native names via Intl.DisplayNames.
  const languageOptions = useMemo(() => {
    const store = (i18n.services as { resourceStore?: { data?: Record<string, unknown> } })
      .resourceStore?.data;
    const registered = store ? Object.keys(store) : [];
    const list =
      registered.length > 0
        ? registered
        : Array.isArray(i18n.languages)
          ? i18n.languages
          : ['en'];
    return list.map((code) => ({ code, label: nativeLanguageName(code) }));
  }, [i18n]);

  const countyOptions = useMemo(
    () => [
      { value: '', label: t('common.allCounties') },
      ...(rowCountsQ.data?.counties ?? [])
        .filter((c) => c.n_listings > 0)
        .sort((a, b) => a.county.localeCompare(b.county))
        .map((c) => ({ value: c.county, label: c.county })),
    ],
    [rowCountsQ.data, t],
  );

  // Stale stored county (P8b-H): when the live county list is loaded and
  // the stored default is NOT in it, reset to "All counties", clear the
  // stored value, and say so — never show a blank select.
  useEffect(() => {
    const known = rowCountsQ.data?.counties.map((c) => c.county);
    if (known && defaultCounty && !known.includes(defaultCounty)) {
      setStoredDefaultCounty('');
      setDefaultCounty('');
      setStaleCleared(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowCountsQ.data]);

  function handleCurrencyChange(c: Currency) {
    setCurrency(c); // module store + safe storage; consumers re-render
  }

  function handleLangChange(l: string) {
    i18n.changeLanguage(l);
    storageSet('lang', l);
    setLang(l);
  }

  function handleCountyChange(c: string) {
    setStoredDefaultCounty(c);
    setDefaultCounty(c);
    setStaleCleared(false);
  }

  const rateAvailable = kshPerUsd != null && kshPerUsd > 0;
  const modeLabel = t('settings.rateModeFixed');

  // The rate note is built from the /meta response ONLY ("1 USD = X KSh,
  // as of D (source)") — the values reach here through the shared
  // currency store; a null rate is an honest "not available", never a
  // fallback number.
  const rateNote = !rateAvailable
    ? t('settings.rateUnavailable')
    : asOf != null
      ? t('settings.rateAvailable', {
          rate: kshPerUsd?.toFixed(0),
          mode: source ?? modeLabel,
          asOf,
        })
      : t('settings.rateAvailableNoDate', {
          rate: kshPerUsd?.toFixed(0),
          mode: source ?? modeLabel,
        });

  return (
    <div className="flex flex-col gap-space-lg p-margin max-w-3xl mx-auto">
      <div className="flex items-baseline gap-3 pt-4">
        <h1 className="font-headline-page text-headline-page text-on-surface">{t('settings.title')}</h1>
      </div>

      {/* Language */}
      <ValuationCard>
        <h2 className="font-headline-section text-headline-section text-on-surface mb-space-sm">
          {t('settings.language')}
        </h2>
        <div
          className="flex gap-2 flex-wrap"
          role="group"
          aria-label={t('settings.languageA11y')}
        >
          {languageOptions.map((opt) => (
            <PillButton
              key={opt.code}
              variant={lang === opt.code || lang.startsWith(opt.code) ? 'primary' : 'secondary'}
              onClick={() => handleLangChange(opt.code)}
            >
              {opt.label}
            </PillButton>
          ))}
        </div>
      </ValuationCard>

      {/* Currency */}
      <ValuationCard>
        <h2 className="font-headline-section text-headline-section text-on-surface mb-space-sm">
          {t('settings.currency')}
        </h2>
        <div
          className="flex gap-2"
          role="group"
          aria-label={t('settings.currencyA11y')}
        >
          <PillButton
            variant={currency === 'KSH' ? 'primary' : 'secondary'}
            onClick={() => handleCurrencyChange('KSH')}
          >
            KSh
          </PillButton>
          {/* P8b-I: USD is disabled while no configured rate exists —
              an honest "not available", never a guessed rate. A stored
              USD preference renders as KSh (the module-level fallback)
              and is NOT deleted. */}
          <span
            title={rateAvailable ? undefined : t('settings.usdDisabledReason')}
            aria-label={rateAvailable ? undefined : `${t('settings.usdDisabledTitle')} — ${t('settings.usdDisabledReason')}`}
          >
            <PillButton
              variant={currency === 'USD' ? 'primary' : 'secondary'}
              disabled={!rateAvailable}
              onClick={() => handleCurrencyChange('USD')}
            >
              USD
            </PillButton>
          </span>
        </div>
        <p className="text-caption-sm font-caption-sm text-secondary mt-2">{rateNote}</p>
      </ValuationCard>

      {/* Default County */}
      <ValuationCard>
        <h2 className="font-headline-section text-headline-section text-on-surface mb-space-sm">
          {t('settings.defaultCounty')}
        </h2>
        <PillDropdown
          label={t('settings.defaultCounty')}
          leadingIcon="location_on"
          options={countyOptions}
          value={defaultCounty}
          onChange={handleCountyChange}
        />
        {staleCleared && (
          <p className="text-caption-sm font-caption-sm text-secondary mt-2" role="status">
            {t('settings.staleCountyCleared')}
          </p>
        )}
      </ValuationCard>

      {/* About */}
      <ValuationCard>
        <h2 className="font-headline-section text-headline-section text-on-surface mb-space-sm">
          {t('settings.about')}
        </h2>
        <p className="text-body-regular text-on-surface-variant">{t('settings.aboutCopy')}</p>
      </ValuationCard>

      {/* Help & Support */}
      <ValuationCard>
        <h2 className="font-headline-section text-headline-section text-on-surface mb-space-sm">
          {t('settings.helpSupport')}
        </h2>
        <p className="text-body-regular text-on-surface-variant">{t('settings.helpCopy')}</p>
      </ValuationCard>
    </div>
  );
}

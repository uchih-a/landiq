/**
 * Settings screen — language, currency, default county, about/help.
 *
 * Web settings surface: the web design export does NOT include a settings
 * screen — settings is mobile-only via the "More" screen (m15_more). On web,
 * settings is reachable from the left rail's "Settings" button (F0's
 * LayoutShell). This screen serves both breakpoints.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ValuationCard } from '@/components/ValuationCard';
import { PillButton } from '@/components/PillButton';
import { PillDropdown } from '@/components/PillDropdown';
import { getCurrency, setCurrency, type Currency } from '@/lib/currency/format';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const [currency, setCurrencyState] = useState<Currency>(getCurrency());
  const [lang, setLang] = useState(i18n.language);

  const counties = [
    { value: '', label: t('common.allCounties') },
    { value: 'Nairobi', label: 'Nairobi' },
    { value: 'Kiambu', label: 'Kiambu' },
    { value: 'Nakuru', label: 'Nakuru' },
    { value: 'Mombasa', label: 'Mombasa' },
    { value: 'Kajiado', label: 'Kajiado' },
  ];
  const [defaultCounty, setDefaultCounty] = useState(
    localStorage.getItem('defaultCounty') || '',
  );

  function handleCurrencyChange(c: Currency) {
    setCurrency(c);
    setCurrencyState(c);
  }

  function handleLangChange(l: string) {
    i18n.changeLanguage(l);
    localStorage.setItem('lang', l);
    setLang(l);
  }

  function handleCountyChange(c: string) {
    localStorage.setItem('defaultCounty', c);
    setDefaultCounty(c);
  }

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
        <div className="flex gap-2">
          <PillButton
            variant={lang === 'en' ? 'primary' : 'secondary'}
            onClick={() => handleLangChange('en')}
          >
            {t('settings.english')}
          </PillButton>
          <PillButton
            variant={lang === 'sw' ? 'primary' : 'secondary'}
            onClick={() => handleLangChange('sw')}
          >
            {t('settings.kiswahili')}
          </PillButton>
        </div>
      </ValuationCard>

      {/* Currency */}
      <ValuationCard>
        <h2 className="font-headline-section text-headline-section text-on-surface mb-space-sm">
          {t('settings.currency')}
        </h2>
        <div className="flex gap-2">
          <PillButton
            variant={currency === 'KSH' ? 'primary' : 'secondary'}
            onClick={() => handleCurrencyChange('KSH')}
          >
            KSh
          </PillButton>
          <PillButton
            variant={currency === 'USD' ? 'primary' : 'secondary'}
            onClick={() => handleCurrencyChange('USD')}
          >
            USD
          </PillButton>
        </div>
        <p className="text-caption-sm font-caption-sm text-secondary mt-2">
          Rate: 1 USD = 129 KSh (fixed, not live — update manually)
        </p>
      </ValuationCard>

      {/* Default County */}
      <ValuationCard>
        <h2 className="font-headline-section text-headline-section text-on-surface mb-space-sm">
          {t('settings.defaultCounty')}
        </h2>
        <PillDropdown
          label={t('settings.defaultCounty')}
          leadingIcon="location_on"
          options={counties}
          value={defaultCounty}
          onChange={handleCountyChange}
        />
      </ValuationCard>

      {/* About */}
      <ValuationCard>
        <h2 className="font-headline-section text-headline-section text-on-surface mb-space-sm">
          {t('settings.about')}
        </h2>
        <p className="text-body-regular text-on-surface-variant">
          Kenya Land Valuation — Ensemble Valuation Engine. A statistical estimate
          produced by models trained on advertised prices. Not an official valuation.
        </p>
      </ValuationCard>

      {/* Help & Support */}
      <ValuationCard>
        <h2 className="font-headline-section text-headline-section text-on-surface mb-space-sm">
          {t('settings.helpSupport')}
        </h2>
        <p className="text-body-regular text-on-surface-variant">
          For questions about the model, data sources, or methodology, see the
          Model Performance and Explainability tabs.
        </p>
      </ValuationCard>
    </div>
  );
}

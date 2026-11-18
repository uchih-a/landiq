/**
 * Explainability — the F8 screen.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ Explainability          [All listings | One estimate]             │
 *   ├──────────────────────────────────────┬───────────────────────────┤
 *   │  What matters most overall (7 cols)  │  How much is explained (5)│
 *   ├──────────────────────────────────────┴───────────────────────────┤
 *   │  In plain words (synthesis, i18n with interpolation)             │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  Glossary (full width)                                           │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Mode toggle (a proper radiogroup with arrow-key support):
 *  - "All listings"  -> global view (default).  The bars/donut/glossary
 *                      all render backend-served data; the selected
 *                      model comes from the response's `models` list +
 *                      `default_model` (never a hard-coded member key).
 *  - "One estimate"  -> the last successful /predict estimate from the
 *                      shared last-estimate store (see OneEstimatePanel;
 *                      the old Deal-Finder promise was removed — that
 *                      behaviour does not exist).
 *
 * Data: `useExplainability()` -> shap_global + feature_labels +
 * ensemble_shap_coverage (fractions + source) + models + default_model +
 * typical_price_per_acre_ksh.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState, ValuationCard } from '@/components';
import { useExplainability } from '@/lib/api/hooks';
import { formatMoney } from '@/lib/currency/format';
import { selectTopDrivers, synthesisKey, formatDriverNames } from './helpers';

import { CoverageDonut } from './CoverageDonut';
import { GlossaryPanel } from './GlossaryPanel';
import { GlobalShapBars } from './GlobalShapBars';
import { OneEstimatePanel } from './OneEstimatePanel';

type Mode = 'global' | 'estimate';

export default function Explainability() {
  const { t } = useTranslation();
  const explainQ = useExplainability();
  const [mode, setMode] = useState<Mode>('global');

  const data = explainQ.data;
  const shapRows = data?.shap_global;
  const labels = data?.feature_labels;
  const coverage = data?.ensemble_shap_coverage;
  const models = data?.models;
  const defaultModel = data?.default_model ?? null;
  const typicalPrice = data?.typical_price_per_acre_ksh ?? null;

  // ---- Model selection (P6b problem D): from the response only. ----
  // The user's pick (state) wins; else the backend's default_model; else
  // the first SHAP-covered member in list order.  Null when no member has
  // SHAP rows — the bars card then shows its honest empty state.
  const [userModel, setUserModel] = useState<string | null>(null);
  const shapModelKeys = useMemo(
    () => (models ?? []).filter((m) => m.has_shap).map((m) => m.key),
    [models],
  );
  const selectedModel = useMemo<string | null>(() => {
    if (userModel) return userModel;
    if (defaultModel) return defaultModel;
    return shapModelKeys[0] ?? null;
  }, [userModel, defaultModel, shapModelKeys]);

  // ---- Top drivers power the plain-synthesis sentence (i18n). ----
  const topDrivers = useMemo(
    () => selectTopDrivers(shapRows, labels, selectedModel),
    [shapRows, labels, selectedModel],
  );

  const synthesis = useMemo(() => {
    if (topDrivers.length === 0) return null;
    const names = topDrivers.map((d) => d.label);
    const andWord = t('common.and');
    if (names.length === 1) {
      return t('explain.synthesis.one', { a: names[0] });
    }
    if (names.length === 2) {
      return t('explain.synthesis.two', { a: names[0], b: names[1] });
    }
    return t(`explain.synthesis.${synthesisKey(names.length)}`, {
      list: formatDriverNames(names, andWord),
    });
  }, [topDrivers, t]);

  // ---- Glossary: only features the model uses (from shap_global). ----
  const modelFeatureKeys = useMemo(
    () => (shapRows ? new Set(shapRows.map((r) => r.feature)) : undefined),
    [shapRows],
  );

  const isLoading = explainQ.isLoading;
  const isError = explainQ.isError;

  return (
    <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
      <header className="flex flex-col gap-space-md pt-2">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-space-md">
          <div>
            <h1 className="font-outfit text-headline-page-mobile md:text-headline-page text-on-surface">
              {t('explain.title')}
            </h1>
            <p className="mt-2 text-body-regular text-on-surface-variant">
              {t('explain.subtitle')}
            </p>
          </div>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </header>

      {mode === 'estimate' ? (
        <OneEstimatePanel models={models} />
      ) : isError ? (
        <EmptyState
          icon="cloud_off"
          title={t('common.dataUnavailable')}
          message={t('explain.feedUnavailable')}
          actionLabel={t('common.retry')}
          onAction={() => explainQ.refetch()}
        />
      ) : (
        <>
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7">
              <GlobalShapBars
                rows={shapRows}
                labels={labels}
                models={models}
                defaultModel={defaultModel}
                selectedModel={selectedModel}
                onSelectModel={setUserModel}
                isLoading={isLoading}
                isError={isError}
                onRetry={() => explainQ.refetch()}
              />
            </div>
            <div className="lg:col-span-5">
              <CoverageDonut
                coverage={coverage}
                models={models}
                isLoading={isLoading}
                isError={isError}
                onRetry={() => explainQ.refetch()}
              />
            </div>
          </section>

          {synthesis && (
            <ValuationCard>
              <h2 className="font-headline-section text-headline-section text-on-surface mb-2">
                {t('explain.synthesisTitle')}
              </h2>
              {/* The backend does not generate natural-language synthesis;
                  this text is templated client-side from the driver list,
                  with the wording in i18n (en + sw). */}
              <p className="text-body-regular text-on-surface-variant">{synthesis}</p>
              <p className="mt-2 text-caption-sm text-secondary">
                {t('explain.synthesis.unit')}
              </p>
            </ValuationCard>
          )}

          <GlossaryPanel
            labels={labels}
            modelFeatureKeys={modelFeatureKeys}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => explainQ.refetch()}
          />

          {/* The model's baseline price — hidden when the backend did not
              serve it (never invented client-side). */}
          {typicalPrice != null && (
            <p className="text-caption-sm text-secondary">
              {t('explain.typicalPriceFooter', { value: formatMoney(typicalPrice) })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

interface ModeToggleProps {
  mode: Mode;
  onChange: (m: Mode) => void;
}

const MODE_ORDER: Mode[] = ['global', 'estimate'];

/**
 * Segmented control — role="radiogroup" with radio buttons; ArrowLeft /
 * ArrowRight move between the two modes (P6b problem K a11y).
 */
function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const { t } = useTranslation();

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const idx = MODE_ORDER.indexOf(mode);
    const next =
      e.key === 'ArrowRight'
        ? MODE_ORDER[(idx + 1) % MODE_ORDER.length]
        : MODE_ORDER[(idx - 1 + MODE_ORDER.length) % MODE_ORDER.length];
    onChange(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('explain.modeToggleLabel')}
      onKeyDown={handleKeyDown}
      className="inline-flex p-1 rounded-full bg-surface-container-highest self-start"
    >
      {MODE_ORDER.map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(m)}
            className={`px-4 py-2 rounded-full text-body-medium font-body-medium transition-colors ${
              active
                ? 'bg-on-surface text-white'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {m === 'global' ? t('explain.allListings') : t('explain.oneEstimate')}
          </button>
        );
      })}
    </div>
  );
}

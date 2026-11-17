/**
 * Explainability — the F8 screen.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ Explainability          [All listings | One estimate]             │
 *   ├──────────────────────────────────────┬───────────────────────────┤
 *   │  What matters most overall (7 cols)   │  How much is explained (5)│
 *   ├──────────────────────────────────────┴───────────────────────────┤
 *   │  Plain synthesis (templated client-side from the driver list)     │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  Glossary (full width)                                             │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Mode toggle:
 *  - "All listings"     -> global view (default)
 *  - "One estimate"     -> placeholder. Real per-listing SHAP would
 *                          come from /predict (already rendered on the
 *                          Predictor screen) or from a future per-listing
 *                          endpoint. For now we just prompt the user.
 *
 * Data:
 *  - `useExplainability()` -> shap_global + feature_labels +
 *                             ensemble_shap_coverage
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState, ValuationCard } from '@/components';
import { useExplainability } from '@/lib/api/hooks';
import type { FeatureLabel, ShapGlobalRow } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency/format';

import { CoverageDonut } from './CoverageDonut';
import { GlossaryPanel } from './GlossaryPanel';
import { GlobalShapBars } from './GlobalShapBars';
import { buildSynthesis, type DriverSummary } from './helpers';

type Mode = 'global' | 'estimate';

export default function Explainability() {
  const { t } = useTranslation();
  const explainQ = useExplainability();
  const [mode, setMode] = useState<Mode>('global');

  const shapRows: ShapGlobalRow[] | undefined = explainQ.data?.shap_global;
  const labels: Record<string, FeatureLabel> | undefined =
    explainQ.data?.feature_labels;
  const coverage: Record<string, unknown> | undefined =
    explainQ.data?.ensemble_shap_coverage;

  // Top 5 drivers power the plain-synthesis sentence.
  const topDrivers = useMemo<DriverSummary[]>(() => {
    if (!shapRows) return [];
    return [...shapRows]
      .filter((r) => r.model === 'xgb')
      .sort((a, b) => b.mean_abs_shap - a.mean_abs_shap)
      .slice(0, 5)
      .map((r) => ({
        feature: r.feature,
        label: labels?.[r.feature]?.label ?? r.feature,
        mean_abs_shap: r.mean_abs_shap,
      }));
  }, [shapRows, labels]);

  const synthesis = useMemo(() => buildSynthesis(topDrivers), [topDrivers]);

  // Defensively read the typical-price reference from the coverage block
  // so the footer can quote it without assuming the field's presence.
  const typicalPrice =
    coverage && typeof coverage.typical_price_per_acre_ksh === 'number'
      ? (coverage.typical_price_per_acre_ksh as number)
      : null;

  return (
    <div className="flex flex-col gap-space-xl p-margin max-w-[1400px] mx-auto">
      <header className="flex flex-col gap-space-md pt-2">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-space-md">
          <div>
            <h1 className="font-outfit text-headline-page-mobile md:text-headline-page text-on-surface">
              {t('explain.title')}
            </h1>
            <p className="mt-2 text-body-regular text-on-surface-variant">
              What the ensemble weighs most, and how much of its price attribution SHAP actually covers.
            </p>
          </div>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </header>

      {mode === 'estimate' ? (
        <EmptyState
          icon="neurology"
          title={t('explain.oneEstimate')}
          message="Select a listing from Deal Finder or run the Predictor — its per-listing SHAP drivers will appear here."
        />
      ) : explainQ.isError ? (
        <EmptyState
          icon="cloud_off"
          title={t('common.dataUnavailable')}
          message="The explainability feed is unavailable."
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
                isLoading={explainQ.isLoading}
                isError={explainQ.isError}
                onRetry={() => explainQ.refetch()}
              />
            </div>
            <div className="lg:col-span-5">
              <CoverageDonut
                coverage={coverage}
                isLoading={explainQ.isLoading}
                isError={explainQ.isError}
                onRetry={() => explainQ.refetch()}
              />
            </div>
          </section>

          {synthesis && (
            <ValuationCard>
              <h2 className="font-headline-section text-headline-section text-on-surface mb-2">
                Plain synthesis
              </h2>
              {/* The backend does not generate natural-language synthesis.
                  This text is templated client-side from the driver list. */}
              <p className="text-body-regular text-on-surface-variant">
                {synthesis}
              </p>
            </ValuationCard>
          )}

          <GlossaryPanel
            labels={labels}
            isLoading={explainQ.isLoading}
            isError={explainQ.isError}
            onRetry={() => explainQ.refetch()}
          />

          {typicalPrice != null && (
            <p className="text-caption-sm text-secondary">
              Ensemble SHAP coverage reflects the loaded model — typical per-acre price reference:{' '}
              {formatMoney(typicalPrice)}.
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

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex p-1 rounded-full bg-surface-container-highest self-start">
      <button
        type="button"
        onClick={() => onChange('global')}
        aria-pressed={mode === 'global'}
        className={`px-4 py-2 rounded-full text-body-medium font-body-medium transition-colors ${mode === 'global' ? 'bg-on-surface text-white' : 'text-on-surface-variant hover:text-on-surface'}`}
      >
        {t('explain.allListings')}
      </button>
      <button
        type="button"
        onClick={() => onChange('estimate')}
        aria-pressed={mode === 'estimate'}
        className={`px-4 py-2 rounded-full text-body-medium font-body-medium transition-colors ${mode === 'estimate' ? 'bg-on-surface text-white' : 'text-on-surface-variant hover:text-on-surface'}`}
      >
        {t('explain.oneEstimate')}
      </button>
    </div>
  );
}

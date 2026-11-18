/**
 * OneEstimatePanel — the "One estimate" mode body (P6b problem G).
 *
 * Renders the LAST successful /predict estimate kept in the shared
 * last-estimate store (sessionStorage-backed, written by the Predictor's
 * mutation onSuccess): the stored request's place name / size / property
 * type, the time of the estimate, the estimate's drivers (reusing the
 * shared DriversList component — the same UI the Predictor's result
 * card shows), and the live coverage block from the stored response's
 * `explanation.coverage` (the live /predict coverage, recomputed by the
 * backend from the loaded ensemble).
 *
 * With no stored estimate: an honest empty state with a "Run an estimate"
 * action to the Predictor.  (The old placeholder promised Deal-Finder
 * behaviour that does not exist — removed.)
 *
 * Member display names resolve via the explainability payload's
 * `models` list; when that feed failed, the raw member keys are shown
 * (they are the backend's values — no invented names).
 */
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { DriversList, EmptyState, PillButton, ValuationCard } from '@/components';
import type { ExplainabilityModel } from '@/lib/api/types';
import { useLastEstimate } from '@/lib/store/lastEstimate';

interface Props {
  /** The explainability payload's models list (display names). */
  models: ExplainabilityModel[] | undefined;
}

function displayName(key: string, models: ExplainabilityModel[] | undefined): string {
  return models?.find((m) => m.key === key)?.display_name ?? key;
}

export function OneEstimatePanel({ models }: Props) {
  const { t, i18n } = useTranslation();
  const stored = useLastEstimate();
  const navigate = useNavigate();

  if (!stored) {
    return (
      <EmptyState
        icon="neurology"
        title={t('explain.oneEstimateEmptyTitle')}
        message={t('explain.oneEstimateEmptyMessage')}
        actionLabel={t('explain.oneEstimateRun')}
        onAction={() => navigate('/predictor')}
      />
    );
  }

  const { request, response } = stored;
  const explanation = response.explanation;

  // Locale from the app's i18n language (data-driven, not a typed locale
  // literal). `undefined` lets the runtime pick its default.
  const locale = i18n.resolvedLanguage || undefined;
  const sizeText = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    request.size_acres,
  );
  const timeText = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(stored.createdAt));

  const headerArgs = {
    name: stored.placeName ?? response.county ?? '',
    size: sizeText,
    type: request.prop_type,
  };

  return (
    <div className="flex flex-col gap-6">
      <ValuationCard noPadding>
        <div className="p-space-lg">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-headline-section text-headline-section text-on-surface">
                {headerArgs.name
                  ? t('explain.oneEstimateHeader', headerArgs)
                  : t('explain.oneEstimateHeaderNoPlace', headerArgs)}
              </h2>
              <p className="text-caption-sm text-secondary mt-1">
                {t('explain.oneEstimateAt', { time: timeText })}
              </p>
            </div>
            <PillButton
              variant="secondary"
              leadingIcon="calculate"
              onClick={() => navigate('/predictor')}
            >
              {t('explain.oneEstimateRunAnother')}
            </PillButton>
          </div>
        </div>
      </ValuationCard>

      {explanation ? (
        <>
          <ValuationCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-outfit text-headline-section text-on-surface">
                {t('explain.oneEstimateDriversTitle')}
              </h3>
            </div>
            <DriversList drivers={explanation.drivers} />
          </ValuationCard>

          <ValuationCard>
            <h3 className="font-outfit text-headline-section text-on-surface mb-2">
              {t('explain.oneEstimateCoverageTitle')}
            </h3>
            <p className="text-body-regular text-on-surface-variant">
              {t('explain.oneEstimateCoverageExplained', {
                pct: `${Math.round(explanation.coverage.tree_share_explained_by_shap * 100)}%`,
              })}
            </p>
            {/* Live coverage members from the stored /predict response. */}
            <div className="mt-space-md flex flex-wrap gap-2">
              {explanation.coverage.explained_members.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center rounded-full bg-surface-container-high px-3 py-1 text-caption-sm text-on-surface-variant"
                >
                  {displayName(m, models)}
                </span>
              ))}
              {explanation.coverage.unexplained_members.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center rounded-full bg-surface-container-high px-3 py-1 text-caption-sm text-secondary"
                >
                  {displayName(m, models)}
                </span>
              ))}
            </div>
            <p className="mt-space-md text-caption-sm text-secondary">
              {t('explain.coverageSource.recomputed')}
            </p>
          </ValuationCard>
        </>
      ) : (
        // The prediction succeeded but the driver breakdown was not
        // available (no tree models loaded / explanation failed) — honest.
        <EmptyState
          icon="psychology"
          title={t('explain.noShapData')}
          message={t('explain.oneEstimateNoExplanation')}
        />
      )}
    </div>
  );
}

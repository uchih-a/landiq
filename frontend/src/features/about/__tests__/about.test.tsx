/**
 * P8b About tests.
 *
 * (d) The live-system stats + FAQ answers template the mocked responses:
 *     change MedAPE / coverage / interval level / model list / counties
 *     total / flag window → the rendered text changes.
 * (e) Health states render DISTINCT copy for loading / ok / degraded /
 *     unreachable (a failed query is NOT "degraded").
 * (f) The pipeline copy comes from the methodology block + model_info
 *     (never a typed "CatBoost, XGBoost, and TabNet" / "80%").
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import '@/lib/i18n';
import type { MetaResponse, MetricsResponse, MetricsTableRow } from '@/lib/api/types';

// ----------------------------------------------------------------------
// Hook mocks — shapes mirror the REAL backend schemas (non-round values
// so a "is this hard-coded?" regression is obvious).
// ----------------------------------------------------------------------

vi.mock('@/lib/api/hooks', () => ({
  useCountyRowCounts: vi.fn(),
  useCountySummary: vi.fn(),
  useExplainability: vi.fn(),
  useHealth: vi.fn(),
  useMeta: vi.fn(),
  useModelMetrics: vi.fn(),
}));

import {
  useCountyRowCounts,
  useCountySummary,
  useExplainability,
  useHealth,
  useMeta,
  useModelMetrics,
} from '@/lib/api/hooks';

import About from '../index';

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
const loading = () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
const errored = () => ({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });

function mkRow(over: Partial<MetricsTableRow>): MetricsTableRow {
  return {
    run: 'Run A',
    model: 'weighted_ensemble',
    cv_rmse_mean: 0.45,
    cv_rmse_se: 0.02,
    test_R2: 0.81,
    test_RMSE: 0.42,
    test_MAE: 0.32,
    test_MedAPE_pct: 31.24,
    test_MAE_KSh_per_acre: 980_000,
    ci95_R2_lo: 0.78,
    ci95_R2_hi: 0.84,
    ci95_RMSE_lo: 0.39,
    ci95_RMSE_hi: 0.45,
    ci95_MAE_lo: 0.29,
    ci95_MAE_hi: 0.35,
    county_group_cv_rmse: null,
    ensemble_weight: 1,
    trimmed_test_rmse: null,
    trimmed_test_rows: null,
    interval_coverage_50: null,
    interval_width_ratio_50: null,
    interval_coverage_80: 0.815,
    interval_width_ratio_80: null,
    interval_coverage_90: null,
    interval_width_ratio_90: null,
    ...over,
  };
}

function mkMetrics(over: Partial<MetricsResponse>): MetricsResponse {
  return {
    table: { rows: [mkRow({})], n_runs: 1, n_models_per_run: 1 },
    metrics_json: { production_run: 'Run A' },
    ensemble_model: 'weighted_ensemble',
    production_run_label: 'Run A · 2025-01-15',
    interval_levels: [0.5, 0.8],
    default_interval_level: 0.8,
    interval_method: 'multiplicative split-conformal',
    n_test: 380,
    n_dev: 500,
    model_info: {
      weighted_ensemble: { display_name: 'Weighted ensemble', family: 'ensemble' },
      xgb: { display_name: 'XGBoost', family: 'tree' },
      catboost: { display_name: 'CatBoost', family: 'tree' },
      tabnet: { display_name: 'TabNet', family: 'neural' },
    },
    ...over,
  } as MetricsResponse;
}

const MOCK_META = (over: Partial<MetaResponse> = {}): MetaResponse => ({
  model_version: 'Run A',
  data_date: '2025-11-01',
  coverage: { min_county_n: 10, min_nearby_n: 5, radius_km: 50 },
  ensemble_weights: null,
  fx: { ksh_per_usd: 129, as_of: '2025-01-15', source: 'manually maintained' },
  flag_definition: { lower_pct: 1, upper_pct: 99 },
  methodology: {
    sources_note: 'Asking prices from public real estate listings.',
    cleaning_steps: ['Step one.', 'Step two.'],
    feature_groups: ['Distance to Nairobi', 'Road access'],
  },
  ...over,
});

const MOCK_ROW_COUNTS = { counties: [{ county: 'Nairobi', n_listings: 610 }], total_listings: 610, n_counties: 22 };

const MOCK_SUMMARY = { n_counties_total: 47 } as never;

const MOCK_EXPLAIN = {
  production_run: 'Run A',
  shap_global: [],
  feature_importance: [],
  feature_labels: {
    log_size_acres: {
      label: 'Log parcel size',
      unit: 'log(acres)',
      description: 'Natural logarithm of the parcel size.',
      source: '',
      in_production_set: true,
      available_at_prediction_time: null,
    },
  },
  ensemble_shap_coverage: {},
};

type HealthQuery = {
  data: { status: 'ok' | 'degraded'; artifacts_loaded: boolean; version: string } | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

type Overrides = {
  metrics?: Partial<MetricsResponse>;
  meta?: Partial<MetaResponse>;
  health?: HealthQuery;
};

function setup({ metrics, meta, health }: Overrides = {}) {
  vi.mocked(useModelMetrics as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
    ok(mkMetrics(metrics ?? {})),
  );
  vi.mocked(useMeta as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
    ok(MOCK_META(meta ?? {})),
  );
  vi.mocked(useHealth as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    () => health ?? ok({ status: 'ok', artifacts_loaded: true, version: '1.2.3' } as never),
  );
  vi.mocked(useCountyRowCounts as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
    ok(MOCK_ROW_COUNTS),
  );
  vi.mocked(useCountySummary as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
    ok(MOCK_SUMMARY),
  );
  vi.mocked(useExplainability as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
    ok(MOCK_EXPLAIN),
  );
}

function renderAbout() {
  return render(<About />);
}

async function openFaq(question: string) {
  await userEvent.click(screen.getByRole('button', { name: question }));
}

beforeEach(() => {
  // VITE_REPORT_EMAIL is unset in tests → the report button is hidden.
});

afterEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------------
// (d) stats + FAQ follow the mocked responses
// ----------------------------------------------------------------------

describe('P8b (d): live-system stats follow the mocked metrics', () => {
  it('renders MedAPE, coverage, and the level from the response', async () => {
    setup({ metrics: { table: { rows: [mkRow({ test_MedAPE_pct: 28.36, interval_coverage_80: 0.793 })], n_runs: 1, n_models_per_run: 1 } } });
    renderAbout();
    // MedAPE one decimal
    expect(screen.getByText('MedAPE 28.4%')).toBeInTheDocument();
    // coverage at the mocked default level 0.8
    expect(screen.getByText('80% range holds')).toBeInTheDocument();
    expect(screen.getByText('79%')).toBeInTheDocument();
    // counties "of TOTAL" from the summary response (never a typed 47)
    expect(screen.getByText('22 of 47')).toBeInTheDocument();
    // FAQ reliability interpolates the same numbers
    await openFaq('How reliable is it');
    expect(
      screen.getByText(/Holdout test MedAPE 28\.4%, with a 80% interval that holds 79%/),
    ).toBeInTheDocument();
  });

  it('changing MedAPE / coverage / level changes the rendered text', async () => {
    setup({ metrics: { table: { rows: [mkRow({ test_MedAPE_pct: 40.02, interval_coverage_80: 0.91 })], n_runs: 1, n_models_per_run: 1 }, default_interval_level: 0.5 } });
    renderAbout();
    expect(screen.getByText('MedAPE 40.0%')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
    expect(screen.getByText('50% range holds')).toBeInTheDocument();
    // the previous numbers are gone
    expect(screen.queryByText('MedAPE 28.4%')).not.toBeInTheDocument();
    expect(screen.queryByText('80% range holds')).not.toBeInTheDocument();
  });
});

// ----------------------------------------------------------------------
// (e) health states render distinct copy
// ----------------------------------------------------------------------

describe('P8b (e): health states', () => {
  it('ok → Live System Active', () => {
    setup({ health: ok({ status: 'ok', artifacts_loaded: true, version: '1.2.3' }) });
    renderAbout();
    expect(screen.getByText('Live System Active')).toBeInTheDocument();
    expect(screen.queryByText('System degraded')).not.toBeInTheDocument();
  });

  it('degraded → System degraded (not "live")', () => {
    setup({ health: ok({ status: 'degraded', artifacts_loaded: false, version: '1.2.3' }) });
    renderAbout();
    expect(screen.getByText('System degraded')).toBeInTheDocument();
    expect(screen.queryByText('Live System Active')).not.toBeInTheDocument();
  });

  it('loading → neutral "Checking system status…" (not degraded)', () => {
    setup({ health: loading() as never });
    renderAbout();
    expect(screen.getByText('Checking system status…')).toBeInTheDocument();
    expect(screen.queryByText('System degraded')).not.toBeInTheDocument();
  });

  it('error → "System status unavailable" (a failed query is NOT degraded)', () => {
    setup({ health: errored() as never });
    renderAbout();
    expect(screen.getByText('System status unavailable')).toBeInTheDocument();
    expect(screen.getByText('Cannot reach the health endpoint right now.')).toBeInTheDocument();
    expect(screen.queryByText('System degraded')).not.toBeInTheDocument();
  });
});

// ----------------------------------------------------------------------
// (f) pipeline copy comes from the responses
// ----------------------------------------------------------------------

describe('P8b (f): pipeline + FAQ copy is data-driven', () => {
  it('renders the methodology block + model names + level (never typed)', () => {
    setup();
    renderAbout();
    // sources note from /meta methodology
    expect(screen.getByText('Asking prices from public real estate listings.')).toBeInTheDocument();
    // cleaning steps joined from the block
    expect(screen.getByText('Step one. Step two.')).toBeInTheDocument();
    // feature groups from the block
    expect(screen.getByText('Geospatial enrichment: Distance to Nairobi, Road access.')).toBeInTheDocument();
    // model names from model_info (never a typed "CatBoost, XGBoost, and TabNet")
    expect(
      screen.getByText('Cross-validation benchmarking of XGBoost, CatBoost, TabNet, including county-grouped validation.'),
    ).toBeInTheDocument();
    // interval level from the metrics response (never a typed 80%)
    expect(screen.getByText('Ensemble weighting with empirical 80% coverage intervals.')).toBeInTheDocument();
    // the "6 Steps" chip interpolates the actual step count
    expect(screen.getByText('6 Steps')).toBeInTheDocument();
  });

  it('changing the mocked model list changes the rendered text', () => {
    setup({
      metrics: {
        model_info: {
          weighted_ensemble: { display_name: 'Weighted ensemble', family: 'ensemble' },
          catboost: { display_name: 'CatBoost', family: 'tree' },
        },
      },
    });
    renderAbout();
    expect(
      screen.getByText('Cross-validation benchmarking of CatBoost, including county-grouped validation.'),
    ).toBeInTheDocument();
  });

  it('a missing model_info renders the honest fallback (no invented names)', () => {
    setup({ metrics: { model_info: {} } });
    renderAbout();
    expect(
      screen.getByText(/Cross-validation benchmarking of the trained models/),
    ).toBeInTheDocument();
  });

  it('the anomalies FAQ interpolates the flag window from flag_definition', async () => {
    setup({ meta: { flag_definition: { lower_pct: 2, upper_pct: 97 } } });
    renderAbout();
    await openFaq('How we handle suspicious listings');
    expect(
      screen.getByText(/outside the dataset’s 2nd–97th percentile window/),
    ).toBeInTheDocument();
  });

  it('the refusal FAQ interpolates the /meta thresholds', async () => {
    setup();
    renderAbout();
    await openFaq('When we will not estimate');
    expect(screen.getByText(/Fewer than 10 listings in the county, or fewer than 5 within 50 km/)).toBeInTheDocument();
  });

  it('the glossary renders feature entries + the app-wide MedAPE term', async () => {
    setup();
    renderAbout();
    await openFaq('Glossary');
    expect(screen.getByText(/^MedAPE:/)).toBeInTheDocument();
    expect(screen.getByText(/Log parcel size: Natural logarithm of the parcel size/)).toBeInTheDocument();
  });
});

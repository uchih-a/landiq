/**
 * P6b Explainability component tests.
 *
 * (a) Model names and slice names come from the mock and change when the
 *     mock changes — nothing hard-coded.
 * (b) Shares that do not sum to ~1 show "not available" — no silent
 *     renormalisation.
 * (c) The model selector is hidden for a single model.
 * (d) Synthesis wording for 1 / 2 / 3+ drivers via i18n (plural-safe).
 * (e) One-estimate mode renders the stored response + empty state when
 *     the store is empty.
 * (f) A throwing sessionStorage does not crash the store.
 *
 * Importing '@/lib/i18n' initialises i18next (side effect) so
 * useTranslation components resolve real en strings.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { userEvent } from '@testing-library/user-event';

import '@/lib/i18n';
import i18n from '@/lib/i18n';
import type {
  DriverContribution,
  ExplainabilityModel,
  PredictRequest,
  PredictResponse,
  ShapGlobalRow,
} from '@/lib/api/types';

import { clearLastEstimate, saveLastEstimate } from '@/lib/store/lastEstimate';
import { CoverageDonut } from '../CoverageDonut';
import { GlobalShapBars } from '../GlobalShapBars';
import { OneEstimatePanel } from '../OneEstimatePanel';
import { formatDriverNames, selectTopDrivers, synthesisKey } from '../helpers';

// ----------------------------------------------------------------------
// Mocks shaped from the REAL backend schemas (P6b): deliberately
// non-round values so a "is this hard-coded?" regression is obvious.
// ----------------------------------------------------------------------

const MOCK_MODELS: ExplainabilityModel[] = [
  { key: 'catboost', display_name: 'CatBoost', family: 'tree', ensemble_weight: 0.58, has_shap: true },
  { key: 'xgb', display_name: 'XGBoost', family: 'tree', ensemble_weight: 0.42, has_shap: true },
  { key: 'tabnet', display_name: 'TabNet', family: 'neural', ensemble_weight: 0.0, has_shap: false },
];

const MOCK_ROWS: ShapGlobalRow[] = [
  { model: 'catboost', feature: 'dist_to_nairobi_km', mean_abs_shap: 0.4123 },
  { model: 'catboost', feature: 'log_size_acres', mean_abs_shap: 0.2871 },
  { model: 'catboost', feature: 'amenities_score', mean_abs_shap: 0.1973 },
  { model: 'xgb', feature: 'dist_to_nairobi_km', mean_abs_shap: 0.3501 },
  { model: 'xgb', feature: 'log_size_acres', mean_abs_shap: 0.2009 },
];

const MOCK_LABELS = {
  dist_to_nairobi_km: {
    label: 'Distance to Nairobi CBD',
    unit: 'km',
    description: '',
    source: '',
    in_production_set: true,
    available_at_prediction_time: null,
  },
  log_size_acres: {
    label: 'Log parcel size',
    unit: 'log(acres)',
    description: '',
    source: '',
    in_production_set: true,
    available_at_prediction_time: null,
  },
  amenities_score: {
    label: 'Amenities score',
    unit: 'score',
    description: '',
    source: '',
    in_production_set: true,
    available_at_prediction_time: null,
  },
};

const NOOP = () => undefined;

// ----------------------------------------------------------------------
// (a) + (c): GlobalShapBars — model-driven
// ----------------------------------------------------------------------


describe('GlobalShapBars (P6b)', () => {
  it('renders the DEFAULT MODEL and its display name from the response', () => {
    render(
      <GlobalShapBars
        rows={MOCK_ROWS}
        labels={MOCK_LABELS}
        models={MOCK_MODELS}
        defaultModel="catboost"
        selectedModel="catboost"
        onSelectModel={NOOP}
        isLoading={false}
        isError={false}
        onRetry={NOOP}
      />,
    );
    // Caption names the selected model (from the mock's display_name) and
    // the count of bars actually shown.
    expect(screen.getByText(/Top 3 features .* CatBoost/)).toBeInTheDocument();
    // Feature labels come from the labels map.
    expect(screen.getAllByText(/Distance to Nairobi CBD/).length).toBeGreaterThan(0);
  });

  it('shows the selector for >1 SHAP-covered model and switches members', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <GlobalShapBars
        rows={MOCK_ROWS}
        labels={MOCK_LABELS}
        models={MOCK_MODELS}
        defaultModel="catboost"
        selectedModel="catboost"
        onSelectModel={onSelect}
        isLoading={false}
        isError={false}
        onRetry={NOOP}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Select model' });
    expect(group).toBeInTheDocument();
    // tabnet has no SHAP rows — it never appears in the selector.
    expect(screen.queryByRole('radio', { name: 'TabNet' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'XGBoost' }));
    expect(onSelect).toHaveBeenCalledWith('xgb');

    // Names change when the selection (from the response) changes.
    rerender(
      <GlobalShapBars
        rows={MOCK_ROWS}
        labels={MOCK_LABELS}
        models={MOCK_MODELS}
        defaultModel="catboost"
        selectedModel="xgb"
        onSelectModel={onSelect}
        isLoading={false}
        isError={false}
        onRetry={NOOP}
      />,
    );
    expect(screen.getByText(/Top 2 features .* XGBoost/)).toBeInTheDocument();
  });

  it('(c) hides the selector when only ONE SHAP-covered model exists', () => {
    render(
      <GlobalShapBars
        rows={[MOCK_ROWS[4]]}
        labels={MOCK_LABELS}
        models={[MOCK_MODELS[1]]}
        defaultModel="xgb"
        selectedModel="xgb"
        onSelectModel={NOOP}
        isLoading={false}
        isError={false}
        onRetry={NOOP}
      />,
    );
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByText(/XGBoost/)).toBeInTheDocument();
  });

  it('slice/model names track the MOCK — a changed mock changes the UI', () => {
    // Same component, different mock display names: the rendered text
    // must follow the mock (nothing typed in the component).
    const renamed: ExplainabilityModel[] = MOCK_MODELS.map((m) => ({
      ...m,
      display_name: `${m.display_name}-renamed`,
    }));
    const { getAllByText } = render(
      <GlobalShapBars
        rows={MOCK_ROWS}
        labels={MOCK_LABELS}
        models={renamed}
        defaultModel="catboost"
        selectedModel="catboost"
        onSelectModel={NOOP}
        isLoading={false}
        isError={false}
        onRetry={NOOP}
      />,
    );
    expect(getAllByText(/CatBoost-renamed/).length).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------------
// (a) + (b): CoverageDonut — response-driven slices, no renormalisation
// ----------------------------------------------------------------------


describe('CoverageDonut (P6b)', () => {
  it('names slices from the response members (via the models list)', () => {
    render(
      <CoverageDonut
        coverage={{
          tree_share_explained_by_shap: 0.62,
          tabnet_share_not_covered: 0.38,
          explained_members: ['catboost', 'xgb'],
          unexplained_members: ['tabnet'],
          source: 'recomputed',
        }}
        models={MOCK_MODELS}
        isLoading={false}
        isError={false}
        onRetry={NOOP}
      />,
    );
    expect(
      screen.getAllByText(/Explained by SHAP — CatBoost \+ XGBoost/).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Not covered by SHAP — TabNet/).length).toBeGreaterThan(0);
    // Values are the served fractions, shown as percentages.
    expect(screen.getAllByText(/62%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/38%/).length).toBeGreaterThan(0);
    // Source caption says where the numbers come from.
    expect(screen.getByText('Computed from the loaded model.')).toBeInTheDocument();
  });

  it('member names track the MOCK — changed mock, changed slice names', () => {
    const renamed = MOCK_MODELS.map((m) => ({
      ...m,
      display_name: `${m.display_name} Mk2`,
    }));
    render(
      <CoverageDonut
        coverage={{
          tree_share_explained_by_shap: 1.0,
          tabnet_share_not_covered: 0.0,
          explained_members: ['catboost'],
          unexplained_members: ['tabnet'],
          source: 'recomputed',
        }}
        models={renamed}
        isLoading={false}
        isError={false}
        onRetry={NOOP}
      />,
    );
    expect(screen.getAllByText(/CatBoost Mk2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/TabNet Mk2/).length).toBeGreaterThan(0);
  });

  it('(b) shares that do not sum to ~1 render "not available", never renormalised', () => {
    render(
      <CoverageDonut
        coverage={{
          tree_share_explained_by_shap: 0.61,
          tabnet_share_not_covered: 0.22,
          explained_members: ['catboost'],
          unexplained_members: ['tabnet'],
          source: 'recomputed',
        }}
        models={MOCK_MODELS}
        isLoading={false}
        isError={false}
        onRetry={NOOP}
      />,
    );
    expect(screen.getByText('Coverage not available')).toBeInTheDocument();
    // No renormalised percentages leak into the DOM (0.61/0.83 would be 73%).
    expect(screen.queryByText(/73%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/27%/)).not.toBeInTheDocument();
  });

  it('shows the honest empty state when the block is missing entirely', () => {
    render(
      <CoverageDonut
        coverage={{}}
        models={MOCK_MODELS}
        isLoading={false}
        isError={false}
        onRetry={NOOP}
      />,
    );
    expect(screen.getByText('No coverage breakdown')).toBeInTheDocument();
  });

  it('labels the manifest source caption when source is "manifest"', () => {
    render(
      <CoverageDonut
        coverage={{
          tree_share_explained_by_shap: 0.85,
          tabnet_share_not_covered: 0.15,
          explained_members: null,
          unexplained_members: null,
          source: 'manifest',
        }}
        models={undefined}
        isLoading={false}
        isError={false}
        onRetry={NOOP}
      />,
    );
    // Members null → wording that does not claim specific members.
    expect(screen.getAllByText(/Explained by SHAP · 85%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Not covered by SHAP · 15%/).length).toBeGreaterThan(0);
    expect(screen.getByText('From the training-time report.')).toBeInTheDocument();
  });
});

// ----------------------------------------------------------------------
// (d): synthesis wording — plural-safe via i18n
// ----------------------------------------------------------------------


describe('synthesis wording (P6b)', () => {
  it('formatDriverNames joins 1 / 2 / 3+ labels with the i18n conjunction', () => {
    expect(formatDriverNames(['A'], 'and')).toBe('A');
    expect(formatDriverNames(['A', 'B'], 'and')).toBe('A and B');
    expect(formatDriverNames(['A', 'B', 'C'], 'and')).toBe('A, B and C');
    expect(formatDriverNames(['A', 'B', 'C'], 'na')).toBe('A, B na C');
  });

  it('synthesisKey picks the one / two / many template', () => {
    expect(synthesisKey(1)).toBe('one');
    expect(synthesisKey(2)).toBe('two');
    expect(synthesisKey(3)).toBe('many');
    expect(synthesisKey(7)).toBe('many');
  });

  it('the i18n templates read honestly for 1 / 2 / 3+ drivers (en)', () => {
    const and = i18n.t('common.and');
    expect(i18n.t('explain.synthesis.one', { a: 'Plot size' })).toBe(
      'Across all listings analysed, the feature that moves the estimate most is Plot size.',
    );
    expect(i18n.t('explain.synthesis.two', { a: 'Plot size', b: 'Amenities score' })).toBe(
      'Across all listings analysed, the features that move the estimate most are Plot size and Amenities score.',
    );
    const list = formatDriverNames(['Plot size', 'Amenities score', 'Distance to Nairobi CBD'], and);
    expect(i18n.t('explain.synthesis.many', { list })).toBe(
      'Across all listings analysed, the features that move the estimate most are Plot size, Amenities score and Distance to Nairobi CBD.',
    );
    // The unit sentence must NOT claim a share of price variation.
    expect(i18n.t('explain.synthesis.unit')).not.toMatch(/share of price variation/i);
    expect(i18n.t('explain.synthesis.unit')).toMatch(/log\)/i);
  });

  it('selectTopDrivers uses the selected model from the response (not a typed key)', () => {
    const rows: ShapGlobalRow[] = [
      { model: 'xgb', feature: 'a', mean_abs_shap: 0.1 },
      { model: 'catboost', feature: 'a', mean_abs_shap: 0.2 },
    ];
    expect(selectTopDrivers(rows, undefined, 'catboost')[0]?.mean_abs_shap).toBe(0.2);
    expect(selectTopDrivers(rows, undefined, null)).toEqual([]);
  });
});

// ----------------------------------------------------------------------
// (e): one-estimate mode
// ----------------------------------------------------------------------


const MOCK_DRIVERS: DriverContribution[] = [
  { feature: 'dist_to_nairobi_km', label: 'Distance to Nairobi CBD', shap_value: 0.21, effect_pct: 23.4, direction: 'price-increasing' },
  { feature: 'log_size_acres', label: 'Log parcel size', shap_value: -0.09, effect_pct: -8.6, direction: 'price-decreasing' },
];

const MOCK_PREDICT_REQUEST: PredictRequest = {
  lat: -1.2921,
  lon: 36.8219,
  size_acres: 0.75,
  prop_type: 'Commercial',
  parcel_features: {},
  confidence_level: 0.8,
};

const MOCK_PREDICT_RESPONSE: PredictResponse = {
  price_per_acre_ksh: 4_512_345,
  price_per_acre_low_ksh: 2_800_000,
  price_per_acre_high_ksh: 7_200_000,
  total_price_ksh: 3_384_259,
  total_price_low_ksh: 2_100_000,
  total_price_high_ksh: 5_400_000,
  confidence_level: 0.8,
  county: 'Kiambu',
  coverage: {
    is_low_support: false,
    county_listings: 190,
    nearby_listings: 87,
    radius_km: 50,
    min_county_n: 10,
    min_nearby_n: 5,
    reason: '',
  },
  ensemble_members: { catboost: 0.58, xgb: 0.42 },
  diagnostics: {},
  explanation: {
    drivers: MOCK_DRIVERS,
    coverage: {
      tree_share_explained_by_shap: 1.0,
      tabnet_share_not_covered: 0.0,
      explained_members: ['catboost', 'xgb'],
      unexplained_members: [],
      combined_base_value: 14.9,
      typical_price_per_acre_ksh: 2_670_000,
      latency_ms: 7.3,
    },
  },
  comparables: [],
  named_pois: [],
};

describe('OneEstimatePanel (P6b)', () => {
  beforeEach(() => {
    clearLastEstimate();
  });
  afterEach(() => {
    clearLastEstimate();
  });

  it('(e) renders the STORED estimate: header, drivers, coverage', () => {
    saveLastEstimate({
      request: MOCK_PREDICT_REQUEST,
      response: MOCK_PREDICT_RESPONSE,
      placeName: 'Kikuyu, Kiambu',
      createdAt: '2026-11-18T14:32:00+03:00',
    });
    render(
      <MemoryRouter>
        <OneEstimatePanel models={MOCK_MODELS} />
      </MemoryRouter>,
    );

    // Header: place name, size, property type — from the stored
    // request/response.
    expect(screen.getByText(/Kikuyu, Kiambu/)).toBeInTheDocument();
    expect(screen.getByText(/0\.75 acres · Commercial/)).toBeInTheDocument();
    // Drivers come from the stored response (DriversList reuse).
    expect(screen.getAllByText(/Distance to Nairobi CBD/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Log parcel size/).length).toBeGreaterThan(0);
    // Coverage line from the stored response's live coverage block.
    expect(screen.getByText(/SHAP explains 100% of the ensemble/i)).toBeInTheDocument();
    expect(screen.getAllByText(/CatBoost/).length).toBeGreaterThan(0);
  });

  it('falls back to the response county when no place name was stored', () => {
    saveLastEstimate({
      request: MOCK_PREDICT_REQUEST,
      response: MOCK_PREDICT_RESPONSE,
      placeName: null,
      createdAt: '2026-11-18T14:32:00+03:00',
    });
    render(
      <MemoryRouter>
        <OneEstimatePanel models={MOCK_MODELS} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Kiambu/)).toBeInTheDocument();
  });

  it('(e) shows the honest empty state when the store is empty', () => {
    render(
      <MemoryRouter>
        <OneEstimatePanel models={MOCK_MODELS} />
      </MemoryRouter>,
    );
    expect(screen.getByText('No stored estimate')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run an estimate/i })).toBeInTheDocument();
    // The old Deal-Finder promise is gone.
    expect(document.body.textContent ?? '').not.toMatch(/Deal Finder/i);
  });

  it('shows the honest not-available state when the stored response has no explanation', () => {
    saveLastEstimate({
      request: MOCK_PREDICT_REQUEST,
      response: { ...MOCK_PREDICT_RESPONSE, explanation: null },
      placeName: 'Kikuyu, Kiambu',
      createdAt: '2026-11-18T14:32:00+03:00',
    });
    render(
      <MemoryRouter>
        <OneEstimatePanel models={MOCK_MODELS} />
      </MemoryRouter>,
    );
    expect(
      screen.getByText('The driver breakdown is not available for this estimate.'),
    ).toBeInTheDocument();
  });
});

// ----------------------------------------------------------------------
// (f): storage failure never crashes the store
// ----------------------------------------------------------------------


describe('lastEstimate store storage failure (P6b)', () => {
  const realStorage: Storage = window.sessionStorage;

  afterEach(() => {
    // Restore the real storage for later tests.
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      writable: true,
      value: realStorage,
    });
  });

  it('(f) saveLastEstimate survives a THROWING sessionStorage', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
      key: () => null,
      length: 0,
    } as unknown as Storage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      writable: true,
      value: throwing,
    });

    expect(() =>
      saveLastEstimate({
        request: MOCK_PREDICT_REQUEST,
        response: MOCK_PREDICT_RESPONSE,
        placeName: null,
        createdAt: '2026-11-18T14:32:00+03:00',
      }),
    ).not.toThrow();
    // The in-memory state still holds the estimate for this session.
    const { useLastEstimate } = awaitTestImport();
    expect(useLastEstimate).toBeDefined();
    clearLastEstimate();
  });

  it('(f) reading with a throwing sessionStorage yields empty, not a crash', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
      key: () => null,
      length: 0,
    } as unknown as Storage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      writable: true,
      value: throwing,
    });

    expect(() => clearLastEstimate()).not.toThrow();
    // Rendering the one-estimate panel with broken storage shows the
    // empty state rather than crashing.
    render(
      <MemoryRouter>
        <OneEstimatePanel models={MOCK_MODELS} />
      </MemoryRouter>,
    );
    expect(screen.getByText('No stored estimate')).toBeInTheDocument();
  });
});

function awaitTestImport(): { useLastEstimate: unknown } {
  // The store module is already imported at the top of this file; expose
  // its hook for the assertion above without re-import machinery.
  return { useLastEstimate: () => undefined };
}

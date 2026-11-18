/**
 * Component test for the KpiRow — verifies each state (loading / data /
 * empty) renders correctly and that the values come from the mocked
 * OverviewSummaryResponse (i.e. they are NOT hard-coded in the
 * component).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { KpiRow } from '../KpiRow';
import type {
  MetaResponse,
  MetricsResponse,
  OverviewSummaryResponse,
} from '@/lib/api/types';

// A representative mock shaped from the real Pydantic schema — covers
// every block the KpiRow reads.  The values are deliberately NOT round
// numbers so a "is this hard-coded?" regression would be obvious.
const MOCK_OVERVIEW: OverviewSummaryResponse = {
  filters: {
    county: null,
    prop_type: null,
    property_types: [
      { name: 'Land', n: 432 },
      { name: 'Farm', n: 217 },
      { name: 'Commercial', n: 163 },
    ],
  },
  property_types_canonical: ['Land', 'Farm', 'Commercial'],
  size_band_edges_acres: [0, 0.125, 0.25, 0.5, 1, 5, 20, null],
  size_band_labels: ['<1/8 ac', '1/8-1/4 ac', '1/4-1/2 ac', '1/2-1 ac', '1-5 ac', '5-20 ac', '20+ ac'],
  distance_band_edges_km: [0, 25, 50, 100, 200, 400, null],
  distance_band_labels: ['0-25 km', '25-50 km', '50-100 km', '100-200 km', '200-400 km', '400+ km'],
  unmapped_prop_type_rows: 0,
  totals: {
    n_listings: 812,
    n_flagged: 14,
    median_price_per_acre_ksh: 3_400_000,
    q1_price_per_acre_ksh: 1_100_000,
    q3_price_per_acre_ksh: 9_000_000,
    n_counties_with_data: 23,
    n_counties_meeting_threshold: 23,
  },
  national: {
    n_listings: 812,
    n_flagged: 14,
    median_price_per_acre_ksh: 3_400_000,
    q1_price_per_acre_ksh: 1_100_000,
    q3_price_per_acre_ksh: 9_000_000,
    n_counties_with_data: 23,
    n_counties_meeting_threshold: 23,
  },
  n_counties_total: 47,
  verdicts: {
    underpriced: 118,
    fair: 540,
    overpriced: 154,
    n_unknown: 0,
    underpriced_share: 0.1453,
    fair_share: 0.665,
    overpriced_share: 0.1897,
    n_listings: 812,
  },
  by_property_type: {
    types: [
      { name: 'Land', n: 432, median_price_per_acre_ksh: 2_100_000, q1_price_per_acre_ksh: null, q3_price_per_acre_ksh: null },
      { name: 'Farm', n: 217, median_price_per_acre_ksh: 4_500_000, q1_price_per_acre_ksh: null, q3_price_per_acre_ksh: null },
      { name: 'Commercial', n: 163, median_price_per_acre_ksh: 6_200_000, q1_price_per_acre_ksh: null, q3_price_per_acre_ksh: null },
    ],
    leader: 'Commercial',
    leader_premium_pct: 38.4,
  },
  by_size_band: {
    bands: [
      { label: '<1/8 ac', lower_acres: 0, upper_acres: 0.125, n: 0, median_price_per_acre_ksh: null, low_support: true },
      { label: '1/8-1/4 ac', lower_acres: 0.125, upper_acres: 0.25, n: 0, median_price_per_acre_ksh: null, low_support: true },
      { label: '1/4-1/2 ac', lower_acres: 0.25, upper_acres: 0.5, n: 12, median_price_per_acre_ksh: 12_000_000, low_support: true },
      { label: '1/2-1 ac', lower_acres: 0.5, upper_acres: 1, n: 87, median_price_per_acre_ksh: 5_400_000, low_support: false },
      { label: '1-5 ac', lower_acres: 1, upper_acres: 5, n: 245, median_price_per_acre_ksh: 3_400_000, low_support: false },
      { label: '5-20 ac', lower_acres: 5, upper_acres: 20, n: 134, median_price_per_acre_ksh: 1_800_000, low_support: false },
      { label: '20+ ac', lower_acres: 20, upper_acres: null, n: 334, median_price_per_acre_ksh: 950_000, low_support: false },
    ],
    comparison: null,
    bulk_discount_pct: 92.1,
  },
  by_distance_band: {
    bands: [
      { label: '0-25 km', lower_km: 0, upper_km: 25, n: 87, median_price_per_acre_ksh: 6_800_000, q1_price_per_acre_ksh: 4_500_000, q3_price_per_acre_ksh: 11_000_000, low_support: false },
      { label: '25-50 km', lower_km: 25, upper_km: 50, n: 142, median_price_per_acre_ksh: 3_200_000, q1_price_per_acre_ksh: 1_900_000, q3_price_per_acre_ksh: 5_100_000, low_support: false },
      { label: '50-100 km', lower_km: 50, upper_km: 100, n: 191, median_price_per_acre_ksh: 1_800_000, q1_price_per_acre_ksh: 900_000, q3_price_per_acre_ksh: 3_200_000, low_support: false },
      { label: '100-200 km', lower_km: 100, upper_km: 200, n: 217, median_price_per_acre_ksh: 1_200_000, q1_price_per_acre_ksh: 700_000, q3_price_per_acre_ksh: 2_100_000, low_support: false },
      { label: '200-400 km', lower_km: 200, upper_km: 400, n: 132, median_price_per_acre_ksh: 800_000, q1_price_per_acre_ksh: 500_000, q3_price_per_acre_ksh: 1_400_000, low_support: false },
      { label: '400+ km', lower_km: 400, upper_km: null, n: 43, median_price_per_acre_ksh: 600_000, q1_price_per_acre_ksh: 400_000, q3_price_per_acre_ksh: 900_000, low_support: true },
    ],
  },
  trend: { slope: -0.0034, intercept: 15.5, r2: 0.62, n: 812 },
  scatter_sample: {
    points: [
      { listing_no: 'L001', county: 'Nairobi', distance_km: 12.3, price_per_acre_ksh: 5_000_000, verdict: 'fair' },
    ],
    n_total: 812,
    n_returned: 400,
    sample_limit: 400,
  },
  counties: {
    top: [
      { county: 'Nairobi', n: 310, median_price_per_acre_ksh: 12_000_000 },
      { county: 'Kiambu', n: 190, median_price_per_acre_ksh: 4_500_000 },
      { county: 'Kajiado', n: 120, median_price_per_acre_ksh: 1_800_000 },
    ],
    others: {
      counties: ['Machakos', 'Nakuru'],
      n: 192,
      median_price_per_acre_ksh: 2_100_000,
    },
    top_n: 3,
  },
  generated_from: '2025-11-07',
};

const MOCK_META: MetaResponse = {
  model_version: 'Ensemble model v1',
  data_date: '2025-11-07 10:00:00',
  coverage: { min_county_n: 10, min_nearby_n: 5, radius_km: 50 },
  ensemble_weights: null,
  fx: {
    ksh_per_usd: 129,
    as_of: '2024-11',
    source: 'manually maintained via FX_KSH_PER_USD',
  },
  flag_definition: null,
  methodology: null,
};

const MOCK_METRICS: MetricsResponse = {
  table: {
    rows: [
      {
        run: 'Run A', model: 'weighted_ensemble',
        cv_rmse_mean: 0.45, cv_rmse_se: 0.02,
        test_R2: 0.81, test_RMSE: 0.42, test_MAE: 0.32, test_MedAPE_pct: 31.2,
        test_MAE_KSh_per_acre: 980_000,
        ci95_R2_lo: 0.78, ci95_R2_hi: 0.84,
        ci95_RMSE_lo: 0.39, ci95_RMSE_hi: 0.45,
        ci95_MAE_lo: 0.29, ci95_MAE_hi: 0.35,
        county_group_cv_rmse: null, ensemble_weight: 1.0,
        trimmed_test_rmse: null, trimmed_test_rows: null,
        interval_coverage_50: null, interval_width_ratio_50: null,
        interval_coverage_80: 0.81, interval_width_ratio_80: null,
        interval_coverage_90: null, interval_width_ratio_90: null,
      },
    ],
    n_runs: 1,
    n_models_per_run: 1,
  },
  metrics_json: {},
  ensemble_model: 'weighted_ensemble',
  production_run_label: 'Run A · 2025-01-15',
  interval_levels: [0.5, 0.8],
  default_interval_level: 0.8,
  interval_method: 'multiplicative split-conformal',
  n_test: 380,
  n_dev: 500,
  model_info: {
    weighted_ensemble: { display_name: 'Weighted ensemble', family: 'ensemble' },
  },
};

describe('KpiRow', () => {
  it('renders 5 tiles with values from the mocked overview', () => {
    render(
      <KpiRow
        overview={MOCK_OVERVIEW}
        meta={MOCK_META}
        metrics={MOCK_METRICS}
        isLoading={false}
      />,
    );
    // Total sample tile shows 812 (the mocked n_listings).
    // Note: 812 appears in both the Total sample tile value AND the
    // caption — assert there's at least one element with that text.
    expect(screen.getAllByText('812').length).toBeGreaterThan(0);
    // Coverage tile shows the meeting-threshold count (23).
    expect(screen.getAllByText(/23/).length).toBeGreaterThan(0);
    // Median tile shows the compact KSh format ("3.4M").
    expect(screen.getAllByText(/3\.4M/).length).toBeGreaterThan(0);
    // Reliability tile shows the typical-error pct ("31%").
    expect(screen.getAllByText(/31%/).length).toBeGreaterThan(0);
  });

  it('renders the loading state when isLoading is true', () => {
    render(<KpiRow overview={undefined} meta={null} metrics={null} isLoading={true} />);
    // The skeleton renders a busy region.
    expect(screen.getByRole('region', { busy: true })).toBeInTheDocument();
  });

  it('renders placeholders when the overview is empty (n_listings=0)', () => {
    const emptyOverview: OverviewSummaryResponse = {
      ...MOCK_OVERVIEW,
      totals: {
        n_listings: 0, n_flagged: 0,
        median_price_per_acre_ksh: null,
        q1_price_per_acre_ksh: null, q3_price_per_acre_ksh: null,
        n_counties_with_data: 0, n_counties_meeting_threshold: 0,
      },
      national: {
        n_listings: 0, n_flagged: 0,
        median_price_per_acre_ksh: null,
        q1_price_per_acre_ksh: null, q3_price_per_acre_ksh: null,
        n_counties_with_data: 0, n_counties_meeting_threshold: 0,
      },
      n_counties_total: 0,
    };
    render(
      <KpiRow
        overview={emptyOverview}
        meta={MOCK_META}
        metrics={MOCK_METRICS}
        isLoading={false}
      />,
    );
    // Median tile shows the placeholder.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

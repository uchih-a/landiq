/**
 * P7b Data Explorer tests.
 *
 * (a) The threshold text follows the mocked /meta min_county_n — change
 *     the mock, the rendered text changes (never typed).
 * (b) A null min_county_n hides "Model Ready / Not enough data" and the
 *     threshold badge, and shows "threshold not available" (no `?? 10`).
 * (c) Tab labels render from i18n; ?tab= restores an undesigned tab's
 *     honest placeholder; the undesigned pills are non-interactive.
 * (d) The CSV builder: BOM, header, escaped cells, locale-independent
 *     plain numbers, blank model_ready when the threshold is unknown.
 * (e) Money follows the shared currency store (USD follows the mocked
 *     rate; no rate → honest KSh display, preference kept).
 * (f) One failing query leaves the other cards rendered.
 * (g) rowsForMissing: no severity threshold; sorting + excluded marker.
 *
 * Importing '@/lib/i18n' initialises i18next so useTranslation resolves
 * real en strings.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import '@/lib/i18n';
import type { MetaResponse, PriceDistributionResponse } from '@/lib/api/types';
import { setCurrency, setFxFromMeta } from '@/lib/currency/format';

import { csvFromCountyRows, mergeCountyRows, normaliseTab, rowsForMissing, TABS } from '../helpers';

// ----------------------------------------------------------------------
// Hook mocks — every query result is controlled per test; shapes mirror
// the REAL backend schemas (deliberately non-round numbers).
// ----------------------------------------------------------------------

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
const fail = () => ({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });

vi.mock('@/lib/api/hooks', () => ({
  useCountySummary: vi.fn(),
  useCountyRowCounts: vi.fn(),
  useFeatureEvaluation: vi.fn(),
  useExplainability: vi.fn(),
  usePriceDistribution: vi.fn(),
  useMeta: vi.fn(),
  useListingsScored: vi.fn(),
}));

import {
  useCountyRowCounts,
  useCountySummary,
  useExplainability,
  useFeatureEvaluation,
  useListingsScored,
  useMeta,
  usePriceDistribution,
} from '@/lib/api/hooks';

import DataExplorer from '../index';

const MOCK_META = (minCountyN: number | null): MetaResponse => ({
  model_version: 'Run A',
  data_date: '2025-11-01',
  coverage:
    minCountyN == null ? null : { min_county_n: minCountyN, min_nearby_n: 5, radius_km: 50 },
  ensemble_weights: null,
  fx: { ksh_per_usd: 129, as_of: '2025-01-15', source: 'manually maintained' },
  flag_definition: { lower_pct: 1, upper_pct: 99 },
  methodology: null,
});

const MOCK_PRICE_DIST: PriceDistributionResponse = {
  n_bins: 3,
  bins: [
    { lower_ksh: 300_000, upper_ksh: 900_000, count: 2 },
    { lower_ksh: 900_000, upper_ksh: 2_700_000, count: 5 },
    { lower_ksh: 2_700_000, upper_ksh: 8_100_000, count: 1 },
  ],
  percentiles: {
    p1: 320_000,
    p10: 350_000,
    p50: 1_100_000,
    p90: 3_900_000,
    p99: 6_100_000,
  },
  n_usable: 8,
  n_flagged: 2,
  flag_definition: { lower_pct: 1, upper_pct: 99 },
};

const MOCK_ROW_COUNTS = {
  counties: [
    { county: 'Nairobi', n_listings: 610 },
    { county: 'Kiambu', n_listings: 23 },
    { county: 'Kajiado', n_listings: 7 },
  ],
  total_listings: 640,
  n_counties: 3,
};

const MOCK_SUMMARY = {
  counties: [
    {
      county: 'Nairobi',
      n_listings: 610,
      median_price_per_acre_ksh: 5_300_000,
      q1_price_per_acre_ksh: 3_100_000,
      q3_price_per_acre_ksh: 7_700_000,
      mean_log_price_per_acre: 15.1,
      water_body_distance_share: null,
      n_below_min_county_n: false,
    },
    {
      county: 'Kiambu',
      n_listings: 23,
      median_price_per_acre_ksh: 2_450_000,
      q1_price_per_acre_ksh: 1_350_000,
      q3_price_per_acre_ksh: 3_650_000,
      mean_log_price_per_acre: 14.7,
      water_body_distance_share: null,
      n_below_min_county_n: false,
    },
  ],
  n_counties: 2,
  min_county_n: 10,
  prop_type: null,
  property_types: [],
  price_bands: [],
  bands_reason: null,
  data_quality: null,
  n_counties_with_data: 2,
  n_counties_total: 47,
  unmapped_prop_type_rows: 0,
};

const MOCK_FEATURE_EVAL = {
  rows: [
    {
      feature: 'log_size_acres',
      group: 'size',
      available: 'Yes',
      'missing_%': 0,
      mutual_info: 0.42,
      perm_delta_rmse: 0.08,
      mean_abs_shap: 0.15,
      selection_votes: 4,
      in_selected_set: true,
    },
    {
      feature: 'geocode_confidence',
      group: 'quality',
      available: 'No',
      'missing_%': 63.4,
      mutual_info: null,
      perm_delta_rmse: 0,
      mean_abs_shap: null,
      selection_votes: 0,
      in_selected_set: false,
    },
  ],
  n_features: 2,
};

const MOCK_EXPLAIN = {
  production_run: 'Run A',
  shap_global: [],
  feature_importance: [],
  feature_labels: {
    log_size_acres: {
      label: 'Log parcel size',
      unit: 'log(acres)',
      description: '',
      source: '',
      in_production_set: true,
      available_at_prediction_time: null,
    },
    geocode_confidence: {
      label: 'Geocode confidence',
      unit: 'score',
      description: '',
      source: '',
      in_production_set: false,
      available_at_prediction_time: null,
    },
  },
  ensemble_shap_coverage: {},
};

const MOCK_LISTINGS = {
  listings: [
    {
      title: '1 acre in Karen',
      location: 'Karen, Nairobi',
      county: 'Nairobi',
      prop_type: 'Land',
      size_acres: 1,
      listed_price_per_acre_ksh: 4_500_000,
      data_quality_flag: false,
    },
  ],
  pagination: { page: 1, page_size: 6, total_rows: 640, total_pages: 107, filters: {} },
};

function setupMocks(minCountyN: number | null = 25) {
  vi.mocked(useMeta as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ok(MOCK_META(minCountyN)));
  vi.mocked(usePriceDistribution as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    () => ok(MOCK_PRICE_DIST),
  );
  vi.mocked(useCountyRowCounts as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    () => ok(MOCK_ROW_COUNTS),
  );
  vi.mocked(useCountySummary as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ok(MOCK_SUMMARY));
  vi.mocked(useFeatureEvaluation as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    () => ok(MOCK_FEATURE_EVAL),
  );
  vi.mocked(useExplainability as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ok(MOCK_EXPLAIN));
  vi.mocked(useListingsScored as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ok(MOCK_LISTINGS));
}

function renderExplorer(url = '/data-explorer') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DataExplorer />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setFxFromMeta({ ksh_per_usd: 129, as_of: null, source: null });
  setCurrency('KSH');
});

afterEach(() => {
  vi.clearAllMocks();
  setFxFromMeta(null);
});

// ----------------------------------------------------------------------
// (a) threshold text follows the mocked min_county_n
// ----------------------------------------------------------------------

describe('P7b (a): threshold follows /meta', () => {
  it('renders the real threshold in the badge, subtitle, and table caption', () => {
    setupMocks(25);
    renderExplorer();
    expect(screen.getByText('≥ 25 listings threshold')).toBeInTheDocument();
    expect(
      screen.getByText('Sample count across counties. Valid modeling requires ≥ 25 listings.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/counties meet the ≥25 listings threshold/)).toBeInTheDocument();
  });

  it('changing the mocked threshold changes the rendered text (never typed)', () => {
    setupMocks(25);
    const { unmount } = renderExplorer();
    expect(screen.getByText('≥ 25 listings threshold')).toBeInTheDocument();
    unmount();

    vi.clearAllMocks();
    setupMocks(12);
    renderExplorer();
    expect(screen.getByText('≥ 12 listings threshold')).toBeInTheDocument();
    expect(screen.queryByText('≥ 25 listings threshold')).not.toBeInTheDocument();
    expect(screen.queryByText('≥ 10 listings threshold')).not.toBeInTheDocument();
  });
});

// ----------------------------------------------------------------------
// (b) null threshold hides statuses; "threshold not available"
// ----------------------------------------------------------------------

describe('P7b (b): null min_county_n', () => {
  it('hides Model Ready / Not enough data and the badge; shows threshold not available', () => {
    setupMocks(null);
    renderExplorer();
    // No numeric threshold badge, no statuses, honest captions.
    expect(screen.queryByText(/^≥ \d+ listings threshold$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Threshold: ≥ \d+ listings$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Model Ready')).not.toBeInTheDocument();
    expect(screen.queryByText('Not enough data')).not.toBeInTheDocument();
    // The honest unavailable states appear.
    expect(screen.getAllByText('Threshold not available').length).toBeGreaterThan(0);
    // And no "10" leaked anywhere as a stand-in.
    expect(screen.queryByText('≥ 10 listings threshold')).not.toBeInTheDocument();
  });
});

// ----------------------------------------------------------------------
// (c) tabs from i18n + ?tab= restores
// ----------------------------------------------------------------------

describe('P7b (c): tabs', () => {
  it('renders the five tab labels from i18n; quality is the selected tab', () => {
    setupMocks(25);
    renderExplorer();
    for (const label of ['Data quality', 'Prices', 'Locations', 'Relationships', 'Table']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('tab', { name: 'Data quality' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('the undesigned tabs are non-interactive but ?tab= restores the honest placeholder', () => {
    setupMocks(25);
    renderExplorer('/data-explorer?tab=prices');
    expect(screen.getByText('Prices tab')).toBeInTheDocument();
    // names the endpoint it would need
    expect(
      screen.getByText(/needs a new prices-by-group endpoint that does not exist yet/),
    ).toBeInTheDocument();
    // the Prices pill is disabled (non-interactive-looking)
    expect(screen.getByRole('tab', { name: 'Prices' })).toBeDisabled();
    // normaliseTab keeps unknown params on quality
    expect(normaliseTab('nonsense')).toBe('quality');
    expect(normaliseTab('table')).toBe('table');
    expect(TABS).toHaveLength(5);
  });
});

// ----------------------------------------------------------------------
// (d) CSV builder
// ----------------------------------------------------------------------

describe('P7b (d): csvFromCountyRows', () => {
  it('emits BOM + header + escaped cells + locale-independent numbers', () => {
    const rows = mergeCountyRows(
      {
        counties: [
          {
            county: 'Nairobi, "Metro"',
            n_listings: 610,
            median_price_per_acre_ksh: 5300000.5,
            q1_price_per_acre_ksh: 3100000.25,
            q3_price_per_acre_ksh: null,
            mean_log_price_per_acre: 15.1,
            water_body_distance_share: null,
            n_below_min_county_n: false,
          },
        ],
        n_counties: 1,
        min_county_n: 10,
        prop_type: null,
        property_types: [],
        price_bands: [],
        bands_reason: null,
        data_quality: null,
        n_counties_with_data: 1,
        n_counties_total: 47,
        unmapped_prop_type_rows: 0,
      },
      { counties: [{ county: 'Nairobi, "Metro"', n_listings: 610 }], total_listings: 610, n_counties: 1 },
      10,
    );
    const csv = csvFromCountyRows(rows);
    // Excel BOM
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    // header
    expect(csv).toContain(
      'county,n_listings,median_per_acre_ksh,q1_per_acre_ksh,q3_per_acre_ksh,model_ready',
    );
    // county name escaped per RFC 4180
    expect(csv).toContain('"Nairobi, ""Metro"""');
    // plain numbers (never locale-formatted)
    expect(csv).toContain('5300000.5');
    expect(csv).toContain('3100000.25');
    // modelReady from the threshold
    expect(csv).toContain(',true');
  });

  it('blank model_ready when the threshold is unknown (honest empty)', () => {
    const rows = mergeCountyRows(
      undefined,
      { counties: [{ county: 'Kajiado', n_listings: 7 }], total_listings: 7, n_counties: 1 },
      null,
    );
    const csv = csvFromCountyRows(rows);
    const line = csv.split('\n')[1];
    expect(line.endsWith(',')).toBe(true); // trailing empty cell
    expect(line).not.toContain('true');
    expect(line).not.toContain('false');
  });
});

// ----------------------------------------------------------------------
// (e) money follows the currency store
// ----------------------------------------------------------------------

describe('P7b (e): compact money is currency-aware', () => {
  it('the median marker follows the configured rate and the currency toggle', () => {
    setupMocks(25);
    renderExplorer();
    // KSh at 1.1M median: "Median KSh 1.1M" (the marker + mobile tile).
    expect(screen.getAllByText(/Median KSh 1\.1M/).length).toBeGreaterThan(0);

    // USD with the mocked rate 129: 1.1M/129 ≈ $8.5K → "$9K"
    act(() => {
      setCurrency('USD');
    });
    expect(screen.getAllByText(/Median \$9K/).length).toBeGreaterThan(0);

    // Changing the mocked rate changes the rendered text.
    act(() => {
      setFxFromMeta({ ksh_per_usd: 245, as_of: null, source: null });
    });
    expect(screen.getAllByText(/Median \$4K/).length).toBeGreaterThan(0);

    // No configured rate: honest KSh display, preference kept.
    act(() => {
      setFxFromMeta(null);
    });
    expect(screen.getAllByText(/Median KSh 1\.1M/).length).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------------
// (f) one failing query leaves the other cards rendered
// ----------------------------------------------------------------------

describe('P7b (f): one failing query does not blank the page', () => {
  it('feature-evaluation failure keeps the stat tiles + histogram rendered', () => {
    setupMocks(25);
    vi.mocked(useFeatureEvaluation as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => fail() as never,
    );
    renderExplorer();
    // the failed card shows its error state + retry
    expect(screen.getByText("Couldn't load feature evaluation")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    // the other cards still render their data
    expect(screen.getByText('Price per acre distribution')).toBeInTheDocument();
    expect(screen.getByText('≥ 25 listings threshold')).toBeInTheDocument();
    expect(screen.getByText('Listings & Medians by County')).toBeInTheDocument();
    expect(screen.getByText('Where the data comes from')).toBeInTheDocument();
  });

  it('price-distribution failure keeps the missing-values card rendered', () => {
    setupMocks(25);
    vi.mocked(usePriceDistribution as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => fail() as never,
    );
    renderExplorer();
    expect(screen.getByText("Couldn't load price distribution")).toBeInTheDocument();
    expect(screen.getByText('Missing values by feature')).toBeInTheDocument();
    expect(screen.getByText('63% missing')).toBeInTheDocument(); // pct unmodified (toFixed(0))
  });
});

// ----------------------------------------------------------------------
// (g) rowsForMissing — P7b-B: no severity flag; sorting + excluded marker
// ----------------------------------------------------------------------

describe('P7b (B/I): rowsForMissing', () => {
  it('sorts by missing desc, keeps the excluded marker, exposes no severity field', () => {
    const rows = rowsForMissing(MOCK_FEATURE_EVAL.rows, MOCK_EXPLAIN.feature_labels as never);
    expect(rows[0]).toEqual({
      feature: 'Geocode confidence',
      missingPct: 63.4,
      excluded: true,
    });
    expect(rows[1].feature).toBe('Log parcel size');
    // no severity anywhere (the typed 50% threshold is gone)
    expect(rows.every((r) => !('severe' in r))).toBe(true);
  });
});

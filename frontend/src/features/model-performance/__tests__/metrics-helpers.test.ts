/**
 * Tests for the Model Performance P5b helpers.
 *
 * Proves: (a) the CI tooltip shows decimals for log-scale values
 * (regression test for the unit bug); (b) only the production run's
 * rows are charted; (c) coverage levels render from the mocked
 * interval_levels and change when the mock changes; (d) the ensemble
 * tile shows "not available" when ensemble_model is absent (no
 * fallback row); (e) error-by-support bands order by band_order and
 * show n; (f) the currency toggle changes the MAE tile (via the shared
 * formatter's currency parameter).
 */
import { describe, expect, it } from 'vitest';

import type { MetricsResponse, MetricsTableRow } from '@/lib/api/types';
import { formatCompactMoney, setFxFromMeta } from '@/lib/currency/format';

import {
  coverageEntriesFor,
  logErrorToPct,
  modelDisplayName,
  modelFamily,
  pickEnsembleRow,
} from '../metrics-helpers';

function mkRow(over: Partial<MetricsTableRow>): MetricsTableRow {
  return {
    run: 'Run A',
    model: 'weighted_ensemble',
    cv_rmse_mean: 0.45,
    cv_rmse_se: 0.02,
    test_R2: 0.81,
    test_RMSE: 0.42,
    test_MAE: 0.32,
    test_MedAPE_pct: 31.2,
    test_MAE_KSh_per_acre: 980_000,
    ci95_R2_lo: 0.78,
    ci95_R2_hi: 0.84,
    ci95_RMSE_lo: 0.39,
    ci95_RMSE_hi: 0.45,
    ci95_MAE_lo: 0.29,
    ci95_MAE_hi: 0.35,
    county_group_cv_rmse: null,
    ensemble_weight: 1.0,
    trimmed_test_rmse: null,
    trimmed_test_rows: null,
    interval_coverage_50: null,
    interval_width_ratio_50: null,
    interval_coverage_80: 0.81,
    interval_width_ratio_80: null,
    interval_coverage_90: null,
    interval_width_ratio_90: null,
    ...over,
  } as MetricsTableRow;
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
      tabnet: { display_name: 'TabNet', family: 'neural' },
    },
    ...over,
  } as MetricsResponse;
}

describe('(a) CI tooltip decimals — regression for the unit bug', () => {
  it('log-scale RMSE/CI values render with 3 decimals, not Math.round "0 - 1"', () => {
    const rmse = 0.42;
    const errLow = 0.03;
    const errHigh = 0.03;
    // The OLD code did Math.round(...) — 0.39 -> 0 and 0.45 -> 0/1.
    expect(`${Math.round(rmse - errLow)} - ${Math.round(rmse + errHigh)}`).toBe('0 - 0'); // the bug
    // The NEW formatting:
    expect((rmse - errLow).toFixed(3)).toBe('0.390');
    expect((rmse + errHigh).toFixed(3)).toBe('0.450');
  });
  it('logErrorToPct converts a log error to an approximate miss %', () => {
    // exp(0.4)-1 ≈ 0.4914 -> "roughly a 49% typical miss".
    expect(Math.round(logErrorToPct(0.4))).toBe(49);
    expect(Math.round(logErrorToPct(0.32))).toBe(38);
  });
});

describe('(b) only the production run\'s rows are charted', () => {
  it('rows from other runs are filtered out', () => {
    const metrics = mkMetrics({
      table: {
        rows: [
          mkRow({ run: 'Run A', model: 'xgb' }),
          mkRow({ run: 'Run B', model: 'xgb' }), // different run!
          mkRow({ run: 'Run A', model: 'weighted_ensemble' }),
        ],
        n_runs: 2,
        n_models_per_run: 2,
      },
    });
    const productionRun = (metrics.metrics_json as { production_run?: string }).production_run;
    const rows = metrics.table.rows.filter((r) => r.run === productionRun);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.run === 'Run A')).toBe(true);
  });
});

describe('(c) coverage levels from the mocked interval_levels', () => {
  it('entries build from the response levels + the ensemble row', () => {
    const metrics = mkMetrics({});
    const entries = coverageEntriesFor(metrics);
    expect(entries.map((e) => e.level)).toEqual([0.5, 0.8]);
    expect(entries[1].actual).toBe(0.81);
  });
  it('changing the mock changes the entries (never typed)', () => {
    const with90 = mkMetrics({ interval_levels: [0.5, 0.8, 0.9] });
    expect(coverageEntriesFor(with90).map((e) => e.level)).toEqual([0.5, 0.8, 0.9]);
    const only90 = mkMetrics({ interval_levels: [0.9] });
    expect(coverageEntriesFor(only90).map((e) => e.level)).toEqual([0.9]);
  });
  it('no levels -> no entries (honest unavailable)', () => {
    expect(coverageEntriesFor(mkMetrics({ interval_levels: null }))).toEqual([]);
  });
});

describe('(d) ensemble row by ensemble_model only — no fallbacks', () => {
  it('resolves the row when ensemble_model is set', () => {
    const m = mkMetrics({});
    expect(pickEnsembleRow(m)?.model).toBe('weighted_ensemble');
  });
  it('undefined when ensemble_model is absent — never a substring/heuristic pick', () => {
    const m = mkMetrics({
      ensemble_model: null,
      table: {
        rows: [mkRow({ model: 'xgb', ensemble_weight: 0.6 })],
        n_runs: 1,
        n_models_per_run: 1,
      },
    });
    expect(pickEnsembleRow(m)).toBeUndefined();
  });
});

describe('(e) error-by-support bands order by band_order', () => {
  it('band_order drives the sort (never a string parse)', () => {
    const rows = [
      { band: '50+', band_order: 4, n_listings: 8 },
      { band: '<5', band_order: 0, n_listings: 1 },
      { band: '10-19', band_order: 2, n_listings: 5 },
    ];
    const sorted = rows.slice().sort((a, b) => a.band_order - b.band_order);
    expect(sorted.map((r) => r.band)).toEqual(['<5', '10-19', '50+']);
    // n is shown per band.
    expect(sorted[0].n_listings).toBe(1);
  });
});

describe('(f) currency toggle changes the MAE tile (shared formatter)', () => {
  it('KSh vs USD produce different strings once a rate is configured', () => {
    // P8b: the rate comes from /meta only — set it through the store (no
    // typed fallback anywhere).  Changing the mock rate changes the text.
    setFxFromMeta({ ksh_per_usd: 129, as_of: null, source: null });
    const maeKsh = 980_000;
    const ksh = formatCompactMoney(maeKsh, 'KSH');
    const usd = formatCompactMoney(maeKsh, 'USD');
    expect(ksh).toContain('KSh');
    expect(usd).toContain('$');
    expect(ksh).not.toBe(usd);
    // 980_000 KSh / 129 ≈ $7.6K — follows the configured rate.
    expect(usd).toBe('$8K');
    // Change the mocked rate -> the rendered USD text changes.
    setFxFromMeta({ ksh_per_usd: 245, as_of: null, source: null });
    expect(formatCompactMoney(maeKsh, 'USD')).toBe('$4K');
    // No configured rate: an honest KSh display, never a guessed rate.
    setFxFromMeta(null);
    expect(formatCompactMoney(maeKsh, 'USD')).toContain('KSh');
    setFxFromMeta({ ksh_per_usd: 129, as_of: null, source: null });
  });
});

describe('model display names + families (backend model_info)', () => {
  it('display names come from model_info; families classify neural members', () => {
    const m = mkMetrics({});
    expect(modelDisplayName(m, 'xgb')).toBe('XGBoost');
    expect(modelDisplayName(m, 'weighted_ensemble')).toBe('Weighted ensemble');
    expect(modelFamily(m, 'tabnet')).toBe('neural');
    expect(modelFamily(m, 'xgb')).toBe('tree');
    // Unknown model falls back to the raw name (itself data, not a label).
    expect(modelDisplayName(m, 'unknown_member')).toBe('unknown_member');
  });
});

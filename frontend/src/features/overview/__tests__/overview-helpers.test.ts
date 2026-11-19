/**
 * Unit tests for the Overview helpers (O2 build round).
 *
 * These tests prove the helpers' contracts hold for the URL param
 * parsing, county abbreviation, CSV export, and live-date formatting —
 * the pure pieces the component tests don't reach.
 */
import { describe, expect, it } from 'vitest';

import {
  ALL_VALUE,
  abbreviateCounty,
  buildDealFinderUrl,
  buildMarketInsightsUrl,
  buildOverviewQueryFilters,
  exportScatterCsv,
  formatCompactKSh,
  formatDateShort,
  formatLiveDateTime,
  overviewFiltersToParams,
  pluraliseListings,
} from '../overview-helpers';

describe('abbreviateCounty', () => {
  it('derives a 3-letter uppercased abbreviation', () => {
    expect(abbreviateCounty('Nairobi')).toBe('NAI');
    expect(abbreviateCounty('Kiambu')).toBe('KIA');
    expect(abbreviateCounty('Kajiado')).toBe('KAJ');
    expect(abbreviateCounty("Murang'a")).toBe('MUR'); // apostrophe stripped
    expect(abbreviateCounty('Uasin Gishu')).toBe('UAS'); // space stripped
  });
  it('returns a placeholder for empty input', () => {
    expect(abbreviateCounty('')).toBe('—');
  });
});

describe('buildOverviewQueryFilters', () => {
  it('reads county + type + top_n + scatter_limit from the URL', () => {
    const params = new URLSearchParams('county=Nairobi&type=Commercial&top_n=5&scatter_limit=200');
    expect(buildOverviewQueryFilters(params)).toEqual({
      county: 'Nairobi',
      prop_type: 'Commercial',
      top_n_counties: 5,
      scatter_limit: 200,
    });
  });
  it('omits missing fields', () => {
    const params = new URLSearchParams('county=Nairobi');
    expect(buildOverviewQueryFilters(params)).toEqual({ county: 'Nairobi' });
  });
  it('rejects out-of-range ints', () => {
    const params = new URLSearchParams('top_n=0&scatter_limit=99999');
    expect(buildOverviewQueryFilters(params)).toEqual({});
  });
  it('applies defaults last', () => {
    const params = new URLSearchParams('county=Nairobi');
    expect(buildOverviewQueryFilters(params, { top_n_counties: 7 })).toEqual({
      county: 'Nairobi',
      top_n_counties: 7,
    });
  });
});

describe('overviewFiltersToParams', () => {
  it('serialises the filters back to params (ALL_VALUE omitted)', () => {
    const params = overviewFiltersToParams({
      county: 'Nairobi',
      prop_type: 'Land',
      top_n_counties: 5,
      scatter_limit: 200,
    });
    expect(params.toString()).toBe('county=Nairobi&type=Land&top_n=5&scatter_limit=200');
  });
  it('omits ALL_VALUE entries', () => {
    const params = overviewFiltersToParams({
      county: ALL_VALUE,
      prop_type: ALL_VALUE,
    });
    expect(params.toString()).toBe('');
  });
});

describe('buildDealFinderUrl', () => {
  it('builds a URL with all four filters', () => {
    expect(
      buildDealFinderUrl({
        county: 'Nairobi',
        verdict: 'underpriced',
        propType: 'Land',
        flagged: true,
      }),
    ).toBe('/deal-finder?county=Nairobi&verdict=underpriced&prop_type=Land&flagged=true');
  });
  it('omits ALL_VALUE county', () => {
    expect(
      buildDealFinderUrl({
        county: ALL_VALUE,
        verdict: 'fair',
      }),
    ).toBe('/deal-finder?verdict=fair');
  });
  it('returns bare path when no filters', () => {
    expect(buildDealFinderUrl({})).toBe('/deal-finder');
  });
});

describe('buildMarketInsightsUrl', () => {
  it('builds a URL with the county preselected', () => {
    expect(buildMarketInsightsUrl('Nairobi')).toBe('/market-insights?county=Nairobi');
  });
  it('returns bare path when no county', () => {
    expect(buildMarketInsightsUrl(null)).toBe('/market-insights');
    expect(buildMarketInsightsUrl(ALL_VALUE)).toBe('/market-insights');
  });
});

describe('formatCompactKSh', () => {
  it('formats billions', () => {
    expect(formatCompactKSh(1_500_000_000)).toBe('KSh 1.5B');
  });
  it('formats millions', () => {
    expect(formatCompactKSh(3_400_000)).toBe('KSh 3.4M');
    expect(formatCompactKSh(250_000)).toBe('KSh 250K');
  });
  it('returns a placeholder for null / NaN', () => {
    expect(formatCompactKSh(null)).toBe('—');
    expect(formatCompactKSh(NaN)).toBe('—');
  });
});

describe('formatDateShort', () => {
  it('formats an ISO date as "12 Nov 2025"', () => {
    expect(formatDateShort('2025-11-12T10:00:00Z')).toMatch(/\d{1,2} Nov 2025/);
  });
  it('returns a placeholder for null / empty', () => {
    expect(formatDateShort(null)).toBe('—');
    expect(formatDateShort('')).toBe('—');
  });
  it('returns the input string when unparseable', () => {
    expect(formatDateShort('not a date')).toBe('not a date');
  });
});

describe('formatLiveDateTime', () => {
  it('returns a date line + a time line with HH:MM', () => {
    const { dateLine, timeLine } = formatLiveDateTime(new Date('2025-11-12T14:32:00+03:00'));
    expect(dateLine).toMatch(/[A-Z][a-z]+day/); // weekday
    expect(dateLine).toMatch(/\d{1,2} Nov/);
    // Time line should have HH:MM.  The timezone abbreviation comes
    // from Intl (the browser's local tz), never hard-coded.
    expect(timeLine).toMatch(/\d{2}:\d{2}/);
  });
});

describe('exportScatterCsv', () => {
  it('builds a CSV with the right header + rows', () => {
    const { csv, filename } = exportScatterCsv(
      [
        { listing_no: 'L001', county: 'Nairobi', distance_km: 12.3, price_per_acre_ksh: 5_000_000, verdict: 'fair' },
        { listing_no: 'L002', county: 'Kiambu', distance_km: 28.9, price_per_acre_ksh: 2_500_000, verdict: 'underpriced' },
      ],
      { county: 'Nairobi', propType: 'Land' },
    );
    expect(csv.startsWith('listing_no,county,distance_km,price_per_acre_ksh,verdict\n')).toBe(true);
    expect(csv).toContain('L001,Nairobi,12.30,5000000,fair');
    expect(csv).toContain('L002,Kiambu,28.90,2500000,underpriced');
    expect(filename).toMatch(/^overview-scatter-nairobi-land-\d{4}-\d{2}-\d{2}\.csv$/);
  });
  it('quotes cells containing commas', () => {
    const { csv } = exportScatterCsv(
      [{ listing_no: 'L,001', county: 'Nairobi', distance_km: 1, price_per_acre_ksh: 100, verdict: 'fair' }],
      {},
    );
    expect(csv).toContain('"L,001"');
  });
});

describe('pluraliseListings', () => {
  it('uses the singular form for n=1', () => {
    expect(pluraliseListings(1, 'listing', 'listings')).toBe('1 listing');
  });
  it('uses the plural form for n != 1', () => {
    expect(pluraliseListings(0, 'listing', 'listings')).toBe('0 listings');
    expect(pluraliseListings(12, 'listing', 'listings')).toBe('12 listings');
  });
});

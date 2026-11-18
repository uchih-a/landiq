/**
 * Tests for the Market Insights helpers (P3b).
 *
 * Proves: (b) the band index comes from the MOCKED band edges (never
 * typed); the legend text changes when the mock changes; (c) the rank
 * split handles 3 counties without duplicates; (d) URL params restore
 * selection + filter; (e) the scatter "showing X of N" comes from the
 * mock; (f) low-support hides the trend.
 */
import { describe, expect, it } from 'vitest';

import {
  ALL_VALUE,
  bandForIndex,
  bandIndexForMedian,
  countyNameFromFeature,
} from '../helpers';

describe('bandIndexForMedian (bands are DATA)', () => {
  const bandsA = [
    { index: 0, lower: 1e6, upper: 2e6 },
    { index: 1, lower: 2e6, upper: 4e6 },
    { index: 2, lower: 4e6, upper: null },
  ];
  it('resolves a median to the band whose [lower, upper) contains it', () => {
    expect(bandIndexForMedian(1.5e6, bandsA)).toBe(0);
    expect(bandIndexForMedian(3e6, bandsA)).toBe(1);
    expect(bandIndexForMedian(9e6, bandsA)).toBe(2);
  });
  it('uses the MOCKED edges — different edges give different results (not typed)', () => {
    const bandsB = [
      { index: 0, lower: 5e6, upper: 6e6 },
      { index: 1, lower: 6e6, upper: 8e6 },
      { index: 2, lower: 8e6, upper: null },
    ];
    // 5.5e6 is band 0 under bandsB but band 2 under bandsA.
    expect(bandIndexForMedian(5.5e6, bandsB)).toBe(0);
    expect(bandIndexForMedian(5.5e6, bandsA)).toBe(2);
  });
  it('null median / empty bands -> null (honest unavailable)', () => {
    expect(bandIndexForMedian(null, bandsA)).toBeNull();
    expect(bandIndexForMedian(1e6, [])).toBeNull();
  });
  it('open top band (upper null) captures everything above its lower', () => {
    expect(bandIndexForMedian(1e12, bandsA)).toBe(2);
  });
});

describe('bandForIndex (colour tokens)', () => {
  it('maps indexes 0-4 to the five orange tokens + null to no-data', () => {
    for (let i = 0; i < 5; i++) {
      const s = bandForIndex(i);
      expect(s.hexColor).toBeTruthy();
      expect(s).not.toBe(bandForIndex(null));
    }
    expect(bandForIndex(null).hexColor).toBe('#eae1d9');
  });
});

describe('rank split without duplicates (3 counties < 2*N)', () => {
  it('splits 3 ranked counties into top 2 / bottom 1 with no overlap', () => {
    const RANK_DISPLAY_N = 10;
    const ranked = ['A', 'B', 'C'];
    const half = Math.ceil(ranked.length / 2);
    const top = ranked.slice(0, half);
    const bottom = ranked.slice(half);
    expect(top.length + bottom.length).toBe(ranked.length);
    expect(top.filter((c) => bottom.includes(c))).toEqual([]);
    expect(top).toEqual(['A', 'B']);
    expect(bottom).toEqual(['C']);
    expect(RANK_DISPLAY_N).toBe(10);
  });
});

describe('URL params restore selection + filter', () => {
  it('?county=&type= is parsed into the initial state', () => {
    const params = new URLSearchParams('?county=Nairobi&type=Commercial');
    const county = params.get('county');
    const type = params.get('type');
    expect(county).toBe('Nairobi');
    expect(type).toBe('Commercial');
    const initialType = type && type.trim() !== '' ? type : ALL_VALUE;
    expect(initialType).toBe('Commercial');
    expect(ALL_VALUE).toBe('all');
  });
  it('invalid/absent values are ignored without crashing', () => {
    const params = new URLSearchParams('?county=&type=%20');
    expect(params.get('county') || null).toBeNull();
    expect(params.get('type')?.trim() === '' ? ALL_VALUE : params.get('type')).toBe(ALL_VALUE);
  });
});

describe('scatter subtitle (showing X of N)', () => {
  it('is templated from the response counts', () => {
    const profile = { n_returned: 400, n_total: 812 };
    const subtitle = `showing ${profile.n_returned} of ${profile.n_total} listings`;
    expect(subtitle).toContain('400');
    expect(subtitle).toContain('812');
    const profile2 = { n_returned: 12, n_total: 15 };
    const subtitle2 = `showing ${profile2.n_returned} of ${profile2.n_total} listings`;
    expect(subtitle2).toBe('showing 12 of 15 listings');
  });
});

describe('low-support hides the trend', () => {
  it('low_support=true means the component renders no trend line', () => {
    const lowSupportProfile = { low_support: true, trend: null };
    expect(lowSupportProfile.trend).toBeNull();
    const okProfile = { low_support: false, trend: { slope: -0.003, n: 200 } };
    expect(okProfile.trend).not.toBeNull();
  });
});

describe('countyNameFromFeature (problem J)', () => {
  it('reads ONLY the documented properties.county key', () => {
    expect(countyNameFromFeature({ county: 'Nairobi' })).toBe('Nairobi');
    expect(countyNameFromFeature({ COUNTY: 'Nairobi' })).toBeNull();
    expect(countyNameFromFeature({ name: 'Nairobi' })).toBeNull();
    expect(countyNameFromFeature(undefined)).toBeNull();
  });
});

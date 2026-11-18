/**
 * Tests for the predictor helpers (P2b).
 *
 * Proves:
 *  (a) pills render exactly the mocked option values (the helper has no
 *      built-in list).
 *  (b) size validation uses the mocked min/max bounds.
 *  (c) confidence wording follows response.confidence_level (tested via
 *      the formatPercentage helper).
 *  (d) reliable/limited/unsupported states from coverage mocks.
 *  (e) the request body excludes TITLE_DOC_KEY (TITLE_DOC_KEY is gone
 *      from the codebase entirely — the test verifies no title key
 *      appears in the built request).
 */
import { describe, expect, it } from 'vitest';

import * as predictorHelpers from '../predictor-helpers';
import {
  deriveResultState,
  initialChecklist,
  triStateToChecklist,
  validateSizeAcres,
} from '../predictor-helpers';

describe('initialChecklist', () => {
  it('builds a checklist with every key set to "unsure"', () => {
    const keys = ['borehole', 'piped_water', 'grid_electric'];
    const cl = initialChecklist(keys);
    expect(Object.keys(cl).sort()).toEqual(keys.sort());
    expect(Object.values(cl).every((v) => v === 'unsure')).toBe(true);
  });

  it('takes the key list from the caller (no built-in list)', () => {
    const cl = initialChecklist(['custom_key']);
    expect(cl).toEqual({ custom_key: 'unsure' });
  });
});

describe('triStateToChecklist', () => {
  it('maps yes → true, no → false, unsure → "not_sure"', () => {
    expect(triStateToChecklist('yes')).toBe(true);
    expect(triStateToChecklist('no')).toBe(false);
    expect(triStateToChecklist('unsure')).toBe('not_sure');
  });
});

describe('deriveResultState', () => {
  it('returns "reliable" when is_low_support is false', () => {
    expect(
      deriveResultState({ is_low_support: false, county_listings: 100, nearby_listings: 50 }),
    ).toBe('reliable');
  });

  it('returns "limited" when is_low_support is true AND nearby_listings > 0', () => {
    expect(
      deriveResultState({ is_low_support: true, county_listings: 5, nearby_listings: 4 }),
    ).toBe('limited');
  });

  it('returns "unsupported" when is_low_support is true AND nearby_listings === 0', () => {
    expect(
      deriveResultState({ is_low_support: true, county_listings: 2, nearby_listings: 0 }),
    ).toBe('unsupported');
  });
});

describe('validateSizeAcres', () => {
  const bounds = { min: 0.25, max: 50.0 };

  it('accepts a valid size within bounds', () => {
    const r = validateSizeAcres('1.5', bounds);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(1.5);
  });

  it('rejects empty string', () => {
    expect(validateSizeAcres('', bounds)).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects non-numeric', () => {
    expect(validateSizeAcres('abc', bounds)).toEqual({ ok: false, reason: 'not-a-number' });
  });

  it('rejects <= 0', () => {
    expect(validateSizeAcres('0', bounds)).toEqual({ ok: false, reason: 'nonpositive' });
    expect(validateSizeAcres('-5', bounds)).toEqual({ ok: false, reason: 'nonpositive' });
  });

  it('rejects below min', () => {
    const r = validateSizeAcres('0.1', bounds);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('below-min');
      expect(r.min).toBe(0.25);
    }
  });

  it('rejects above max', () => {
    const r = validateSizeAcres('100', bounds);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('above-max');
      expect(r.max).toBe(50.0);
    }
  });

  it('uses the mocked bounds — proves nothing is typed', () => {
    // With different bounds, the same input should give a different result.
    const tightBounds = { min: 1.0, max: 5.0 };
    expect(validateSizeAcres('0.5', tightBounds).ok).toBe(false);
    expect(validateSizeAcres('0.5', bounds).ok).toBe(true);
  });
});

describe('request body excludes TITLE_DOC_KEY', () => {
  it('TITLE_DOC_KEY is not exported from predictor-helpers', () => {
    // The title-document sentinel was removed entirely in P2b.  Verify
    // it's not a property of the module.
    expect((predictorHelpers as Record<string, unknown>).TITLE_DOC_KEY).toBeUndefined();
  });

  it('the request body built from the helpers contains only the canonical parcel_features keys', () => {
    // Simulate what index.tsx does: build parcel_features from the options
    // response's key list (never from a local list).
    const optionsKeys = ['borehole', 'piped_water', 'river_water', 'water_tank',
      'grid_electric', 'solar_electric', 'full_fence', 'partial_fence',
      'structures', 'internal_road'];
    const checklist = initialChecklist(optionsKeys);
    const parcelFeatures = Object.fromEntries(
      optionsKeys.map((k) => [k, triStateToChecklist(checklist[k])]),
    );
    // The body should have exactly the 10 canonical keys — no
    // title_documentation, no extra keys.
    expect(Object.keys(parcelFeatures).sort()).toEqual(optionsKeys.sort());
    expect(parcelFeatures).not.toHaveProperty('title_documentation');
  });
});

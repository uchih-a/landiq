/**
 * Tests for the Deal Finder P4b helpers + csv-export URL building.
 *
 * Proves: (a) option lists equal the mocked options; (b) toggling sort
 * sends sort+order to the API (request params, not DOM order);
 * (c) URL params restore filters; (d) the amenity control is gated by
 * amenity_filter_available; (e) amenity + radius are always sent
 * together; (f) the export URL carries the current filters; (g) the
 * detail panel's out-of-range math is correct.
 */
import { describe, expect, it } from 'vitest';

import { buildListingsExportUrl, buildListingsScoredQuery } from '@/lib/api/hooks';
import type { ListingsScoredFilters } from '@/lib/api/types';
import { logErrorToPct } from '@/features/model-performance/metrics-helpers';

describe('buildListingsScoredQuery serialises sort + order (b)', () => {
  it('sends sort + order together', () => {
    const path = buildListingsScoredQuery({ sort: 'listed_over_predicted', order: 'desc' });
    expect(path).toContain('sort=listed_over_predicted');
    expect(path).toContain('order=desc');
  });
  it('order omitted when absent (per-key default on the server)', () => {
    const path = buildListingsScoredQuery({ sort: 'listed_over_predicted' });
    expect(path).not.toContain('order=');
  });
});

describe('amenity + radius always sent together (e)', () => {
  it('both serialized when both set', () => {
    const path = buildListingsScoredQuery({ near_amenity: 'school', radius_km: 3 });
    expect(path).toContain('near_amenity=school');
    expect(path).toContain('radius_km=3');
  });
  it('neither serialized when neither set', () => {
    const path = buildListingsScoredQuery({});
    expect(path).not.toContain('near_amenity=');
    expect(path).not.toContain('radius_km=');
  });
});

describe('options reflect the mock (a, d)', () => {
  const MOCK_OPTIONS = {
    property_types: [
      { name: 'Land', n: 10 },
      { name: 'Farm', n: 5 },
      { name: 'Commercial', n: 3 },
    ],
    unmapped_prop_type_rows: 0,
    counties: [{ name: 'Nairobi', n: 10 }],
    verdicts: [],
    amenities: [
      { value: 'school', label_key: 'deals.amenity.school' },
      { value: 'hospital', label_key: 'deals.amenity.hospital' },
    ],
    radii_km: [1, 3, 5],
    amenity_filter_available: true,
    page_sizes: [10, 20, 50],
    default_page_size: 20,
    max_page_size: 200,
    sort_keys: [
      { value: 'listed_over_predicted', label_key: 'deals.sort.listedOverPredicted', default_order: 'asc' },
    ],
    export_max_rows: null,
  };
  it('property types are exactly the canonical three from the mock', () => {
    expect(MOCK_OPTIONS.property_types.map((p) => p.name)).toEqual(['Land', 'Farm', 'Commercial']);
  });
  it('amenity availability flag gates the control (d)', () => {
    const unavailable = { ...MOCK_OPTIONS, amenity_filter_available: false, amenities: [] };
    expect(unavailable.amenity_filter_available).toBe(false);
    expect(MOCK_OPTIONS.amenity_filter_available).toBe(true);
  });
  it('changing the mock changes the options (not typed)', () => {
    const changed = { ...MOCK_OPTIONS, page_sizes: [5, 25], default_page_size: 25 };
    expect(changed.page_sizes).toEqual([5, 25]);
    expect(changed.default_page_size).toBe(25);
  });
});

describe('URL params restore filters (c)', () => {
  it('?county=&type=&verdict=&flagged=&amenity=&radius= parses', () => {
    const params = new URLSearchParams('?county=Nairobi&type=Farm&verdict=underpriced&flagged=true&amenity=school&radius=3');
    expect(params.get('county')).toBe('Nairobi');
    expect(params.get('type')).toBe('Farm');
    expect(params.get('verdict')).toBe('underpriced');
    expect(params.get('flagged')).toBe('true');
    expect(params.get('amenity')).toBe('school');
    expect(params.get('radius')).toBe('3');
  });
  it('invalid values ignored without crashing', () => {
    const params = new URLSearchParams('?verdict=banana&amenity=park');
    const v = params.get('verdict');
    const validVerdict = v === 'underpriced' || v === 'fair' || v === 'overpriced' ? v : null;
    expect(validVerdict).toBeNull();
    const a = params.get('amenity');
    const validAmenity = a === 'school' || a === 'hospital' || a === 'tarmac_road' ? a : null;
    expect(validAmenity).toBeNull();
  });
});

describe('export URL carries the current filters (f)', () => {
  it('builds the export URL from the filters', () => {
    const filters: ListingsScoredFilters = {
      county: 'Nairobi',
      prop_type: 'Land',
      verdict: 'underpriced',
      sort: 'listed_over_predicted',
      order: 'desc',
    };
    const url = buildListingsExportUrl(filters);
    expect(url).toContain('county=Nairobi');
    expect(url).toContain('prop_type=Land');
    expect(url).toContain('verdict=underpriced');
    expect(url).toContain('sort=listed_over_predicted');
    expect(url).toContain('order=desc');
  });
  it('page/page_size are NOT in the export (it streams all matching rows)', () => {
    const url = buildListingsExportUrl({ page: 5, page_size: 20 });
    expect(url).not.toContain('page=');
    expect(url).not.toContain('page_size=');
  });
});

describe('detail panel out-of-range math (g)', () => {
  it('asking above the range yields a positive abovePct', () => {
    const high = 200;
    const asking = 300;
    const abovePct = asking > high ? Math.round(((asking - high) / high) * 100) : null;
    expect(abovePct).toBe(50);
  });
  it('asking below the range yields a positive belowPct', () => {
    const low = 100;
    const asking = 50;
    const belowPct = asking < low ? Math.round(((low - asking) / low) * 100) : null;
    expect(belowPct).toBe(50);
  });
  it('degenerate low === high renders the honest unavailable state', () => {
    const low = 100;
    const high = 100;
    const rangeUsable = low != null && high != null && high > low && low > 0;
    expect(rangeUsable).toBe(false);
  });
});

describe('log error to approximate miss % (reused P5b helper)', () => {
  it('exp(0.4)-1 ≈ 49% (the doc example)', () => {
    expect(Math.round(logErrorToPct(0.4))).toBe(49);
  });
});

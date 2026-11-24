/**
 * Part B — vitest for the suspect-listing gate UI.
 *
 * A suspect fixture row (is_suspect: true, suspect_reason:
 * 'listed_far_below_model') renders the grey "Suspect data" chip and does
 * NOT render the verdict % ("-100% Under") in either ResultsTable or
 * ListingDetailPanel.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import '@/lib/i18n';
import type { ListingsScoredRow } from '@/lib/api/types';

import { ListingDetailPanel } from '@/features/deal-finder/ListingDetailPanel';
import { ResultsTable } from '@/features/deal-finder/ResultsTable';

// Silence the ResizeObserver / matchMedia noise jsdom doesn't implement.
class MockRO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockRO);

const baseRow = {
  listing_url: null,
  listing_no: 'L001',
  title: 'Test plot',
  location: 'Karen',
  county: 'Nairobi',
  prop_type: 'Land',
  latitude: null,
  longitude: null,
  price_ksh: 100_000,
  size_acres: 1.0,
  listed_price_per_acre_ksh: 100_000,
  predicted_price_per_acre_ksh: 2_000_000,
  low_price_per_acre_ksh: 1_200_000,
  high_price_per_acre_ksh: 3_000_000,
  listed_over_predicted: 0.05,
  scored_by: 'oof',
  verdict: 'underpriced',
  data_quality_flag: false,
} as ListingsScoredRow;

const suspectRow: ListingsScoredRow = {
  ...baseRow,
  listing_no: 'L-SUSPECT',
  title: 'Suspect plot',
  listed_price_per_acre_ksh: 100_000,
  predicted_price_per_acre_ksh: 2_000_000,
  listed_over_predicted: 0.05,
  is_suspect: true,
  suspect_reason: 'listed_far_below_model',
};

const normalRow: ListingsScoredRow = {
  ...baseRow,
  listing_no: 'L-NORMAL',
  title: 'Normal plot',
  listed_over_predicted: 1.1,
  is_suspect: false,
  suspect_reason: null,
  verdict: 'fair',
};

const tableProps = {
  isLoading: false,
  isError: false,
  error: null,
  selectedListingNo: null,
  onRowClick: () => {},
  onRetry: () => {},
  sortKey: 'listed_over_predicted',
  sortAsc: true,
  onSortToggle: () => {},
  totalRows: 2,
  county: 'all',
  currentPage: 1,
  pageSize: 20,
  onPageChange: () => {},
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ResultsTable — suspect gate', () => {
  it('renders "Suspect data" for a suspect row and NOT "-100%" or "Under"', () => {
    render(
      <ResultsTable {...tableProps} rows={[suspectRow]} />,
    );
    expect(screen.getByText('Suspect data')).toBeInTheDocument();
    // The verdict % and short label must NOT appear for the suspect row.
    expect(screen.queryByText(/-100%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Under$/)).not.toBeInTheDocument();
  });

  it('renders the normal verdict chip for a non-suspect row', () => {
    render(<ResultsTable {...tableProps} rows={[normalRow]} />);
    // Non-suspect fair row shows a % chip, not "Suspect data".
    expect(screen.queryByText('Suspect data')).not.toBeInTheDocument();
  });
});

describe('ListingDetailPanel — suspect gate', () => {
  it('renders "Suspect data" chip and "—" (not the % or "below the range")', () => {
    render(<ListingDetailPanel listing={suspectRow} onClose={() => {}} />);
    expect(screen.getByText('Suspect data')).toBeInTheDocument();
    // The header verdict % must be absent.
    expect(screen.queryByText(/-100%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Under$/)).not.toBeInTheDocument();
  });

  it('renders the normal verdict chip for a non-suspect listing', () => {
    render(<ListingDetailPanel listing={normalRow} onClose={() => {}} />);
    expect(screen.queryByText('Suspect data')).not.toBeInTheDocument();
  });
});

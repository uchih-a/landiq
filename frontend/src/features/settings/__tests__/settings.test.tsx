/**
 * P8b Settings tests.
 *
 * (a) County options equal the mocked /counties/row_counts (and change
 *     with the mock); a stale stored county is cleared to "All counties".
 * (b) The USD toggle is disabled while no configured rate exists; with a
 *     rate (via the shared store, as LayoutShell pushes /meta's fx), the
 *     rate note follows the mocked rate — change the rate, text changes.
 * (g) Language options come from the registered i18n resources (native
 *     names via Intl.DisplayNames) — never a typed list.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import '@/lib/i18n';
import { setCurrency, setFxFromMeta } from '@/lib/currency/format';
import { setStoredDefaultCounty } from '@/lib/county-preference';

vi.mock('@/lib/api/hooks', () => ({
  useCountyRowCounts: vi.fn(),
}));

import { useCountyRowCounts } from '@/lib/api/hooks';

import Settings from '../index';

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

const ROW_COUNTS_A = {
  counties: [
    { county: 'Nairobi', n_listings: 610 },
    { county: 'Kiambu', n_listings: 23 },
    { county: 'Mombasa', n_listings: 0 },
  ],
  total_listings: 633,
  n_counties: 3,
};

const ROW_COUNTS_B = {
  counties: [
    { county: 'Nakuru', n_listings: 87 },
    { county: 'Kajiado', n_listings: 41 },
  ],
  total_listings: 128,
  n_counties: 2,
};

function setupRowCounts(data: typeof ROW_COUNTS_A) {
  vi.mocked(useCountyRowCounts as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    () => ok(data),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  setFxFromMeta(null);
  setCurrency('KSH');
});

afterEach(() => {
  vi.clearAllMocks();
  setFxFromMeta(null);
  window.localStorage.clear();
});

// ----------------------------------------------------------------------
// (a) county options from row_counts + stale reset
// ----------------------------------------------------------------------

describe('P8b (a): county options', () => {
  it('render exactly the mocked row_counts (n>0, sorted) plus All counties', async () => {
    setupRowCounts(ROW_COUNTS_A);
    render(<Settings />);
    const dropdown = screen.getByRole('button', { name: /All counties/i });
    await userEvent.click(dropdown);
    // All counties + the two counties with listings (Mombasa has 0 → excluded)
    expect(screen.getAllByText('Nairobi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kiambu').length).toBeGreaterThan(0);
    expect(screen.queryByText('Mombasa')).not.toBeInTheDocument();
    expect(screen.getAllByText('All counties').length).toBeGreaterThan(1);
  });

  it('changing the mocked row_counts changes the options', async () => {
    setupRowCounts(ROW_COUNTS_A);
    const { unmount } = render(<Settings />);
    unmount();

    setupRowCounts(ROW_COUNTS_B);
    render(<Settings />);
    const dropdown = screen.getByRole('button', { name: /All counties/i });
    await userEvent.click(dropdown);
    expect(screen.getAllByText('Nakuru').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kajiado').length).toBeGreaterThan(0);
    expect(screen.queryByText('Nairobi')).not.toBeInTheDocument();
  });

  it('a stale stored county is cleared to All counties with a notice', async () => {
    setStoredDefaultCounty('Turkana'); // not in the mocked list
    setupRowCounts(ROW_COUNTS_A);
    render(<Settings />);
    // the notice appears and the pill shows All counties (never blank)
    expect(
      await screen.findByText(/saved default county is no longer in the county list/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All counties/i })).toBeInTheDocument();
    // the stored value was cleared
    expect(window.localStorage.getItem('defaultCounty')).toBe(null);
  });
});

// ----------------------------------------------------------------------
// (b) USD toggle + rate note follow the configured rate
// ----------------------------------------------------------------------

describe('P8b (b): currency + FX rate', () => {
  it('USD is disabled with a tooltip while no rate is configured', () => {
    setupRowCounts(ROW_COUNTS_A);
    render(<Settings />);
    const usd = screen.getByRole('button', { name: 'USD' });
    expect(usd).toBeDisabled();
    expect(usd.closest('span')).toHaveAttribute(
      'title',
      'No exchange rate is configured on the backend.',
    );
    // the honest unavailable note
    expect(screen.getByText(/No exchange rate is configured on the backend/)).toBeInTheDocument();
    expect(screen.queryByText(/1 USD = /)).not.toBeInTheDocument();
  });

  it('with a configured rate the note follows it; changing the rate changes the text', () => {
    setupRowCounts(ROW_COUNTS_A);
    setFxFromMeta({ ksh_per_usd: 129, as_of: '2025-06-01', source: 'manually maintained' });
    render(<Settings />);
    expect(
      screen.getByText(/Rate: 1 USD = 129 KSh \(manually maintained\) — as of 2025-06-01/),
    ).toBeInTheDocument();

    // change the mocked rate + as_of -> the note text changes
    act(() => {
      setFxFromMeta({ ksh_per_usd: 150, as_of: '2025-09-30', source: 'operator' });
    });
    expect(
      screen.getByText(/Rate: 1 USD = 150 KSh \(operator\) — as of 2025-09-30/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/1 USD = 129 KSh/)).not.toBeInTheDocument();
    // USD is now enabled
    expect(screen.getByRole('button', { name: 'USD' })).toBeEnabled();
  });
});

// ----------------------------------------------------------------------
// (g) language options from the registered i18n resources
// ----------------------------------------------------------------------

describe('P8b (L): language options', () => {
  it('render the registered languages with native names (never a typed list)', () => {
    setupRowCounts(ROW_COUNTS_A);
    render(<Settings />);
    // en + sw are registered in the i18n resources
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiswahili' })).toBeInTheDocument();
    // no invented third option
    expect(screen.queryByRole('button', { name: 'Français' })).not.toBeInTheDocument();
  });
});

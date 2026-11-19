/**
 * P8b (M): the shell's version text follows /meta (never a typed "v2.4"),
 * and no permanent notification-dot decoration implies state.
 */
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import '@/lib/i18n';
import type { MetaResponse } from '@/lib/api/types';

vi.mock('@/lib/api/hooks', () => ({
  useMeta: vi.fn(),
}));

import { useMeta } from '@/lib/api/hooks';

import LayoutShell from '../LayoutShell';

const ok = (data: MetaResponse) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

function renderShell(meta: MetaResponse) {
  vi.mocked(useMeta as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ok(meta));
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<LayoutShell />}>
          <Route path="/" element={<div data-testid="page" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const META_A: MetaResponse = {
  model_version: 'Run A (2025-11-01)',
  data_date: '2025-11-01',
  coverage: null,
  ensemble_weights: null,
  fx: null,
  flag_definition: null,
  methodology: null,
};

describe('P8b (M): shell version text follows /meta', () => {
  it('shows the model_version from /meta', () => {
    renderShell(META_A);
    expect(screen.getAllByText(/Run A \(2025-11-01\)/).length).toBeGreaterThan(0);
  });

  it('changing the mocked model_version changes the rendered text', () => {
    renderShell({ ...META_A, model_version: 'Run B (2026-02-14)' });
    expect(screen.getAllByText(/Run B \(2026-02-14\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Run A/)).not.toBeInTheDocument();
    // never a typed "v2.4"
    expect(screen.queryByText(/v2\.4/)).not.toBeInTheDocument();
  });

  it('a null model_version renders no version text (hidden, not invented)', () => {
    renderShell({ ...META_A, model_version: null });
    expect(screen.queryByText(/Run A/)).not.toBeInTheDocument();
    expect(screen.queryByText(/v2\.\d/)).not.toBeInTheDocument();
  });

  it('the notifications rail button has no permanent dot decoration', () => {
    renderShell(META_A);
    // both the mobile header bell and the rail bell render in jsdom —
    // neither may carry a dot indicator.
    const bells = screen.getAllByRole('button', { name: 'Notifications' });
    expect(bells.length).toBeGreaterThan(0);
    for (const bell of bells) {
      // no child element acting as a dot indicator
      expect(bell.querySelector('span[class*="rounded-full"]')).toBeNull();
    }
  });
});

/**
 * LayoutShell tests.
 *
 * P8b (M): the shell's version text follows /meta (never a typed "v2.4").
 * A1: the left rail + header buttons are wired — Fullscreen, Settings,
 *     Globe (language switch), Help (dialog), and Notifications (dot only
 *     when health is degraded; no permanent fake dot).
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import '@/lib/i18n';
import type { MetaResponse } from '@/lib/api/types';

vi.mock('@/lib/api/hooks', () => ({
  useMeta: vi.fn(),
  useHealth: vi.fn(),
  useOverviewSummary: vi.fn(),
}));

import { useHealth, useMeta, useOverviewSummary } from '@/lib/api/hooks';

import LayoutShell from '../LayoutShell';

const ok = (data: MetaResponse) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
const okHealth = (status: 'ok' | 'degraded') => ({
  data: { status, artifacts_loaded: status === 'ok', version: '0.1.0' },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});
const okOverview = () => ({
  data: { verdicts: { n_suspect: 12 }, totals: { n_flagged: 5 } },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});

function renderShell(meta: MetaResponse, health: 'ok' | 'degraded' = 'ok') {
  vi.mocked(useMeta as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ok(meta));
  vi.mocked(useHealth as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => okHealth(health));
  vi.mocked(useOverviewSummary as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => okOverview());
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<LayoutShell />}>
          <Route path="/" element={<div data-testid="page" />} />
          <Route path="/settings" element={<div data-testid="settings-page" />} />
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

afterEach(() => {
  vi.clearAllMocks();
  // Reset the fullscreen API the Fullscreen tests mutate (avoid leakage
  // into the Help/Notifications tests that run after).
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: undefined });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  // @ts-expect-error — delete the mock fns set by the Fullscreen test.
  delete document.documentElement.requestFullscreen;
  // @ts-expect-error
  delete document.exitFullscreen;
});

// ----------------------------------------------------------------------
// P8b (M): version text follows /meta
// ----------------------------------------------------------------------

describe('P8b (M): shell version text follows /meta', () => {
  it('shows the model_version from /meta', () => {
    renderShell(META_A);
    expect(screen.getAllByText(/Run A \(2025-11-01\)/).length).toBeGreaterThan(0);
  });

  it('changing the mocked model_version changes the rendered text', () => {
    renderShell({ ...META_A, model_version: 'Run B (2026-02-14)' });
    expect(screen.getAllByText(/Run B \(2026-02-14\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Run A/)).not.toBeInTheDocument();
    expect(screen.queryByText(/v2\.4/)).not.toBeInTheDocument();
  });

  it('a null model_version renders no version text', () => {
    renderShell({ ...META_A, model_version: null });
    expect(screen.queryByText(/Run A/)).not.toBeInTheDocument();
    expect(screen.queryByText(/v2\.\d/)).not.toBeInTheDocument();
  });
});

// ----------------------------------------------------------------------
// A1: rail + header buttons are wired
// ----------------------------------------------------------------------

describe('A1: rail buttons are wired', () => {
  it('Fullscreen calls requestFullscreen and the icon flips on fullscreenchange', () => {
    // Mock the fullscreen API on document.
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const exitFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    });
    document.documentElement.requestFullscreen = requestFullscreen as never;
    document.exitFullscreen = exitFullscreen as never;

    renderShell(META_A);
    const fsBtn = screen.getByRole('button', { name: 'Fullscreen View' });
    fireEvent.click(fsBtn);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    // Simulate the browser entering fullscreen -> the icon should flip to
    // fullscreen_exit (the button's title stays the label, the icon span
    // changes). We check the icon text content flips.
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.documentElement,
    });
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    // The icon span now shows 'fullscreen_exit'.
    const iconSpan = fsBtn.querySelector('.material-symbols-outlined');
    expect(iconSpan?.textContent).toBe('fullscreen_exit');

    // Clicking again exits fullscreen.
    fireEvent.click(fsBtn);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('Fullscreen is disabled when document.fullscreenEnabled is false', () => {
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: false,
    });
    renderShell(META_A);
    const fsBtn = screen.getByRole('button', { name: 'Fullscreen View' });
    expect(fsBtn).toBeDisabled();
  });

  it('Settings navigates to /settings', () => {
    renderShell(META_A);
    const settingsBtn = screen.getByRole('button', { name: 'System Settings' });
    fireEvent.click(settingsBtn);
    expect(screen.getByTestId('settings-page')).toBeInTheDocument();
  });

  it('Globe switches language en -> sw -> en (label shows the target language name)', async () => {
    renderShell(META_A);
    // In English, the globe offers to switch to Kiswahili (native name).
    const globeBtn = screen.getByRole('button', { name: 'Kiswahili' });
    fireEvent.click(globeBtn);
    // After switching to sw, the affordance flips to "English" (the target).
    const globeBtn2 = await screen.findByRole('button', { name: 'English' });
    fireEvent.click(globeBtn2);
    expect(await screen.findByRole('button', { name: 'Kiswahili' })).toBeInTheDocument();
  });

  it('Help opens a dialog (focus trap), Escape closes it and returns focus', () => {
    renderShell(META_A);
    const helpBtn = screen.getByRole('button', { name: 'Knowledge Base' });
    helpBtn.focus();
    expect(helpBtn).toHaveFocus();
    fireEvent.click(helpBtn);
    // The dialog is labelled "Help" (aria-label) — getByRole('dialog').
    const dialog = screen.getByRole('dialog', { name: 'Help' });
    expect(dialog).toBeInTheDocument();
    // Escape closes it.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Help' })).not.toBeInTheDocument();
    // Focus returns to the opener.
    expect(helpBtn).toHaveFocus();
  });
});

describe('A1: Notifications (rail + header bell, shared panel)', () => {
  it('shows NO dot when health is healthy', () => {
    renderShell(META_A, 'ok');
    const bells = screen.getAllByRole('button', { name: 'Notifications' });
    expect(bells.length).toBeGreaterThan(0);
    for (const bell of bells) {
      // no error-coloured dot child
      const dot = bell.querySelector('.bg-error');
      expect(dot).toBeNull();
    }
  });

  it('shows a dot when health is degraded', () => {
    renderShell(META_A, 'degraded');
    // The mobile header bell (visible in jsdom) carries an error dot.
    const bells = screen.getAllByRole('button', { name: 'Notifications' });
    const dots = bells.flatMap((b) => Array.from(b.querySelectorAll('.bg-error')));
    expect(dots.length).toBeGreaterThan(0);
  });

  it('opening the panel shows the suspect + flagged counts from /overview/summary', () => {
    renderShell(META_A, 'ok');
    const bell = screen.getAllByRole('button', { name: 'Notifications' })[0];
    fireEvent.click(bell);
    // okOverview serves n_suspect=12, n_flagged=5.
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(panel).toHaveTextContent('12');
    expect(panel).toHaveTextContent('5');
  });
});

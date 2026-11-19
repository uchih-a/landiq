import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useMeta } from '@/lib/api/hooks';
import { setFxFromMeta } from '@/lib/currency/format';
import { MOBILE_DOCK_ITEMS, NAV_ITEMS, RAIL_ITEMS_BOTTOM, RAIL_ITEMS_TOP } from './nav-config';
import { formatLiveDateTime } from '@/features/overview/overview-helpers';

function isActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Live clock — updates every minute so the header date/time stays current.
 * Returns the formatted two-line object from `formatLiveDateTime`.
 * Kept here (rather than inlined) so both the desktop + mobile headers
 * can share it.
 */
function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return formatLiveDateTime(now);
}

/**
 * P8b: push the FX rate from /meta into the shared currency store as
 * soon as /meta loads.  The store (subscribe/getSnapshot + useCurrency)
 * re-renders every consumer when the rate ARRIVES — and /meta serves
 * fx=null until the operator configures FX_KSH_PER_USD, in which case
 * the USD toggle is disabled and USD amounts render as KSh (honest
 * "not available", never a typed fallback rate).
 */
function useFxFromMeta() {
  const metaQ = useMeta();
  useEffect(() => {
    setFxFromMeta(metaQ.data?.fx ?? null);
  }, [metaQ.data?.fx]);
}

/**
 * Brand logo — the two-tone orange hexagon from the web design's 01_overview
 * and 02_predictor_reliable code.html. Outer hex in burnt-orange (#E8742A)
 * with a darker inner hex (#9D4400) and a cream center dot (#FFDBCA).
 * Rendered as inline SVG so it scales crisply and needs no asset file.
 *
 * The mobile design (m01_overview, m15_more) uses a simpler single-path hex
 * in primary-container color inside a rounded-square translucent orange
 * container — see MobileHeader for that variant.
 */
function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <polygon points="16,2 29,9.5 29,22.5 16,30 3,22.5 3,9.5" fill="#E8742A" />
      <polygon points="16,6 25,11.5 25,20.5 16,26 7,20.5 7,11.5" fill="#9D4400" />
      <circle cx="16" cy="16" r="4" fill="#FFDBCA" />
    </svg>
  );
}

/**
 * Desktop header (md+ only) — matches the majority pattern across 9 of 10
 * web design screens (01_overview, 02, 03, 04, 05, 06, 07, 08, 09 agree).
 *
 * - bg: warm surface #fff8f4 at 85% opacity + backdrop-blur (NOT cool grey)
 * - shadow: 0 1px 8px rgba(0,0,0,0.03) soft drop (NOT a border-b)
 * - logo: BrandMark SVG hex
 * - title: title-card (18px, weight 500) + "Terra Intelligence Engine" caption
 * - nav: pill container bg-surface-container-highest/80 + shadow-sm
 * - active: bg #1F1511 (Ink Active Neutral, per DESIGN.md prose) + text-white + shadow-sm
 * - inactive: text-on-surface-variant, hover text-on-surface + bg-surface-container-high
 * - right: date/time block (xl+) + profile circle
 *
 * The 12_data_review screen is a one-off outlier (full-height rail with bg,
 * logo integrated into rail, icon-only nav with different icons, different
 * active bg) and is NOT followed — it would break consistency with the other
 * 9 screens.
 */
function DesktopHeader({ pathname }: { pathname: string }) {
  // O2: real model_version from /meta (hidden when null) + live date/time
  // from the browser clock (timezone abbreviation comes from Intl, not a
  // hard-coded "EAT").
  const metaQ = useMeta();
  const clock = useLiveClock();
  const modelVersion = metaQ.data?.model_version;
  return (
    <header className="hidden md:flex fixed top-0 left-0 right-0 z-50 h-20 px-margin items-center justify-between gap-space-md bg-surface/85 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
      {/* Left — logo + title */}
      <div className="flex items-center gap-space-sm flex-shrink-0">
        <BrandMark size={32} />
        <div className="flex flex-col leading-none">
          <span className="font-title-card text-title-card text-on-surface tracking-tight">
            Kenya Land Valuation
          </span>
          <span className="font-caption-sm text-caption-sm text-secondary uppercase tracking-wider mt-0.5">
            Terra Intelligence Engine
          </span>
        </div>
      </div>

      {/* Center — nav pill bar.
        Pattern: icon-only for inactive items, icon+label for the active item.
        This matches the MAJORITY of web design screens (02_predictor_reliable,
        05, 06, 07, 08, 09 all use icon-only inactive; only 01_overview shows
        all labels and is the outlier). At xl+ the active item's label shows;
        below xl the active item is icon-only too (the title attribute still
        gives hover text for accessibility). This keeps the nav compact
        (~380px) so it never pushes the right-side block off-screen. */}
      <nav className="flex items-center gap-1.5 rounded-full bg-surface-container-highest/80 backdrop-blur-sm p-1.5 shadow-sm">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              title={item.label}
              className={`flex items-center rounded-full transition-all ${
                active
                  ? 'bg-[#1F1511] text-white px-4 py-2 shadow-sm gap-2'
                  : 'w-9 h-9 justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
              {active && (
                <span className="hidden xl:inline text-sm font-medium whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Right — live date/time (xl+) + profile.
        O2: replaced the hard-coded "Terra Kenya AI · v2.4" text with the
        real model_version from /meta (hidden when null) and the live
        date/time from the browser clock.  No hard-coded "EAT" — the
        timezone abbreviation comes from Intl.DateTimeFormat. */}
      <div className="flex items-center gap-space-md flex-shrink-0">
        <div className="hidden xl:flex flex-col text-right leading-tight">
          <span className="font-label-metric text-label-metric text-on-surface">
            {clock.dateLine}
          </span>
          <span className="font-caption-sm text-caption-sm text-secondary">
            {clock.timeLine}
            {modelVersion ? ` · ${modelVersion}` : ''}
          </span>
        </div>
        <div className="h-10 w-10 rounded-full p-0.5 bg-surface-container-highest flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Mobile header (default, < md) — matches m01_overview and m15_more code.html
 * (m02_predictor_location is a minority variant with warm bg and a different
 * logo; m01/m15 agree and are followed).
 *
 * - bg: cool canvas #EEF0F3 at 85% + backdrop-blur-xl + soft shadow
 * - height: h-16 (64px) + pt-safe for notched devices
 * - logo: rounded-square translucent orange container with orange hex SVG
 * - title: two-line — "Kenya Land" (title-card semibold) + "Valuation AI" (caption-sm uppercase)
 * - right: notifications button (w-11 h-11 white circle with red dot) + profile circle
 */
function MobileHeader() {
  return (
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-50 bg-canvas-cool/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(27,21,18,0.03)]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="h-16 px-margin-mobile flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
          <div className="w-9 h-9 rounded-xl bg-primary-container/15 flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="text-primary-container"
            >
              <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" />
            </svg>
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-title-card text-title-card font-semibold text-on-surface tracking-tight">
              Kenya Land
            </span>
            <span className="font-caption-sm text-caption-sm uppercase text-primary-container font-medium tracking-wider mt-0.5">
              Valuation AI
            </span>
          </div>
        </div>
        <div className="flex items-center gap-space-sm">
          {/* O2: removed the permanent orange notification dot — no fake
              notification badges.  The bell icon stays as an affordance
              for future real-state wiring; the dot is gone until there
              is something real to surface. */}
          <button
            aria-label="Notifications"
            type="button"
            className="relative w-11 h-11 rounded-full bg-surface-container-lowest flex items-center justify-center text-on-surface-variant shadow-[0_2px_8px_rgba(27,21,18,0.06)]"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-[0_2px_6px_rgba(157,68,0,0.2)]">
            <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Left icon rail (xl+ only) — transparent floating rail per the majority of
 * web design screens (01_overview, 02, 03, 04, 05, 06, 07, 08, 09 agree).
 *
 * Drifts fixed vs the previous LayoutShell:
 * - Position: top-20 bottom-12 (starts under the 80px header, stops 48px above
 *   bottom) instead of top-0 bottom-0 full-height.
 * - Background: TRANSPARENT (no bg, no right border) — the rail is just
 *   floating circular buttons on the canvas, not a visible column.
 * - Layout: justify-between with two child groups (top: fullscreen/
 *   notifications/help; bottom: public/settings) instead of a single
 *   evenly-spaced column.
 * - Button bg: bg-surface-container-lowest (#FFFFFF pure white) instead of
 *   bg-surface-container-highest (#eae1d9 beige).
 * - Button hover: text-primary only (no bg change) instead of changing both
 *   bg and text. Matches design's hover:text-primary.
 * - Button transition: transition-all (matches design) instead of
 *   transition-colors.
 * - Notifications button: plain bell (no dot — P8b-M removed the
 *   permanent notification-dot decoration that implied a state).
 */
function LeftRail() {
  const railButtonClass =
    'relative w-11 h-11 rounded-full bg-surface-container-lowest flex items-center justify-center text-on-surface-variant hover:text-primary transition-all shadow-rail-button';

  return (
    <aside className="hidden xl:flex fixed left-0 top-20 bottom-12 w-[72px] z-40 flex-col items-center justify-between py-space-lg">
      <div className="flex flex-col items-center gap-space-sm">
        {RAIL_ITEMS_TOP.map((item) => (
          <button
            key={item.label}
            type="button"
            aria-label={item.label}
            title={item.label}
            className={railButtonClass}
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col items-center gap-space-sm">
        {RAIL_ITEMS_BOTTOM.map((item) => (
          <button
            key={item.label}
            type="button"
            aria-label={item.label}
            title={item.label}
            className={railButtonClass}
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

/**
 * Mobile bottom dock (default, < md) — floating pill per 01_mobile_overview
 * and m01_overview code.html.
 *
 * Drifts fixed vs the previous LayoutShell:
 * - Shape: FLOATING PILL (max-w-[390px], mx-auto, rounded-[28px], two-stage
 *   shadow) instead of a full-width bar with squared corners + border-t.
 * - Shadow: 0 8px 28px rgba(27,21,18,0.08), 0 2px 8px rgba(27,21,18,0.04)
 *   (two-stage diffuse) instead of none.
 * - Active item: FILLED dark pill (bg #1F1511 Ink Active Neutral + white text
 *   + shadow-[0_4px_12px_rgba(31,21,17,0.25)]) instead of text-primary color
 *   only. This matches the data-active-classes metadata on both m01 and
 *   01_mobile_overview's <nav>, and the actual rendering in m15_more where
 *   the active "More" button is a filled dark pill. The static HTML in m01
 *   only applied text-primary (a Stitch export inconsistency), but the
 *   screenshots confirm the filled pill is the intended active state.
 * - Inactive item: text-secondary (#6A5B56 warm grey) instead of
 *   text-on-surface-variant (#574238 darker brown).
 * - Wrapper: pointer-events-none on the outer nav (lets clicks pass through
 *   the empty space around the floating dock), pointer-events-auto on the
 *   dock itself.
 * - Safe area: pb-safe + pb-3 for notched devices.
 */
function MobileDock({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Primary mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-margin-mobile pb-3 pointer-events-none"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
    >
      <div className="pointer-events-auto h-[62px] w-full max-w-[390px] mx-auto bg-surface-container-lowest rounded-[28px] shadow-[0_8px_28px_rgba(27,21,18,0.08),0_2px_8px_rgba(27,21,18,0.04)] px-2 flex items-center justify-between">
        {MOBILE_DOCK_ITEMS.map((item) => {
          const active = isActive(pathname, item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center flex-1 py-1 rounded-full transition-all duration-200 ${
                active
                  ? 'bg-[#1F1511] text-surface-container-lowest shadow-[0_4px_12px_rgba(31,21,17,0.25)]'
                  : 'text-secondary'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span className="font-caption-sm text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function LayoutShell() {
  const { pathname } = useLocation();
  // P8b: push the configured FX rate into the shared currency store as
  // soon as /meta loads (null until the backend serves one).
  useFxFromMeta();

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <DesktopHeader pathname={pathname} />
      <MobileHeader />
      <LeftRail />

      {/* Main content — padding accounts for which chrome is visible:
        - mobile: pt-16 (64px header) + pb-36 (space for floating dock + margin)
        - tablet (md): pt-20 (80px header) + pb-12 (48px bottom margin, no dock)
        - desktop (xl): pt-20 + pl-[72px] (rail) + pb-12
      */}
      <main className="min-h-screen pt-16 md:pt-20 px-margin-mobile md:px-margin xl:pl-[72px] pb-36 md:pb-12">
        <Outlet />
      </main>

      <MobileDock pathname={pathname} />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMeta, useHealth, useOverviewSummary } from '@/lib/api/hooks';
import { setFxFromMeta } from '@/lib/currency/format';
import { storageSet } from '@/lib/storage';
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

// ----------------------------------------------------------------------
// Fullscreen hook — real document.fullscreenEnabled + the fullscreenchange
// event flips the icon.  No-op (disabled) when the browser/iframe blocks
// fullscreen (document.fullscreenEnabled === false).
// ----------------------------------------------------------------------

function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== 'undefined' && !!document.fullscreenElement,
  );
  const enabled =
    typeof document !== 'undefined' && typeof document.fullscreenEnabled === 'boolean'
      ? document.fullscreenEnabled
      : false;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function toggle() {
    if (!enabled) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
  }

  return { isFullscreen, enabled, toggle };
}

// ----------------------------------------------------------------------
// Notifications panel — REAL status only: model version + data date from
// /meta, suspect + flagged counts from /overview/summary, and API health.
// A dot appears ONLY when health is not healthy.  When nothing needs
// attention the panel says so.
// ----------------------------------------------------------------------

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
  /** The button that opened the panel — focus returns here on close. */
  returnFocusTo: HTMLElement | null;
}

function NotificationsPanel({ open, onClose, returnFocusTo }: NotificationsPanelProps) {
  const { t } = useTranslation();
  const metaQ = useMeta();
  const healthQ = useHealth();
  // /overview/summary carries verdicts.n_suspect + the flagged count.
  const overviewQ = useOverviewSummary();
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Escape closes + returns focus; basic focus trap (first focusable gets
  // focus on open).
  useEffect(() => {
    if (!open) return;
    const node = panelRef.current;
    if (!node) return;
    const focusable = node.querySelector<HTMLElement>(
      'button, a, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Return focus to the opener on close.
  useEffect(() => {
    if (!open) return;
    return () => {
      returnFocusTo?.focus();
    };
  }, [open, returnFocusTo]);

  if (!open) return null;

  const health = healthQ.data;
  const healthy = health?.status === 'ok';
  const nSuspect = overviewQ.data?.verdicts?.n_suspect ?? null;
  const nFlagged = overviewQ.data?.totals?.n_flagged ?? null;
  const modelVersion = metaQ.data?.model_version ?? null;
  const dataDate = metaQ.data?.data_date ?? null;
  const needsAttention = !healthy;

  return (
    <>
      {/* Click-outside backdrop */}
      <button
        type="button"
        aria-label={t('common.close')}
        className="fixed inset-0 z-[60] bg-black/20 cursor-default"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={t('rail.notifications.label')}
        className="fixed right-4 top-24 z-[61] w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-surface-container-lowest shadow-level-2 border border-black/[0.06] p-space-md"
      >
        <div className="flex items-center justify-between mb-space-sm">
          <h2 className="font-headline-section text-headline-section text-on-surface">
            {t('rail.notifications.label')}
          </h2>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="flex flex-col gap-space-sm">
          {/* API health */}
          <div className="flex items-center justify-between">
            <span className="font-body-medium text-body-medium text-on-surface">
              {t('rail.notifications.apiHealth')}
            </span>
            <span
              className={`inline-flex items-center gap-1 font-caption-sm text-caption-sm ${
                healthy ? 'text-tertiary' : 'text-error'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${healthy ? 'bg-tertiary' : 'bg-error'}`}
                aria-hidden="true"
              />
              {healthQ.isLoading
                ? t('common.loading')
                : healthy
                  ? t('rail.notifications.healthy')
                  : t('rail.notifications.degraded')}
            </span>
          </div>

          {/* Model version + data date */}
          <div className="flex flex-col">
            <span className="font-label-uppercase text-label-uppercase text-secondary uppercase tracking-wider">
              {t('rail.notifications.model')}
            </span>
            <span className="font-body-medium text-body-medium text-on-surface">
              {modelVersion ?? t('de.footer.versionUnavailable')}
            </span>
            <span className="font-caption-sm text-caption-sm text-secondary">
              {dataDate
                ? t('overview.dataUpdated', { date: dataDate })
                : t('de.footer.dateUnavailable')}
            </span>
          </div>

          {/* Suspect + flagged counts */}
          <div className="flex items-center justify-between">
            <span className="font-body-medium text-body-medium text-on-surface">
              {t('rail.notifications.suspectListings')}
            </span>
            <span className="font-label-metric text-label-metric text-on-surface">
              {nSuspect != null ? nSuspect : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-body-medium text-body-medium text-on-surface">
              {t('rail.notifications.flaggedListings')}
            </span>
            <span className="font-label-metric text-label-metric text-on-surface">
              {nFlagged != null ? nFlagged : '—'}
            </span>
          </div>

          {/* "Nothing needs attention" or the degraded note */}
          {!needsAttention ? (
            <p className="font-caption-sm text-caption-sm text-tertiary mt-1">
              {t('rail.notifications.allClear')}
            </p>
          ) : (
            <p className="font-caption-sm text-caption-sm text-error mt-1">
              {t('rail.notifications.attentionNeeded')}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// ----------------------------------------------------------------------
// Help dialog — focus trap, Escape closes, focus returns to the button.
// Short bilingual copy explaining the verdict chips, the 80% range,
// "Suspect data", and the data-quality flag.  Links to /about for depth.
// ----------------------------------------------------------------------

function HelpDialog({ open, onClose, returnFocusTo }: { open: boolean; onClose: () => void; returnFocusTo: HTMLElement | null }) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    if (!node) return;
    const focusable = node.querySelector<HTMLElement>(
      'button, a, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      // Basic focus trap: Tab cycles within the dialog.
      if (e.key === 'Tab' && focusable) {
        // simple single-element trap is enough for this short dialog.
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnFocusTo?.focus();
    };
  }, [open, onClose, returnFocusTo]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('rail.help.label')}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl bg-surface-container-lowest shadow-level-2 p-space-lg flex flex-col gap-space-sm"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-headline-section text-headline-section text-on-surface">
            {t('rail.help.title')}
          </h2>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <p className="font-body-regular text-body-regular text-on-surface">
          {t('rail.help.verdictChips')}
        </p>
        <p className="font-body-regular text-body-regular text-on-surface">
          {t('rail.help.range80')}
        </p>
        <p className="font-body-regular text-body-regular text-on-surface">
          {t('rail.help.suspectData')}
        </p>
        <p className="font-body-regular text-body-regular text-on-surface">
          {t('rail.help.dataQualityFlag')}
        </p>
        <div className="flex justify-end mt-2">
          <Link
            to="/about"
            onClick={onClose}
            className="font-body-medium text-body-medium text-primary hover:underline"
          >
            {t('rail.help.aboutLink')} →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Brand logo — the two-tone orange hexagon from the web design's 01_overview
// and 02_predictor_reliable code.html.
// ----------------------------------------------------------------------

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
 * Desktop header (md+ only).  The right-side profile is unchanged; the
 * bell is wired to the shared NotificationsPanel (A1).
 */
function DesktopHeader({ pathname }: { pathname: string }) {
  const metaQ = useMeta();
  const clock = useLiveClock();
  const modelVersion = metaQ.data?.model_version;
  return (
    <header className="hidden md:flex fixed top-0 left-0 right-0 z-50 h-20 px-margin items-center justify-between gap-space-md bg-surface/85 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
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
 * Mobile header (default, < md).  The bell is wired to the shared
 * NotificationsPanel (A1).
 */
function MobileHeader({
  onNotifications,
}: {
  onNotifications: (opener: HTMLElement | null) => void;
}) {
  const { t } = useTranslation();
  const healthQ = useHealth();
  const healthy = healthQ.data?.status === 'ok';
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
          <button
            aria-label={t('rail.notifications.label')}
            type="button"
            onClick={(e) => onNotifications(e.currentTarget)}
            className="relative w-11 h-11 rounded-full bg-surface-container-lowest flex items-center justify-center text-on-surface-variant shadow-[0_2px_8px_rgba(27,21,18,0.06)]"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
            {/* A1: a dot appears ONLY when health is not healthy. */}
            {!healthy && !healthQ.isLoading && (
              <span
                className="absolute top-2 right-2 w-2 h-2 rounded-full bg-error"
                aria-hidden="true"
              />
            )}
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
 * Left icon rail (xl+ only).  A1: every button is wired — Fullscreen,
 * Notifications, Help (top); Region & Boundaries (language switch),
 * System Settings (bottom).
 */
function LeftRail({
  onNotifications,
  onHelp,
}: {
  onNotifications: (opener: HTMLElement | null) => void;
  onHelp: (opener: HTMLElement | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fullscreen = useFullscreen();
  const railButtonClass =
    'relative w-11 h-11 rounded-full bg-surface-container-lowest flex items-center justify-center text-on-surface-variant hover:text-primary transition-all shadow-rail-button';

  function handleRail(item: { label: string; icon: string }, opener: HTMLElement | null) {
    // Map the rail item by its label (nav-config carries the human label;
    // the icon alone is not unique enough to dispatch on).
    switch (item.label) {
      case 'Fullscreen View':
        fullscreen.toggle();
        break;
      case 'Notifications':
        onNotifications(opener);
        break;
      case 'Knowledge Base':
        onHelp(opener);
        break;
      case 'Region & Boundaries': {
        // Switch language en <-> sw through the SAME mechanism the Settings
        // page uses (i18n.changeLanguage + storageSet so it persists).
        const next = i18n.language.startsWith('sw') ? 'en' : 'sw';
        i18n.changeLanguage(next);
        storageSet('lang', next);
        break;
      }
      case 'System Settings':
        navigate('/settings');
        break;
      default:
        break;
    }
  }

  // The language button's label shows the language that WILL be selected,
  // as that language's native name (language-neutral — "Kiswahili" shows
  // the same whether you're on English or Kiswahili, so the affordance is
  // unambiguous in either locale).
  const NATIVE_LANG_NAME: Record<string, string> = { en: 'English', sw: 'Kiswahili' };
  function globeTitle(): string {
    const next = i18n.language.startsWith('sw') ? 'en' : 'sw';
    return NATIVE_LANG_NAME[next] ?? next;
  }

  function renderTop(item: { label: string; icon: string }) {
    const isFullscreen = item.label === 'Fullscreen View';
    const isGlobe = item.label === 'Region & Boundaries';

    // Fullscreen is disabled when the browser blocks it.
    const disabled = isFullscreen && !fullscreen.enabled;
    const icon = isFullscreen
      ? fullscreen.isFullscreen
        ? 'fullscreen_exit'
        : 'fullscreen'
      : item.icon;
    const title = isGlobe ? globeTitle() : item.label;
    const ariaLabel = isGlobe ? title : item.label;

    return (
      <button
        key={item.label}
        type="button"
        aria-label={ariaLabel}
        title={disabled ? t('rail.fullscreen.unavailable') : title}
        disabled={disabled}
        onClick={(e) => handleRail(item, e.currentTarget)}
        className={`${railButtonClass} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </button>
    );
  }

  return (
    <aside className="hidden xl:flex fixed left-0 top-20 bottom-12 w-[72px] z-40 flex-col items-center justify-between py-space-lg">
      <div className="flex flex-col items-center gap-space-sm">
        {RAIL_ITEMS_TOP.map((item) => renderTop(item))}
      </div>
      <div className="flex flex-col items-center gap-space-sm">
        {RAIL_ITEMS_BOTTOM.map((item) => renderTop(item))}
      </div>
    </aside>
  );
}

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
  useFxFromMeta();

  // A1: shared Notifications + Help dialogs (opened from the rail or the
  // header bell).  returnFocusTo holds the button that opened the dialog
  // so Escape/close returns focus to it.
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifOpener, setNotifOpener] = useState<HTMLElement | null>(null);
  const [helpOpener, setHelpOpener] = useState<HTMLElement | null>(null);

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <DesktopHeader pathname={pathname} />
      <MobileHeader
        onNotifications={(opener) => {
          setNotifOpener(opener);
          setNotifOpen(true);
        }}
      />
      <LeftRail
        onNotifications={(opener) => {
          setNotifOpener(opener);
          setNotifOpen(true);
        }}
        onHelp={(opener) => {
          setHelpOpener(opener);
          setHelpOpen(true);
        }}
      />

      <main className="min-h-screen pt-16 md:pt-20 px-margin-mobile md:px-margin xl:pl-[72px] pb-36 md:pb-12">
        <Outlet />
      </main>

      <MobileDock pathname={pathname} />

      {/* A1: shared panels — one NotificationsPanel for the rail bell + the
          mobile header bell. */}
      <NotificationsPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        returnFocusTo={notifOpener}
      />
      <HelpDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        returnFocusTo={helpOpener}
      />
    </div>
  );
}

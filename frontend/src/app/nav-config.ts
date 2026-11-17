export interface NavItem {
  label: string;
  /** Material Symbols Outlined icon name */
  icon: string;
  /** React Router path */
  path: string;
}

/** Action button (left rail) — not a route */
export interface RailItem {
  label: string;
  icon: string;
  /** Whether this rail button shows a notification dot (e.g. Notifications) */
  hasDot?: boolean;
}

/**
 * ICON-CONSISTENCY DECISION (was F0 open question #41, now resolved).
 *
 * The web top-bar and mobile bottom-dock use DIFFERENT Material Symbol icons
 * for the same destination (e.g. Overview: web `dashboard` vs mobile
 * `analytics`; Predictor: web `calculate` vs mobile `neurology`). This is
 * DELIBERATE and stays as-is, for the following reasons:
 *
 * 1. The mobile dock is a 5-item SUBSET of the web nav's 8 items, with
 *    abbreviated labels ("Predict" vs "Price Predictor", "Market" vs
 *    "Market Insights", "Deals" vs "Deal Finder"). It is already a
 *    condensed/different information architecture, not a 1:1 port.
 * 2. The mobile "More" item (icon `menu`) has no single web-route
 *    counterpart — it opens a sheet routing to 6+ secondary screens. At
 *    least 1 of 5 mobile items has no web equivalent anyway.
 * 3. Each device's icon set is internally self-consistent: the web icons
 *    below are the majority pattern across 9 of 10 design screens (dashboard
 *    6/9, calculate 8/9, trending_up 9/9, local_offer 4/9 tied with
 *    travel_explore, speed 6/9, lightbulb 5/9, table_chart 5/9, info 8/9);
 *    the mobile icons are consistent across all mobile screens checked
 *    (m01, m07, m15).
 * 4. A user is on one device at a time and never sees the other device's
 *    icon. The theoretical "switch devices and get confused" risk is minor
 *    for the diaspora/institutional persona, who reads the text label, not
 *    just the icon glyph.
 * 5. Overriding one design source's icons to match the other would violate
 *    that source's intent for no functional gain.
 *
 * Path names were standardised on the web paths for React Router (so
 * `/predictor` not `/predict`, `/market-insights` not `/market`); the mobile
 * dock's shorter labels are presentation-only and route to the same paths.
 */

// Web top-bar nav (8 items) — icons are the majority pattern across 9 of 10
// web design screens (01_overview, 02, 03, 04, 05, 06, 07, 08, 09 agree;
// 12_data_review is a one-off outlier with different icons and is not followed).
export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', icon: 'dashboard', path: '/' },
  { label: 'Price Predictor', icon: 'calculate', path: '/predictor' },
  { label: 'Market Insights', icon: 'trending_up', path: '/market-insights' },
  { label: 'Deal Finder', icon: 'local_offer', path: '/deal-finder' },
  { label: 'Model Performance', icon: 'speed', path: '/model-performance' },
  { label: 'Explainability', icon: 'lightbulb', path: '/explainability' },
  { label: 'Data Explorer', icon: 'table_chart', path: '/data-explorer' },
  { label: 'About', icon: 'info', path: '/about' },
];

// Mobile bottom dock (5 items) — icons from m01_overview (canonical mobile
// home screen), consistent across m01/m07/m15. Labels are the abbreviated
// mobile forms. The "More" item routes to /more which links to the 3
// secondary screens (Model Performance, Explainability, Data Explorer) plus
// About, Settings, etc.
export const MOBILE_DOCK_ITEMS: NavItem[] = [
  { label: 'Overview', icon: 'analytics', path: '/' },
  { label: 'Predict', icon: 'neurology', path: '/predictor' },
  { label: 'Market', icon: 'map', path: '/market-insights' },
  { label: 'Deals', icon: 'verified', path: '/deal-finder' },
  { label: 'More', icon: 'menu', path: '/more' },
];

// Left rail utility buttons (NOT routes — these are action buttons).
// Split into two groups: TOP (utility) and BOTTOM (system). The rail layout
// uses justify-between so these two groups pin to the top and bottom of the
// rail respectively, matching the design's 01_overview/02_predictor code.html.
export const RAIL_ITEMS_TOP: RailItem[] = [
  { label: 'Fullscreen View', icon: 'fullscreen' },
  { label: 'Notifications', icon: 'notifications', hasDot: true },
  { label: 'Knowledge Base', icon: 'help' },
];

export const RAIL_ITEMS_BOTTOM: RailItem[] = [
  { label: 'Region & Boundaries', icon: 'public' },
  { label: 'System Settings', icon: 'settings' },
];

/** @deprecated use RAIL_ITEMS_TOP / RAIL_ITEMS_BOTTOM instead */
export const RAIL_ITEMS: RailItem[] = [...RAIL_ITEMS_TOP, ...RAIL_ITEMS_BOTTOM];

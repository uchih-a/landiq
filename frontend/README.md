# Kenya Land Valuation - Frontend

A Vite + React + TypeScript + Tailwind CSS frontend for the Kenya Land
Valuation application. Provides a responsive (desktop / tablet / mobile)
shell with placeholder screens for the eight primary navigation targets,
a mobile "More" page, settings, and a 404 route.

## Tech Stack

- **Framework**: Vite 5 + React 18
- **Language**: TypeScript 5
- **Routing**: React Router v6
- **Styling**: Tailwind CSS 3 with a custom Material Design 3 inspired,
  warm-toned design system
- **Icons**: Material Symbols Outlined
- **Fonts**: Outfit (Google Fonts)

## Getting Started

```bash
# Install dependencies
npm install

# Start the dev server (http://localhost:5173)
npm run dev

# Type-check
npm run typecheck

# Lint
npm run lint

# Build for production
npm run build

# Preview the production build
npm run preview
```

The dev server proxies `/api` requests to `http://localhost:8000` (the
backend). Override this with `VITE_API_BASE_URL` (see below).

## Project Structure

```
src/
+- app/                  App shell, routing, layout
|  +- App.tsx            Route definitions
|  +- LayoutShell.tsx    Responsive layout (rail / top bar / dock)
|  +- nav-config.ts      Navigation items
+- components/           Shared UI components
|  +- ErrorBoundary.tsx
|  +- LoadingSkeleton.tsx
+- features/             Screen-level feature modules
|  +- overview/
|  +- predictor/
|  +- market-insights/
|  +- deal-finder/
|  +- model-performance/
|  +- explainability/
|  +- data-explorer/
|  +- about/
|  +- settings/
|  +- more/
|  +- not-found/
+- lib/                  Utilities and clients
|  +- api/               API client
|  +- currency/          KSh formatting
|  +- i18n/              i18n stub
+- index.css             Tailwind base + theme tokens
+- main.tsx              React entry point
```

## Environment

Copy `.env.example` to `.env` and adjust as needed:

```
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## Responsive Layout

The `LayoutShell` adapts across three breakpoints:

| Breakpoint         | Left rail | Top bar              | Bottom dock |
| ------------------ | --------- | -------------------- | ----------- |
| Desktop (`xl+`)    | 72px rail | logo + title + nav pills (icon + label) + profile | - |
| Tablet (`md`-`xl`) | hidden    | logo + scrollable icon-only nav pills            | - |
| Mobile (`<md`)     | hidden    | logo only (`h-16`)   | 5-item dock |

## Design System

All design tokens (colors, spacing, typography, border radius, shadows) are
defined in `tailwind.config.ts` as a single source of truth, following a
Material Design 3 inspired warm-toned palette suited to the Kenya land
valuation context. Components reference these tokens (`bg-surface`,
`text-on-surface`, `rounded-DEFAULT`, `px-margin`, etc.) rather than
hardcoding values.

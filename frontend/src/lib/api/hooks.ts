/**
 * React Query hooks for every read endpoint in the Kenya Land Valuation
 * API, plus the `queryClient` singleton and the `getErrorState` helper
 * used by every screen to pick the right fallback UI.
 *
 * Caching policy
 * --------------
 * The backend serves notebook-cadence artifacts (CSV/Parquet/GeoJSON
 * baked at notebook-run time — see `backend/app/services/app_exports.py`),
 * so static resources (summary, metrics, explainability, boundaries, …)
 * never change between deploys. We pin their `staleTime` to `Infinity`
 * so the first hit caches forever for the session.
 *
 * - Static notebook-cadence data .... staleTime: Infinity
 * - Per-county listings ............ staleTime: 5 min (paginated)
 * - Place typeahead ................ staleTime: 30s (debounce-aware)
 * - Nearby POIs .................... staleTime: 5 min
 * - Deal Finder .................... staleTime: 60s (paginated + filtered)
 * - Predict (POST) ................. useMutation, NO caching (fresh input)
 *
 * Error contract
 * --------------
 * Every hook returns the standard
 * `{ data, isLoading, isError, error, isFetching }` shape (React Query v5
 * computes `isLoading` as `isPending && isFetching`). Screens feed the
 * `error` into `getErrorState(error)` to switch between the rate-limit
 * banner, the `EmptyState` (F1) for `DATA_UNAVAILABLE`, and the generic
 * "Something went wrong" retry card.
 */

import {
  QueryClient,
  UseQueryOptions,
  UseQueryResult,
  keepPreviousData,
  useMutation,
  useQuery,
} from '@tanstack/react-query';

import { apiClient } from './client';
import { ApiError, RateLimitError } from './error';
import type {
  CountyListingsResponse,
  CountyRowCountsResponse,
  CountySummaryResponse,
  ExplainabilityResponse,
  FeatureEvaluationResponse,
  GeoJSONFeatureCollection,
  ErrorBySupportResponse,
  HealthResponse,
  ListingsScoredFilters,
  ListingsScoredResponse,
  MetaResponse,
  MetricsResponse,
  ModelPredictionsResponse,
  NearbyPOICategory,
  NearbyPOIsResponse,
  PlaceSearchResponse,
  PredictRequest,
  PredictResponse,
  PriceDistributionResponse,
} from './types';

// ----------------------------------------------------------------------
// queryClient — single instance shared across the app
// ----------------------------------------------------------------------

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Single retry — backend errors are usually deterministic
      // (DATA_UNAVAILABLE / 422), so aggressive retries just amplify load.
      retry: 1,
      // The data is notebook-cadence; no point refetching when the user
      // tabs back. Predict + search have their own short policies.
      refetchOnWindowFocus: false,
      // Hold the previous page while fetching the next — pagination UX.
      placeholderData: keepPreviousData,
    },
    mutations: {
      // Predict is rate-limited; don't auto-retry into the rate limiter.
      retry: 0,
    },
  },
});

// ----------------------------------------------------------------------
// useApiQuery — the shared hook pattern (consistent return contract)
// ----------------------------------------------------------------------

/**
 * The minimum contract every screen depends on. Picked from React Query's
 * `UseQueryResult` so we don't lose the framework's own derived flags
 * (e.g. `isLoading = isPending && isFetching`).
 *
 * `dataUpdatedAt` is included so the `HealthBanner` can detect fresh
 * re-checks (each refetch bumps the timestamp, even when the payload is
 * identical) — that's how a dismissed banner reappears on the next poll.
 * `refetch` is included so screens can wire a "Retry" button without
 * reaching back into the query client.
 * `isSuccess` / `isPending` round out the standard status trio so
 * consumers don't have to derive them from `isLoading`/`isError`.
 */
export type ApiQueryResult<T> = Pick<
  UseQueryResult<T>,
  | 'data'
  | 'isLoading'
  | 'isError'
  | 'error'
  | 'isFetching'
  | 'isSuccess'
  | 'isPending'
  | 'dataUpdatedAt'
  | 'refetch'
>;

interface UseApiQueryOptions {
  queryKey: unknown[];
  path: string;
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
  /**
   * Optional override for the request init (rarely needed — used for
   * custom headers like If-None-Match if a future endpoint needs it).
   */
  requestInit?: RequestInit;
}

/**
 * Thin wrapper around `useQuery` that wires the typed `apiClient.get` and
 * enforces the consistent `{ data, isLoading, isError, error, isFetching }`
 * return shape. Every static-data hook below builds on this.
 */
export function useApiQuery<T>({
  queryKey,
  path,
  enabled = true,
  staleTime,
  refetchInterval,
  requestInit,
}: UseApiQueryOptions): ApiQueryResult<T> {
  const queryOptions: UseQueryOptions<T, Error, T, unknown[]> = {
    queryKey: queryKey as unknown[],
    queryFn: () => apiClient.get<T>(path, requestInit),
    enabled,
    staleTime,
    refetchInterval,
  };
  // React Query v5's UseQueryResult already includes isLoading /
  // isError / error / isFetching / data, so the Pick<> is satisfied.
  return useQuery(queryOptions);
}

// ----------------------------------------------------------------------
// Static data — staleTime: Infinity (notebook-cadence)
// ----------------------------------------------------------------------

const INF = Infinity;

/** GET /health — polled every 30s so the banner can flip to "degraded" live. */
export function useHealth(): ApiQueryResult<HealthResponse> {
  return useApiQuery<HealthResponse>({
    queryKey: ['health'],
    path: '/health',
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

/** GET /meta — model version + coverage thresholds. */
export function useMeta(): ApiQueryResult<MetaResponse> {
  return useApiQuery<MetaResponse>({
    queryKey: ['meta'],
    path: '/meta',
    staleTime: INF,
  });
}

/** GET /counties/summary — per-county median/IQR + small-n flag (Cell 9.5). */
export function useCountySummary(): ApiQueryResult<CountySummaryResponse> {
  return useApiQuery<CountySummaryResponse>({
    queryKey: ['counties', 'summary'],
    path: '/counties/summary',
    staleTime: INF,
  });
}

/**
 * GET /counties/boundaries — raw GeoJSON FeatureCollection (Douglas-Peucker
 * simplified). Returns `GeoJSONFeatureCollection` rather than `unknown` so
 * the choropleth layer gets autocomplete on `features[i].properties`.
 */
export function useCountyBoundaries(): ApiQueryResult<GeoJSONFeatureCollection> {
  return useApiQuery<GeoJSONFeatureCollection>({
    queryKey: ['counties', 'boundaries'],
    path: '/counties/boundaries',
    staleTime: INF,
  });
}

/** GET /counties/row_counts — county picker + per-county listing counts. */
export function useCountyRowCounts(): ApiQueryResult<CountyRowCountsResponse> {
  return useApiQuery<CountyRowCountsResponse>({
    queryKey: ['counties', 'row_counts'],
    path: '/counties/row_counts',
    staleTime: INF,
  });
}

/** GET /model/metrics — metrics table + metrics.json (Cell 9.3). */
export function useModelMetrics(): ApiQueryResult<MetricsResponse> {
  return useApiQuery<MetricsResponse>({
    queryKey: ['model', 'metrics'],
    path: '/model/metrics',
    staleTime: INF,
  });
}

/** GET /model/feature-evaluation — Cell 3.8's ranked_table. */
export function useFeatureEvaluation(): ApiQueryResult<FeatureEvaluationResponse> {
  return useApiQuery<FeatureEvaluationResponse>({
    queryKey: ['model', 'feature-evaluation'],
    path: '/model/feature-evaluation',
    staleTime: INF,
  });
}

/** GET /model/explainability — shap_global + feature_importance + labels. */
export function useExplainability(): ApiQueryResult<ExplainabilityResponse> {
  return useApiQuery<ExplainabilityResponse>({
    queryKey: ['model', 'explainability'],
    path: '/model/explainability',
    staleTime: INF,
  });
}

/**
 * GET /model/predictions — OOF + test-set actual-vs-predicted values.
 * P5 wiring (known-gaps #49 RESOLVED). The `sample` param (10..10000)
 * triggers a deterministic random subset for scatter plots where the full
 * row count would be wasteful. We default to sample=500 for the scatter
 * — enough density to see the distribution shape without over-rendering.
 */
const PREDICTIONS_SAMPLE = 500;

export function useModelPredictions(
  sample: number | undefined = PREDICTIONS_SAMPLE,
): ApiQueryResult<ModelPredictionsResponse> {
  const path = sample != null ? `/model/predictions?sample=${sample}` : '/model/predictions';
  return useApiQuery<ModelPredictionsResponse>({
    queryKey: ['model', 'predictions', sample ?? 'all'],
    path,
    staleTime: INF,
  });
}

/** GET /model/error-by-support — OOF error by listing-count support bands. */
export function useErrorBySupport(): ApiQueryResult<ErrorBySupportResponse> {
  return useApiQuery<ErrorBySupportResponse>({
    queryKey: ['model', 'error-by-support'],
    path: '/model/error-by-support',
    staleTime: INF,
  });
}

/**
 * GET /data/price-distribution — log-scale price histogram + percentiles
 * + corpus counters (n_usable / n_flagged) over listings_scored.
 * Read-only summary the backend computes from the frame it already loads.
 */
export function usePriceDistribution(): ApiQueryResult<PriceDistributionResponse> {
  return useApiQuery<PriceDistributionResponse>({
    queryKey: ['data', 'price-distribution'],
    path: '/data/price-distribution',
    staleTime: 5 * 60_000,
  });
}

// ----------------------------------------------------------------------
// Per-county listings — staleTime: 5 min (paginated)
// ----------------------------------------------------------------------

const COUNTY_LISTINGS_STALE = 5 * 60_000;

/**
 * GET /counties/{county}/listings — per-listing scatter-plot data, paginated
 * by `page` / `pageSize`. Disabled when `county` is empty so the first
 * render (before the user picks a county) doesn't fire a 404-shaped
 * request against `/counties//listings`.
 */
export function useCountyListings(
  county: string,
  page: number = 1,
  pageSize: number = 50,
): ApiQueryResult<CountyListingsResponse> {
  const safeCounty = county?.trim() ?? '';
  const path =
    safeCounty === ''
      ? '/counties//listings' // never fetched (enabled=false)
      : `/counties/${encodeURIComponent(safeCounty)}/listings?page=${page}&page_size=${pageSize}`;

  return useApiQuery<CountyListingsResponse>({
    queryKey: ['counties', 'listings', safeCounty, page, pageSize],
    path,
    enabled: safeCounty !== '',
    staleTime: COUNTY_LISTINGS_STALE,
  });
}

// ----------------------------------------------------------------------
// Predict — useMutation, no caching
// ----------------------------------------------------------------------

/**
 * POST /predict — returns a `useMutation`-shaped result. The mutation is
 * NOT cached (every prediction is a fresh input), and `retry: 0` is set
 * in the `queryClient` defaults so a 429 doesn't auto-retry into the
 * rate limiter.
 */
export function usePredict() {
  return useMutation<PredictResponse, Error, PredictRequest>({
    mutationKey: ['predict'],
    mutationFn: (body: PredictRequest) =>
      apiClient.post<PredictResponse>('/predict', body),
  });
}

// ----------------------------------------------------------------------
// Place search — staleTime: 30s, enabled when query.length >= 2
// ----------------------------------------------------------------------

const PLACE_SEARCH_STALE = 30_000;

/**
 * GET /places/search?q=... — typeahead over the Kenyan places gazetteer.
 * Disabled when the query is shorter than 2 chars (the backend requires
 * `min_length=1`, but a 1-char substring would return too many noisy
 * matches; the spec mandates a 2-char floor). The caller is expected to
 * debounce the input (e.g. `useDeferredValue`) — this hook simply reacts
 * to the debounced value.
 */
export function usePlaceSearch(query: string): ApiQueryResult<PlaceSearchResponse> {
  const trimmed = query?.trim() ?? '';
  const enabled = trimmed.length >= 2;
  const path = `/places/search?q=${encodeURIComponent(trimmed)}`;

  return useApiQuery<PlaceSearchResponse>({
    queryKey: ['places', 'search', trimmed],
    path,
    enabled,
    staleTime: PLACE_SEARCH_STALE,
  });
}

// ----------------------------------------------------------------------
// Nearby POIs — staleTime: 5 min
// ----------------------------------------------------------------------

const NEARBY_POIS_STALE = 5 * 60_000;

/**
 * GET /places/nearby — named POIs within `radiusKm` of (lat, lon).
 * Disabled until both `lat` and `lon` are finite numbers so the predictor
 * screen can mount the hook unconditionally and let it idle before the
 * user has picked a location.
 */
export function useNearbyPOIs(
  lat: number | null | undefined,
  lon: number | null | undefined,
  radiusKm: number = 5,
  category?: NearbyPOICategory | null,
): ApiQueryResult<NearbyPOIsResponse> {
  const latNum = typeof lat === 'number' ? lat : NaN;
  const lonNum = typeof lon === 'number' ? lon : NaN;
  const enabled = Number.isFinite(latNum) && Number.isFinite(lonNum);

  const params = new URLSearchParams({
    lat: String(latNum),
    lon: String(lonNum),
    radius_km: String(radiusKm),
  });
  if (category) params.set('category', category);

  return useApiQuery<NearbyPOIsResponse>({
    queryKey: ['places', 'nearby', latNum, lonNum, radiusKm, category ?? null],
    path: `/places/nearby?${params.toString()}`,
    enabled,
    staleTime: NEARBY_POIS_STALE,
  });
}

// ----------------------------------------------------------------------
// Deal Finder — staleTime: 60s (paginated + filtered)
// ----------------------------------------------------------------------

const LISTINGS_SCORED_STALE = 60_000;

/**
 * Build the `/listings/scored` query string from a typed filter object.
 * Only set (non-null/undefined) fields are serialized so omitted filters
 * behave identically across callers. Booleans are emitted as `true`/
 * `false` to match the backend's `bool | None` query parser.
 *
 * Exported so non-hook callers (e.g. the full-page CSV exporter in
 * `features/deal-finder/csv-export.ts`) can build the same URL for a
 * given filter shape without duplicating the serialization logic.
 */
export function buildListingsScoredQuery(filters: ListingsScoredFilters): string {
  const params = new URLSearchParams();
  if (filters.page != null) params.set('page', String(filters.page));
  if (filters.page_size != null) params.set('page_size', String(filters.page_size));
  if (filters.county) params.set('county', filters.county);
  if (filters.prop_type) params.set('prop_type', filters.prop_type);
  if (filters.verdict) params.set('verdict', filters.verdict);
  if (filters.scored_by) params.set('scored_by', filters.scored_by);
  if (filters.data_quality_flag != null)
    params.set('data_quality_flag', String(filters.data_quality_flag));
  if (filters.near_amenity) params.set('near_amenity', filters.near_amenity);
  if (filters.radius_km != null) params.set('radius_km', String(filters.radius_km));
  if (filters.sort) params.set('sort', filters.sort);
  const qs = params.toString();
  return qs ? `/listings/scored?${qs}` : '/listings/scored';
}

/**
 * GET /listings/scored — paginated + filtered Deal Finder table. The query
 * key includes the serialized filter object so changing any filter (page,
 * verdict, county, sort, …) creates a new cache entry while leaving the
 * previous result visible via `keepPreviousData` (set in the queryClient
 * defaults) — this is what gives the table its smooth pagination UX.
 */
export function useListingsScored(
  filters: ListingsScoredFilters = {},
): ApiQueryResult<ListingsScoredResponse> {
  const path = buildListingsScoredQuery(filters);
  return useApiQuery<ListingsScoredResponse>({
    queryKey: ['listings', 'scored', filters],
    path,
    staleTime: LISTINGS_SCORED_STALE,
  });
}

// ----------------------------------------------------------------------
// getErrorState — switch-on-error helper for screens
// ----------------------------------------------------------------------

export type ErrorStateType = 'rate_limit' | 'data_unavailable' | 'generic';

export interface ErrorState {
  type: ErrorStateType;
  message: string;
  /** Only present when `type === 'rate_limit'` — seconds to wait. */
  retryAfterSeconds?: number;
}

/**
 * Reduce an arbitrary thrown value (React Query wraps unknown errors) into
 * a tagged `{ type, message, retryAfterSeconds? }` so screens can switch
 * on a single field instead of `instanceof` checks scattered everywhere.
 *
 * Mapping:
 * - `RateLimitError`               -> `rate_limit`   ("try again in Ns")
 * - `ApiError` w/ `DATA_UNAVAILABLE` -> `data_unavailable` (F1 EmptyState)
 * - anything else                  -> `generic`      (retry card)
 *
 * The screen-side rendering for each branch:
 * - `rate_limit`        -> amber banner with countdown
 * - `data_unavailable`  -> `<EmptyState icon="cloud_off" … />` (F1)
 * - `generic`           -> `<EmptyState icon="error" actionLabel="Retry" … />`
 */
export function getErrorState(error: unknown): ErrorState {
  if (error instanceof RateLimitError) {
    const n = error.retryAfterSeconds;
    return {
      type: 'rate_limit',
      message: `Too many requests — try again in ${n}s.`,
      retryAfterSeconds: n,
    };
  }

  if (error instanceof ApiError) {
    if (error.code === 'DATA_UNAVAILABLE') {
      return {
        type: 'data_unavailable',
        message:
          error.message ||
          'This data layer is not loaded yet. Try again after the backend finishes loading its artifacts.',
      };
    }
    return {
      type: 'generic',
      message: error.message || 'Something went wrong.',
    };
  }

  if (error instanceof Error) {
    return {
      type: 'generic',
      message: error.message || 'Something went wrong.',
    };
  }

  return {
    type: 'generic',
    message: 'Something went wrong.',
  };
}

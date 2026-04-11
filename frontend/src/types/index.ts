// Auth Types
export interface User {
  id: number;
  email: string;
  role: 'user' | 'admin';
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: 'bearer';
}

// Prediction Types
export interface PredictionRequest {
  location_text: string;
  size_acres: number;
  amenity_score: number;
  accessibility_score: number;
  infrastructure_score: number;
}

export interface FeatureBreakdown {
  name: string;
  value: string;
  unit: string;
  influence: string;
  direction: string;
}

export interface PredictionResponse {
  id: number;
  county: string | null;
  geocode_source: string | null;
  size_acres: number;
  model_used: 'mlp';
  price_per_acre_ksh: number;
  price_total_ksh: number;
  price_low_ksh: number;
  price_high_ksh: number;
  features: FeatureBreakdown[];
  created_at: string;
  is_beta: boolean;
}

export interface PredictionHistory {
  id: number;
  location_text: string;
  county: string | null;
  size_acres: number;
  model_used: 'mlp';
  price_per_acre_ksh: number;
  price_total_ksh: number;
  created_at: string;
}

export interface PredictionHistoryPage {
  items: PredictionHistory[];
  total: number;
  page: number;
  pages: number;
}

// Market Types
export interface MarketSummary {
  total_listings: number;
  counties_covered: number;
  national_median_price_per_acre: number;
  national_avg_price_per_acre: number;
  most_expensive_county: string;
  best_value_county: string;
  ols_r2: number;
  total_predictions_made: number;
  last_updated: string;
}

export interface CountyStat {
  county: string;
  avg_price_per_acre: number;
  median_price_per_acre: number;
  listing_count: number;
  min_price: number;
  max_price: number;
  avg_size_acres: number;
  median_amenities_score: number;
  median_accessibility_score: number;
  latitude_centroid: number | null;
  longitude_centroid: number | null;
}

export interface SpatialListing {
  latitude: number;
  longitude: number;
  price_per_acre: number;
  size_acres: number;
  county: string;
}

export interface ProximityPoint {
  county: string;
  dist_km: number;
  log_price: number;
  price_ksh: number;
  listing_count: number;
}

export interface ProximityData {
  nairobi: ProximityPoint[];
  reference_city: ProximityPoint[];
}

export interface ScoreBin {
  bin: string;
  median_price: number;
  q25_price: number;
  q75_price: number;
  listing_count: number;
  reliable: boolean;
}

export interface ScoreData {
  amenities: ScoreBin[];
  accessibility: ScoreBin[];
}

export interface InvestmentCounty {
  county: string;
  rank: number;

  /** Weighted composite investment score — 0 to 1 */
  investment_score: number;

  /** Raw market data */
  median_price_per_acre: number;
  listing_count: number;

  /** Backward-compat */
  median_amenities_score: number;
  median_accessibility_score: number;

  // ── Five 0-1 dimension scores for the stacked bar chart ──
  affordability_score: number;  // weight 35%
  amenity_score: number;  // weight 20%
  access_score: number;  // weight 20%
  infrastructure_score: number;  // weight 15%
  proximity_score: number;  // weight 10%
}

/** One individual listing's proximity data point */
export interface RawProximityPoint {
  county: string;
  dist_km: number;
  log_price: number;
  price_ksh: number;
}

/**
 * Response shape from GET /api/v1/market/proximity/raw
 * Both arrays contain unaggregated, per-listing records.
 */
export interface RawProximityData {
  nairobi: RawProximityPoint[];
  reference_city: RawProximityPoint[];
}
// UI Types
export type Theme = 'light' | 'dark';
export type DashboardTab = 'market' | 'history';
export type SpatialTab = 'scatter' | 'choropleth' | 'idw';
export type ScoreTab = 'amenities' | 'accessibility';

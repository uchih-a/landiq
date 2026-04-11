import { clsx, type ClassValue } from 'clsx';

/**
 * Merge class names, filtering out falsy values
 */
export function cn(...classes: ClassValue[]): string {
  return clsx(classes);
}

/**
 * Format a number as Kenyan Shillings (KES)
 * Examples: 1234567 → "KES 1.2M", 234000 → "KES 234K", 1234 → "KES 1,234"
 */
export function formatKES(n: number): string {
  if (n >= 1_000_000_000) {
    return `KES ${(n / 1_000_000_000).toFixed(1)}B`;
  }
  if (n >= 1_000_000) {
    return `KES ${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `KES ${(n / 1_000).toFixed(0)}K`;
  }
  return `KES ${n.toLocaleString()}`;
}

/**
 * Format a number with comma separators
 */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format a price per acre with full precision
 */
export function formatPricePerAcre(n: number): string {
  return `KES ${n.toLocaleString()}`;
}

/**
 * Compute linear regression (least squares)
 * Returns: slope, intercept, and R²
 */
export function computeLinearRegression(
  data: { x: number; y: number }[]
): { slope: number; intercept: number; r2: number } {
  const n = data.length;
  if (n < 2) {
    return { slope: 0, intercept: 0, r2: 0 };
  }

  const sumX = data.reduce((sum, p) => sum + p.x, 0);
  const sumY = data.reduce((sum, p) => sum + p.y, 0);
  const sumXY = data.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = data.reduce((sum, p) => sum + p.x * p.x, 0);
  const sumYY = data.reduce((sum, p) => sum + p.y * p.y, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R²
  const yMean = sumY / n;
  const ssTotal = data.reduce((sum, p) => sum + Math.pow(p.y - yMean, 2), 0);
  const ssResidual = data.reduce(
    (sum, p) => sum + Math.pow(p.y - (slope * p.x + intercept), 2),
    0
  );
  const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { slope, intercept, r2 };
}

/**
 * Compute quantile thresholds for a set of values
 * Returns n-1 thresholds dividing values into n equal quantile groups
 */
export function computeQuantileThresholds(
  values: number[],
  n: number
): number[] {
  if (values.length === 0 || n < 2) {
    return [];
  }

  const sorted = [...values].sort((a, b) => a - b);
  const thresholds: number[] = [];

  for (let i = 1; i < n; i++) {
    const idx = (i / n) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    const frac = idx - lower;

    if (lower === upper) {
      thresholds.push(sorted[lower]);
    } else {
      thresholds.push(sorted[lower] * (1 - frac) + sorted[upper] * frac);
    }
  }

  return thresholds;
}

/**
 * Format a date string to a readable format
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date to month/year only
 */
export function formatMonthYear(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
  });
}

/**
 * Get color for a score value (0-100)
 */
export function getScoreColor(score: number): string {
  if (score >= 67) return 'text-forest';
  if (score >= 34) return 'text-earth';
  return 'text-alert';
}

/**
 * Get badge variant for a score value
 */
export function getScoreBadgeVariant(score: number): 'green' | 'amber' | 'red' {
  if (score >= 67) return 'green';
  if (score >= 34) return 'amber';
  return 'red';
}

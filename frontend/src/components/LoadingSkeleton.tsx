interface LoadingSkeletonProps {
  className?: string;
}

/**
 * Generic animated placeholder block. Renders an amber-toned surface block
 * that pulses, suitable for filling in layout space while data loads.
 */
export function LoadingSkeleton({ className = '' }: LoadingSkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-surface-container rounded-DEFAULT ${className}`.trim()}
      aria-hidden="true"
    />
  );
}

/**
 * Card-shaped skeleton with a few internal skeleton lines, suitable for
 * representing a loading metric/KPI card or list item.
 */
export function LoadingSkeletonCard({ className = '' }: LoadingSkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-surface-container p-6 shadow-level-1 ${className}`.trim()}
      aria-hidden="true"
    >
      <div className="h-4 w-1/3 rounded-full bg-surface-container-high mb-4" />
      <div className="h-8 w-2/3 rounded-full bg-surface-container-high mb-6" />
      <div className="h-3 w-full rounded-full bg-surface-container-high mb-2" />
      <div className="h-3 w-5/6 rounded-full bg-surface-container-high" />
    </div>
  );
}

export default LoadingSkeleton;

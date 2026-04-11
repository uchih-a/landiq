import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('skeleton', className)} />;
}

export function SkeletonText({
  lines = 1,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function SkeletonCard({
  height = '200px',
  className,
}: {
  height?: string;
  className?: string;
}) {
  return (
    <Skeleton
      className={cn('w-full rounded-card', className)}
      style={{ height }}
    />
  );
}

export function SkeletonKpiCard({ className }: { className?: string }) {
  return (
    <div className={cn('card space-y-3', className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export function SkeletonChart({
  height = '300px',
  className,
}: {
  height?: string;
  className?: string;
}) {
  return (
    <Skeleton
      className={cn('w-full rounded-card', className)}
      style={{ height }}
    />
  );
}

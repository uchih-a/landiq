import { Skeleton } from './Skeleton';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: string;
  isLoading?: boolean;
  error?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  value,
  isLoading = false,
  error = false,
  className,
}: KpiCardProps) {
  if (isLoading) {
    return <SkeletonKpiCard className={className} />;
  }

  return (
    <div className={cn('card', className)}>
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-1">
        {label}
      </p>
      <p
        className={cn(
          'stats-number',
          error && 'text-[var(--text-muted)]'
        )}
      >
        {error ? '—' : value}
      </p>
    </div>
  );
}

function SkeletonKpiCard({ className }: { className?: string }) {
  return (
    <div className={cn('card space-y-3', className)}>
      <div className="h-3 w-20 skeleton" />
      <div className="h-8 w-28 skeleton" />
    </div>
  );
}

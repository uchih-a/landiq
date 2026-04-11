import { MapPin } from 'lucide-react';
import { usePredictionHistory } from '@/hooks/usePrediction';
import { formatDate, formatKES } from '@/lib/utils';
import { Skeleton } from './Skeleton';

export function HistoryTable() {
  const { data, isLoading, error } = usePredictionHistory(1, 10);

  if (isLoading) {
    return (
      <div className="card space-y-4">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-12">
        <p className="text-[var(--text-secondary)]">Failed to load history.</p>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary mt-4"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data?.items?.length) {
    return (
      <div className="card text-center py-16">
        <div className="h-16 w-16 rounded-full bg-[var(--surface)] flex items-center justify-center mx-auto mb-4">
          <MapPin className="h-8 w-8 text-[var(--text-muted)]" />
        </div>
        <h3 className="font-serif font-semibold text-lg text-[var(--text-primary)] mb-2">
          You haven't made any valuations yet
        </h3>
        <p className="text-[var(--text-secondary)] mb-6">
          Start by creating your first land valuation
        </p>
        <a href="/estimate" className="btn-primary">
          Make Your First Valuation
        </a>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <h3 className="font-serif font-semibold text-lg text-[var(--text-primary)] mb-4">
        My Valuations ({data.total})
      </h3>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Location
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                County
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Size (acres)
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Est. Price/Acre
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Total Value
              </th>
              <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)] transition-colors"
              >
                <td className="py-3 px-4 text-sm text-[var(--text-primary)]">
                  {item.location_text}
                </td>
                <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">
                  {item.county || '—'}
                </td>
                <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">
                  {item.size_acres.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-sm font-mono text-[var(--text-primary)]">
                  {formatKES(item.price_per_acre_ksh)}
                </td>
                <td className="py-3 px-4 text-sm font-mono text-[var(--text-primary)]">
                  {formatKES(item.price_total_ksh)}
                </td>
                <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                  {formatDate(item.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {data.items.map((item) => (
          <div
            key={item.id}
            className="border border-[var(--border)] rounded-lg p-4"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-medium text-[var(--text-primary)]">
                  {item.location_text}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {item.county || '—'}
                </p>
              </div>
              <span className="text-xs text-[var(--text-muted)]">
                {formatDate(item.created_at)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-[var(--border)]">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Size</p>
                <p className="font-mono text-sm">{item.size_acres.toFixed(2)} ac</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Price/Acre</p>
                <p className="font-mono text-sm">
                  {formatKES(item.price_per_acre_ksh)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Total</p>
                <p className="font-mono text-sm">
                  {formatKES(item.price_total_ksh)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {data.pages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--border)]">
          <button
            disabled={data.page <= 1}
            className="text-sm text-[var(--text-secondary)] disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-[var(--text-muted)]">
            Page {data.page} of {data.pages}
          </span>
          <button
            disabled={data.page >= data.pages}
            className="text-sm text-[var(--text-secondary)] disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

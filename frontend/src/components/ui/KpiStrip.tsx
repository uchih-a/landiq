import { useMarketSummary } from '@/hooks/useMarketData';
import { usePredictionHistory } from '@/hooks/usePrediction';
import { formatKES, formatNumber, formatMonthYear } from '@/lib/utils';
import { KpiCard } from './KpiCard';

interface KpiStripProps {
  mode: 'market' | 'history';
  countyFilter: string | null;
}

export function KpiStrip({ mode, countyFilter }: KpiStripProps) {
  const { data: summary, isLoading: summaryLoading } = useMarketSummary(countyFilter);
  const { data: history, isLoading: historyLoading } = usePredictionHistory(1, 100);

  if (mode === 'market') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label={countyFilter ? `Listings in ${countyFilter}` : 'Total Listings'}
          value={formatNumber(summary?.total_listings || 0)}
          isLoading={summaryLoading}
        />
        <KpiCard
          label="Counties Covered"
          value={`${summary?.counties_covered || 0}`}
          isLoading={summaryLoading}
        />
        <KpiCard
          label="Median Price / Acre"
          value={formatKES(summary?.national_median_price_per_acre || 0)}
          isLoading={summaryLoading}
        />
        <KpiCard
          label="Most Expensive"
          value={summary?.most_expensive_county || '—'}
          isLoading={summaryLoading}
        />
        <KpiCard
          label="Best Value"
          value={summary?.best_value_county || '—'}
          isLoading={summaryLoading}
        />
      </div>
    );
  }

  // My Valuations KPIs
  const totalValuations = history?.total || 0;
  const mostSearchedCounty = history?.items?.length
    ? getMostFrequentCounty(history.items)
    : '—';
  const avgPrice = history?.items?.length
    ? Math.round(
        history.items.reduce((sum, item) => sum + item.price_per_acre_ksh, 0) /
          history.items.length
      )
    : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard
        label="My Valuations"
        value={`${totalValuations}`}
        isLoading={historyLoading}
      />
      <KpiCard
        label="Most Searched"
        value={mostSearchedCounty}
        isLoading={historyLoading}
      />
      <KpiCard
        label="Avg Price / Acre"
        value={avgPrice ? formatKES(avgPrice) : '—'}
        isLoading={historyLoading}
      />
      <KpiCard
        label="Member Since"
        value={history?.items?.[0]?.created_at ? formatMonthYear(history.items[0].created_at) : '—'}
        isLoading={historyLoading}
      />
    </div>
  );
}

function getMostFrequentCounty(items: { county: string | null }[]): string {
  const counts: Record<string, number> = {};
  items.forEach((item) => {
    if (item.county) {
      counts[item.county] = (counts[item.county] || 0) + 1;
    }
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || '—';
}

import { useCounties } from '@/hooks/useMarketData';
import { useDashboardStore } from '@/store';

export function CountyFilter() {
  const { countyFilter, setCountyFilter } = useDashboardStore();
  const { data: counties, isLoading } = useCounties();

  const sortedCounties = counties
    ? [...counties].sort((a, b) => a.county.localeCompare(b.county))
    : [];

  if (isLoading) {
    return <div className="h-10 w-48 skeleton rounded-md" />;
  }

  return (
    <select
      value={countyFilter ?? ''}
      onChange={(e) => setCountyFilter(e.target.value || null)}
      className="h-10 px-3 pr-8 rounded-md text-sm font-medium
        bg-[var(--surface)] text-[var(--text-secondary)]
        border border-[var(--border)]
        focus:outline-none focus:ring-2 focus:ring-forest focus:border-forest
        cursor-pointer transition-colors hover:border-forest"
    >
      <option value="">All Kenya</option>
      {sortedCounties.map((c) => (
        <option key={c.county} value={c.county}>
          {c.county}
        </option>
      ))}
    </select>
  );
}
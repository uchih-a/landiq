import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ErrorBar,
} from 'recharts';
import { useScoreData } from '@/hooks/useMarketData';
import { useDashboardStore } from '@/store';
import { formatKES } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

const COLORS = ['#A8C5A0', '#8FB890', '#C8781A', '#C0522B', '#8C3A1C'];

export function AmenitiesScoreChart() {
  const { countyFilter } = useDashboardStore();
  const { data, isLoading } = useScoreData(countyFilter);

  if (isLoading) {
    return <Skeleton className="h-[300px] w-full" />;
  }

  const amenitiesData = data?.amenities || [];

  return (
    <div className="h-[320px] md:h-[400px]">
      {/* Correlation Badge */}
      <div className="mb-4">
        <span className="badge-green text-xs">r = +0.52</span>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={amenitiesData}
          margin={{ top: 20, right: 30, left: 70, bottom: 50 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          
          <XAxis
            dataKey="bin"
            interval={0}
            height={50}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={{ stroke: 'var(--text-muted)' }}
            axisLine={{ stroke: 'var(--text-muted)' }}
            label={{
              value: 'Amenities Score Range',
              position: 'insideBottom',
              offset: -10,
              fill: 'var(--text-secondary)',
              fontSize: 12,
            }}
          />
          
          <YAxis
            tickFormatter={(v) => formatKES(v)}
            width={70}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={{ stroke: 'var(--text-muted)' }}
            axisLine={{ stroke: 'var(--text-muted)' }}
            label={{
              value: 'Median Price / Acre (KES)',
              angle: -90,
              position: 'insideLeft',
              offset: 20,
              fill: 'var(--text-secondary)',
              fontSize: 12,
            }}
          />
          
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-3 shadow-elevated">
                    <p className="font-medium text-[var(--text-primary)]">
                      Score Range: {data.bin}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Median: {formatKES(data.median_price)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Q1: {formatKES(data.q25_price)} | Q3: {formatKES(data.q75_price)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      n = {data.listing_count}
                    </p>
                    {!data.reliable && (
                      <p className="text-xs text-alert mt-1">
                        ⚠ Fewer than 5 listings
                      </p>
                    )}
                  </div>
                );
              }
              return null;
            }}
          />
          
          <Bar 
            dataKey="median_price" 
            radius={[4, 4, 0, 0]}
            maxBarSize={100}
          >
            {amenitiesData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
                fillOpacity={entry.reliable ? 1 : 0.5}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-2 text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-[var(--sage)]" />
          <span>Median Price/Acre</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-[var(--text-muted)]" />
          <span>IQR (25th-75th percentile)</span>
        </div>
      </div>

      <p className="text-xs text-[var(--text-muted)] mt-4 text-center">
        Scores are computed from OpenStreetMap data using a gravity decay model.
        Bins with fewer than 5 listings are marked as unreliable.
      </p>
    </div>
  );
}
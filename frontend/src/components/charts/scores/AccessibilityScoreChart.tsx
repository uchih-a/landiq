import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';
import { useScoreData } from '@/hooks/useMarketData';
import { useDashboardStore } from '@/store';
import { formatKES } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

// Blue-teal ramp matching the accessibility theme
const COLORS = ['#bfdbfe', '#60a5fa', '#2563eb', '#1d4ed8', '#1e3a8a'];

// Custom label that avoids overlapping by only showing on reliable bins
function SmartLabel(props: any) {
  const { x, y, width, height, value, reliable } = props;
  if (!reliable || height < 28) return null;
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="#fff"
      fontSize={11}
      fontWeight={500}
    >
      {formatKES(value)}
    </text>
  );
}

export function AccessibilityScoreChart() {
  const { countyFilter } = useDashboardStore();
  const { data, isLoading } = useScoreData(countyFilter);

  if (isLoading) return <Skeleton className="h-[300px] w-full" />;

  const accessData = data?.accessibility || [];

  return (
    <div>
      {/* Correlation badge */}
      <div className="mb-4">
        <span className="badge-blue text-xs">r = +0.48</span>
      </div>

      <div className="h-[300px] md:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={accessData}
            margin={{ top: 24, right: 30, left: 70, bottom: 48 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="bin"
              stroke="var(--text-muted)"
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              label={{
                value: 'Accessibility Score Range',
                position: 'insideBottom',
                offset: -32,
                style: { fill: 'var(--text-secondary)', fontSize: 12 },
              }}
            />
            <YAxis
              tickFormatter={(v) => formatKES(v)}
              stroke="var(--text-muted)"
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              width={68}
              label={{
                value: 'Median Price / Acre (KES)',
                angle: -90,
                position: 'insideLeft',
                offset: 16,
                style: { fill: 'var(--text-secondary)', fontSize: 12 },
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-3 shadow-elevated">
                    <p className="font-medium text-[var(--text-primary)]">
                      Score Range: {d.bin}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Median: {formatKES(d.median_price)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Q1: {formatKES(d.q25_price)} | Q3: {formatKES(d.q75_price)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      n = {d.listing_count}
                    </p>
                    {!d.reliable && (
                      <p className="text-xs text-amber-500 mt-1">
                        ⚠ Fewer than 5 listings
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <Bar dataKey="median_price" radius={[4, 4, 0, 0]} maxBarSize={80}>
              {accessData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  fillOpacity={entry.reliable ? 1 : 0.4}
                />
              ))}
              <LabelList
                dataKey="median_price"
                content={(props: any) =>
                  SmartLabel({ ...props, reliable: accessData[props.index]?.reliable })
                }
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-2 text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-[#2563eb]" />
          <span>Median Price / Acre</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-[#2563eb] opacity-40" />
          <span>Unreliable (&lt;5 listings)</span>
        </div>
      </div>

      <p className="text-xs text-[var(--text-muted)] mt-3 text-center">
        Accessibility scores computed from OpenStreetMap road network data.
        Bins with fewer than 5 listings are marked as unreliable.
      </p>
    </div>
  );
}
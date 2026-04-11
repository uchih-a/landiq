import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend
} from 'recharts';
import { useRawProximityData } from '@/hooks/useMarketData';
import { useDashboardStore } from '@/store';
import { formatKES } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

interface ProximityChartProps {
  target: 'nairobi' | 'reference_city';
}

// A beautiful, distinct color palette for the different towns
const TOWN_COLORS = [
  '#2dd4bf', // Teal (Nanyuki)
  '#3b82f6', // Blue (Rumuruti)
  '#22c55e', // Green (Naivasha)
  '#f97316', // Orange (Malindi)
  '#a855f7', // Purple (Ngong)
  '#ec4899', // Pink (Athi River)
  '#eab308', // Yellow
  '#06b6d4', // Cyan
];

// Helper function to calculate linear regression line segment
function calculateRegressionLine(data: any[]) {
  const cleanData = data.filter(
    (d: any) => typeof d.dist_km === 'number' && typeof d.log_price === 'number'
  );

  if (cleanData.length < 2) return null;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  const n = cleanData.length;

  cleanData.forEach((d: any) => {
    sumX += d.dist_km;
    sumY += d.log_price;
    sumXY += d.dist_km * d.log_price;
    sumXX += d.dist_km * d.dist_km;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const minX = Math.min(...cleanData.map((d: any) => d.dist_km));
  const maxX = Math.max(...cleanData.map((d: any) => d.dist_km));

  return [
    { x: minX, y: slope * minX + intercept },
    { x: maxX, y: slope * maxX + intercept }
  ];
}

export function NairobiProximityChart({ target }: ProximityChartProps) {
  const { countyFilter } = useDashboardStore();
  const { data, isLoading } = useRawProximityData(countyFilter);

  // ── 1. Process Data & Grouping ─────────────────────────────────────────────
  const { groupedSeries, trendlines } = useMemo(() => {
    const rawData = target === 'nairobi' ? data?.nairobi : data?.reference_city;
    const validData = rawData || [];

    if (validData.length === 0) return { groupedSeries: [], trendlines: [] };

    // If looking at Nairobi, treat it as one giant group
    if (target === 'nairobi') {
      return {
        groupedSeries: [{ name: 'Nairobi', data: validData, color: '#6366f1' }], // Indigo
        trendlines: [{ name: 'Nairobi', segment: calculateRegressionLine(validData), color: '#f43f5e' }] // Neon Rose line
      };
    }

    // If looking at Nearest Town, group by the reference town
    const groups: Record<string, any[]> = {};
    validData.forEach((d: any) => {
      // Fallback to county if ref_town is missing in the DB
      const groupName = d.ref_town || d.county || 'Other';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(d);
    });

    // Convert object to arrays and assign colors
    const seriesArr: any[] = [];
    const linesArr: any[] = [];

    Object.keys(groups).sort().forEach((town, index) => {
      const townData = groups[town];
      const color = TOWN_COLORS[index % TOWN_COLORS.length];

      seriesArr.push({ name: town, data: townData, color });
      linesArr.push({ name: town, segment: calculateRegressionLine(townData), color });
    });

    return { groupedSeries: seriesArr, trendlines: linesArr };
  }, [data, target]);

  if (isLoading) {
    return <Skeleton className="h-[360px] w-full rounded-xl bg-slate-800/50" />;
  }

  if (groupedSeries.length === 0) {
    return (
      <div className="h-[360px] flex items-center justify-center text-slate-500 text-sm">
        No proximity data available for this selection.
      </div>
    );
  }

  return (
    <div className="h-[400px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: target === 'reference_city' ? 40 : 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={true} vertical={false} opacity={0.5} />

          <XAxis
            type="number"
            dataKey="dist_km"
            name="Distance"
            unit=" km"
            stroke="#64748b"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: '#334155' }}
          />

          <YAxis
            type="number"
            dataKey="log_price"
            name="Price"
            stroke="#64748b"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => formatKES(Math.exp(val))}
            domain={['dataMin - 0.5', 'dataMax + 0.5']}
          />

          <Tooltip
            cursor={{ strokeDasharray: '3 3', stroke: '#475569' }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const point = payload[0].payload;
                const seriesName = payload[0].name; // Gets the town name
                return (
                  <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl">
                    <div className="font-bold text-slate-100 mb-1 pb-1 border-b border-slate-700 flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: payload[0].color }}
                      />
                      {seriesName === 'Nairobi' ? (point.county || 'Listing') : seriesName}
                    </div>
                    <div className="text-sm text-slate-300 mt-2">
                      <span className="font-semibold text-white">
                        {formatKES(point.price_per_acre || Math.exp(point.log_price))}
                      </span> / acre
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {point.dist_km.toFixed(1)} km from {target === 'nairobi' ? 'Nairobi' : seriesName}
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />

          {/* Only show Legend when grouping by Nearest Town */}
          {target === 'reference_city' && (
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ fontSize: '12px', color: '#cbd5e1', paddingBottom: '10px' }}
            />
          )}

          {/* Reference line for Nairobi Metro Boundary */}
          {target === 'nairobi' && (
            <ReferenceLine
              x={40}
              stroke="#fbbf24"
              strokeDasharray="4 4"
              opacity={0.4}
              label={{
                value: 'Nairobi Metro Edge',
                position: 'insideTopRight',
                fill: '#fbbf24',
                fontSize: 11,
              }}
            />
          )}

          {/* Render Trendlines (Multiple for Nearest Town, Single for Nairobi) */}
          {trendlines.map((line, idx) => (
            line.segment && (
              <ReferenceLine
                key={`trendline-${idx}`}
                segment={line.segment}
                stroke={line.color}
                strokeWidth={2}
                opacity={0.9}
                // Don't show line in legend, the scatter dots will handle the legend
                isFront={true}
              />
            )
          ))}

          {/* Render Scatter Points (Multiple series for Nearest Town, Single for Nairobi) */}
          {groupedSeries.map((series, idx) => (
            <Scatter
              key={`scatter-${idx}`}
              name={series.name}
              data={series.data}
              fill={series.color}
              fillOpacity={0.6}
              line={false}
              shape="circle"
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
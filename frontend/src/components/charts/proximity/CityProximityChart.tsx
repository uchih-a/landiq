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
  Label,
} from 'recharts';
import { useRawProximityData } from '@/hooks/useMarketData';
import { useDashboardStore } from '@/store';
import { formatKES } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

// ── Statistical helpers ──────────────────────────────────────────────────────
function calculateRegression(x: number[], y: number[]) {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R-squared calculation
  const yMean = sumY / n;
  const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
  const ssResidual = y.reduce((sum, yi, i) => sum + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
  const rSquared = 1 - (ssResidual / ssTotal);

  return { slope, intercept, rSquared };
}

// ── LOWESS smoother (tricube weighted, bandwidth = 0.3) ──────────────────────
function lowess(
  data: { x: number; y: number }[],
  bandwidth = 0.3,
  steps = 60
): { x: number; y: number }[] {
  if (data.length < 4) return [];

  const sorted = [...data].sort((a, b) => a.x - b.x);
  const n = sorted.length;
  const h = Math.ceil(bandwidth * n);
  const xs = sorted.map((d) => d.x);
  const ys = sorted.map((d) => d.y);

  const minX = xs[0];
  const maxX = xs[n - 1];
  const step = (maxX - minX) / (steps - 1);

  const result: { x: number; y: number }[] = [];

  for (let s = 0; s < steps; s++) {
    const x0 = minX + s * step;

    const dists = xs.map((x) => Math.abs(x - x0));
    const maxDist = dists.sort((a, b) => a - b)[h - 1] || 1e-9;

    let num = 0;
    let den = 0;

    for (let i = 0; i < n; i++) {
      const w = Math.pow(1 - Math.pow(Math.min(1, dists[i] / maxDist), 3), 3);
      if (w > 0) {
        num += w * ys[i];
        den += w;
      }
    }
    result.push({ x: x0, y: den > 0 ? num / den : 0 });
  }

  return result;
}

export function CityProximityChart() {
  const { countyFilter } = useDashboardStore();
  const { data, isLoading } = useRawProximityData(countyFilter);

  const { nairobiData, countyData, nairobiTrend, countyTrend, stats } = useMemo(() => {
    const validData = data?.reference_city || [];

    if (validData.length === 0) {
      return {
        nairobiData: [],
        countyData: [],
        nairobiTrend: [],
        countyTrend: [],
        stats: null,
      };
    }

    // Split data by reference type
    const nairobiPoints = validData
      .filter((d: any) => d.reference_type === 'nairobi' || d.ref_city === 'Nairobi')
      .map((d: any) => ({
        ...d,
        x: d.dist_km,
        y: d.log_price,
        fill: '#4682b4', // Steel blue for Nairobi
      }))
      .filter((d: any) => !isNaN(d.x) && !isNaN(d.y));

    const countyPoints = validData
      .filter((d: any) => d.reference_type === 'county' || d.ref_city !== 'Nairobi')
      .map((d: any) => ({
        ...d,
        x: d.dist_km,
        y: d.log_price,
        fill: '#ff8c00', // Dark orange for county towns
      }))
      .filter((d: any) => !isNaN(d.x) && !isNaN(d.y));

    // Calculate LOWESS trends for each group
    const nairobiTrend = lowess(nairobiPoints, 0.4, 60);
    const countyTrend = lowess(countyPoints, 0.4, 60);

    // Calculate regression stats for combined data
    const allPoints = [...nairobiPoints, ...countyPoints];
    const xValues = allPoints.map((p) => p.x);
    const yValues = allPoints.map((p) => p.y);
    const regression = calculateRegression(xValues, yValues);

    const stats = {
      n: allPoints.length,
      nairobiN: nairobiPoints.length,
      countyN: countyPoints.length,
      rSquared: regression.rSquared,
      slope: regression.slope,
      intercept: regression.intercept,
    };

    return {
      nairobiData: nairobiPoints,
      countyData: countyPoints,
      nairobiTrend,
      countyTrend,
      stats,
    };
  }, [data]);

  if (isLoading) return <Skeleton className="w-full h-[400px] bg-gray-100" />;
  if (!stats || stats.n === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center text-gray-500 bg-white rounded-lg">
        No proximity data available.
      </div>
    );
  }

  return (
    // AFTER
<div className="relative w-full h-[550px] bg-white rounded-lg p-4">
      {/* Title matching the image style */}
      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-900 text-center">
          Distance from the Local Reference City Independently Explains Land Price Variation
        </h3>
        <p className="text-sm text-gray-600 text-center mt-1">
          <span className="inline-flex items-center">
            <span className="w-3 h-3 rounded-full bg-blue-600 mr-1"></span>
            Blue = parcels referenced to Nairobi
          </span>
          <span className="mx-2">|</span>
          <span className="inline-flex items-center">
            <span className="w-3 h-3 rounded-full bg-orange-500 mr-1"></span>
            Orange = parcels referenced to county town
          </span>
        </p>
      </div>

      {/* Stats box like in the image */}
      <div className="absolute top-4 right-4 bg-white/90 border border-gray-300 rounded-md p-3 shadow-sm z-10 text-xs">
        <div className="font-semibold text-gray-700 mb-2 border-b border-gray-200 pb-1">
          (blue = Nairobi counties, orange = others)
        </div>
        <div className="text-gray-600">
          <div>Nairobi reference (n={stats.nairobiN})</div>
          <div>County town reference (n={stats.countyN})</div>
          <div className="mt-1 pt-1 border-t border-gray-200">
            <span className="text-red-600 font-medium">Average trend (LOWESS)</span>
          </div>
          <div className="mt-1 text-gray-500">
            R² = {stats.rSquared.toFixed(3)} | slope = {stats.slope.toFixed(4)}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 60 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#d1d5db"
            opacity={0.5}
          />

          <XAxis
            type="number"
            dataKey="x"
            name="Distance"
            unit=" km"
            stroke="#374151"
            tick={{ fill: '#4b5563', fontSize: 11 }}
            tickLine={{ stroke: '#9ca3af' }}
            axisLine={{ stroke: '#9ca3af' }}
            domain={['auto', 'auto']}
            label={{
              value: 'Distance from Reference City (km)',
              position: 'bottom',
              offset: 0,
              fill: '#374151',
              fontSize: 12,
              fontWeight: 500,
            }}
          />

          <YAxis
            type="number"
            dataKey="y"
            name="Log Price"
            stroke="#374151"
            tick={{ fill: '#4b5563', fontSize: 11 }}
            tickLine={{ stroke: '#9ca3af' }}
            axisLine={{ stroke: '#9ca3af' }}
            domain={['auto', 'auto']}
            tickFormatter={(val) => {
              const price = Math.exp(val);
              if (price >= 1_000_000) return `KSh ${(price / 1_000_000).toFixed(0)}M`;
              if (price >= 1_000) return `KSh ${(price / 1_000).toFixed(0)}K`;
              return `KSh ${price.toFixed(0)}`;
            }}
            label={{
              value: 'Price per Acre — log scale (KSh equivalent)',
              angle: -90,
              position: 'insideLeft',
              fill: '#374151',
              fontSize: 12,
              fontWeight: 500,
            }}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const point = payload[0].payload;
                if (!point.county) return null;

                const price = point.price_ksh || Math.exp(point.log_price);
                const isNairobi = point.fill === '#4682b4';

                return (
                  <div className="bg-white/95 border border-gray-300 p-3 rounded-lg shadow-lg">
                    <div className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
                      {point.county}
                    </div>
                    <div
                      className="text-xs font-medium mb-2"
                      style={{ color: isNairobi ? '#4682b4' : '#ff8c00' }}
                    >
                      {isNairobi ? 'Nairobi reference' : 'County town reference'}
                    </div>
                    <div className="text-sm text-gray-700">
                      <span className="font-bold text-gray-900">
                        {formatKES(price)}
                      </span>{' '}
                      / acre
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {point.dist_km.toFixed(1)} km from reference city
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />

          {/* Nairobi points - Steel Blue */}
          <Scatter
            name="Nairobi reference"
            data={nairobiData}
            fill="#4682b4"
            fillOpacity={0.5}
            stroke="#4682b4"
            strokeWidth={0.5}
            line={false}
            shape="circle"
          />

          {/* County town points - Orange */}
          <Scatter
            name="County town reference"
            data={countyData}
            fill="#ff8c00"
            fillOpacity={0.4}
            stroke="#ff8c00"
            strokeWidth={0.5}
            line={false}
            shape="circle"
          />

          {/* Nairobi LOWESS trend - Blue line */}
          {nairobiTrend.length > 0 && (
            <Scatter
              data={nairobiTrend}
              fill="none"
              line={{
                stroke: '#4682b4',
                strokeWidth: 2.5,
                strokeDasharray: '5 5',
              }}
              shape={() => null as any}
            />
          )}

          {/* County LOWESS trend - Orange line */}
          {countyTrend.length > 0 && (
            <Scatter
              data={countyTrend}
              fill="none"
              line={{
                stroke: '#ff8c00',
                strokeWidth: 2.5,
                strokeDasharray: '5 5',
              }}
              shape={() => null as any}
            />
          )}

          {/* Combined LOWESS trend - Red (like in image) */}
          <Scatter
            name="Average trend (LOWESS)"
            data={[...nairobiTrend, ...countyTrend].sort((a, b) => a.x - b.x)}
            fill="none"
            line={{
              stroke: '#dc2626',
              strokeWidth: 3,
            }}
            shape={() => null as any}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
} from 'recharts';
import { useBestInvestment } from '@/hooks/useMarketData';
import { useDashboardStore } from '@/store';
import { formatKES } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

// Infrastructure score removed — weights redistributed proportionally across remaining 4
const DIMENSIONS = [
  { key: 'affordability_score', label: 'Affordability', weight: '40%', color: '#7AB8E8' },
  { key: 'amenity_score',       label: 'Amenities',     weight: '24%', color: '#2E5C8A' },
  { key: 'access_score',        label: 'Accessibility', weight: '24%', color: '#E7A428' },
  { key: 'proximity_score',     label: 'Proximity',     weight: '12%', color: '#2E8B57' },
] as const;

function SegmentLabel(props: any) {
  const { x, y, width, height, value } = props;
  if (!value || width < 32 || height < 14) return null;
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="#ffffff"
      fontSize={10}
      fontWeight={600}
    >
      {Number(value).toFixed(2)}
    </text>
  );
}

function TotalLabel(props: any) {
  const { x, y, width, height, value } = props;
  if (!value) return null;
  return (
    <text
      x={(x ?? 0) + (width ?? 0) + 8}
      y={(y ?? 0) + (height ?? 0) / 2}
      dominantBaseline="middle"
      fill="#1e293b"
      fontSize={12}
      fontWeight={700}
    >
      Total: {Number(value).toFixed(3)}
    </text>
  );
}

export function BestInvestmentChart() {
  const { countyFilter } = useDashboardStore();
  const { data: apiData, isLoading } = useBestInvestment(countyFilter);

  if (isLoading) return <Skeleton className="h-[420px] w-full rounded-xl" />;

  if (!apiData || apiData.length === 0) {
    return (
      <div className="h-[420px] flex items-center justify-center text-slate-500 text-sm bg-slate-50 rounded-xl border border-slate-100">
        No investment data available.
      </div>
    );
  }

  const xDomainMax = 1.15;

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-6 shadow-sm">
      <div className="mb-2">
        <h3 className="text-lg font-bold text-slate-800">
          Top {apiData.length} Kenyan Counties for Land Investment
        </h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Best balance of Price, Services and Access.&nbsp;
          Bars show normalised score per dimension (0–1). Total = weighted composite investment score.
        </p>
      </div>

      <div className="h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={apiData}
            layout="vertical"
            margin={{ top: 10, right: 120, left: 170, bottom: 30 }}
            barCategoryGap="22%"
          >
            <XAxis
              type="number"
              domain={[0, xDomainMax]}
              ticks={[0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]}
              stroke="#cbd5e1"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#94a3b8' }}
              label={{
                value: 'Normalised Score (0 = weakest  |  1 = strongest)',
                position: 'insideBottom',
                offset: -20,
                style: { fill: '#64748b', fontSize: 11 },
              }}
            />

            <YAxis
              type="category"
              dataKey="county"
              tickLine={false}
              axisLine={false}
              width={160}
              tick={(props: any) => {
                const item = apiData.find((d: any) => d.county === props.payload.value);
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={-10} y={-4} textAnchor="end" fill="#1e293b" fontSize={12} fontWeight={600}>
                      {props.payload.value}
                    </text>
                    {item && (
                      <text x={-10} y={12} textAnchor="end" fill="#64748b" fontSize={10}>
                        (median {formatKES(item.median_price_per_acre)}/acre)
                      </text>
                    )}
                  </g>
                );
              }}
            />

            <Tooltip
              cursor={{ fill: '#f1f5f9', opacity: 0.5 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return (
                  <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg p-3 shadow-2xl text-sm min-w-[230px]">
                    <p className="font-bold text-slate-800 mb-2 text-base">{label}</p>
                    {DIMENSIONS.map((dim) => {
                      const val = d?.[dim.key];
                      if (val === undefined) return null;
                      return (
                        <div key={dim.key} className="flex items-center justify-between gap-4 text-xs py-0.5">
                          <span className="flex items-center gap-2 text-slate-600">
                            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: dim.color }} />
                            {dim.label} ({dim.weight})
                          </span>
                          <span className="text-slate-800 font-semibold tabular-nums">
                            {Number(val).toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                    <div className="border-t border-slate-200 mt-2 pt-2 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Weighted Total</span>
                        <span className="text-slate-800 font-bold">{d?.investment_score?.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Median price</span>
                        <span className="text-slate-700 font-medium">{formatKES(d?.median_price_per_acre)}/acre</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Sample size</span>
                        <span className="text-slate-700 font-medium">{d?.listing_count} listings</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />

            {DIMENSIONS.map((dim, idx) => (
              <Bar
                key={dim.key}
                dataKey={dim.key}
                stackId="stack"
                fill={dim.color}
                stroke="#ffffff"
                strokeWidth={1}
                radius={idx === DIMENSIONS.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
              >
                <LabelList dataKey={dim.key} content={<SegmentLabel />} />
              </Bar>
            ))}

            <Bar dataKey="investment_score" stackId="stack" fill="transparent" isAnimationActive={false}>
              <LabelList dataKey="investment_score" content={<TotalLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-4 pt-4 border-t border-slate-100">
        {DIMENSIONS.map((dim) => (
          <div key={dim.key} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="inline-block w-4 h-4 rounded-sm shadow-sm" style={{ background: dim.color }} />
            <span className="font-medium">{dim.label} ({dim.weight})</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 mt-3 text-center">
        Total = weighted composite investment score (0–1). Counties with fewer than 5 listings excluded.
      </p>
    </div>
  );
}
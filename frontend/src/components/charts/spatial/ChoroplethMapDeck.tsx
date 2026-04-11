import { useEffect, useRef, useMemo, useState } from 'react';
import * as echarts from 'echarts';
import { useCounties } from '@/hooks/useMarketData';
import { useDashboardStore } from '@/store';
import { Skeleton } from '@/components/ui/Skeleton';

// ── SWD Principle: Grey is your friend ────────────────────────────────────────
// Light theme: soft grey for missing data to fade into background
const NO_DATA_COLOR = '#e5e7eb'; // Light gray-200 matching the image

// ── Helper ────────────────────────────────────────────────────────────────────
function formatKES(v: number): string {
  if (!v) return '';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  return `${(v / 1_000).toFixed(0)}K`;
}

// ── ECharts option builder ────────────────────────────────────────────────────
function buildOption(data: any[], minPrice: number, maxPrice: number) {
  return {
    backgroundColor: '#ffffff', // Clean white background like the image
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderWidth: 1,
      borderColor: '#d1d5db',
      padding: [8, 12],
      textStyle: { 
        color: '#1f2937', // Dark gray text
        fontSize: 13, 
        fontFamily: 'sans-serif' 
      },
      formatter: (params: any) => {
        const v = params.value;
        return `<div style="font-weight:600; margin-bottom:4px; color:#111827;">${params.name}</div>
                <div style="color: #4b5563;">${v ? 'KES ' + formatKES(v) + ' / acre' : 'No data available'}</div>`;
      },
    },
    visualMap: {
      left: 'right',
      bottom: '5%',
      min: minPrice,
      max: maxPrice,
      text: ['High Price', 'Low Price'],
      calculable: true,
      realtime: false,
      inRange: {
        // Matching Image 2: Yellow-Orange-Red sequential scale (Fisher-Jenks style)
        // Light yellow → Yellow → Orange → Dark Orange → Red → Dark Red
        color: [
          '#ffffcc', // Very light yellow (0-3M range)
          '#ffeda0', // Light yellow  
          '#fed976', // Yellow
          '#feb24c', // Light orange
          '#fd8d3c', // Orange
          '#fc4e2a', // Red-orange
          '#e31a1c', // Red
          '#bd0026'  // Dark red (highest values)
        ],
      },
      textStyle: { 
        color: '#4b5563', // Dark gray text for legend
        fontSize: 11 
      },
      formatter: (value: number) => `KES ${formatKES(value)}`
    },
    series: [
      {
        type: 'map',
        map: 'kenya',
        roam: true,
        aspectScale: 1,
        nameProperty: 'NAME_1',
        itemStyle: {
          // Subtle county borders like in the image
          borderColor: '#9ca3af', // Gray-400 for visible but subtle borders
          borderWidth: 0.8,
          areaColor: NO_DATA_COLOR,
        },
        label: {
          show: true,
          fontSize: 10,
          color: '#1f2937', // Dark text for readability on light colors
          textBorderColor: 'rgba(255,255,255,0.8)',
          textBorderWidth: 2,
          formatter: (params: any) => {
            if (!params.value) return ''; // Hide labels for missing data
            return `${params.name}\n${formatKES(params.value)}`;
          }
        },
        emphasis: {
          label: { 
            show: true, 
            fontSize: 12, 
            color: '#1f2937', 
            fontWeight: 'bold' 
          },
          itemStyle: { 
            areaColor: '#fbbf24', // Amber highlight on hover
            borderColor: '#1f2937', 
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.2)'
          }
        },
        select: {
          itemStyle: {
            areaColor: '#f59e0b', // Darker amber for selected
          },
          label: {
            color: '#1f2937',
            fontWeight: 'bold'
          }
        },
        data: data,
      },
    ],
  };
}

export function ChoroplethMapDeck() {
  const { countyFilter, setCountyFilter } = useDashboardStore();
  const { data: allCounties, isLoading } = useCounties(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [geoJsonLoaded, setGeoJsonLoaded] = useState(false);

  useEffect(() => {
    fetch('/kenya-counties.geojson')
      .then((res) => res.json())
      .then((geoJson) => {
        echarts.registerMap('kenya', geoJson);
        setGeoJsonLoaded(true);
      })
      .catch((err) => console.error('Failed to load GeoJSON:', err));
  }, []);

  const { chartData, minPrice, maxPrice } = useMemo(() => {
    if (!allCounties || allCounties.length === 0) {
      return { chartData: [], minPrice: 0, maxPrice: 10000000 };
    }

    const prices = allCounties.map(c => c.median_price_per_acre).filter(Boolean) as number[];
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);

    const data = allCounties.map((c) => {
      const isSelected = countyFilter === c.county;
      return {
        name: c.county,
        value: c.median_price_per_acre,
        itemStyle: {
          // Dim non-selected counties when one is selected
          opacity: countyFilter ? (isSelected ? 1 : 0.4) : 1,
          borderColor: isSelected ? '#1f2937' : '#9ca3af',
          borderWidth: isSelected ? 2 : 0.8,
        },
        selected: isSelected
      };
    });

    return { chartData: data, minPrice: minP, maxPrice: maxP };
  }, [allCounties, countyFilter]);

  useEffect(() => {
    if (!chartRef.current || !geoJsonLoaded || !chartData.length) return;

    let myChart = echarts.getInstanceByDom(chartRef.current);
    if (!myChart) {
      myChart = echarts.init(chartRef.current, null, { renderer: 'canvas' });
    }

    myChart.setOption(buildOption(chartData, minPrice, maxPrice), true);

    myChart.off('click');
    myChart.on('click', (params: any) => {
      if (params.name) {
        if (countyFilter === params.name) {
          setCountyFilter(null);
        } else {
          setCountyFilter(params.name);
        }
      }
    });

    // Click outside to reset
    myChart.getZr().off('click');
    myChart.getZr().on('click', (e) => {
      if (!e.target) {
        setCountyFilter(null);
      }
    });

    const handleResize = () => myChart?.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [chartData, geoJsonLoaded, countyFilter, setCountyFilter, minPrice, maxPrice]);

  if (isLoading || !geoJsonLoaded) {
    return <Skeleton className="h-full w-full rounded-xl bg-gray-100" />;
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-white rounded-lg shadow-sm">
      <div ref={chartRef} className="flex-1 w-full min-h-[500px] h-full" />
    </div>
  );
}
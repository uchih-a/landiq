import { useEffect, useRef, useMemo, useState } from 'react';
import * as echarts from 'echarts';
import { useSpatialListings } from '@/hooks/useMarketData';
import { useDashboardStore } from '@/store';
import { Skeleton } from '@/components/ui/Skeleton';

// ── SWD Principle: Grey is your friend for context ───────────────────────────
const NO_DATA_COLOR = '#f3f4f6'; // Very light gray for counties background

function formatKES(v: number) {
  if (!v) return '';
  if (v >= 1_000_000) return `KES ${(v / 1_000_000).toFixed(1)}M`;
  return `KES ${(v / 1_000).toFixed(0)}K`;
}

function buildOption(points: any[], minPrice: number, maxPrice: number) {
  return {
    backgroundColor: '#ffffff', // White background matching Image 1
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderWidth: 1,
      borderColor: '#d1d5db',
      padding: [8, 12],
      textStyle: { 
        color: '#1f2937', 
        fontSize: 13, 
        fontFamily: 'sans-serif' 
      },
      formatter: (params: any) => {
        const [lng, lat, price] = params.value;
        const countyName = params.name || params.data?.name || 'Listing';
        return `<div style="font-weight:600; margin-bottom:4px; color:#111827; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">${countyName}</div>
                <div style="color: #4b5563; font-size:12px; margin-top:4px;">Price: <span style="color:#dc2626; font-weight:600;">${formatKES(price)} / acre</span></div>
                <div style="color: #9ca3af; font-size:10px; margin-top:2px;">Coords: ${lat.toFixed(4)}°, ${lng.toFixed(4)}°</div>`;
      },
    },
    // Dynamic continuous scale matching Image 1's color bar
    visualMap: {
      left: 'right',
      bottom: '5%',
      min: minPrice,
      max: maxPrice,
      text: ['High Price', 'Low Price'],
      calculable: true,
      realtime: false,
      inRange: {
        // Matching Image 1: Green → Yellow-Green → Yellow → Orange → Red
        // Price range: KSh 65K (dark green) to KSh 271M (red)
        color: [
          '#1a9850', // Dark green (65K)
          '#66bd63', // Medium green
          '#a6d96a', // Light green
          '#d9ef8b', // Yellow-green
          '#fee08b', // Yellow
          '#fdae61', // Light orange
          '#f46d43', // Orange
          '#d73027', // Red (271M)
          '#a50026'  // Dark red (for outliers)
        ],
      },
      textStyle: { 
        color: '#4b5563', 
        fontSize: 11 
      },
      formatter: (value: number) => `KES ${formatKES(value)}`
    },
    geo: {
      map: 'kenya',
      roam: true,
      aspectScale: 1,
      nameProperty: 'NAME_1',
      itemStyle: {
        areaColor: NO_DATA_COLOR, // Light gray county backgrounds
        borderColor: '#d1d5db',   // Subtle gray borders like Image 1
        borderWidth: 0.8,
      },
      emphasis: {
        itemStyle: { 
          areaColor: '#e5e7eb', // Slightly darker on hover
          borderColor: '#9ca3af'
        },
        label: { show: false }
      },
      label: { show: false }, // Clean look, no labels on base map
    },
    series: [
      {
        type: 'scatter',
        coordinateSystem: 'geo',
        data: points,
        symbolSize: 8, // Slightly larger for better visibility
        itemStyle: {
          opacity: 0.85,
          borderColor: '#ffffff', // White border to separate dots
          borderWidth: 0.8,
          shadowBlur: 2,
          shadowColor: 'rgba(0,0,0,0.1)' // Subtle depth
        },
        emphasis: {
          scale: 1.8,
          itemStyle: { 
            opacity: 1, 
            borderColor: '#1f2937', // Dark border on hover
            borderWidth: 1.5,
            shadowBlur: 8,
            shadowColor: 'rgba(0,0,0,0.3)'
          },
        },
      },
    ],
  };
}

export function ScatterMapDeck() {
  const chartRef = useRef<HTMLDivElement>(null);
  const { countyFilter, setCountyFilter } = useDashboardStore();

  const { data: listings, isLoading } = useSpatialListings(countyFilter);
  const [geoJsonLoaded, setGeoJsonLoaded] = useState(false);

  useEffect(() => {
    fetch('/kenya-counties.geojson')
      .then((r) => r.json())
      .then((geo) => {
        echarts.registerMap('kenya', geo);
        setGeoJsonLoaded(true);
      })
      .catch((err) => console.error('Failed to load GeoJSON:', err));
  }, []);

  const { chartData, minPrice, maxPrice } = useMemo(() => {
    if (!listings || listings.length === 0) {
      return { chartData: [], minPrice: 0, maxPrice: 10000000 };
    }

    const prices = listings.map((l) => l.price_per_acre).filter(Boolean) as number[];
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);

    const points = listings
      .filter((l) => l.longitude && l.latitude && l.price_per_acre)
      .map((l) => ({
        name: l.county ?? '',
        value: [l.longitude, l.latitude, l.price_per_acre],
      }));

    return { chartData: points, minPrice: minP, maxPrice: maxP };
  }, [listings]);

  useEffect(() => {
    if (!chartRef.current || !geoJsonLoaded) return;

    let myChart = echarts.getInstanceByDom(chartRef.current);
    if (!myChart) {
      myChart = echarts.init(chartRef.current, null, { renderer: 'canvas' });
    }

    myChart.setOption(buildOption(chartData, minPrice, maxPrice), true);

    // Interactivity
    myChart.off('click');
    myChart.on('click', (params: any) => {
      const clickedCounty = params.name || params.data?.name;
      if (clickedCounty) {
        if (countyFilter === clickedCounty) {
          setCountyFilter(null);
        } else {
          setCountyFilter(clickedCounty);
        }
      }
    });

    myChart.getZr().off('click');
    myChart.getZr().on('click', (e) => {
      if (!e.target) {
        setCountyFilter(null);
      }
    });

    const observer = new ResizeObserver(() => myChart?.resize());
    if (chartRef.current) {
      observer.observe(chartRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [chartData, geoJsonLoaded, minPrice, maxPrice, countyFilter, setCountyFilter]);

  if (isLoading || !geoJsonLoaded) {
    return <Skeleton className="h-full w-full rounded-xl bg-gray-100" />;
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-white rounded-lg shadow-sm">
      <div ref={chartRef} className="flex-1 w-full h-full min-h-[500px]" />
    </div>
  );
}
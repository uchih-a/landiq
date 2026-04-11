import { useEffect, useRef, useMemo, useState } from 'react';
import * as echarts from 'echarts';
import { useSpatialListings } from '@/hooks/useMarketData';
import { useDashboardStore } from '@/store';
import { Skeleton } from '@/components/ui/Skeleton';

// Kenya Bounding Box [minLng, maxLng, minLat, maxLat]
const BBOX = { minLng: 33.9, maxLng: 41.9, minLat: -4.7, maxLat: 4.6 };
const GRID_COLS = 80; // High resolution for smooth raster
const GRID_ROWS = 80;

interface Listing { longitude: number; latitude: number; price_per_acre: number }

/** Fast Inverse Distance Weighting interpolation */
function idwAt(
  px: number, py: number, listings: Listing[], power = 2, maxRadiusDeg = 0.5 // ~50km
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const l of listings) {
    const dx = px - l.longitude;
    const dy = py - l.latitude;
    const d = Math.sqrt(dx * dx + dy * dy);

    if (d === 0) return l.price_per_acre;
    if (d > maxRadiusDeg) continue;

    const w = 1 / Math.pow(d, power);
    weightedSum += w * l.price_per_acre;
    totalWeight += w;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function formatKES(v: number) {
  if (!v) return '';
  if (v >= 1_000_000) return `KES ${(v / 1_000_000).toFixed(1)}M`;
  return `KES ${(v / 1_000).toFixed(0)}K`;
}

export function IDWMapDeck() {
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

  const { gridData, scatterData, minPrice, maxPrice } = useMemo(() => {
    if (!listings || listings.length === 0) {
      return { gridData: [], scatterData: [], minPrice: 0, maxPrice: 10000000 };
    }

    const validListings = listings.filter((l: any) => l.longitude && l.latitude && l.price_per_acre);

    let minP = Infinity;
    let maxP = -Infinity;
    const scatter: any[] = [];

    // 1. Prepare Scatter Data (Actual Listings)
    validListings.forEach((l: any) => {
      scatter.push([l.longitude, l.latitude, l.price_per_acre]);
      if (l.price_per_acre < minP) minP = l.price_per_acre;
      if (l.price_per_acre > maxP) maxP = l.price_per_acre;
    });

    // 2. Prepare Raster Grid (IDW Surface)
    const grid: any[] = [];
    const stepX = (BBOX.maxLng - BBOX.minLng) / GRID_COLS;
    const stepY = (BBOX.maxLat - BBOX.minLat) / GRID_ROWS;

    for (let ix = 0; ix <= GRID_COLS; ix++) {
      for (let iy = 0; iy <= GRID_ROWS; iy++) {
        const lng = BBOX.minLng + ix * stepX;
        const lat = BBOX.minLat + iy * stepY;
        const val = idwAt(lng, lat, validListings);
        if (val !== null) {
          grid.push([lng, lat, val]);
        }
      }
    }

    return { gridData: grid, scatterData: scatter, minPrice: minP, maxPrice: maxP };
  }, [listings]);

  useEffect(() => {
    if (!chartRef.current || !geoJsonLoaded || !gridData.length) return;

    let myChart = echarts.getInstanceByDom(chartRef.current);
    if (!myChart) myChart = echarts.init(chartRef.current);

    const option = {
      backgroundColor: '#0f172a', // Deep dark background
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderWidth: 1,
        borderColor: '#334155',
        textStyle: { color: '#f8fafc' },
        formatter: (params: any) => {
          if (!params.value || params.value.length < 3) return '';
          const [lng, lat, price] = params.value;
          const isScatter = params.seriesIndex === 2; // Check if hovering over actual listing vs raster

          return `<div style="font-weight:600; margin-bottom:4px; border-bottom:1px solid #334155; padding-bottom:4px;">
                    ${isScatter ? 'Actual Listing Price' : 'Interpolated Estimate'}
                  </div>
                  <div style="color: #ffffff; font-size:14px; font-weight:bold; margin-top:4px;">
                    ${formatKES(price)} / acre
                  </div>`;
        },
      },
      visualMap: {
        min: minPrice,
        max: maxPrice,
        calculable: true,
        orient: 'vertical',
        right: '5%',
        bottom: '5%',
        dimension: 2,
        seriesIndex: 0, // CRITICAL FIX: Only apply colors to the Heatmap (Series 0)
        text: ['High', 'Low'],
        textStyle: { color: '#94a3b8' },
        formatter: (v: number) => formatKES(v),
        inRange: {
          // Classic Python Matplotlib "Turbo" style colormap
          color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026']
        },
      },
      // Invisible base geo to anchor the coordinate system
      geo: {
        map: 'kenya',
        roam: true,
        aspectScale: 1,
        itemStyle: { areaColor: '#0f172a', borderColor: 'transparent' },
        emphasis: { itemStyle: { areaColor: '#0f172a' }, label: { show: false } }
      },
      series: [
        // LAYER 1: The Continuous Raster Surface (Heatmap)
        {
          type: 'heatmap',
          coordinateSystem: 'geo',
          data: gridData,
          pointSize: 24, // Large point size
          blurSize: 35,  // Massive blur creates the smooth raster illusion
          itemStyle: { opacity: 0.85 }
        },
        // LAYER 2: Vector Overlays (County Boundaries)
        {
          type: 'map',
          map: 'kenya',
          geoIndex: 0, // Sync pan/zoom with base geo
          nameProperty: 'NAME_1',
          itemStyle: {
            areaColor: 'transparent', // Transparent so heatmap shows through!
            borderColor: 'rgba(255, 255, 255, 0.4)', // Crisp, slightly transparent white borders
            borderWidth: 1,
          },
          emphasis: {
            itemStyle: { areaColor: 'rgba(255,255,255,0.1)', borderColor: '#ffffff', borderWidth: 2 },
            label: { show: false }
          },
        },
        // LAYER 3: Point Markers (Actual Listings)
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          data: scatterData,
          symbolSize: 4,
          itemStyle: {
            color: '#000000', // Black dots
            borderColor: '#ffffff', // White outline makes them pop against the heatmap
            borderWidth: 1,
            opacity: 0.8
          },
          emphasis: { itemStyle: { borderWidth: 2 } }
        }
      ]
    };

    myChart.setOption(option, true);

    // Filter by county clicking
    myChart.off('click');
    myChart.on('click', (params: any) => {
      if (params.seriesIndex === 1 && params.name) { // Only trigger if clicking Layer 2 (Map Boundaries)
        setCountyFilter(countyFilter === params.name ? null : params.name);
      }
    });

    const observer = new ResizeObserver(() => myChart?.resize());
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [gridData, scatterData, geoJsonLoaded, minPrice, maxPrice, countyFilter, setCountyFilter]);

  if (isLoading || !geoJsonLoaded) {
    return <Skeleton className="h-full w-full rounded-xl bg-slate-800/50" />;
  }

  return <div className="relative w-full h-full flex flex-col"><div ref={chartRef} className="flex-1 w-full h-full min-h-[500px]" /></div>;
}
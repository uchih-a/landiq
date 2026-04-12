import { useQuery } from '@tanstack/react-query';
import { marketApi } from '@/lib/api';

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

export function useMarketSummary(county?: string | null) {
  return useQuery({
    queryKey: ['market', 'summary', county ?? 'all'],
    queryFn: () => marketApi.summary(county ?? undefined),
    staleTime: STALE_TIME,
  });
}

export function useCounties(county?: string | null) {
  return useQuery({
    queryKey: ['market', 'counties', county ?? 'all'],
    queryFn: () => marketApi.counties(county ?? undefined),
    staleTime: STALE_TIME,
  });
}

// useMarketData.ts

export function useSpatialListings(county?: string | null) {
  return useQuery({
    queryKey: ['market', 'spatial', county ?? 'all'],
    queryFn: () => marketApi.spatial(county ?? undefined),
    staleTime: 2 * 60 * 1000, // 2 min — map data can refresh more often
    retry: 1,                  // don't hammer a broken endpoint
    select: (data) => data ?? [], // guard against null response
  });
}

export function useProximityData(county?: string | null) {
  return useQuery({
    queryKey: ['market', 'proximity', county ?? 'all'],
    queryFn: async () => {
      const response = await marketApi.proximity(county ?? undefined);
      // Unwrap in case axios response object leaks through
      return response?.data ? response.data : response;
    },
    staleTime: STALE_TIME,
  });
}

export function useRawProximityData(county?: string | null) {
  return useQuery({
    queryKey: ['market', 'proximity', 'raw', county ?? 'all'],
    queryFn: async () => {
      const response = await marketApi.proximityRaw(county ?? undefined);
      return response?.data ? response.data : response;
    },
    staleTime: STALE_TIME,
  });
}

export function useScoreData(county?: string | null) {
  return useQuery({
    queryKey: ['market', 'scores', county ?? 'all'],
    queryFn: () => marketApi.scores(county ?? undefined),
    staleTime: STALE_TIME,
  });
}

export function useBestInvestment(county?: string | null) {
  return useQuery({
    queryKey: ['market', 'best-investment', county ?? 'all'],
    queryFn: () => marketApi.bestInvestment(county ?? undefined),
    staleTime: STALE_TIME,
  });
}

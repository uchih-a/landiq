import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { predictApi } from '@/lib/api';
import type { PredictionRequest } from '@/types';

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

export function usePredict() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PredictionRequest) => predictApi.predict(payload),
    onSuccess: () => {
      // Invalidate history query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['predict', 'history'] });
    },
  });
}

export function usePredictionHistory(page = 1, limit = 10) {
  return useQuery({
    queryKey: ['predict', 'history', page, limit],
    queryFn: () => predictApi.history(page, limit),
    staleTime: STALE_TIME,
  });
}

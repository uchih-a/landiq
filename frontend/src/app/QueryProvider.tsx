/**
 * QueryProvider — wires React Query into the app + mounts the global
 * `HealthBanner` so every screen inherits the degraded-state banner
 * without each one having to mount it.
 *
 * Rendering order is intentional:
 *   <QueryClientProvider>
 *     <HealthBanner />   ← polls /health every 30s; sticky at top
 *     {children}         ← routes / LayoutShell / Outlet
 *   </QueryClientProvider>
 *
 * The banner MUST live inside `QueryClientProvider` because it calls
 * `useHealth()`, which calls `useQuery`. Putting it here (rather than in
 * `LayoutShell.tsx`) keeps the F1 layout file untouched per the F2 brief
 * ("Don't modify any existing component files (F1) — only create new
 * files") and ensures the banner renders even on the not-found route.
 */

import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { HealthBanner } from '@/components/HealthBanner';
import { queryClient } from '@/lib/api/hooks';

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <HealthBanner />
      {children}
    </QueryClientProvider>
  );
}

export default QueryProvider;

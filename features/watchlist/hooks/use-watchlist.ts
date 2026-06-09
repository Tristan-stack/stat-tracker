'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import type { WatchlistWallet } from '@/types/watchlist';

const WATCHLIST_KEY = ['watchlist'] as const;

export function useWatchlist() {
  return useQuery({
    queryKey: WATCHLIST_KEY,
    queryFn: () =>
      apiGet<{ wallets: WatchlistWallet[] }>('/api/watchlist').then((d) => d.wallets),
  });
}

export function useAddWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      walletAddress: string;
      label?: string;
      notes?: string;
      sourceRuggerId?: string;
    }) => apiPost<WatchlistWallet>('/api/watchlist', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });
}

export function useUpdateWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; label: string | null; notes: string | null }) =>
      apiPatch<WatchlistWallet>(`/api/watchlist/${input.id}`, {
        label: input.label,
        notes: input.notes,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });
}

export function useDeleteWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ deleted: boolean }>(`/api/watchlist/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });
}

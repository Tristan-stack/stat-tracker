'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import type { RuggerBuyerWallet } from '@/types/rugger-buyer';

const buyersKey = (ruggerId: string) => ['ruggers', ruggerId, 'buyers'] as const;

export function useBuyers(ruggerId: string) {
  return useQuery({
    queryKey: buyersKey(ruggerId),
    queryFn: () =>
      apiGet<{ buyers: RuggerBuyerWallet[] }>(`/api/ruggers/${ruggerId}/buyers`).then((d) => d.buyers),
  });
}

export function useAddBuyer(ruggerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { walletAddress: string; label: string | null; notes: string | null }) =>
      apiPost<RuggerBuyerWallet>(`/api/ruggers/${ruggerId}/buyers`, { ...input, origin: 'manual' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: buyersKey(ruggerId) }),
  });
}

export function useUpdateBuyer(ruggerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { buyerId: string; label: string | null; notes: string | null }) =>
      apiPatch<RuggerBuyerWallet>(`/api/ruggers/${ruggerId}/buyers/${input.buyerId}`, {
        label: input.label,
        notes: input.notes,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: buyersKey(ruggerId) }),
  });
}

export function useDeleteBuyer(ruggerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (buyerId: string) =>
      apiDelete<{ ok: boolean }>(`/api/ruggers/${ruggerId}/buyers/${buyerId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: buyersKey(ruggerId) }),
  });
}

export interface AggregateTokensResult {
  insertedCount?: number;
  skippedExistingCount?: number;
  sourceWalletCount?: number;
  walletRanking?: Array<{ walletAddress: string; tokenCount: number; coveragePercent: number }>;
  selectionStats?: Array<{ walletAddress: string; selectedTokenCount: number }>;
}

export function useAggregateTokens(ruggerId: string) {
  return useMutation({
    mutationFn: () =>
      apiPost<AggregateTokensResult>(`/api/ruggers/${ruggerId}/buyers/aggregate-tokens`, {}),
  });
}

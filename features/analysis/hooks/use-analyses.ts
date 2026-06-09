'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiDelete } from '@/lib/api-client';
import type { WalletAnalysis } from '@/types/analysis';

const analysesKey = (ruggerId: string) => ['ruggers', ruggerId, 'analyses'] as const;

export function useAnalyses(ruggerId: string) {
  return useQuery({
    queryKey: analysesKey(ruggerId),
    queryFn: () =>
      apiGet<{ analyses: WalletAnalysis[] }>(`/api/ruggers/${ruggerId}/analysis`).then((d) => d.analyses),
  });
}

export function useDeleteAnalysis(ruggerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (analysisId: string) =>
      apiDelete<{ ok?: boolean }>(`/api/ruggers/${ruggerId}/analysis/${analysisId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: analysesKey(ruggerId) }),
  });
}

export function useDeleteAllAnalyses(ruggerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<{ ok?: boolean }>(`/api/ruggers/${ruggerId}/analysis`),
    onSuccess: () => qc.invalidateQueries({ queryKey: analysesKey(ruggerId) }),
  });
}

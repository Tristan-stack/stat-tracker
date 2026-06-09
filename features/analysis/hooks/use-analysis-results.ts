'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api-client';
import type { AnalysisMotherAddress, WalletCombinationStep, CrossRuggerMatch } from '@/types/analysis';

const analysisKey = (analysisId: string) => ['analysis', analysisId] as const;

// --- Adresses mères --------------------------------------------------------

export function useMothers(ruggerId: string, analysisId: string) {
  return useQuery({
    queryKey: [...analysisKey(analysisId), 'mothers'],
    queryFn: () =>
      apiGet<{ mothers: AnalysisMotherAddress[] }>(
        `/api/ruggers/${ruggerId}/analysis/${analysisId}/mothers`
      ).then((d) => d.mothers),
  });
}

export function useValidateMother(ruggerId: string, analysisId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { motherId: string; validated: boolean }) =>
      apiPatch<AnalysisMotherAddress>(
        `/api/ruggers/${ruggerId}/analysis/${analysisId}/mothers/${input.motherId}`,
        { validated: input.validated }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...analysisKey(analysisId), 'mothers'] }),
  });
}

// --- Combinaisons ----------------------------------------------------------

export function useCombinations(ruggerId: string, analysisId: string, targetCoverage: number) {
  return useQuery({
    queryKey: [...analysisKey(analysisId), 'combinations', targetCoverage],
    queryFn: () =>
      apiGet<{ steps: WalletCombinationStep[]; totalTokens: number }>(
        `/api/ruggers/${ruggerId}/analysis/${analysisId}/combinations?targetCoverage=${targetCoverage}`
      ),
  });
}

// --- Leaderboard + cross-rugger -------------------------------------------

export interface LeaderboardQueryOpts {
  sortBy: string;
  sortQuery: string;
  offset: number;
  search: string;
  limit: number;
}

export function useLeaderboard<W>(ruggerId: string, analysisId: string, opts: LeaderboardQueryOpts) {
  return useQuery({
    queryKey: [...analysisKey(analysisId), 'leaderboard', opts],
    queryFn: () => {
      const params = new URLSearchParams({
        sortBy: opts.sortBy,
        limit: String(opts.limit),
        offset: String(opts.offset),
      });
      if (opts.sortQuery !== '') params.set('sort', opts.sortQuery);
      if (opts.search.trim() !== '') params.set('search', opts.search.trim());
      return apiGet<{ wallets: W[]; total: number }>(
        `/api/ruggers/${ruggerId}/analysis/${analysisId}/leaderboard?${params.toString()}`
      );
    },
  });
}

export function useCrossRugger(ruggerId: string, analysisId: string) {
  return useQuery({
    queryKey: [...analysisKey(analysisId), 'cross-rugger'],
    queryFn: () =>
      apiGet<{ matches: CrossRuggerMatch[] }>(
        `/api/ruggers/${ruggerId}/analysis/${analysisId}/cross-rugger`
      ).then((d) => d.matches),
  });
}

/** Détail d'un wallet acheteur (onglet WalletDetail). */
export function useWalletDetail<T>(ruggerId: string, analysisId: string, walletAddress: string) {
  return useQuery({
    queryKey: [...analysisKey(analysisId), 'wallet', walletAddress],
    queryFn: () =>
      apiGet<T>(
        `/api/ruggers/${ruggerId}/analysis/${analysisId}/wallet/${encodeURIComponent(walletAddress)}`
      ),
  });
}

'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import { appendTokenDateQueryParams, type TokenPurchaseFilter } from '@/lib/token-date-filter';
import type { Token } from '@/types/token';
import type { StatusId } from '@/types/rugger';
import type { FirstBuyPreviewEntry } from '@/types/first-buy-preview';
import type { DexPaidEntry } from '@/types/dex-paid';

export interface TokensResponse {
  tokens: Token[];
  page: number;
  pageSize: number;
  total: number;
  allSameTargetPercent: number | null;
}

export interface TokenFilters {
  status: StatusId | 'all';
  purchaseFilter: TokenPurchaseFilter;
  entryMcapMin: string;
  entryMcapMax: string;
  customFrom: string;
  customTo: string;
  pickDay: string;
  migrationOnly: boolean;
}

function parsePositiveNumericFilterValue(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildParams(filters: TokenFilters, pagination: { all: true } | { page: number; pageSize: number }): string {
  const params = new URLSearchParams();
  if ('all' in pagination) {
    params.set('all', 'true');
  } else {
    params.set('page', String(pagination.page));
    params.set('pageSize', String(pagination.pageSize));
    if (filters.migrationOnly) params.set('migration', 'true');
  }
  if (filters.status !== 'all') params.set('status', filters.status);
  appendTokenDateQueryParams(params, filters.purchaseFilter, filters.customFrom, filters.customTo, filters.pickDay);
  const min = parsePositiveNumericFilterValue(filters.entryMcapMin);
  if (min !== null) params.set('entryMcapMin', String(min));
  const max = parsePositiveNumericFilterValue(filters.entryMcapMax);
  if (max !== null) params.set('entryMcapMax', String(max));
  return params.toString();
}

const tokensRoot = (ruggerId: string) => ['ruggers', ruggerId, 'tokens'] as const;

/** Page de tokens filtrée (tableau). */
export function useRuggerTokensPage(
  ruggerId: string,
  page: number,
  pageSize: number,
  filters: TokenFilters
) {
  return useQuery({
    queryKey: [...tokensRoot(ruggerId), 'page', { page, pageSize, ...filters }],
    queryFn: () =>
      apiGet<TokensResponse>(`/api/ruggers/${ruggerId}/tokens?${buildParams(filters, { page, pageSize })}`),
  });
}

/** Tous les tokens correspondant aux filtres (stats agrégées). */
export function useRuggerTokensAll(ruggerId: string, filters: TokenFilters) {
  return useQuery({
    queryKey: [...tokensRoot(ruggerId), 'all', filters],
    queryFn: () =>
      apiGet<TokensResponse>(`/api/ruggers/${ruggerId}/tokens?${buildParams(filters, { all: true })}`).then(
        (d) => d.tokens
      ),
  });
}

/** Tous les tokens, sans filtre (inférence d'activité + déduplication). */
export function useRuggerTokensUnfiltered(ruggerId: string) {
  return useQuery({
    queryKey: [...tokensRoot(ruggerId), 'unfiltered'],
    queryFn: () =>
      apiGet<TokensResponse>(`/api/ruggers/${ruggerId}/tokens?all=true`).then((d) => d.tokens),
  });
}

/** Montant du 1er achat par mint (wallets « buyer »). */
export function useFirstBuyPreview(ruggerId: string, mints: string[], enabled: boolean) {
  return useQuery({
    queryKey: [...tokensRoot(ruggerId), 'first-buy', mints],
    queryFn: () =>
      apiPost<{ byMint?: Record<string, FirstBuyPreviewEntry> }>(
        `/api/ruggers/${ruggerId}/tokens/first-buy-preview`,
        { tokenAddresses: mints }
      ).then((d) => d.byMint ?? {}),
    enabled,
  });
}

/**
 * Statut « DEX payé » par mint (Dexscreener Enhanced Token Info).
 * Indépendant du rugger : clé seulement par mints. TTL serveur (cache mémoire)
 * gère la fraîcheur ; côté client on garde la donnée stable un moment.
 */
export function useDexPaidPreview(mints: string[], enabled: boolean) {
  return useQuery({
    queryKey: ['dex-paid', mints],
    queryFn: () =>
      apiPost<{ byMint?: Record<string, DexPaidEntry> }>('/api/dexscreener/paid', {
        tokenAddresses: mints,
      }).then((d) => d.byMint ?? {}),
    enabled: enabled && mints.length > 0,
    staleTime: 5 * 60_000,
  });
}

function invalidateTokens(qc: QueryClient, ruggerId: string) {
  void qc.invalidateQueries({ queryKey: tokensRoot(ruggerId) });
}

export function useInsertTokens(ruggerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tokens: Token[]; replace?: boolean }) =>
      apiPost<{ count: number }>(`/api/ruggers/${ruggerId}/tokens`, input),
    onSuccess: () => invalidateTokens(qc, ruggerId),
  });
}

export function useUpdateToken(ruggerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tokenId: string; patch: Record<string, unknown> }) =>
      apiPatch<{ ok?: boolean; warning?: string }>(
        `/api/ruggers/${ruggerId}/tokens/${input.tokenId}`,
        input.patch
      ),
    onSuccess: () => invalidateTokens(qc, ruggerId),
  });
}

export function useDeleteToken(ruggerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) =>
      apiDelete<{ ok: boolean }>(`/api/ruggers/${ruggerId}/tokens/${tokenId}`),
    onSuccess: () => invalidateTokens(qc, ruggerId),
  });
}

export function useApplyGlobalTarget(ruggerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { targetExitPercent: number } | { targetExitMcap: number }) =>
      apiPatch<{ ok: boolean }>(`/api/ruggers/${ruggerId}/tokens`, body),
    onSuccess: () => invalidateTokens(qc, ruggerId),
  });
}

export function useResetTokens(ruggerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<{ ok: boolean }>(`/api/ruggers/${ruggerId}/tokens`),
    onSuccess: () => invalidateTokens(qc, ruggerId),
  });
}

/** Charge à la demande tous les tokens (déduplication avant ajout GMGN). */
export function fetchRuggerTokensUnfiltered(ruggerId: string): Promise<Token[]> {
  return apiGet<TokensResponse>(`/api/ruggers/${ruggerId}/tokens?all=true`)
    .then((d) => d.tokens)
    .catch(() => []);
}

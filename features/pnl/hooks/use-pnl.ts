'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import type {
  PnlWallet,
  PnlBackground,
  PnlBackgroundMeta,
  PnlComputeResponse,
} from '@/types/pnl';

const WALLETS_KEY = ['pnl', 'wallets'] as const;
const BACKGROUNDS_KEY = ['pnl', 'backgrounds'] as const;

// --- Wallets ---------------------------------------------------------------

export function usePnlWallets() {
  return useQuery({
    queryKey: WALLETS_KEY,
    queryFn: () => apiGet<{ wallets: PnlWallet[] }>('/api/pnl/wallets').then((d) => d.wallets),
  });
}

export function useAddPnlWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { walletAddress: string; label?: string }) =>
      apiPost<{ wallet: PnlWallet }>('/api/pnl/wallets', input).then((d) => d.wallet),
    onSuccess: () => qc.invalidateQueries({ queryKey: WALLETS_KEY }),
  });
}

export function useUpdatePnlWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; label?: string }) =>
      apiPatch<{ wallet: PnlWallet }>(`/api/pnl/wallets/${input.id}`, {
        label: input.label,
      }).then((d) => d.wallet),
    onSuccess: () => qc.invalidateQueries({ queryKey: WALLETS_KEY }),
  });
}

export function useDeletePnlWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ deleted: boolean }>(`/api/pnl/wallets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: WALLETS_KEY }),
  });
}

// --- Backgrounds -----------------------------------------------------------

export function usePnlBackgrounds() {
  return useQuery({
    queryKey: BACKGROUNDS_KEY,
    queryFn: () =>
      apiGet<{ backgrounds: PnlBackgroundMeta[] }>('/api/pnl/backgrounds').then(
        (d) => d.backgrounds
      ),
  });
}

export function useAddPnlBackground() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; imageData: string }) =>
      apiPost<{ background: PnlBackgroundMeta }>('/api/pnl/backgrounds', input).then(
        (d) => d.background
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: BACKGROUNDS_KEY }),
  });
}

export function useDeletePnlBackground() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ deleted: boolean }>(`/api/pnl/backgrounds/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: BACKGROUNDS_KEY }),
  });
}

/** Récupère l'image (data URL) d'un fond — utilisé par le cache lazy de la page. */
export function fetchPnlBackgroundImage(id: string): Promise<string> {
  return apiGet<{ background: PnlBackground }>(`/api/pnl/backgrounds/${id}`).then(
    (d) => d.background.imageData
  );
}

// --- Compute ---------------------------------------------------------------

export interface ComputePnlInput {
  walletAddress: string;
  fromMs: number;
  toMs: number;
  preset: string;
  method: string;
}

export function useComputePnl() {
  return useMutation({
    mutationFn: (input: ComputePnlInput) =>
      apiPost<PnlComputeResponse>('/api/pnl/compute', input),
  });
}

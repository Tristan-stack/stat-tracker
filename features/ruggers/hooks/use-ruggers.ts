'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import type { Rugger, StatusId, WalletType } from '@/types/rugger';

interface RuggerListResponse {
  ruggers: Rugger[];
  page: number;
  pageSize: number;
  total: number;
}

const RUGGERS_KEY = ['ruggers'] as const;

/** Liste simple des ruggers (pour les sélecteurs / rattachements). */
export function useRuggersList(pageSize = 100) {
  return useQuery({
    queryKey: ['ruggers', 'list', { pageSize }],
    queryFn: () =>
      apiGet<RuggerListResponse>(`/api/ruggers?pageSize=${pageSize}`).then((r) => r.ruggers),
  });
}

/** Détail d'un rugger (page détail). */
export function useRugger(id: string | null) {
  return useQuery({
    queryKey: ['ruggers', 'detail', id],
    queryFn: () => apiGet<Rugger>(`/api/ruggers/${id}`),
    enabled: Boolean(id),
  });
}

/** Liste filtrée (page Ruggers) par statut et archivage. */
export function useRuggers(filters: { status: StatusId | 'all'; archived: boolean }) {
  return useQuery({
    queryKey: ['ruggers', 'list', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status !== 'all') params.set('status', filters.status);
      if (filters.archived) params.set('archived', 'true');
      return apiGet<RuggerListResponse>(`/api/ruggers?${params.toString()}`).then((r) => r.ruggers);
    },
  });
}

export interface RuggerWritePayload {
  name?: string | null;
  description?: string | null;
  walletAddress?: string | null;
  walletType?: WalletType;
  volumeMin?: number | null;
  volumeMax?: number | null;
  startHour?: number | null;
  endHour?: number | null;
  notes?: string | null;
  statusId?: StatusId;
  archived?: boolean;
}

export function useCreateRugger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RuggerWritePayload) => apiPost<Rugger>('/api/ruggers', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: RUGGERS_KEY }),
  });
}

export function useUpdateRugger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: RuggerWritePayload & { id: string }) =>
      apiPatch<Rugger>(`/api/ruggers/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: RUGGERS_KEY }),
  });
}

export function useDeleteRugger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/api/ruggers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: RUGGERS_KEY }),
  });
}

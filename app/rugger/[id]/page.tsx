'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { TokenTable } from '@/components/TokenTable';
import { TokenForm } from '@/components/TokenForm';
import { StatsSummary } from '@/components/StatsSummary';
import { TokenImportExport } from '@/components/TokenImportExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { Rugger, WalletType, StatusId } from '@/types/rugger';
import { STATUS_LABELS, STATUS_ORDER, STATUS_BADGE_STYLES, STATUS_FILTER_BUTTON_STYLES } from '@/types/rugger';
import type { Token, ExitMode } from '@/types/token';
import { getTokenWithMetrics } from '@/lib/token-calculations';
import { isMigrationPeakMcap, type MigrationView } from '@/lib/migration';
import {
  appendTokenDateQueryParams,
  localCustomDayRange,
  localGmgnAllTimeRange,
  localTodayPurchaseRange,
  localYesterdayPurchaseRange,
  type TokenPurchaseFilter,
} from '@/lib/token-date-filter';
import { IconArrowLeft, IconPencil, IconTrash, IconChevronRight, IconChevronLeft } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { formatGmgnDecimalString, parseGmgnDecimalString } from '@/lib/gmgn/price-rounding';

interface TokensResponse {
  tokens: Token[];
  page: number;
  pageSize: number;
  total: number;
  allSameTargetPercent: number | null;
}

const TOKEN_TABLE_PAGE_SIZES = [10, 15, 30] as const;

const walletTypeLabel: Record<WalletType, string> = {
  exchange: 'Exchange',
  mother: 'Mère',
  simple: 'Simple',
};

function getPurchaseFilterLabel(period: TokenPurchaseFilter): string {
  if (period === 'all') return 'Tous';
  if (period === 'today') return 'Aujourd’hui';
  if (period === 'yesterday') return 'Hier';
  if (period === 'day') return 'Un jour';
  return 'Plage…';
}

function parseYyyyMmDdToDate(value: string): Date | undefined {
  if (value.trim() === '') return undefined;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!parts) return undefined;
  const year = Number(parts[1]);
  const month = Number(parts[2]) - 1;
  const day = Number(parts[3]);
  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function formatDateToYyyyMmDd(date?: Date): string {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface GmgnPurchasePreview {
  tokenAddress: string;
  name: string;
  purchasedAt: string;
  entryPrice: number;
  high: number;
  low: number;
  truncatedKlines: boolean;
  sourceWallet?: string;
}

/** Client row: valeurs déjà en échelle MCap (× 1e6 depuis GMGN) ; champs éditables si tu veux corriger. */
interface GmgnPreviewRow {
  rowKey: string;
  tokenAddress: string;
  name: string;
  purchasedAt: string;
  truncatedKlines: boolean;
  entryStr: string;
  highStr: string;
  lowStr: string;
  sourceWallet?: string;
}

function mapApiPurchasesToRows(purchases: GmgnPurchasePreview[]): GmgnPreviewRow[] {
  return purchases.map((p) => ({
    rowKey: crypto.randomUUID(),
    tokenAddress: p.tokenAddress,
    name: p.name,
    purchasedAt: p.purchasedAt,
    truncatedKlines: p.truncatedKlines,
    entryStr: formatGmgnDecimalString(p.entryPrice),
    highStr: formatGmgnDecimalString(p.high),
    lowStr: formatGmgnDecimalString(p.low),
    sourceWallet: p.sourceWallet,
  }));
}

function parseWalletLines(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const a = line.trim();
    if (a === '' || seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

/** Mints déjà enregistrés sur le rugger (`token_address` ou `name` si pas d’adresse séparée). */
function buildRuggerMintSet(tokens: Token[]): Set<string> {
  const s = new Set<string>();
  for (const t of tokens) {
    const m = (t.tokenAddress?.trim() || t.name?.trim()) ?? '';
    if (m !== '') s.add(m);
  }
  return s;
}

const DEFAULT_GMGN_TARGET_PERCENT = 100;

function StatusBadge({ statusId }: { statusId: StatusId }) {
  return (
    <span className={cn('rounded px-2 py-0.5 text-[11px] font-medium tracking-wide', STATUS_BADGE_STYLES[statusId])}>
      {STATUS_LABELS[statusId]}
    </span>
  );
}

export default function RuggerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : null;

  const [rugger, setRugger] = useState<Rugger | null>(null);
  const [tokensPage, setTokensPage] = useState<TokensResponse | null>(null);
  const [allTokensForStats, setAllTokensForStats] = useState<Token[]>([]);
  const [page, setPage] = useState(1);
  const [tokenTablePageSize, setTokenTablePageSize] =
    useState<(typeof TOKEN_TABLE_PAGE_SIZES)[number]>(10);
  const [isLoadingRugger, setIsLoadingRugger] = useState(true);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editWalletAddress, setEditWalletAddress] = useState('');
  const [editWalletType, setEditWalletType] = useState<WalletType>('simple');
  const [editNotes, setEditNotes] = useState('');
  const [globalTargetPercent, setGlobalTargetPercent] = useState('');
  const [globalTargetMcap, setGlobalTargetMcap] = useState('');
  const [globalExitMode, setGlobalExitMode] = useState<ExitMode>('percent');
  const [isApplyingGlobalTarget, setIsApplyingGlobalTarget] = useState(false);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const [tokenStatusFilter, setTokenStatusFilter] = useState<StatusId | 'all'>('all');
  const [tokenPurchaseFilter, setTokenPurchaseFilter] = useState<TokenPurchaseFilter>('all');
  const [tokenTableCustomFrom, setTokenTableCustomFrom] = useState('');
  const [tokenTableCustomTo, setTokenTableCustomTo] = useState('');
  const [tokenTablePickDay, setTokenTablePickDay] = useState('');
  const [migrationView, setMigrationView] = useState<MigrationView>('all');
  const [gmgnWalletInput, setGmgnWalletInput] = useState('');
  const [motherWalletText, setMotherWalletText] = useState('');
  const [tokenTrackingText, setTokenTrackingText] = useState('');
  const [gmgnFetchPeriod, setGmgnFetchPeriod] = useState<'today' | 'yesterday' | 'all' | 'custom'>('today');
  const [gmgnFetchFrom, setGmgnFetchFrom] = useState('');
  const [gmgnFetchTo, setGmgnFetchTo] = useState('');
  const [gmgnLoading, setGmgnLoading] = useState(false);
  const [gmgnError, setGmgnError] = useState<string | null>(null);
  const [gmgnPreview, setGmgnPreview] = useState<GmgnPreviewRow[] | null>(null);
  /** Après un fetch réussi : message si liste vide ou si des lignes ont été exclues (déjà en base). */
  const [gmgnDedupeNotice, setGmgnDedupeNotice] = useState<string | null>(null);
  const [tokenAddMode, setTokenAddMode] = useState<'manual' | 'walletBuyer' | 'motherExchange' | 'tokenTracking'>('walletBuyer');
  const prevRuggerIdForFetchRef = useRef<string | null>(null);
  const [hiddenTokenIds, setHiddenTokenIds] = useState<Set<string>>(() => new Set());
  const [refreshingTokenIds, setRefreshingTokenIds] = useState<Set<string>>(() => new Set());
  const [unfilteredRuggerTokens, setUnfilteredRuggerTokens] = useState<Token[]>([]);

  useEffect(() => {
    if (!id) return;
    try {
      const raw = window.localStorage.getItem(`stattracker-rugger-hidden:${id}`);
      if (!raw) {
        setHiddenTokenIds(new Set());
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setHiddenTokenIds(new Set());
        return;
      }
      setHiddenTokenIds(new Set(parsed.filter((x): x is string => typeof x === 'string')));
    } catch {
      setHiddenTokenIds(new Set());
    }
  }, [id]);

  const mergeHidden = useCallback(
    (list: Token[]) => list.map((t) => ({ ...t, hidden: hiddenTokenIds.has(t.id) })),
    [hiddenTokenIds]
  );

  const handleToggleHidden = useCallback(
    (tokenId: string) => {
      if (!id) return;
      setHiddenTokenIds((prev) => {
        const next = new Set(prev);
        if (next.has(tokenId)) next.delete(tokenId);
        else next.add(tokenId);
        try {
          window.localStorage.setItem(`stattracker-rugger-hidden:${id}`, JSON.stringify([...next]));
        } catch {
          // ignore storage errors
        }
        return next;
      });
    },
    [id]
  );

  const tokensForStats = useMemo(
    () => mergeHidden(allTokensForStats).filter((t) => !t.hidden),
    [mergeHidden, allTokensForStats]
  );

  const tokensForActivityInference = useMemo(
    () => mergeHidden(unfilteredRuggerTokens).filter((t) => !t.hidden),
    [mergeHidden, unfilteredRuggerTokens]
  );

  const migrationKnownTotal = useMemo(
    () => allTokensForStats.filter((t) => isMigrationPeakMcap(t.high)).length,
    [allTokensForStats]
  );

  const handleMigrationViewChange = useCallback((view: MigrationView) => {
    setMigrationView(view);
    setPage(1);
  }, []);

  const loadRugger = useCallback(async (ruggerId: string) => {
    setIsLoadingRugger(true);
    try {
      const response = await fetch(`/api/ruggers/${ruggerId}`);
      if (!response.ok) return;
      const data = (await response.json()) as Rugger;
      setRugger(data);
    } finally {
      setIsLoadingRugger(false);
    }
  }, []);

  const loadTokens = useCallback(
    async (
      ruggerId: string,
      nextPage: number,
      listPageSize: number,
      status?: StatusId | 'all',
      purchaseFilter?: TokenPurchaseFilter,
      tableCustomFrom?: string,
      tableCustomTo?: string,
      pickDay?: string,
      migrationOnly = false
    ) => {
      setIsLoadingTokens(true);
      try {
        const searchParams = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(listPageSize),
        });
        if (status && status !== 'all') {
          searchParams.set('status', status);
        }
        appendTokenDateQueryParams(
          searchParams,
          purchaseFilter ?? 'all',
          tableCustomFrom,
          tableCustomTo,
          pickDay
        );
        if (migrationOnly) {
          searchParams.set('migration', 'true');
        }
        const response = await fetch(
          `/api/ruggers/${ruggerId}/tokens?${searchParams.toString()}`
        );
        if (!response.ok) return;
        const data = (await response.json()) as TokensResponse;
        setTokensPage(data);
      } finally {
        setIsLoadingTokens(false);
      }
    },
    []
  );

  const loadAllTokensForStats = useCallback(
    async (
      ruggerId: string,
      status?: StatusId | 'all',
      purchaseFilter?: TokenPurchaseFilter,
      tableCustomFrom?: string,
      tableCustomTo?: string,
      pickDay?: string
    ) => {
      try {
        const params = new URLSearchParams({ all: 'true' });
        if (status && status !== 'all') {
          params.set('status', status);
        }
        appendTokenDateQueryParams(
          params,
          purchaseFilter ?? 'all',
          tableCustomFrom,
          tableCustomTo,
          pickDay
        );
        const response = await fetch(
          `/api/ruggers/${ruggerId}/tokens?${params.toString()}`
        );
        if (!response.ok) return;
        const data = (await response.json()) as TokensResponse;
        setAllTokensForStats(data.tokens);
      } catch {
        setAllTokensForStats([]);
      }
    },
    []
  );

  /** Tous les tokens du rugger, sans filtre statut / date — pour dédoublonner le fetch GMGN. */
  const loadAllRuggerTokensUnfiltered = useCallback(async (ruggerId: string): Promise<Token[]> => {
    try {
      const response = await fetch(`/api/ruggers/${ruggerId}/tokens?all=true`);
      if (!response.ok) return [];
      const data = (await response.json()) as TokensResponse;
      return data.tokens;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!id) {
      setUnfilteredRuggerTokens([]);
      return;
    }
    let cancelled = false;
    void loadAllRuggerTokensUnfiltered(id).then((list) => {
      if (!cancelled) setUnfilteredRuggerTokens(list);
    });
    return () => {
      cancelled = true;
    };
  }, [id, rugger?.tokenCount, allTokensForStats.length, loadAllRuggerTokensUnfiltered]);

  useEffect(() => {
    if (!id) return;
    void loadRugger(id);
  }, [id, loadRugger]);

  useEffect(() => {
    if (!id) {
      setTokensPage(null);
      setAllTokensForStats([]);
      prevRuggerIdForFetchRef.current = null;
      return;
    }

    const ruggerChanged = prevRuggerIdForFetchRef.current !== id;
    if (ruggerChanged) {
      prevRuggerIdForFetchRef.current = id;
      setMigrationView('all');
      setPage(1);
    }

    const fetchPage = ruggerChanged ? 1 : page;
    const migrationOnly = ruggerChanged ? false : migrationView === 'migrations';

    void loadTokens(
      id,
      fetchPage,
      tokenTablePageSize,
      tokenStatusFilter,
      tokenPurchaseFilter,
      tokenTableCustomFrom,
      tokenTableCustomTo,
      tokenTablePickDay,
      migrationOnly
    );
    void loadAllTokensForStats(
      id,
      tokenStatusFilter,
      tokenPurchaseFilter,
      tokenTableCustomFrom,
      tokenTableCustomTo,
      tokenTablePickDay
    );
  }, [
    id,
    page,
    tokenStatusFilter,
    tokenPurchaseFilter,
    tokenTableCustomFrom,
    tokenTableCustomTo,
    tokenTablePickDay,
    migrationView,
    tokenTablePageSize,
    loadTokens,
    loadAllTokensForStats,
  ]);

  useEffect(() => {
    if (rugger?.walletAddress) setGmgnWalletInput(rugger.walletAddress);
  }, [rugger?.walletAddress]);

  useEffect(() => {
    if (rugger && isEditing) {
      setEditName(rugger.name ?? '');
      setEditDescription(rugger.description ?? '');
      setEditWalletAddress(rugger.walletAddress);
      setEditWalletType(rugger.walletType);
      setEditNotes(rugger.notes ?? '');
    }
  }, [rugger, isEditing]);

  useEffect(() => {
    if (tokensPage?.allSameTargetPercent != null) {
      setGlobalTargetPercent(String(tokensPage.allSameTargetPercent));
    }
  }, [tokensPage?.allSameTargetPercent]);

  const handleImportTokens = useCallback(
    async (importedTokens: Token[]) => {
      if (!id) return;
      const response = await fetch(`/api/ruggers/${id}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: importedTokens }),
      });
      if (!response.ok) return;
      setPage(1);
      await loadTokens(
        id,
        1,
        tokenTablePageSize,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay,
        migrationView === 'migrations'
      );
      await loadAllTokensForStats(
        id,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay
      );
      await loadRugger(id);
    },
    [
      id,
      tokenTablePageSize,
      tokenStatusFilter,
      tokenPurchaseFilter,
      tokenTableCustomFrom,
      tokenTableCustomTo,
      tokenTablePickDay,
      migrationView,
      loadTokens,
      loadAllTokensForStats,
      loadRugger,
    ]
  );

  const handleAddToken = useCallback(
    async (token: Token) => {
      if (!id) return;
      const response = await fetch(`/api/ruggers/${id}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: [token], replace: false }),
      });
      if (!response.ok) return;
      setPage(1);
      await loadTokens(
        id,
        1,
        tokenTablePageSize,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay,
        migrationView === 'migrations'
      );
      await loadAllTokensForStats(
        id,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay
      );
    },
    [
      id,
      tokenTablePageSize,
      tokenStatusFilter,
      tokenPurchaseFilter,
      tokenTableCustomFrom,
      tokenTableCustomTo,
      tokenTablePickDay,
      migrationView,
      loadTokens,
      loadAllTokensForStats,
    ]
  );

  const handleChangeTarget = useCallback(
    async (tokenId: string, nextPercent: number) => {
      if (!id) return;
      const response = await fetch(`/api/ruggers/${id}/tokens/${tokenId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetExitPercent: nextPercent }),
      });
      if (!response.ok) return;
      await loadTokens(
        id,
        page,
        tokenTablePageSize,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay,
        migrationView === 'migrations'
      );
      await loadAllTokensForStats(
        id,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay
      );
    },
    [
      id,
      page,
      tokenTablePageSize,
      tokenStatusFilter,
      tokenPurchaseFilter,
      tokenTableCustomFrom,
      tokenTableCustomTo,
      tokenTablePickDay,
      migrationView,
      loadTokens,
      loadAllTokensForStats,
    ]
  );

  const handleChangeEntryPrice = useCallback(
    async (tokenId: string, nextPrice: number) => {
      if (!id) return;
      const response = await fetch(`/api/ruggers/${id}/tokens/${tokenId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryPrice: nextPrice }),
      });
      if (!response.ok) return;
      await loadTokens(
        id,
        page,
        tokenTablePageSize,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay,
        migrationView === 'migrations'
      );
      await loadAllTokensForStats(
        id,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay
      );
    },
    [
      id,
      page,
      tokenTablePageSize,
      tokenStatusFilter,
      tokenPurchaseFilter,
      tokenTableCustomFrom,
      tokenTableCustomTo,
      tokenTablePickDay,
      migrationView,
      loadTokens,
      loadAllTokensForStats,
    ]
  );

  const handleDeleteToken = useCallback(
    async (tokenId: string) => {
      if (!id) return;
      if (!window.confirm('Supprimer ce token ?')) return;
      const response = await fetch(`/api/ruggers/${id}/tokens/${tokenId}`, {
        method: 'DELETE',
      });
      if (!response.ok) return;
      await loadTokens(
        id,
        page,
        tokenTablePageSize,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay,
        migrationView === 'migrations'
      );
      await loadAllTokensForStats(
        id,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay
      );
    },
    [
      id,
      page,
      tokenTablePageSize,
      tokenStatusFilter,
      tokenPurchaseFilter,
      tokenTableCustomFrom,
      tokenTableCustomTo,
      tokenTablePickDay,
      migrationView,
      loadTokens,
      loadAllTokensForStats,
    ]
  );

  const handleRefreshTokenFromGmgn = useCallback(
    async (token: Token) => {
      if (!id) return;
      const mint = token.tokenAddress?.trim() ?? '';
      if (mint === '') {
        setGmgnError('Token sans mint : refresh GMGN impossible.');
        return;
      }
      setRefreshingTokenIds((prev) => new Set(prev).add(token.id));

      const fromMs = localGmgnAllTimeRange().fromMs;
      const toMs = Date.now();

      try {
        const res = await fetch('/api/gmgn/token-tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenAddress: mint,
            fromMs,
            toMs,
            athHigh: true,
          }),
        });
        const data = (await res.json()) as { purchases?: GmgnPurchasePreview[]; error?: string };
        if (!res.ok || !data.purchases || data.purchases.length === 0) {
          setGmgnError(data.error ?? 'Aucune donnée GMGN trouvée pour ce token.');
          return;
        }

        const p = data.purchases[0];
        const patchRes = await fetch(`/api/ruggers/${id}/tokens/${token.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            high: p.high,
            low: p.low,
            tokenName: p.name,
            purchasedAt: p.purchasedAt,
            // IMPORTANT: on ne touche pas entryPrice.
          }),
        });
        if (!patchRes.ok) return;

        // Mise à jour locale pour éviter le "jump" visuel lié au refetch complet.
        setTokensPage((prev) =>
          prev
            ? {
                ...prev,
                tokens: prev.tokens.map((t) =>
                  t.id === token.id
                    ? {
                        ...t,
                        high: p.high,
                        low: p.low,
                        tokenName: p.name,
                        purchasedAt: p.purchasedAt,
                      }
                    : t
                ),
              }
            : prev
        );
        setAllTokensForStats((prev) =>
          prev.map((t) =>
            t.id === token.id
              ? {
                  ...t,
                  high: p.high,
                  low: p.low,
                  tokenName: p.name,
                  purchasedAt: p.purchasedAt,
                }
              : t
          )
        );
        void loadAllRuggerTokensUnfiltered(id).then(setUnfilteredRuggerTokens);
      } finally {
        setRefreshingTokenIds((prev) => {
          const next = new Set(prev);
          next.delete(token.id);
          return next;
        });
      }
    },
    [id, setTokensPage, setAllTokensForStats, loadAllRuggerTokensUnfiltered]
  );

  const handleUpdateRugger = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!id || editWalletAddress.trim() === '') return;
      const response = await fetch(`/api/ruggers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim() || null,
          description: editDescription.trim() || null,
          walletAddress: editWalletAddress.trim(),
          walletType: editWalletType,
          notes: editNotes.trim() || null,
        }),
      });
      if (!response.ok) return;
      setIsEditing(false);
      await loadRugger(id);
    },
    [id, editName, editDescription, editWalletAddress, editWalletType, editNotes, loadRugger]
  );

  const handleApplyGlobalTarget = useCallback(async () => {
    if (!id) return;
    setIsApplyingGlobalTarget(true);
    try {
      let body: Record<string, number>;
      if (globalExitMode === 'mcap') {
        const mcap = Number(globalTargetMcap.replace(',', '.'));
        if (!Number.isFinite(mcap) || mcap <= 0) return;
        body = { targetExitMcap: mcap };
      } else {
        const value = Number(globalTargetPercent.replace(',', '.'));
        if (!Number.isFinite(value)) return;
        body = { targetExitPercent: value };
      }
      const response = await fetch(`/api/ruggers/${id}/tokens`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) return;
      await loadTokens(
        id,
        page,
        tokenTablePageSize,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay,
        migrationView === 'migrations'
      );
      await loadAllTokensForStats(
        id,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay
      );
    } finally {
      setIsApplyingGlobalTarget(false);
    }
  }, [
    id,
    globalExitMode,
    globalTargetPercent,
    globalTargetMcap,
    page,
    tokenTablePageSize,
    tokenStatusFilter,
    tokenPurchaseFilter,
    tokenTableCustomFrom,
    tokenTableCustomTo,
    tokenTablePickDay,
    migrationView,
    loadTokens,
    loadAllTokensForStats,
  ]);

  const handleResetTokens = useCallback(async () => {
    if (!id) return;
    if (!window.confirm('Supprimer tous les tokens de ce rugger ?')) return;
    const response = await fetch(`/api/ruggers/${id}/tokens`, { method: 'DELETE' });
    if (!response.ok) return;
    setPage(1);
    await loadTokens(
      id,
      1,
      tokenTablePageSize,
      tokenStatusFilter,
      tokenPurchaseFilter,
      tokenTableCustomFrom,
      tokenTableCustomTo,
      tokenTablePickDay,
      migrationView === 'migrations'
    );
    await loadAllTokensForStats(
      id,
      tokenStatusFilter,
      tokenPurchaseFilter,
      tokenTableCustomFrom,
      tokenTableCustomTo,
      tokenTablePickDay
    );
    await loadRugger(id);
  }, [
    id,
    tokenTablePageSize,
    tokenStatusFilter,
    tokenPurchaseFilter,
    tokenTableCustomFrom,
    tokenTableCustomTo,
    tokenTablePickDay,
    migrationView,
    loadTokens,
    loadAllTokensForStats,
    loadRugger,
  ]);

  const handleGmgnFetch = useCallback(async () => {
    setGmgnError(null);
    setGmgnPreview(null);
    setGmgnDedupeNotice(null);
    const w = gmgnWalletInput.trim();
    if (!w) {
      setGmgnError('Adresse wallet requise.');
      return;
    }
    if (!id) {
      setGmgnError('Rugger introuvable.');
      return;
    }
    const range =
      gmgnFetchPeriod === 'today'
        ? localTodayPurchaseRange()
        : gmgnFetchPeriod === 'yesterday'
          ? localYesterdayPurchaseRange()
          : gmgnFetchPeriod === 'all'
            ? localGmgnAllTimeRange()
            : gmgnFetchFrom && gmgnFetchTo
              ? localCustomDayRange(gmgnFetchFrom, gmgnFetchTo)
              : null;
    if (!range) {
      setGmgnError('Indique deux dates (début et fin) pour la plage personnalisée.');
      return;
    }
    setGmgnLoading(true);
    try {
      const existingTokens = await loadAllRuggerTokensUnfiltered(id);
      const knownMints = buildRuggerMintSet(existingTokens);

      const res = await fetch('/api/gmgn/wallet-purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: w,
          fromMs: range.fromMs,
          toMs: range.toMs,
        }),
      });
      const data = (await res.json()) as { purchases?: GmgnPurchasePreview[]; error?: string };
      if (!res.ok) {
        setGmgnError(data.error ?? 'Échec du fetch GMGN');
        return;
      }
      const rows = mapApiPurchasesToRows(data.purchases ?? []);
      const filtered = rows.filter((r) => !knownMints.has(r.tokenAddress.trim()));
      const skipped = rows.length - filtered.length;

      if (rows.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice(
          'Aucun achat « buy » renvoyé par GMGN sur ce créneau (minuit local → maintenant). ' +
            'Si le wallet est très actif, les achats récents peuvent être au-delà de la pagination : essaie « Tout » ou une plage personnalisée.'
        );
      } else if (filtered.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice(
          rows.length === 1
            ? 'Cet achat est déjà enregistré sur ce rugger.'
            : `Les ${rows.length} achat(s) trouvé(s) sont déjà enregistrés sur ce rugger.`
        );
      } else {
        setGmgnPreview(filtered);
        setGmgnDedupeNotice(
          skipped > 0
            ? `${skipped} achat(s) déjà présent(s) sur ce rugger — exclus de la liste.`
            : null
        );
      }
    } catch {
      setGmgnError('Erreur réseau');
    } finally {
      setGmgnLoading(false);
    }
  }, [id, gmgnWalletInput, gmgnFetchPeriod, gmgnFetchFrom, gmgnFetchTo, loadAllRuggerTokensUnfiltered]);

  const handleMotherFetch = useCallback(async () => {
    setGmgnError(null);
    setGmgnPreview(null);
    setGmgnDedupeNotice(null);
    const wallets = parseWalletLines(motherWalletText);
    if (wallets.length === 0) {
      setGmgnError('Indique au moins une adresse wallet (une par ligne).');
      return;
    }
    const MAX_WALLETS = 20;
    if (wallets.length > MAX_WALLETS) {
      setGmgnError(`Maximum ${MAX_WALLETS} adresses distinctes.`);
      return;
    }
    if (!id) {
      setGmgnError('Rugger introuvable.');
      return;
    }
    const range =
      gmgnFetchPeriod === 'today'
        ? localTodayPurchaseRange()
        : gmgnFetchPeriod === 'yesterday'
          ? localYesterdayPurchaseRange()
          : gmgnFetchPeriod === 'all'
            ? localGmgnAllTimeRange()
            : gmgnFetchFrom && gmgnFetchTo
              ? localCustomDayRange(gmgnFetchFrom, gmgnFetchTo)
              : null;
    if (!range) {
      setGmgnError('Indique deux dates (début et fin) pour la plage personnalisée.');
      return;
    }
    setGmgnLoading(true);
    try {
      const existingTokens = await loadAllRuggerTokensUnfiltered(id);
      const knownMints = buildRuggerMintSet(existingTokens);

      const res = await fetch('/api/gmgn/wallet-purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddresses: wallets,
          fromMs: range.fromMs,
          toMs: range.toMs,
        }),
      });
      const data = (await res.json()) as { purchases?: GmgnPurchasePreview[]; error?: string };
      if (!res.ok) {
        setGmgnError(data.error ?? 'Échec du fetch GMGN');
        return;
      }
      const rows = mapApiPurchasesToRows(data.purchases ?? []);
      const filtered = rows.filter((r) => !knownMints.has(r.tokenAddress.trim()));
      const skipped = rows.length - filtered.length;

      if (rows.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice(
          'Aucun achat « buy » renvoyé par GMGN sur ce créneau (minuit local → maintenant). ' +
            'Si les wallets sont très actifs, les achats récents peuvent être au-delà de la pagination : essaie « Tous » ou une plage personnalisée.'
        );
      } else if (filtered.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice(
          rows.length === 1
            ? 'Cet achat est déjà enregistré sur ce rugger.'
            : `Les ${rows.length} achat(s) trouvé(s) sont déjà enregistrés sur ce rugger.`
        );
      } else {
        setGmgnPreview(filtered);
        setGmgnDedupeNotice(
          skipped > 0
            ? `${skipped} achat(s) déjà présent(s) sur ce rugger — exclus de la liste.`
            : null
        );
      }
    } catch {
      setGmgnError('Erreur réseau');
    } finally {
      setGmgnLoading(false);
    }
  }, [id, motherWalletText, gmgnFetchPeriod, gmgnFetchFrom, gmgnFetchTo, loadAllRuggerTokensUnfiltered]);

  const handleTokenTrackingFetch = useCallback(async () => {
    setGmgnError(null);
    setGmgnPreview(null);
    setGmgnDedupeNotice(null);
    const tokens = parseWalletLines(tokenTrackingText);
    if (tokens.length === 0) {
      setGmgnError('Indique au moins une adresse token (une par ligne).');
      return;
    }
    const MAX_TOKENS = 30;
    if (tokens.length > MAX_TOKENS) {
      setGmgnError(`Maximum ${MAX_TOKENS} tokens distincts.`);
      return;
    }
    if (!id) {
      setGmgnError('Rugger introuvable.');
      return;
    }
    const range =
      gmgnFetchPeriod === 'today'
        ? localTodayPurchaseRange()
        : gmgnFetchPeriod === 'yesterday'
          ? localYesterdayPurchaseRange()
          : gmgnFetchPeriod === 'all'
            ? localGmgnAllTimeRange()
            : gmgnFetchFrom && gmgnFetchTo
              ? localCustomDayRange(gmgnFetchFrom, gmgnFetchTo)
              : null;
    if (!range) {
      setGmgnError('Indique deux dates (début et fin) pour la plage personnalisée.');
      return;
    }

    setGmgnLoading(true);
    try {
      const existingTokens = await loadAllRuggerTokensUnfiltered(id);
      const knownMints = buildRuggerMintSet(existingTokens);

      const res = await fetch('/api/gmgn/token-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenAddresses: tokens,
          fromMs: range.fromMs,
          toMs: range.toMs,
        }),
      });
      const data = (await res.json()) as { purchases?: GmgnPurchasePreview[]; error?: string };
      if (!res.ok) {
        setGmgnError(data.error ?? 'Échec du fetch GMGN');
        return;
      }

      const rows = mapApiPurchasesToRows(data.purchases ?? []);
      const filtered = rows.filter((r) => !knownMints.has(r.tokenAddress.trim()));
      const skipped = rows.length - filtered.length;

      if (rows.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice('Aucune donnée GMGN trouvée pour ces tokens sur ce créneau.');
      } else if (filtered.length === 0) {
        setGmgnPreview([]);
        setGmgnDedupeNotice(
          rows.length === 1
            ? 'Ce token est déjà enregistré sur ce rugger.'
            : `Les ${rows.length} token(s) trouvé(s) sont déjà enregistrés sur ce rugger.`
        );
      } else {
        setGmgnPreview(filtered);
        setGmgnDedupeNotice(
          skipped > 0
            ? `${skipped} token(s) déjà présent(s) sur ce rugger — exclus de la liste.`
            : null
        );
      }
    } catch {
      setGmgnError('Erreur réseau');
    } finally {
      setGmgnLoading(false);
    }
  }, [id, tokenTrackingText, gmgnFetchPeriod, gmgnFetchFrom, gmgnFetchTo, loadAllRuggerTokensUnfiltered]);

  const handleAddGmgnPurchases = useCallback(
    async (items: GmgnPreviewRow[]) => {
      if (!id || items.length === 0) return;
      const existingTokens = await loadAllRuggerTokensUnfiltered(id);
      const knownMints = buildRuggerMintSet(existingTokens);
      const newItems = items.filter((p) => !knownMints.has(p.tokenAddress.trim()));
      if (newItems.length === 0) return;

      const tokens: Token[] = newItems.map((p) => {
        const entryPrice = parseGmgnDecimalString(p.entryStr);
        const high = parseGmgnDecimalString(p.highStr);
        const low = parseGmgnDecimalString(p.lowStr);
        return {
          id: crypto.randomUUID(),
          name: p.tokenAddress,
          tokenName: p.name,
          entryPrice: entryPrice > 0 ? entryPrice : 1e-12,
          high: high > 0 ? high : 1e-12,
          low: low > 0 ? low : 1e-12,
          targetExitPercent: DEFAULT_GMGN_TARGET_PERCENT,
          purchasedAt: p.purchasedAt,
          tokenAddress: p.tokenAddress,
        };
      });
      const response = await fetch(`/api/ruggers/${id}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens, replace: false }),
      });
      if (!response.ok) return;
      setGmgnPreview(null);
      setGmgnDedupeNotice(null);
      setPage(1);
      await loadTokens(
        id,
        1,
        tokenTablePageSize,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay,
        migrationView === 'migrations'
      );
      await loadAllTokensForStats(
        id,
        tokenStatusFilter,
        tokenPurchaseFilter,
        tokenTableCustomFrom,
        tokenTableCustomTo,
        tokenTablePickDay
      );
    },
    [
      id,
      tokenTablePageSize,
      tokenStatusFilter,
      tokenPurchaseFilter,
      tokenTableCustomFrom,
      tokenTableCustomTo,
      tokenTablePickDay,
      migrationView,
      loadTokens,
      loadAllTokensForStats,
      loadAllRuggerTokensUnfiltered,
    ]
  );

  const removeGmgnPreviewRow = useCallback((rowKey: string) => {
    setGmgnPreview((prev) => {
      if (!prev) return prev;
      const next = prev.filter((r) => r.rowKey !== rowKey);
      return next.length === 0 ? null : next;
    });
  }, []);

  const updateGmgnPreviewRow = useCallback(
    (rowKey: string, field: 'entryStr' | 'highStr' | 'lowStr', value: string) => {
      setGmgnPreview((prev) => {
        if (!prev) return prev;
        return prev.map((r) => (r.rowKey === rowKey ? { ...r, [field]: value } : r));
      });
    },
    []
  );

  const handleAdvanceStatus = useCallback(async () => {
    if (!id || !rugger) return;
    const currentIndex = STATUS_ORDER.indexOf(rugger.statusId);
    if (currentIndex >= STATUS_ORDER.length - 1) return;
    const nextStatus = STATUS_ORDER[currentIndex + 1];
    const response = await fetch(`/api/ruggers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusId: nextStatus }),
    });
    if (!response.ok) return;
    await loadRugger(id);
  }, [id, rugger, loadRugger]);

  const handleRetrogradeStatus = useCallback(async () => {
    if (!id || !rugger) return;
    const currentIndex = STATUS_ORDER.indexOf(rugger.statusId);
    if (currentIndex <= 0) return;
    const prevStatus = STATUS_ORDER[currentIndex - 1];
    const response = await fetch(`/api/ruggers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusId: prevStatus }),
    });
    if (!response.ok) return;
    await loadRugger(id);
  }, [id, rugger, loadRugger]);

  const handleDeleteRugger = useCallback(async () => {
    if (!id || !rugger) return;
    if (
      !window.confirm(
        `Supprimer le rugger "${rugger.name ?? rugger.walletAddress}" ? Les tokens associés seront aussi supprimés.`
      )
    )
      return;
    const response = await fetch(`/api/ruggers/${id}`, { method: 'DELETE' });
    if (!response.ok) return;
    router.push('/rugger');
  }, [id, rugger, router]);

  const totalPages = useMemo(() => {
    if (!tokensPage) return 1;
    return Math.max(1, Math.ceil(tokensPage.total / tokensPage.pageSize));
  }, [tokensPage]);

  const activeTokens: Token[] = mergeHidden(tokensPage?.tokens ?? []);
  const tokensWithMetrics = activeTokens.map(getTokenWithMetrics);

  if (!id) {
    return (
      <div className="p-6 sm:p-8">
        <p className="text-muted-foreground">Rugger introuvable.</p>
      </div>
    );
  }

  if (isLoadingRugger && !rugger) {
    return (
      <div className="p-6 sm:p-8">
        <p className="text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  if (!rugger) {
    return (
      <div className="space-y-4 p-6 sm:p-8">
        <Link
          href="/rugger"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Retour aux ruggers
        </Link>
        <p className="text-muted-foreground">Rugger introuvable.</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-x-hidden space-y-10 p-6 sm:p-8">
      <header className="space-y-4">
        <Link
          href="/rugger"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Retour aux ruggers
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between overflow-hidden">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                {rugger.name ?? `${rugger.walletAddress.slice(0, 10)}…`}
              </h1>
              <div className="flex items-center gap-1.5">
                <StatusBadge statusId={rugger.statusId} />
                <span
                  className={cn(
                    'shrink-0 rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
                    rugger.walletType === 'exchange' &&
                      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                    rugger.walletType === 'mother' &&
                      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                    rugger.walletType === 'simple' &&
                      'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200'
                  )}
                >
                  {walletTypeLabel[rugger.walletType]}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {STATUS_ORDER.indexOf(rugger.statusId) > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRetrogradeStatus}
                    className="gap-1"
                  >
                    <IconChevronLeft className="size-4" />
                    Revenir à {STATUS_LABELS[STATUS_ORDER[STATUS_ORDER.indexOf(rugger.statusId) - 1]]}
                  </Button>
                )}
                {STATUS_ORDER.indexOf(rugger.statusId) < STATUS_ORDER.length - 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAdvanceStatus}
                    className="gap-1"
                  >
                    Passer à {STATUS_LABELS[STATUS_ORDER[STATUS_ORDER.indexOf(rugger.statusId) + 1]]}
                    <IconChevronRight className="size-4" />
                  </Button>
                )}
              </div>
            </div>
            <div
              className={cn(
                'min-w-0 overflow-x-hidden wrap-break-word',
                !isHeaderExpanded && 'max-h-24 overflow-y-hidden sm:max-h-none sm:overflow-visible',
                isHeaderExpanded && 'max-h-[50vh] overflow-y-auto'
              )}
            >
              {rugger.description ? (
                /^https?:\/\//i.test(rugger.description.trim()) ? (
                  <a
                    href={rugger.description.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block break-all text-sm text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    {rugger.description}
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground wrap-break-word">{rugger.description}</p>
                )
              ) : null}
              {(rugger.volumeMin != null || rugger.volumeMax != null) && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Intervalle volume : {rugger.volumeMin ?? '—'} – {rugger.volumeMax ?? '—'}
                </p>
              )}
              {rugger.notes?.trim() ? (
                <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm text-muted-foreground">
                  {rugger.notes}
                </p>
              ) : null}
              <p className="mt-2 break-all font-mono text-sm text-muted-foreground">
                {rugger.walletAddress}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 sm:hidden"
              onClick={() => setIsHeaderExpanded((v) => !v)}
            >
              {isHeaderExpanded ? 'Voir moins' : 'Voir plus'}
            </Button>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:flex-nowrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <IconPencil className="size-4 mr-1" />
              Modifier
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDeleteRugger}
            >
              <IconTrash className="size-4 mr-1" />
              Supprimer
            </Button>
          </div>
        </div>
      </header>

      {isEditing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-rugger-detail-title"
        >
          <Card className="w-full max-w-md max-h-[90dvh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 id="edit-rugger-detail-title" className="text-lg font-semibold">
                Modifier le rugger
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(false)}
              >
                Fermer
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateRugger} className="flex flex-col gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-detail-name">Nom (optionnel)</Label>
                  <Input
                    id="edit-detail-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="ex. Rugger principal"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-detail-description">Description (optionnel)</Label>
                  <Input
                    id="edit-detail-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="ex. Wallet principal CEX"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-detail-wallet">Adresse du wallet</Label>
                  <Input
                    id="edit-detail-wallet"
                    value={editWalletAddress}
                    onChange={(e) => setEditWalletAddress(e.target.value)}
                    placeholder="0x..."
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-detail-type">Type de wallet</Label>
                  <select
                    id="edit-detail-type"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={editWalletType}
                    onChange={(e) => setEditWalletType(e.target.value as WalletType)}
                  >
                    <option value="exchange">Exchange</option>
                    <option value="mother">Mère</option>
                    <option value="simple">Simple</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-detail-notes">Notes (optionnel)</Label>
                  <textarea
                    id="edit-detail-notes"
                    className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notes sur ce rugger…"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" size="sm">
                    Enregistrer
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-8">
        <StatsSummary
          tokens={tokensForStats}
          activityInferenceTokens={tokensForActivityInference}
        />

        <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow sm:p-6">
          <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-3">
            <h2 className="text-lg font-semibold leading-tight">Ajouter des tokens</h2>
            <TokenImportExport
              variant="menu"
              tokens={mergeHidden(allTokensForStats)}
              onImport={handleImportTokens}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setTokenAddMode('walletBuyer');
                setGmgnPreview(null);
                setGmgnDedupeNotice(null);
                setGmgnError(null);
              }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                tokenAddMode === 'walletBuyer'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              Wallet Buyer Tracking
            </button>
            <button
              type="button"
              onClick={() => {
                setTokenAddMode('motherExchange');
                setGmgnPreview(null);
                setGmgnDedupeNotice(null);
                setGmgnError(null);
              }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                tokenAddMode === 'motherExchange'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              Mother / Exchange Tracking
            </button>
            <button
              type="button"
              onClick={() => {
                setTokenAddMode('tokenTracking');
                setGmgnPreview(null);
                setGmgnDedupeNotice(null);
                setGmgnError(null);
              }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                tokenAddMode === 'tokenTracking'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              Token Tracking
            </button>
            <button
              type="button"
              onClick={() => {
                setTokenAddMode('manual');
                setGmgnPreview(null);
                setGmgnDedupeNotice(null);
                setGmgnError(null);
              }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                tokenAddMode === 'manual'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              Ajout manuel
            </button>
          </div>

          {tokenAddMode === 'manual' && <TokenForm onAdd={handleAddToken} />}

          {(tokenAddMode === 'walletBuyer' || tokenAddMode === 'motherExchange' || tokenAddMode === 'tokenTracking') && (
          <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">Période du fetch</span>
            <div className="flex flex-wrap items-center gap-2">
              {(['today', 'yesterday', 'all', 'custom'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setGmgnFetchPeriod(p)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    gmgnFetchPeriod === p
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {p === 'today'
                    ? 'Aujourd’hui'
                    : p === 'yesterday'
                      ? 'Hier'
                      : p === 'all'
                        ? 'Tous'
                        : 'Personnalisé'}
                </button>
              ))}
            </div>
          </div>
          {gmgnFetchPeriod === 'custom' && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="gmgn-from">Du</Label>
                <DatePicker
                  value={parseYyyyMmDdToDate(gmgnFetchFrom)}
                  onChange={(date) => setGmgnFetchFrom(formatDateToYyyyMmDd(date))}
                  placeholder="Date de début"
                  className="w-[200px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gmgn-to">Au</Label>
                <DatePicker
                  value={parseYyyyMmDdToDate(gmgnFetchTo)}
                  onChange={(date) => setGmgnFetchTo(formatDateToYyyyMmDd(date))}
                  placeholder="Date de fin"
                  className="w-[200px]"
                />
              </div>
            </div>
          )}
          {tokenAddMode === 'walletBuyer' && (
          <div className="mt-4 flex max-w-2xl flex-col gap-3">
            <Label htmlFor="gmgn-wallet" className="block text-sm font-medium leading-normal">
              Adresse wallet
            </Label>
            <Input
              id="gmgn-wallet"
              value={gmgnWalletInput}
              onChange={(e) => setGmgnWalletInput(e.target.value)}
              placeholder="Adresse Solana"
              className="w-full font-mono text-sm"
            />
          </div>
          )}
          {tokenAddMode === 'motherExchange' && (
          <div className="mt-4 flex max-w-2xl flex-col gap-3">
            <Label htmlFor="mother-wallets" className="block text-sm font-medium leading-normal">
              Adresses wallet (une par ligne)
            </Label>
            <textarea
              id="mother-wallets"
              value={motherWalletText}
              onChange={(e) => setMotherWalletText(e.target.value)}
              placeholder="Colle une ou plusieurs adresses Solana…"
              rows={5}
              className={cn(
                'min-h-[120px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs transition-[color,box-shadow] outline-none',
                'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'
              )}
            />
          </div>
          )}
          {tokenAddMode === 'tokenTracking' && (
          <div className="mt-4 flex max-w-2xl flex-col gap-3">
            <Label htmlFor="token-tracking" className="block text-sm font-medium leading-normal">
              Adresses token (une par ligne)
            </Label>
            <textarea
              id="token-tracking"
              value={tokenTrackingText}
              onChange={(e) => setTokenTrackingText(e.target.value)}
              placeholder="Colle une ou plusieurs adresses de token Solana…"
              rows={5}
              className={cn(
                'min-h-[120px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs transition-[color,box-shadow] outline-none',
                'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'
              )}
            />
          </div>
          )}
          {gmgnError && <p className="text-sm text-destructive">{gmgnError}</p>}
          <Button
            type="button"
            onClick={() =>
              void (
                tokenAddMode === 'motherExchange'
                  ? handleMotherFetch()
                  : tokenAddMode === 'tokenTracking'
                    ? handleTokenTrackingFetch()
                    : handleGmgnFetch()
              )
            }
            disabled={gmgnLoading}
          >
            {gmgnLoading ? 'Chargement GMGN…' : 'Fetch achats'}
          </Button>
          {gmgnPreview && gmgnPreview.length > 0 && (
            <div className="space-y-3">
              {gmgnDedupeNotice && (
                <p className="text-xs text-muted-foreground">{gmgnDedupeNotice}</p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {gmgnPreview.length} nouveau{gmgnPreview.length !== 1 ? 'x' : ''} achat
                  {gmgnPreview.length !== 1 ? 's' : ''} à ajouter
                </p>
                <Button type="button" size="sm" onClick={() => void handleAddGmgnPurchases(gmgnPreview)}>
                  Tout ajouter au rugger
                </Button>
              </div>
              <ul className="max-h-96 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3 text-sm">
                {gmgnPreview.map((p) => (
                  <li
                    key={p.rowKey}
                    className={cn(
                      'flex flex-col gap-3 rounded-md border bg-background/80 px-3 py-2',
                      p.truncatedKlines && 'border-2 border-red-500'
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground truncate">{p.tokenAddress}</div>
                        {p.sourceWallet && (
                          <div className="font-mono text-[10px] text-muted-foreground/90 truncate">
                            Wallet : {p.sourceWallet}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {new Date(p.purchasedAt).toLocaleString('fr-FR')}
                          {p.truncatedKlines && ' · kline non chargé (limite)'}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeGmgnPreviewRow(p.rowKey)}
                          aria-label="Retirer de la liste"
                        >
                          <IconTrash className="size-4" />
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => void handleAddGmgnPurchases([p])}>
                          Ajouter
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Entrée</Label>
                        <Input
                          className="font-mono text-xs"
                          inputMode="decimal"
                          value={p.entryStr}
                          onChange={(e) => updateGmgnPreviewRow(p.rowKey, 'entryStr', e.target.value)}
                          placeholder="ex. 6.41"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">High</Label>
                        <Input
                          className="font-mono text-xs"
                          inputMode="decimal"
                          value={p.highStr}
                          onChange={(e) => updateGmgnPreviewRow(p.rowKey, 'highStr', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Low</Label>
                        <Input
                          className="font-mono text-xs"
                          inputMode="decimal"
                          value={p.lowStr}
                          onChange={(e) => updateGmgnPreviewRow(p.rowKey, 'lowStr', e.target.value)}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gmgnPreview !== null && gmgnPreview.length === 0 && !gmgnLoading && (
            <p className="text-sm text-muted-foreground">
              {gmgnDedupeNotice ?? 'Aucun nouveau token à ajouter.'}
            </p>
          )}
          </div>
          )}
        </section>

        <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">Tokens</h2>
            <div className="flex gap-1">
              {(['all', ...STATUS_ORDER] as const).map((s) => {
                const styles = STATUS_FILTER_BUTTON_STYLES[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setTokenStatusFilter(s); setPage(1); }}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      tokenStatusFilter === s ? styles.selected : styles.unselected
                    )}
                  >
                    {s === 'all' ? 'Tous' : STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
            {allTokensForStats.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleResetTokens}
              >
                <IconTrash className="size-4 mr-1" />
                Reset les tokens
              </Button>
            )}
          </div>
          {tokensPage && (
            <p className="text-xs text-muted-foreground">
              Page {tokensPage.page} sur {totalPages} – {tokensPage.total} token
              {tokensPage.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Date d&apos;achat :</span>
            {(['all', 'today', 'yesterday', 'day', 'custom'] satisfies TokenPurchaseFilter[]).map(
              (period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => {
                    setTokenPurchaseFilter(period);
                    setPage(1);
                    if (period === 'day') {
                      setTokenTablePickDay((prev) => prev || formatDateToYyyyMmDd(new Date()));
                    }
                  }}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    tokenPurchaseFilter === period
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {getPurchaseFilterLabel(period)}
                </button>
              )
            )}
          </div>
          {tokenPurchaseFilter === 'day' && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label>Jour</Label>
                <DatePicker
                  value={parseYyyyMmDdToDate(tokenTablePickDay)}
                  onChange={(date) => {
                    setTokenTablePickDay(formatDateToYyyyMmDd(date));
                    setPage(1);
                  }}
                  placeholder="Choisir un jour"
                  className="w-[200px]"
                />
              </div>
            </div>
          )}
          {tokenPurchaseFilter === 'custom' && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="table-filter-from">Du</Label>
                <DatePicker
                  value={parseYyyyMmDdToDate(tokenTableCustomFrom)}
                  onChange={(date) => {
                    setTokenTableCustomFrom(formatDateToYyyyMmDd(date));
                    setPage(1);
                  }}
                  placeholder="Date de début"
                  className="w-[200px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="table-filter-to">Au</Label>
                <DatePicker
                  value={parseYyyyMmDdToDate(tokenTableCustomTo)}
                  onChange={(date) => {
                    setTokenTableCustomTo(formatDateToYyyyMmDd(date));
                    setPage(1);
                  }}
                  placeholder="Date de fin"
                  className="w-[200px]"
                />
              </div>
            </div>
          )}
        </div>
        {isLoadingTokens && tokensPage === null ? (
          <p className="text-sm text-muted-foreground">Chargement des tokens…</p>
        ) : activeTokens.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center text-muted-foreground">
            Aucun token pour ce rugger{tokenPurchaseFilter !== 'all' || tokenStatusFilter !== 'all' ? ' avec ces filtres' : ''}. Importe une liste JSON ci-dessus.
          </p>
        ) : (
          <>
            {isLoadingTokens ? (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Actualisation des données…
              </p>
            ) : null}
            <div
              className={cn(
                'space-y-4 transition-opacity',
                isLoadingTokens && 'pointer-events-none opacity-60'
              )}
            >
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                <Label className="text-sm font-medium">Objectif commun</Label>
                <div className="flex rounded-md border text-xs">
                  <button
                    type="button"
                    onClick={() => setGlobalExitMode('percent')}
                    className={cn(
                      'px-2 py-0.5 rounded-l-md transition-colors font-medium',
                      globalExitMode === 'percent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setGlobalExitMode('mcap')}
                    className={cn(
                      'px-2 py-0.5 rounded-r-md transition-colors font-medium',
                      globalExitMode === 'mcap' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    MCap
                  </button>
                </div>
                {globalExitMode === 'percent' ? (
                  <Input
                    id="global-target-percent"
                    type="text"
                    inputMode="decimal"
                    className="w-24"
                    value={globalTargetPercent}
                    onChange={(e) => setGlobalTargetPercent(e.target.value)}
                    placeholder="100"
                  />
                ) : (
                  <Input
                    id="global-target-mcap"
                    type="text"
                    inputMode="decimal"
                    className="w-32"
                    value={globalTargetMcap}
                    onChange={(e) => setGlobalTargetMcap(e.target.value)}
                    placeholder="500000"
                  />
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    isApplyingGlobalTarget || (
                      globalExitMode === 'percent'
                        ? !Number.isFinite(Number(globalTargetPercent.replace(',', '.')))
                        : !Number.isFinite(Number(globalTargetMcap.replace(',', '.'))) || Number(globalTargetMcap.replace(',', '.')) <= 0
                    )
                  }
                  onClick={handleApplyGlobalTarget}
                >
                  {isApplyingGlobalTarget ? 'Application…' : 'Appliquer à tous'}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {globalExitMode === 'percent'
                    ? 'Applique le même % de sortie à tous les tokens.'
                    : 'Calcule le % de sortie pour chaque token en fonction de son point d\'entrée.'}
                </span>
              </div>
            <TokenTable
              tokens={tokensWithMetrics}
              onChangeTarget={handleChangeTarget}
              onChangeEntryPrice={handleChangeEntryPrice}
              onRefreshToken={handleRefreshTokenFromGmgn}
              refreshingTokenIds={refreshingTokenIds}
              onDeleteToken={handleDeleteToken}
              onToggleHidden={handleToggleHidden}
              migrationView={migrationView}
              onMigrationViewChange={handleMigrationViewChange}
              migrationKnownCount={migrationKnownTotal}
            />
            <div className="flex flex-wrap items-center justify-start gap-3">
              <span className="text-xs font-medium text-muted-foreground">Par page</span>
              <div className="flex rounded-md border text-xs">
                {TOKEN_TABLE_PAGE_SIZES.map((n, i) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setTokenTablePageSize(n);
                      setPage(1);
                    }}
                    className={cn(
                      'px-2.5 py-1 font-medium transition-colors',
                      i === 0 && 'rounded-l-md',
                      i === TOKEN_TABLE_PAGE_SIZES.length - 1 && 'rounded-r-md',
                      i > 0 && 'border-l border-border',
                      tokenTablePageSize === n
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Page précédente
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Page suivante
                </Button>
              </div>
            </div>
            </div>
          </>
        )}
      </section>
      </div>
    </div>
  );
}

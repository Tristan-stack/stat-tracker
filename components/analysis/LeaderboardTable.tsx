'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WalletSource } from '@/types/analysis';
import { IconChevronDown, IconChevronUp, IconArrowsSort, IconExternalLink } from '@tabler/icons-react';

interface LeaderboardWallet {
  id: string;
  walletAddress: string;
  source: WalletSource;
  tokensBought: number;
  totalTokens: number;
  coveragePercent: number;
  firstBuyAt: string | null;
  lastBuyAt: string | null;
  activeDays: number;
  consistency: number;
  weight: number;
  avgHoldDuration: number | null;
  fundingDepth: number | null;
  fundingChain: string[] | null;
  motherAddress: string | null;
}

interface LeaderboardTableProps {
  ruggerId: string;
  analysisId: string;
  onWalletClick?: (walletAddress: string) => void;
}

type SortField = 'consistency' | 'weight' | 'coverage' | 'tokensBought';

const SORT_OPTIONS: { key: SortField; label: string }[] = [
  { key: 'consistency', label: 'Consistance' },
  { key: 'weight', label: 'Poids' },
  { key: 'coverage', label: 'Couverture' },
  { key: 'tokensBought', label: 'Tokens' },
];

const PAGE_SIZE = 30;

function sourceBadge(source: WalletSource) {
  const styles: Record<WalletSource, string> = {
    token: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    funding: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    both: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  };
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', styles[source])}>
      {source}
    </span>
  );
}

function truncateWallet(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(days: number) {
  if (days < 1) return '<1j';
  return `${Math.round(days)}j`;
}

export default function LeaderboardTable({ ruggerId, analysisId, onWalletClick }: LeaderboardTableProps) {
  const [wallets, setWallets] = useState<LeaderboardWallet[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<SortField>('consistency');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async (sort: SortField, pageOffset: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ sortBy: sort, limit: String(PAGE_SIZE), offset: String(pageOffset) });
      const res = await fetch(`/api/ruggers/${ruggerId}/analysis/${analysisId}/leaderboard?${params}`);
      if (!res.ok) return;
      const data = (await res.json()) as { wallets: LeaderboardWallet[]; total: number };
      setWallets(data.wallets);
      setTotal(data.total);
    } finally { setIsLoading(false); }
  }, [ruggerId, analysisId]);

  useEffect(() => { void fetchLeaderboard(sortBy, offset); }, [fetchLeaderboard, sortBy, offset]);

  const handleSort = (field: SortField) => {
    setSortBy(field);
    setOffset(0);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Leaderboard ({total} wallets)</h3>
        <div className="flex items-center gap-1">
          <IconArrowsSort className="size-3.5 text-muted-foreground" />
          {SORT_OPTIONS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => handleSort(key)}
              className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                sortBy === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn('overflow-x-auto rounded-lg border', isLoading && 'opacity-60 pointer-events-none')}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Wallet</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium text-right">Tokens</th>
              <th className="px-3 py-2 font-medium text-right">Couverture</th>
              <th className="px-3 py-2 font-medium text-right">Consistance</th>
              <th className="px-3 py-2 font-medium text-right">Poids</th>
              <th className="px-3 py-2 font-medium text-right">Durée</th>
              <th className="px-3 py-2 font-medium">Mère</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {wallets.map((w, i) => {
              const rank = offset + i + 1;
              const isExpanded = expandedId === w.id;
              return (
                <tr key={w.id} className="group border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => onWalletClick?.(w.walletAddress)}>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{rank}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs">{truncateWallet(w.walletAddress)}</span>
                  </td>
                  <td className="px-3 py-2">{sourceBadge(w.source)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{w.tokensBought}/{w.totalTokens}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPercent(w.coveragePercent)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPercent(w.consistency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPercent(w.weight)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDuration(w.activeDays)}</td>
                  <td className="px-3 py-2">
                    {w.motherAddress && (
                      <span className="font-mono text-[10px] text-muted-foreground">{truncateWallet(w.motherAddress)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : w.id); }}
                      className="rounded p-0.5 hover:bg-muted">
                      {isExpanded ? <IconChevronUp className="size-4" /> : <IconChevronDown className="size-4" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {wallets.length > 0 && expandedId && (() => {
        const w = wallets.find((x) => x.id === expandedId);
        if (!w) return null;
        return (
          <div className="rounded-lg border bg-muted/20 p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs">{w.walletAddress}</span>
              <a href={`https://solscan.io/account/${w.walletAddress}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                <IconExternalLink className="size-3.5" />
              </a>
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <div><span className="text-muted-foreground">Premier achat :</span> {w.firstBuyAt ? new Date(w.firstBuyAt).toLocaleDateString('fr-FR') : '—'}</div>
              <div><span className="text-muted-foreground">Dernier achat :</span> {w.lastBuyAt ? new Date(w.lastBuyAt).toLocaleDateString('fr-FR') : '—'}</div>
              <div><span className="text-muted-foreground">Durée hold moy. :</span> {w.avgHoldDuration != null ? `${w.avgHoldDuration.toFixed(1)}h` : '—'}</div>
            </div>
            {w.fundingChain && w.fundingChain.length > 0 && (
              <div className="text-xs">
                <span className="text-muted-foreground">Funding chain :</span>{' '}
                <span className="font-mono">{w.fundingChain.map(truncateWallet).join(' → ')}</span>
              </div>
            )}
          </div>
        );
      })()}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {currentPage}/{totalPages}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>Précédent</Button>
            <Button type="button" variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((o) => o + PAGE_SIZE)}>Suivant</Button>
          </div>
        </div>
      )}
    </div>
  );
}

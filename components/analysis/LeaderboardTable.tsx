'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WalletSource, CrossRuggerMatch } from '@/types/analysis';
import { IconChevronDown, IconChevronUp, IconArrowsSort, IconExternalLink, IconCopy, IconCheck } from '@tabler/icons-react';
import CrossRuggerBadge from '@/components/analysis/CrossRuggerBadge';
import WalletActions from '@/components/analysis/WalletActions';

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
  const [crossMatches, setCrossMatches] = useState<Map<string, CrossRuggerMatch>>(new Map());
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleCopyAddress = useCallback(async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress((prev) => (prev === address ? null : prev)), 1500);
  }, []);

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

  const fetchCrossRugger = useCallback(async () => {
    try {
      const res = await fetch(`/api/ruggers/${ruggerId}/analysis/${analysisId}/cross-rugger`);
      if (!res.ok) return;
      const data = (await res.json()) as { matches: CrossRuggerMatch[] };
      const map = new Map<string, CrossRuggerMatch>();
      for (const m of data.matches) map.set(m.walletAddress, m);
      setCrossMatches(map);
    } catch { /* ignore */ }
  }, [ruggerId, analysisId]);

  useEffect(() => { void fetchLeaderboard(sortBy, offset); }, [fetchLeaderboard, sortBy, offset]);
  useEffect(() => { void fetchCrossRugger(); }, [fetchCrossRugger]);

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
              const crossMatch = crossMatches.get(w.walletAddress);
              return (
                <Fragment key={w.id}>
                  <tr className={cn('group border-b hover:bg-muted/30 cursor-pointer', crossMatch && 'bg-amber-50/50 dark:bg-amber-950/10')}
                    onClick={() => onWalletClick?.(w.walletAddress)}>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{rank}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs">{truncateWallet(w.walletAddress)}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void handleCopyAddress(w.walletAddress); }}
                          className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
                          title="Copier l'adresse"
                        >
                          {copiedAddress === w.walletAddress
                            ? <IconCheck className="size-3 text-green-500" />
                            : <IconCopy className="size-3 text-muted-foreground" />}
                        </button>
                        {crossMatch && <span className="size-1.5 rounded-full bg-amber-500 shrink-0" title="Multi-rugger" />}
                      </div>
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
                  {isExpanded && (
                    <tr className={cn('border-b bg-muted/20', crossMatch && 'bg-amber-50/30 dark:bg-amber-950/10')}>
                      <td colSpan={10} className="p-0">
                        <div
                          className="border-t border-border/60 px-3 py-3 sm:px-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="rounded-lg border bg-background/80 p-3 shadow-sm space-y-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                              <p className="min-w-0 flex-1 font-mono text-[11px] leading-relaxed text-foreground break-all sm:max-w-[min(100%,42rem)]">
                                {w.walletAddress}
                              </p>
                              <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border/50 pt-3 sm:border-t-0 sm:pt-0">
                                <button
                                  type="button"
                                  onClick={() => void handleCopyAddress(w.walletAddress)}
                                  className="rounded-md border border-border/80 bg-muted/40 p-1.5 hover:bg-muted transition-colors"
                                  title="Copier l'adresse"
                                >
                                  {copiedAddress === w.walletAddress
                                    ? <IconCheck className="size-3.5 text-green-600 dark:text-green-400" />
                                    : <IconCopy className="size-3.5 text-muted-foreground" />}
                                </button>
                                <a
                                  href={`https://solscan.io/account/${w.walletAddress}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-md border border-border/80 bg-muted/40 p-1.5 text-primary hover:bg-muted"
                                  title="Solscan"
                                >
                                  <IconExternalLink className="size-3.5" />
                                </a>
                                <a
                                  href={`https://gmgn.ai/sol/address/${w.walletAddress}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-md border border-border/80 bg-muted/40 px-2 py-1.5 text-xs font-medium text-primary hover:bg-muted"
                                  title="GMGN"
                                >
                                  GMGN
                                </a>
                                <WalletActions walletAddress={w.walletAddress} sourceRuggerId={ruggerId} />
                                {crossMatch && (
                                  <CrossRuggerBadge ruggerNames={crossMatch.ruggerNames} ruggerIds={crossMatch.ruggerIds} />
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-3 sm:gap-4">
                              <div className="min-w-36 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Premier achat</p>
                                <p className="mt-0.5 text-sm font-medium tabular-nums">
                                  {w.firstBuyAt ? new Date(w.firstBuyAt).toLocaleDateString('fr-FR') : '—'}
                                </p>
                              </div>
                              <div className="min-w-36 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Dernier achat</p>
                                <p className="mt-0.5 text-sm font-medium tabular-nums">
                                  {w.lastBuyAt ? new Date(w.lastBuyAt).toLocaleDateString('fr-FR') : '—'}
                                </p>
                              </div>
                              <div className="min-w-36 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Hold moyen</p>
                                <p className="mt-0.5 text-sm font-medium tabular-nums">
                                  {w.avgHoldDuration != null ? `${w.avgHoldDuration.toFixed(1)} h` : '—'}
                                </p>
                              </div>
                            </div>

                            {w.fundingChain && w.fundingChain.length > 0 && (
                              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                                <span className="font-medium text-muted-foreground">Funding chain</span>
                                <p className="mt-1.5 font-mono text-[11px] leading-relaxed break-all">
                                  {w.fundingChain.map(truncateWallet).join(' → ')}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

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

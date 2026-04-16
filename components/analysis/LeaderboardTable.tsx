'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { WalletSource, CrossRuggerMatch } from '@/types/analysis';
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, Search, X } from 'lucide-react';
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
  spanDaysInScope: number;
  consistency: number;
  weight: number;
  avgHoldDuration: number | null;
  fundingDepth: number | null;
  fundingChain: string[] | null;
  motherAddress: string | null;
  motherChildCount: number;
  hasHighFanoutMother: boolean;
  matchingConfidence: number;
  inclusionDecision: 'included' | 'excluded' | 'included_with_risk';
  riskFlag: string | null;
  riskLevel: 'low' | 'medium' | 'high' | null;
  decisionReasons: string[];
}

interface LeaderboardTableProps {
  ruggerId: string;
  analysisId: string;
  onWalletClick?: (walletAddress: string) => void;
}

type SortField = 'consistency' | 'weight' | 'coverage' | 'tokensBought' | 'activeDays' | 'spanDays' | 'confidence';
type SortDirection = 'asc' | 'desc';

interface SortCriterion {
  field: SortField;
  direction: SortDirection;
}

const SORT_OPTIONS: { key: SortField; label: string; description: string }[] = [
  {
    key: 'coverage',
    label: 'Couverture %',
    description:
      'Part des tokens du rugger achetés par ce wallet : tokens achetés / total tokens du rugger.',
  },
  {
    key: 'consistency',
    label: 'Consistance',
    description:
      'Régularité des achats dans le temps, pondérée par la couverture. Un wallet peut couvrir beaucoup de tokens mais être moins consistant.',
  },
  {
    key: 'weight',
    label: 'Poids',
    description:
      'Importance relative du wallet dans le cluster (volume SOL si disponible, sinon nombre d’achats), normalisée de 0 à 100.',
  },
  {
    key: 'tokensBought',
    label: 'Tokens (nb)',
    description:
      'Nombre brut de tokens du rugger achetés. Contrairement à la couverture, ce score n’est pas un pourcentage.',
  },
  {
    key: 'activeDays',
    label: 'Jours actifs',
    description:
      'Nombre de jours d’activité du wallet sur cette analyse (fréquence, pas durée réelle).',
  },
  {
    key: 'spanDays',
    label: 'Durée (span)',
    description:
      'Durée réelle entre premier et dernier achat observé dans le scope de l’analyse.',
  },
  {
    key: 'confidence',
    label: 'Confiance',
    description:
      'Score de matching sur 100 (couverture, cohérence temporelle, proximité funding, poids).',
  },
];

const PAGE_SIZE = 30;
const MAX_SORT_CRITERIA = 3;
const DEFAULT_SORTS: SortCriterion[] = [{ field: 'coverage', direction: 'desc' }];

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
  return `${value.toFixed(1)}%`;
}

function formatDuration(days: number) {
  if (days < 1) return '<1j';
  return `${Math.round(days)}j`;
}

function getRiskBadgeClass(level: 'low' | 'medium' | 'high' | null): string {
  if (level === 'high') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  if (level === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  if (level === 'low') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
  return 'bg-muted text-muted-foreground';
}

function formatDecisionReason(reason: string | undefined): string {
  if (!reason) return '—';
  const labels: Record<string, string> = {
    wallet_centric_recovered: 'Wallet récupéré (passe ciblée)',
    high_coverage: 'Bonne couverture',
    low_coverage: 'Couverture faible',
    funding_only: 'Funding only',
    high_fanout_mother: 'Mère à haut fanout',
    weak_execution_weight: 'Poids faible',
    deep_funding_path: 'Funding profond',
    both_source_bonus: 'Signal token+funding',
  };
  return labels[reason] ?? reason;
}

function buildSortQuery(criteria: SortCriterion[]): string {
  return criteria.map((c) => `${c.field}:${c.direction}`).join(',');
}

export default function LeaderboardTable({ ruggerId, analysisId, onWalletClick }: LeaderboardTableProps) {
  const [wallets, setWallets] = useState<LeaderboardWallet[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sortCriteria, setSortCriteria] = useState<SortCriterion[]>(DEFAULT_SORTS);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [crossMatches, setCrossMatches] = useState<Map<string, CrossRuggerMatch>>(new Map());
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const handleCopyAddress = useCallback(async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress((prev) => (prev === address ? null : prev)), 1500);
  }, []);

  const fetchLeaderboard = useCallback(async (sorts: SortCriterion[], pageOffset: number, searchTerm: string) => {
    setIsLoading(true);
    try {
      const primarySort = sorts[0]?.field ?? 'coverage';
      const params = new URLSearchParams({
        sortBy: primarySort,
        limit: String(PAGE_SIZE),
        offset: String(pageOffset),
      });
      const sortQuery = buildSortQuery(sorts);
      if (sortQuery !== '') params.set('sort', sortQuery);
      if (searchTerm.trim() !== '') params.set('search', searchTerm.trim());
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

  useEffect(() => {
    void fetchLeaderboard(sortCriteria, offset, search);
  }, [fetchLeaderboard, sortCriteria, offset, search]);
  useEffect(() => { void fetchCrossRugger(); }, [fetchCrossRugger]);

  const toggleSortFromColumn = (field: SortField) => {
    setSortCriteria((prev): SortCriterion[] => {
      const existing = prev.find((criterion) => criterion.field === field);
      if (existing) {
        // Cycle: desc -> asc -> off
        if (existing.direction === 'desc') {
          return prev.map((criterion): SortCriterion =>
            criterion.field === field
              ? { field: criterion.field, direction: 'asc' }
              : criterion
          );
        }
        return prev.filter((criterion) => criterion.field !== field);
      }
      return [...prev, { field, direction: 'desc' as const }].slice(0, MAX_SORT_CRITERIA);
    });
    setOffset(0);
  };

  const getSortInfo = (field: SortField) => {
    const index = sortCriteria.findIndex((criterion) => criterion.field === field);
    if (index === -1) return null;
    return { index, direction: sortCriteria[index].direction };
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const primarySort = sortCriteria[0];
  const activeSortOption = primarySort
    ? SORT_OPTIONS.find((option) => option.key === primarySort.field) ?? null
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Leaderboard ({total} wallets)</h3>
        <p className="text-xs text-muted-foreground">Tri via en-têtes de colonnes</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          placeholder="Filtrer par adresse wallet…"
          className="h-8 pr-8 pl-8 text-xs"
        />
        {search.trim() !== '' && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setOffset(0);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Effacer la recherche"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <p className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {activeSortOption
          ? <>Tri principal : <span className="font-medium text-foreground">{activeSortOption.label}</span> — {activeSortOption.description}. Clic colonne : DESC → ASC → OFF.</>
          : <>Aucun tri actif. Clique une colonne (Couverture, Consistance, Poids, Durée...) pour activer le tri.</>}
      </p>

      <div className={cn('overflow-x-auto rounded-lg border', isLoading && 'opacity-60 pointer-events-none')}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Wallet</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium text-right">
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSortFromColumn('tokensBought')}>
                  Tokens
                  {(() => {
                    const sortInfo = getSortInfo('tokensBought');
                    if (!sortInfo) return null;
                    return <span className="text-[10px]">{sortInfo.direction === 'desc' ? '↓' : '↑'}{sortInfo.index + 1}</span>;
                  })()}
                </button>
              </th>
              <th className="px-3 py-2 font-medium text-right">
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSortFromColumn('coverage')}>
                  Couverture
                  {(() => {
                    const sortInfo = getSortInfo('coverage');
                    if (!sortInfo) return null;
                    return <span className="text-[10px]">{sortInfo.direction === 'desc' ? '↓' : '↑'}{sortInfo.index + 1}</span>;
                  })()}
                </button>
              </th>
              <th className="px-3 py-2 font-medium text-right">
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSortFromColumn('consistency')}>
                  Consistance
                  {(() => {
                    const sortInfo = getSortInfo('consistency');
                    if (!sortInfo) return null;
                    return <span className="text-[10px]">{sortInfo.direction === 'desc' ? '↓' : '↑'}{sortInfo.index + 1}</span>;
                  })()}
                </button>
              </th>
              <th className="px-3 py-2 font-medium text-right">
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSortFromColumn('weight')}>
                  Poids
                  {(() => {
                    const sortInfo = getSortInfo('weight');
                    if (!sortInfo) return null;
                    return <span className="text-[10px]">{sortInfo.direction === 'desc' ? '↓' : '↑'}{sortInfo.index + 1}</span>;
                  })()}
                </button>
              </th>
              <th className="px-3 py-2 font-medium text-right">
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSortFromColumn('confidence')}>
                  Confiance
                  {(() => {
                    const sortInfo = getSortInfo('confidence');
                    if (!sortInfo) return null;
                    return <span className="text-[10px]">{sortInfo.direction === 'desc' ? '↓' : '↑'}{sortInfo.index + 1}</span>;
                  })()}
                </button>
              </th>
              <th className="px-3 py-2 font-medium text-right">
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSortFromColumn('activeDays')}>
                  Jours actifs
                  {(() => {
                    const sortInfo = getSortInfo('activeDays');
                    if (!sortInfo) return null;
                    return <span className="text-[10px]">{sortInfo.direction === 'desc' ? '↓' : '↑'}{sortInfo.index + 1}</span>;
                  })()}
                </button>
              </th>
              <th className="px-3 py-2 font-medium text-right">
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSortFromColumn('spanDays')}>
                  Durée span
                  {(() => {
                    const sortInfo = getSortInfo('spanDays');
                    if (!sortInfo) return null;
                    return <span className="text-[10px]">{sortInfo.direction === 'desc' ? '↓' : '↑'}{sortInfo.index + 1}</span>;
                  })()}
                </button>
              </th>
              <th className="px-3 py-2 font-medium">Risque</th>
              <th className="px-3 py-2 font-medium">Raison</th>
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
                            ? <Check className="size-3 text-green-500" />
                            : <Copy className="size-3 text-muted-foreground" />}
                        </button>
                        {crossMatch && <span className="size-1.5 rounded-full bg-amber-500 shrink-0" title="Multi-rugger" />}
                      </div>
                    </td>
                    <td className="px-3 py-2">{sourceBadge(w.source)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{w.tokensBought}/{w.totalTokens}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPercent(w.coveragePercent)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPercent(w.consistency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPercent(w.weight)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPercent(w.matchingConfidence)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatDuration(w.activeDays)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatDuration(w.spanDaysInScope)}</td>
                    <td className="px-3 py-2">
                      {w.riskLevel
                        ? (
                          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', getRiskBadgeClass(w.riskLevel))}>
                            {w.riskLevel}
                          </span>
                        )
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDecisionReason(w.decisionReasons[0])}
                    </td>
                    <td className="px-3 py-2">
                      {w.motherAddress && (
                        <span className="font-mono text-[10px] text-muted-foreground">{truncateWallet(w.motherAddress)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : w.id); }}
                        className="rounded p-0.5 hover:bg-muted">
                        {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className={cn('border-b bg-muted/20', crossMatch && 'bg-amber-50/30 dark:bg-amber-950/10')}>
                      <td colSpan={14} className="p-0">
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
                                    ? <Check className="size-3.5 text-green-600 dark:text-green-400" />
                                    : <Copy className="size-3.5 text-muted-foreground" />}
                                </button>
                                <a
                                  href={`https://solscan.io/account/${w.walletAddress}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-md border border-border/80 bg-muted/40 p-1.5 text-primary hover:bg-muted"
                                  title="Solscan"
                                >
                                  <ExternalLink className="size-3.5" />
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

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WalletSource } from '@/types/analysis';
import { IconArrowLeft, IconExternalLink, IconCopy, IconCheck, IconAnalyze, IconLoader2 } from '@tabler/icons-react';
import WalletActions from '@/components/analysis/WalletActions';
import { getMaxGainPercent, getMaxLossPercent } from '@/lib/token-calculations';
import { formatGmgnDecimalString } from '@/lib/gmgn/price-rounding';
import type { Token } from '@/types/token';
import { StatsSummary } from '@/components/StatsSummary';

/** Entrée = plafond +X %. High = TP sécurisé −X % seul. Low = creux d’origine seul. */
const SECURE_MARGIN_PCT = 2;

function entryPlafondSecurise(entry: number): number {
  if (!Number.isFinite(entry) || entry <= 0) return 0;
  return entry * (1 + SECURE_MARGIN_PCT / 100);
}

function highSortieSecurisee(high: number): number {
  if (!Number.isFinite(high) || high <= 0) return 0;
  return high * (1 - SECURE_MARGIN_PCT / 100);
}

interface WalletPurchase {
  id: string;
  tokenAddress: string;
  tokenName: string | null;
  purchasedAt: string | null;
  amountSol: number | null;
}

interface WalletData {
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
  purchases: WalletPurchase[];
}

interface TokenAnalysisResult {
  tokenAddress: string;
  name: string;
  purchasedAt: string;
  entryPrice: number;
  high: number;
  low: number;
  truncatedKlines: boolean;
}

interface WalletDetailProps {
  ruggerId: string;
  analysisId: string;
  walletAddress: string;
  onBack: () => void;
}

function truncateAddress(addr: string) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function formatPercent(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function formatGainLoss(pct: number) {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

export default function WalletDetail({ ruggerId, analysisId, walletAddress, onBack }: WalletDetailProps) {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [tokenAnalysis, setTokenAnalysis] = useState<TokenAnalysisResult[] | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [copiedTokenMint, setCopiedTokenMint] = useState<string | null>(null);

  const handleCopy = useCallback(async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  const handleCopyTokenMint = useCallback(async (mint: string) => {
    await navigator.clipboard.writeText(mint);
    setCopiedTokenMint(mint);
    setTimeout(() => setCopiedTokenMint((prev) => (prev === mint ? null : prev)), 1500);
  }, []);

  const fetchWallet = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/ruggers/${ruggerId}/analysis/${analysisId}/wallet/${walletAddress}`);
      if (!res.ok) return;
      const data = (await res.json()) as WalletData;
      setWallet(data);
    } finally { setIsLoading(false); }
  }, [ruggerId, analysisId, walletAddress]);

  useEffect(() => { void fetchWallet(); }, [fetchWallet]);

  const statsTokensForSummary = useMemo((): Token[] => {
    if (!tokenAnalysis || tokenAnalysis.length === 0) return [];
    return tokenAnalysis.map((t) => ({
      id: t.tokenAddress,
      name: t.name.trim() || `${t.tokenAddress.slice(0, 4)}…${t.tokenAddress.slice(-4)}`,
      entryPrice: t.entryPrice,
      high: t.high,
      low: t.low,
      targetExitPercent: 100,
      tokenAddress: t.tokenAddress,
      purchasedAt: t.purchasedAt,
    }));
  }, [tokenAnalysis]);

  const handleAnalyzeTokens = useCallback(async () => {
    if (!wallet) return;
    setIsAnalyzing(true);
    setAnalysisError(null);

    const firstBuy = wallet.firstBuyAt ? new Date(wallet.firstBuyAt).getTime() : Date.now() - 30 * 86400000;
    const lastBuy = wallet.lastBuyAt ? new Date(wallet.lastBuyAt).getTime() : Date.now();
    const fromMs = firstBuy - 86400000;
    const toMs = Math.min(lastBuy + 7 * 86400000, Date.now());

    try {
      const res = await fetch('/api/gmgn/wallet-purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet.walletAddress, fromMs, toMs }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({ error: 'Erreur' }))) as { error?: string };
        setAnalysisError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as { purchases: TokenAnalysisResult[] };
      setTokenAnalysis(data.purchases);
    } catch {
      setAnalysisError('Erreur réseau');
    } finally {
      setIsAnalyzing(false);
    }
  }, [wallet]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (!wallet) return <p className="text-sm text-muted-foreground">Wallet introuvable.</p>;

  const sourceBadgeStyle: Record<WalletSource, string> = {
    token: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    funding: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    both: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  };

  const avgGain = tokenAnalysis && tokenAnalysis.length > 0
    ? tokenAnalysis.reduce((sum, t) => sum + getMaxGainPercent(t.entryPrice, t.high), 0) / tokenAnalysis.length
    : null;
  const avgLoss = tokenAnalysis && tokenAnalysis.length > 0
    ? tokenAnalysis.reduce((sum, t) => sum + getMaxLossPercent(t.entryPrice, t.low), 0) / tokenAnalysis.length
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <IconArrowLeft className="size-4" />Retour
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCopy(wallet.walletAddress)}
            className="flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-muted transition-colors cursor-pointer"
            title="Copier l'adresse"
          >
            <span className="font-mono text-sm">{wallet.walletAddress}</span>
            {copied
              ? <IconCheck className="size-3.5 text-green-500" />
              : <IconCopy className="size-3.5 text-muted-foreground" />}
          </button>
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', sourceBadgeStyle[wallet.source])}>{wallet.source}</span>
          <a href={`https://solscan.io/account/${wallet.walletAddress}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80" title="Solscan">
            <IconExternalLink className="size-4" />
          </a>
          <a href={`https://gmgn.ai/sol/address/${wallet.walletAddress}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:text-primary/80 font-medium" title="GMGN">
            GMGN
          </a>
          <WalletActions walletAddress={wallet.walletAddress} />
        </div>

        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatItem label="Tokens achetés" value={`${wallet.tokensBought}/${wallet.totalTokens}`} />
          <StatItem label="Couverture" value={formatPercent(wallet.coveragePercent)} />
          <StatItem label="Consistance" value={formatPercent(wallet.consistency)} />
          <StatItem label="Poids" value={formatPercent(wallet.weight)} />
          <StatItem label="Jours actifs" value={`${wallet.activeDays}j`} />
          <StatItem label="Hold moyen" value={wallet.avgHoldDuration != null ? `${wallet.avgHoldDuration.toFixed(1)}h` : '—'} />
        </div>

        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
          <StatItem label="Premier achat" value={wallet.firstBuyAt ? new Date(wallet.firstBuyAt).toLocaleDateString('fr-FR') : '—'} />
          <StatItem label="Dernier achat" value={wallet.lastBuyAt ? new Date(wallet.lastBuyAt).toLocaleDateString('fr-FR') : '—'} />
        </div>
      </div>

      {wallet.fundingChain && wallet.fundingChain.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Funding chain</h4>
          <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/20 p-3">
            {wallet.fundingChain.map((addr, i) => (
              <span key={`${addr}-${i}`} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground">→</span>}
                <a href={`https://solscan.io/account/${addr}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-primary hover:underline">
                  {truncateAddress(addr)}
                </a>
              </span>
            ))}
          </div>
          {wallet.motherAddress && (
            <p className="text-xs text-muted-foreground">
              Adresse mère : <span className="font-mono">{truncateAddress(wallet.motherAddress)}</span>
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Tokens achetés ({wallet.purchases.length})</h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            disabled={isAnalyzing}
            onClick={() => void handleAnalyzeTokens()}
          >
            {isAnalyzing
              ? <><IconLoader2 className="size-3.5 animate-spin" />Analyse en cours…</>
              : <><IconAnalyze className="size-3.5" />{tokenAnalysis ? 'Relancer l’analyse' : 'Analyser les tokens'}</>}
          </Button>
        </div>
        {analysisError && (
          <p className="text-sm text-destructive">{analysisError}</p>
        )}
        {wallet.purchases.length === 0
          ? <p className="text-xs text-muted-foreground">Aucun achat enregistré.</p>
          : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Token</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium text-right">SOL</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {wallet.purchases.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="truncate max-w-[200px]">{p.tokenName ?? truncateAddress(p.tokenAddress)}</div>
                        <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[200px]">{p.tokenAddress}</div>
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums whitespace-nowrap">
                        {p.purchasedAt ? new Date(p.purchasedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.amountSol != null ? p.amountSol.toFixed(3) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <a href={`https://solscan.io/token/${p.tokenAddress}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80" title="Solscan">
                            <IconExternalLink className="size-3.5" />
                          </a>
                          <a href={`https://gmgn.ai/sol/token/${p.tokenAddress}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:text-primary/80 font-medium" title="GMGN">
                            GMGN
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {(isAnalyzing || tokenAnalysis !== null) && (
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Analyse des tokens</h4>
        {isAnalyzing && tokenAnalysis === null && (
          <p className="text-xs text-muted-foreground">Récupération des données GMGN…</p>
        )}

        {tokenAnalysis && tokenAnalysis.length > 0 && (
          <>
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatItem label="Tokens analysés" value={String(tokenAnalysis.length)} />
              <StatItem label="Gain max moyen" value={avgGain != null ? formatGainLoss(avgGain) : '—'} />
              <StatItem label="Perte max moyenne" value={avgLoss != null ? formatGainLoss(avgLoss) : '—'} />
              <StatItem
                label="Ratio gain/perte"
                value={avgGain != null && avgLoss != null && avgLoss !== 0
                  ? (Math.abs(avgGain / avgLoss)).toFixed(2)
                  : '—'}
              />
            </div>

            {statsTokensForSummary.length > 0 && (
              <StatsSummary
                tokens={statsTokensForSummary}
                showSimulation={false}
                activityInferenceTokens={statsTokensForSummary}
              />
            )}

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Token</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium text-right">
                      Point d’entrée (+{SECURE_MARGIN_PCT}%)
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      High (−{SECURE_MARGIN_PCT}%)
                    </th>
                    <th className="px-3 py-2 font-medium text-right">Low</th>
                    <th className="px-3 py-2 font-medium text-right">Gain max</th>
                    <th className="px-3 py-2 font-medium text-right">Perte max</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {tokenAnalysis.map((t) => {
                    const gain = getMaxGainPercent(t.entryPrice, t.high);
                    const loss = getMaxLossPercent(t.entryPrice, t.low);
                    return (
                      <tr key={t.tokenAddress} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => void handleCopyTokenMint(t.tokenAddress)}
                            className="group flex w-full min-w-0 items-center gap-2 rounded px-1 -mx-1 py-0.5 text-left hover:bg-muted/80 transition-colors"
                            title="Copier le mint du token"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{t.name}</div>
                              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground truncate">
                                {t.tokenAddress}
                              </div>
                            </div>
                            <span className="shrink-0 self-center">
                              {copiedTokenMint === t.tokenAddress
                                ? <IconCheck className="size-3.5 text-green-600 dark:text-green-400" />
                                : <IconCopy className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />}
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2 text-xs tabular-nums whitespace-nowrap">
                          {new Date(t.purchasedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                          {formatGmgnDecimalString(entryPlafondSecurise(t.entryPrice))}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                          {formatGmgnDecimalString(highSortieSecurisee(t.high))}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                          {formatGmgnDecimalString(t.low)}
                        </td>
                        <td className={cn('px-3 py-2 text-right tabular-nums', gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                          {formatGainLoss(gain)}
                        </td>
                        <td className={cn('px-3 py-2 text-right tabular-nums', loss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                          {formatGainLoss(loss)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <a href={`https://solscan.io/token/${t.tokenAddress}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80" title="Solscan">
                              <IconExternalLink className="size-3.5" />
                            </a>
                            <a href={`https://gmgn.ai/sol/token/${t.tokenAddress}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:text-primary/80 font-medium" title="GMGN">
                              GMGN
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 px-1 text-[11px] text-muted-foreground">
                Point d’entrée = plafond +{SECURE_MARGIN_PCT}% seul. High = objectif TP −{SECURE_MARGIN_PCT}% seul (sous le sommet). Low = creux d’origine.
              </p>
            </div>
          </>
        )}

        {tokenAnalysis && tokenAnalysis.length === 0 && (
          <p className="text-xs text-muted-foreground">Aucun achat trouvé sur la période.</p>
        )}
      </div>
      )}
    </div>
  );
}

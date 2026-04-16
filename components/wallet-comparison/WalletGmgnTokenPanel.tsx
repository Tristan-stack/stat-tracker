'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getMaxGainPercent, getMaxLossPercent } from '@/lib/token-calculations';
import { formatGmgnDecimalString } from '@/lib/gmgn/price-rounding';
import type { Token } from '@/types/token';
import { StatsSummary } from '@/components/StatsSummary';
import WalletActions from '@/components/analysis/WalletActions';
import { Check, Copy, ExternalLink, LineChart, Loader2, X } from 'lucide-react';

const SECURE_MARGIN_PCT = 2;

function entryPlafondSecurise(entry: number): number {
  if (!Number.isFinite(entry) || entry <= 0) return 0;
  return entry * (1 + SECURE_MARGIN_PCT / 100);
}

function highSortieSecurisee(high: number): number {
  if (!Number.isFinite(high) || high <= 0) return 0;
  return high * (1 - SECURE_MARGIN_PCT / 100);
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

interface WalletGmgnTokenPanelProps {
  walletAddress: string;
  fromMs: number;
  toMs: number;
  onClose?: () => void;
}

function truncateAddress(addr: string) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
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

export default function WalletGmgnTokenPanel({ walletAddress, fromMs, toMs, onClose }: WalletGmgnTokenPanelProps) {
  const [tokenAnalysis, setTokenAnalysis] = useState<TokenAnalysisResult[] | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [copiedTokenMint, setCopiedTokenMint] = useState<string | null>(null);

  const handleCopyWallet = useCallback(async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopiedWallet(true);
    window.setTimeout(() => setCopiedWallet(false), 1500);
  }, [walletAddress]);

  const handleCopyTokenMint = useCallback(async (mint: string) => {
    await navigator.clipboard.writeText(mint);
    setCopiedTokenMint(mint);
    window.setTimeout(() => setCopiedTokenMint((prev) => (prev === mint ? null : prev)), 1500);
  }, []);

  const handleAnalyzeTokens = useCallback(async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch('/api/gmgn/wallet-purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, fromMs, toMs }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({ error: 'Erreur' }))) as { error?: string };
        setAnalysisError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as { purchases: TokenAnalysisResult[] };
      const rows = data.purchases.map((p) => ({
        ...p,
        name: typeof p.name === 'string' && p.name.trim() !== '' ? p.name.trim() : p.tokenAddress.slice(0, 8),
      }));
      setTokenAnalysis(rows);
    } catch {
      setAnalysisError('Erreur réseau');
    } finally {
      setIsAnalyzing(false);
    }
  }, [walletAddress, fromMs, toMs]);

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

  const avgGain =
    tokenAnalysis && tokenAnalysis.length > 0
      ? tokenAnalysis.reduce((sum, t) => sum + getMaxGainPercent(t.entryPrice, t.high), 0) / tokenAnalysis.length
      : null;
  const avgLoss =
    tokenAnalysis && tokenAnalysis.length > 0
      ? tokenAnalysis.reduce((sum, t) => sum + getMaxLossPercent(t.entryPrice, t.low), 0) / tokenAnalysis.length
      : null;

  return (
    <div className="relative space-y-4 rounded-lg border border-primary/25 bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Analyse détail (même période que la comparaison)</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopyWallet()}
              className="flex min-w-0 max-w-full items-center gap-1.5 rounded px-1 py-0.5 text-left font-mono text-sm hover:bg-muted"
              title="Copier l'adresse"
            >
              <span className="truncate">{walletAddress}</span>
              {copiedWallet ? (
                <Check className="size-3.5 shrink-0 text-green-500" />
              ) : (
                <Copy className="size-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
            <a
              href={`https://solscan.io/account/${walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80"
              title="Solscan"
            >
              <ExternalLink className="size-4" />
            </a>
            <a
              href={`https://gmgn.ai/sol/address/${walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-primary hover:text-primary/80"
            >
              GMGN
            </a>
            <div className="relative shrink-0">
              <WalletActions walletAddress={walletAddress} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {new Date(fromMs).toLocaleString('fr-FR', { dateStyle: 'short' })} →{' '}
            {new Date(toMs).toLocaleString('fr-FR', { dateStyle: 'short' })}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {onClose && (
            <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer le panneau">
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={isAnalyzing}
          onClick={() => void handleAnalyzeTokens()}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Analyse en cours…
            </>
          ) : (
            <>
              <LineChart className="size-3.5" />
              {tokenAnalysis ? 'Relancer l’analyse tokens' : 'Analyser les tokens'}
            </>
          )}
        </Button>
      </div>

      {analysisError && <p className="text-sm text-destructive">{analysisError}</p>}

      {(isAnalyzing || tokenAnalysis !== null) && (
        <div className="space-y-3 border-t border-border pt-4">
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
                  value={
                    avgGain != null && avgLoss != null && avgLoss !== 0 ? Math.abs(avgGain / avgLoss).toFixed(2) : '—'
                  }
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
                      <th className="px-3 py-2 text-right font-medium">Entrée (+{SECURE_MARGIN_PCT}%)</th>
                      <th className="px-3 py-2 text-right font-medium">High (−{SECURE_MARGIN_PCT}%)</th>
                      <th className="px-3 py-2 text-right font-medium">Low</th>
                      <th className="px-3 py-2 text-right font-medium">Gain max</th>
                      <th className="px-3 py-2 text-right font-medium">Perte max</th>
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
                              className="group flex w-full min-w-0 items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/80"
                              title="Copier le mint"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">{t.name}</div>
                                <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                                  {truncateAddress(t.tokenAddress)}
                                </div>
                              </div>
                              {copiedTokenMint === t.tokenAddress ? (
                                <Check className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />
                              ) : (
                                <Copy className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                              )}
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">
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
                          <td
                            className={cn(
                              'px-3 py-2 text-right tabular-nums',
                              gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            )}
                          >
                            {formatGainLoss(gain)}
                          </td>
                          <td
                            className={cn(
                              'px-3 py-2 text-right tabular-nums',
                              loss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            )}
                          >
                            {formatGainLoss(loss)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <a
                                href={`https://solscan.io/token/${t.tokenAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary/80"
                              >
                                <ExternalLink className="size-3.5" />
                              </a>
                              <a
                                href={`https://gmgn.ai/sol/token/${t.tokenAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-medium text-primary hover:text-primary/80"
                              >
                                GMGN
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-2 px-3 text-[11px] text-muted-foreground">
                  Point d&apos;entrée = plafond +{SECURE_MARGIN_PCT}% seul. High = TP −{SECURE_MARGIN_PCT}% seul. Low =
                  creux d&apos;origine.
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

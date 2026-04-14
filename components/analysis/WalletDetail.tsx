'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WalletSource } from '@/types/analysis';
import { IconArrowLeft, IconExternalLink } from '@tabler/icons-react';
import WalletActions from '@/components/analysis/WalletActions';

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

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (!wallet) return <p className="text-sm text-muted-foreground">Wallet introuvable.</p>;

  const sourceBadgeStyle: Record<WalletSource, string> = {
    token: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    funding: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    both: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <IconArrowLeft className="size-4" />Retour
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm">{wallet.walletAddress}</span>
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', sourceBadgeStyle[wallet.source])}>{wallet.source}</span>
          <a href={`https://solscan.io/account/${wallet.walletAddress}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
            <IconExternalLink className="size-4" />
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
        <h4 className="text-sm font-semibold">Tokens achetés ({wallet.purchases.length})</h4>
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
                    <th className="w-8" />
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
                        <a href={`https://solscan.io/token/${p.tokenAddress}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                          <IconExternalLink className="size-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}

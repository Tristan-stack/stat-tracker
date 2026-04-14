'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { WalletCombinationStep } from '@/types/analysis';

interface CombinationOptimizerProps {
  ruggerId: string;
  analysisId: string;
}

function truncateWallet(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const COVERAGE_OPTIONS = [50, 60, 70, 80, 90, 100] as const;

export default function CombinationOptimizer({ ruggerId, analysisId }: CombinationOptimizerProps) {
  const [targetCoverage, setTargetCoverage] = useState(80);
  const [steps, setSteps] = useState<WalletCombinationStep[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCombinations = useCallback(async (coverage: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/ruggers/${ruggerId}/analysis/${analysisId}/combinations?targetCoverage=${coverage}`);
      if (!res.ok) return;
      const data = (await res.json()) as { steps: WalletCombinationStep[]; totalTokens: number };
      setSteps(data.steps);
      setTotalTokens(data.totalTokens);
    } finally { setIsLoading(false); }
  }, [ruggerId, analysisId]);

  useEffect(() => { void fetchCombinations(targetCoverage); }, [fetchCombinations, targetCoverage]);

  const handleCoverageChange = (value: number) => {
    setTargetCoverage(value);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Combinaisons optimales</h3>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Couverture cible</Label>
        <div className="flex items-center gap-1.5">
          {COVERAGE_OPTIONS.map((c) => (
            <button key={c} type="button" onClick={() => handleCoverageChange(c)}
              className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                targetCoverage === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted border border-border')}>
              {c}%
            </button>
          ))}
        </div>
      </div>

      <div className={cn('space-y-2', isLoading && 'opacity-60 pointer-events-none')}>
        {steps.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground">Aucune combinaison trouvée.</p>
        )}

        {steps.map((step, i) => {
          const coveragePercent = totalTokens > 0 ? (step.cumulativeCoverage / totalTokens) * 100 : 0;
          return (
            <div key={step.walletAddress} className="rounded-lg border bg-background p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                  <span className="font-mono text-xs">{truncateWallet(step.walletAddress)}</span>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  +{step.newTokensCovered.length} token{step.newTokensCovered.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${coveragePercent}%` }} />
                </div>
                <span className="text-xs font-medium tabular-nums">{coveragePercent.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}

        {steps.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {steps.length} wallet{steps.length !== 1 ? 's' : ''} nécessaire{steps.length !== 1 ? 's' : ''} pour couvrir {targetCoverage}% des {totalTokens} tokens.
          </p>
        )}
      </div>
    </div>
  );
}

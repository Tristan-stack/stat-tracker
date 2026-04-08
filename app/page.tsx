'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TokenForm } from '@/components/TokenForm';
import { TokenTable } from '@/components/TokenTable';
import { StatsSummary } from '@/components/StatsSummary';
import { TokenImportExport } from '@/components/TokenImportExport';
import { CreateRuggerFromTokens } from '@/components/CreateRuggerFromTokens';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getStoredTokens, saveTokens } from '@/lib/storage';
import { getTokenWithMetrics } from '@/lib/token-calculations';
import type { Token, ExitMode } from '@/types/token';
import { cn } from '@/lib/utils';

export default function Home() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = getStoredTokens();
    const id = setTimeout(() => {
      setTokens(stored);
      setIsHydrated(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saveTokens(tokens);
  }, [tokens, isHydrated]);

  const handleAdd = useCallback((token: Token) => {
    setTokens((prev) => [...prev, token]);
  }, []);

  const handleChangeTarget = useCallback((id: string, nextPercent: number) => {
    setTokens((prev) =>
      prev.map((token) =>
        token.id === id ? { ...token, targetExitPercent: nextPercent } : token
      )
    );
  }, []);

  const handleChangeEntryPrice = useCallback((id: string, nextPrice: number) => {
    setTokens((prev) =>
      prev.map((token) =>
        token.id === id ? { ...token, entryPrice: nextPrice } : token
      )
    );
  }, []);

  const handleToggleHidden = useCallback((id: string) => {
    setTokens((prev) =>
      prev.map((token) =>
        token.id === id ? { ...token, hidden: !token.hidden } : token
      )
    );
  }, []);

  const activeTokens = useMemo(
    () => tokens.filter((t) => !t.hidden),
    [tokens]
  );

  const allSameTargetPercent = useMemo(() => {
    if (tokens.length === 0) return null;
    const first = tokens[0].targetExitPercent;
    return tokens.every((t) => t.targetExitPercent === first) ? first : null;
  }, [tokens]);

  const [globalTargetPercent, setGlobalTargetPercent] = useState('');
  const [globalTargetMcap, setGlobalTargetMcap] = useState('');
  const [globalExitMode, setGlobalExitMode] = useState<ExitMode>('percent');
  const derivedGlobalTarget = allSameTargetPercent != null && globalTargetPercent === ''
    ? String(allSameTargetPercent)
    : globalTargetPercent;

  const handleApplyGlobalTarget = useCallback(() => {
    if (globalExitMode === 'mcap') {
      const mcap = Number(globalTargetMcap.replace(',', '.'));
      if (!Number.isFinite(mcap) || mcap <= 0) return;
      setTokens((prev) =>
        prev.map((t) =>
          t.entryPrice > 0
            ? { ...t, targetExitPercent: Math.round(((mcap / t.entryPrice) - 1) * 10000) / 100 }
            : t
        )
      );
    } else {
      const value = Number(derivedGlobalTarget.replace(',', '.'));
      if (!Number.isFinite(value)) return;
      setTokens((prev) => prev.map((t) => ({ ...t, targetExitPercent: value })));
    }
  }, [globalExitMode, derivedGlobalTarget, globalTargetMcap]);

  const tokensWithMetrics = tokens.map(getTokenWithMetrics);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-12 p-6 py-10 sm:p-8 lg:py-14">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Suivi rentabilité tokens
            </h1>
            <p className="text-muted-foreground">
              Saisis ton entrée, le plus haut, le plus bas et ton objectif de sortie en %.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CreateRuggerFromTokens tokens={activeTokens} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTokens([])}
              disabled={tokens.length === 0}
            >
              Reset les tokens
            </Button>
          </div>
        </header>

        <TokenForm onAdd={handleAdd} />

        <StatsSummary tokens={activeTokens} />

        <TokenImportExport tokens={tokens} onImport={setTokens} />

        <section className="space-y-6">
          <h2 className="text-lg font-semibold">
            Tokens ({tokens.length})
            {tokens.length > 0 && activeTokens.length !== tokens.length && (
              <span className="font-normal text-muted-foreground">
                {' '}
                — {activeTokens.length} actif{activeTokens.length !== 1 ? 's' : ''}
              </span>
            )}
          </h2>
          {tokens.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center text-muted-foreground">
              Aucun token. Ajoute-en un avec le formulaire ci-dessus.
            </p>
          ) : (
            <>
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
                    value={derivedGlobalTarget}
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
                    globalExitMode === 'percent'
                      ? !Number.isFinite(Number(derivedGlobalTarget.replace(',', '.')))
                      : !Number.isFinite(Number(globalTargetMcap.replace(',', '.'))) || Number(globalTargetMcap.replace(',', '.')) <= 0
                  }
                  onClick={handleApplyGlobalTarget}
                >
                  Appliquer à tous
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
                onToggleHidden={handleToggleHidden}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

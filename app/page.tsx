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
import type { Token } from '@/types/token';

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

  const handleRemove = useCallback((id: string) => {
    setTokens((prev) => prev.filter((t) => t.id !== id));
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

  const allSameTargetPercent = useMemo(() => {
    if (tokens.length === 0) return null;
    const first = tokens[0].targetExitPercent;
    return tokens.every((t) => t.targetExitPercent === first) ? first : null;
  }, [tokens]);

  const [globalTargetPercent, setGlobalTargetPercent] = useState('');
  const derivedGlobalTarget = allSameTargetPercent != null && globalTargetPercent === ''
    ? String(allSameTargetPercent)
    : globalTargetPercent;

  const handleApplyGlobalTarget = useCallback(() => {
    const value = Number(derivedGlobalTarget.replace(',', '.'));
    if (!Number.isFinite(value)) return;
    setTokens((prev) => prev.map((t) => ({ ...t, targetExitPercent: value })));
  }, [derivedGlobalTarget]);

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
            <CreateRuggerFromTokens tokens={tokens} />
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

        <StatsSummary tokens={tokens} />

        <TokenImportExport tokens={tokens} onImport={setTokens} />

        <section className="space-y-6">
          <h2 className="text-lg font-semibold">Tokens ({tokens.length})</h2>
          {tokens.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center text-muted-foreground">
              Aucun token. Ajoute-en un avec le formulaire ci-dessus.
            </p>
          ) : (
            <>
              {allSameTargetPercent != null && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                  <Label htmlFor="global-target-percent" className="text-sm font-medium">
                    Objectif commun (%)
                  </Label>
                  <Input
                    id="global-target-percent"
                    type="text"
                    inputMode="decimal"
                    className="w-24"
                    value={derivedGlobalTarget}
                    onChange={(e) => setGlobalTargetPercent(e.target.value)}
                    placeholder="0"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!Number.isFinite(Number(derivedGlobalTarget.replace(',', '.')))}
                    onClick={handleApplyGlobalTarget}
                  >
                    Appliquer à tous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Tous les tokens ont le même objectif. Modifie et applique pour les mettre à jour.
                  </span>
                </div>
              )}
              <TokenTable
                tokens={tokensWithMetrics}
                onRemove={handleRemove}
                onChangeTarget={handleChangeTarget}
                onChangeEntryPrice={handleChangeEntryPrice}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

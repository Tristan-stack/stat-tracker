'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { TokenTable } from '@/components/TokenTable';
import { StatsSummary } from '@/components/StatsSummary';
import { TokenImportExport } from '@/components/TokenImportExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { Rugger, WalletType } from '@/types/rugger';
import type { Token } from '@/types/token';
import { getTokenWithMetrics } from '@/lib/token-calculations';
import { IconArrowLeft, IconPencil, IconTrash } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

interface TokensResponse {
  tokens: Token[];
  page: number;
  pageSize: number;
  total: number;
  allSameTargetPercent: number | null;
}

const walletTypeLabel: Record<WalletType, string> = {
  exchange: 'Exchange',
  mother: 'Mère',
  simple: 'Simple',
};

export default function RuggerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : null;

  const [rugger, setRugger] = useState<Rugger | null>(null);
  const [tokensPage, setTokensPage] = useState<TokensResponse | null>(null);
  const [allTokensForStats, setAllTokensForStats] = useState<Token[]>([]);
  const [page, setPage] = useState(1);
  const [isLoadingRugger, setIsLoadingRugger] = useState(true);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editWalletAddress, setEditWalletAddress] = useState('');
  const [editWalletType, setEditWalletType] = useState<WalletType>('simple');
  const [editStartHour, setEditStartHour] = useState('');
  const [editEndHour, setEditEndHour] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [globalTargetPercent, setGlobalTargetPercent] = useState('');
  const [isApplyingGlobalTarget, setIsApplyingGlobalTarget] = useState(false);

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

  const loadTokens = useCallback(async (ruggerId: string, nextPage: number) => {
    setIsLoadingTokens(true);
    try {
      const searchParams = new URLSearchParams({
        page: String(nextPage),
        pageSize: '10',
      });
      const response = await fetch(
        `/api/ruggers/${ruggerId}/tokens?${searchParams.toString()}`
      );
      if (!response.ok) return;
      const data = (await response.json()) as TokensResponse;
      setTokensPage(data);
    } finally {
      setIsLoadingTokens(false);
    }
  }, []);

  const loadAllTokensForStats = useCallback(async (ruggerId: string) => {
    try {
      const response = await fetch(
        `/api/ruggers/${ruggerId}/tokens?all=true`
      );
      if (!response.ok) return;
      const data = (await response.json()) as TokensResponse;
      setAllTokensForStats(data.tokens);
    } catch {
      setAllTokensForStats([]);
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    void loadRugger(id);
  }, [id, loadRugger]);

  useEffect(() => {
    if (!id) {
      setTokensPage(null);
      setAllTokensForStats([]);
      return;
    }
    void loadTokens(id, page);
    void loadAllTokensForStats(id);
  }, [id, page, loadTokens, loadAllTokensForStats]);

  useEffect(() => {
    if (rugger && isEditing) {
      setEditName(rugger.name ?? '');
      setEditDescription(rugger.description ?? '');
      setEditWalletAddress(rugger.walletAddress);
      setEditWalletType(rugger.walletType);
      setEditStartHour(rugger.startHour != null ? String(rugger.startHour) : '');
      setEditEndHour(rugger.endHour != null ? String(rugger.endHour) : '');
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
      await loadTokens(id, 1);
      await loadAllTokensForStats(id);
      await loadRugger(id);
    },
    [id, loadTokens, loadAllTokensForStats, loadRugger]
  );

  const handleUpdateRugger = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!id || editWalletAddress.trim() === '') return;
      const parseHour = (s: string): number | null => {
        const t = s.trim();
        if (t === '') return null;
        const n = Number(t);
        return Number.isFinite(n) && n >= 0 && n <= 23 ? n : null;
      };
      const response = await fetch(`/api/ruggers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim() || null,
          description: editDescription.trim() || null,
          walletAddress: editWalletAddress.trim(),
          walletType: editWalletType,
          startHour: parseHour(editStartHour),
          endHour: parseHour(editEndHour),
          notes: editNotes.trim() || null,
        }),
      });
      if (!response.ok) return;
      setIsEditing(false);
      await loadRugger(id);
    },
    [id, editName, editDescription, editWalletAddress, editWalletType, editStartHour, editEndHour, editNotes, loadRugger]
  );

  const handleApplyGlobalTarget = useCallback(async () => {
    if (!id) return;
    const value = Number(globalTargetPercent.replace(',', '.'));
    if (!Number.isFinite(value)) return;
    setIsApplyingGlobalTarget(true);
    try {
      const response = await fetch(`/api/ruggers/${id}/tokens`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetExitPercent: value }),
      });
      if (!response.ok) return;
      setGlobalTargetPercent(String(value));
      await loadTokens(id, page);
      await loadAllTokensForStats(id);
    } finally {
      setIsApplyingGlobalTarget(false);
    }
  }, [id, globalTargetPercent, page, loadTokens, loadAllTokensForStats]);

  const handleResetTokens = useCallback(async () => {
    if (!id) return;
    if (!window.confirm('Supprimer tous les tokens de ce rugger ?')) return;
    const response = await fetch(`/api/ruggers/${id}/tokens`, { method: 'DELETE' });
    if (!response.ok) return;
    setPage(1);
    await loadTokens(id, 1);
    await loadAllTokensForStats(id);
    await loadRugger(id);
  }, [id, loadTokens, loadAllTokensForStats, loadRugger]);

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

  const activeTokens: Token[] = tokensPage?.tokens ?? [];
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
    <div className="space-y-10 p-6 sm:p-8">
      <header className="space-y-4">
        <Link
          href="/rugger"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Retour aux ruggers
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {rugger.name ?? `${rugger.walletAddress.slice(0, 10)}…`}
              </h1>
              <span
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
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
            {rugger.description ? (
              /^https?:\/\//i.test(rugger.description.trim()) ? (
                <a
                  href={rugger.description.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  {rugger.description}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">{rugger.description}</p>
              )
            ) : null}
            {(rugger.volumeMin != null || rugger.volumeMax != null) && (
              <p className="mt-3 text-sm text-muted-foreground">
                Intervalle volume : {rugger.volumeMin ?? '—'} – {rugger.volumeMax ?? '—'}
              </p>
            )}
            {(rugger.startHour != null || rugger.endHour != null) && (
              <p className="mt-3 text-sm text-muted-foreground">
                Intervalle horaire : {rugger.startHour ?? '?'}h – {rugger.endHour ?? '?'}h
              </p>
            )}
            {rugger.notes?.trim() ? (
              <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{rugger.notes}</p>
            ) : null}
            <p className="font-mono text-sm text-muted-foreground">
              {rugger.walletAddress}
            </p>
          </div>
          <div className="flex gap-2">
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
                  <Label>Intervalle horaire (optionnel)</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Rug de</span>
                    <Input
                      id="edit-detail-start-hour"
                      type="number"
                      min={0}
                      max={23}
                      value={editStartHour}
                      onChange={(e) => setEditStartHour(e.target.value)}
                      placeholder="9"
                      className="w-16"
                    />
                    <span className="text-xs text-muted-foreground">h à</span>
                    <Input
                      id="edit-detail-end-hour"
                      type="number"
                      min={0}
                      max={23}
                      value={editEndHour}
                      onChange={(e) => setEditEndHour(e.target.value)}
                      placeholder="18"
                      className="w-16"
                    />
                    <span className="text-xs text-muted-foreground">h</span>
                  </div>
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
        <StatsSummary tokens={allTokensForStats} />

        <TokenImportExport tokens={allTokensForStats} onImport={handleImportTokens} />

        <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Tokens</h2>
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
        {isLoadingTokens ? (
          <p className="text-sm text-muted-foreground">Chargement des tokens…</p>
        ) : activeTokens.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center text-muted-foreground">
            Aucun token pour ce rugger. Importe une liste JSON ci-dessus.
          </p>
        ) : (
          <>
            {tokensPage?.allSameTargetPercent != null && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                <Label htmlFor="global-target-percent" className="text-sm font-medium">
                  Objectif commun (%)
                </Label>
                <Input
                  id="global-target-percent"
                  type="text"
                  inputMode="decimal"
                  className="w-24"
                  value={globalTargetPercent}
                  onChange={(e) => setGlobalTargetPercent(e.target.value)}
                  placeholder="0"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={isApplyingGlobalTarget || !Number.isFinite(Number(globalTargetPercent.replace(',', '.')))}
                  onClick={handleApplyGlobalTarget}
                >
                  {isApplyingGlobalTarget ? 'Application…' : 'Appliquer à tous'}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Tous les tokens ont le même objectif. Modifie et applique pour les mettre à jour.
                </span>
              </div>
            )}
            <TokenTable
              tokens={tokensWithMetrics}
              onRemove={() => {}}
              onChangeTarget={() => {}}
            />
            <div className="flex justify-end gap-2">
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
          </>
        )}
      </section>
      </div>
    </div>
  );
}

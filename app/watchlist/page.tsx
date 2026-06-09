'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { WatchlistWallet } from '@/types/watchlist';
import { Check, Copy, ExternalLink, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { canOpenSolscanAccount, openSolscanAccountInNewTab } from '@/lib/open-trusted-solana-external';
import { truncateAddress } from '@/lib/format';
import { apiPost } from '@/lib/api-client';
import {
  useWatchlist,
  useAddWatchlist,
  useUpdateWatchlist,
  useDeleteWatchlist,
} from '@/features/watchlist/hooks/use-watchlist';
import { useRuggersList } from '@/features/ruggers/hooks/use-ruggers';

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Erreur';
}

export default function WatchlistPage() {
  const { data: wallets = [], isLoading } = useWatchlist();
  const { data: ruggers = [] } = useRuggersList();
  const addWatchlist = useAddWatchlist();
  const updateWatchlist = useUpdateWatchlist();
  const deleteWatchlist = useDeleteWatchlist();

  const [isAdding, setIsAdding] = useState(false);
  const [addAddress, setAddAddress] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [linkingWallet, setLinkingWallet] = useState<WatchlistWallet | null>(null);
  const [selectedRuggerId, setSelectedRuggerId] = useState('');
  const [copiedWalletId, setCopiedWalletId] = useState<string | null>(null);

  const attachToRugger = useMutation({
    mutationFn: (input: { ruggerId: string; wallet: WatchlistWallet }) =>
      apiPost(`/api/ruggers/${input.ruggerId}/buyers`, {
        walletAddress: input.wallet.walletAddress,
        label: input.wallet.label ?? null,
        notes: input.wallet.notes ?? null,
        origin: 'watchlist',
      }),
  });

  const handleAdd = useCallback(async () => {
    setError(null);
    const addr = addAddress.trim();
    if (!addr) {
      setError('Adresse wallet requise.');
      return;
    }
    try {
      await addWatchlist.mutateAsync({
        walletAddress: addr,
        label: addLabel.trim() || undefined,
        notes: addNotes.trim() || undefined,
      });
      setAddAddress('');
      setAddLabel('');
      setAddNotes('');
      setIsAdding(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [addAddress, addLabel, addNotes, addWatchlist]);

  const handleUpdate = useCallback(
    async (id: string) => {
      try {
        await updateWatchlist.mutateAsync({
          id,
          label: editLabel.trim() || null,
          notes: editNotes.trim() || null,
        });
        setEditingId(null);
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [editLabel, editNotes, updateWatchlist]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm('Retirer ce wallet de la watchlist ?')) return;
      try {
        await deleteWatchlist.mutateAsync(id);
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [deleteWatchlist]
  );

  const startEdit = useCallback((w: WatchlistWallet) => {
    setEditingId(w.id);
    setEditLabel(w.label ?? '');
    setEditNotes(w.notes ?? '');
  }, []);

  const handleAttachToRugger = useCallback(async () => {
    if (!linkingWallet || selectedRuggerId.trim() === '') return;
    try {
      await attachToRugger.mutateAsync({ ruggerId: selectedRuggerId, wallet: linkingWallet });
      setLinkingWallet(null);
      setSelectedRuggerId('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [linkingWallet, selectedRuggerId, attachToRugger]);

  const handleCopyWallet = useCallback(async (wallet: WatchlistWallet) => {
    try {
      await navigator.clipboard.writeText(wallet.walletAddress);
      setCopiedWalletId(wallet.id);
      setTimeout(() => {
        setCopiedWalletId((current) => (current === wallet.id ? null : current));
      }, 1200);
    } catch {
      setError('Impossible de copier le wallet.');
    }
  }, []);

  return (
    <div className="space-y-6 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Watchlist</h1>
        <Button type="button" size="sm" onClick={() => setIsAdding(true)} className="gap-1">
          <Plus className="size-4" />Ajouter
        </Button>
      </div>

      {isAdding && (
        <Card>
          <CardHeader><h2 className="text-sm font-semibold">Ajouter un wallet</h2></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Adresse wallet</Label>
              <Input value={addAddress} onChange={(e) => setAddAddress(e.target.value)} placeholder="Adresse Solana" className="font-mono text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label (optionnel)</Label>
              <Input value={addLabel} onChange={(e) => setAddLabel(e.target.value)} placeholder="ex. Whale suspecte" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes (optionnel)</Label>
              <Input value={addNotes} onChange={(e) => setAddNotes(e.target.value)} placeholder="Notes…" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleAdd} disabled={addWatchlist.isPending}>Ajouter</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => { setIsAdding(false); setError(null); }}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : wallets.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center text-muted-foreground">
          Aucun wallet dans la watchlist. Ajoute des wallets depuis le leaderboard d&apos;une analyse ou manuellement.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Wallet</th>
                <th className="px-3 py-2 font-medium">Label</th>
                <th className="px-3 py-2 font-medium">Notes</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Ajouté le</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => (
                <tr key={w.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs">{truncateAddress(w.walletAddress)}</span>
                      <button
                        type="button"
                        onClick={() => void openSolscanAccountInNewTab(w.walletAddress)}
                        className="text-primary hover:text-primary/80 disabled:pointer-events-none disabled:opacity-40"
                        aria-label="Solscan"
                        disabled={!canOpenSolscanAccount(w.walletAddress)}
                      >
                        <ExternalLink className="size-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {editingId === w.id ? (
                      <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-7 text-xs" />
                    ) : (
                      <span className="text-xs">{w.label ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === w.id ? (
                      <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="h-7 text-xs" />
                    ) : (
                      <span className="text-xs text-muted-foreground truncate max-w-[200px] block">{w.notes ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {w.sourceRuggerId ? (
                      <Link href={`/rugger/${w.sourceRuggerId}`} className="text-primary hover:underline">
                        {w.sourceRuggerName ?? truncateAddress(w.sourceRuggerId)}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums whitespace-nowrap">
                    {new Date(w.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {editingId === w.id ? (
                        <>
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => void handleUpdate(w.id)}>OK</Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingId(null)}>x</Button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => startEdit(w)} className="rounded p-1 hover:bg-muted" aria-label="Modifier">
                            <Pencil className="size-3.5 text-muted-foreground" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCopyWallet(w)}
                            className="rounded p-1 hover:bg-muted"
                            aria-label="Copier le wallet"
                            title={copiedWalletId === w.id ? 'Copié' : 'Copier le wallet'}
                          >
                            {copiedWalletId === w.id ? (
                              <Check className="size-3.5 text-green-600" />
                            ) : (
                              <Copy className="size-3.5 text-muted-foreground" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLinkingWallet(w);
                              setSelectedRuggerId(w.sourceRuggerId ?? '');
                              setError(null);
                            }}
                            className="rounded p-1 hover:bg-muted"
                            aria-label="Ajouter à un rugger"
                            title="Ajouter à un rugger"
                          >
                            <Wallet className="size-3.5 text-primary" />
                          </button>
                          <button type="button" onClick={() => void handleDelete(w.id)} className="rounded p-1 hover:bg-muted" aria-label="Supprimer">
                            <Trash2 className="size-3.5 text-destructive" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {linkingWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h2 className="text-lg font-semibold">Ajouter à un rugger</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground break-all">
                Wallet: <span className="font-mono">{linkingWallet.walletAddress}</span>
              </p>
              <div className="space-y-1">
                <Label className="text-xs">Rugger cible</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedRuggerId}
                  onChange={(e) => setSelectedRuggerId(e.target.value)}
                >
                  <option value="">Choisir un rugger…</option>
                  {ruggers.map((rugger) => (
                    <option key={rugger.id} value={rugger.id}>
                      {rugger.name ?? rugger.walletAddress ?? `Rugger ${rugger.id.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={selectedRuggerId.trim() === '' || attachToRugger.isPending} onClick={() => void handleAttachToRugger()}>
                  Ajouter
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { setLinkingWallet(null); setSelectedRuggerId(''); }}>
                  Annuler
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

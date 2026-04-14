'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { WatchlistWallet } from '@/types/watchlist';
import { IconExternalLink, IconPencil, IconTrash, IconPlus } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

function truncateAddress(addr: string) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

export default function WatchlistPage() {
  const [wallets, setWallets] = useState<WatchlistWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [addAddress, setAddAddress] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchWallets = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/watchlist');
      if (!res.ok) return;
      const data = (await res.json()) as { wallets: WatchlistWallet[] };
      setWallets(data.wallets);
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void fetchWallets(); }, [fetchWallets]);

  const handleAdd = useCallback(async () => {
    setError(null);
    const addr = addAddress.trim();
    if (!addr) { setError('Adresse wallet requise.'); return; }
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: addr, label: addLabel.trim() || undefined, notes: addNotes.trim() || undefined }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? 'Erreur');
      return;
    }
    setAddAddress(''); setAddLabel(''); setAddNotes(''); setIsAdding(false);
    await fetchWallets();
  }, [addAddress, addLabel, addNotes, fetchWallets]);

  const handleUpdate = useCallback(async (id: string) => {
    const res = await fetch(`/api/watchlist/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: editLabel.trim() || null, notes: editNotes.trim() || null }),
    });
    if (!res.ok) return;
    setEditingId(null);
    await fetchWallets();
  }, [editLabel, editNotes, fetchWallets]);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('Retirer ce wallet de la watchlist ?')) return;
    const res = await fetch(`/api/watchlist/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    await fetchWallets();
  }, [fetchWallets]);

  const startEdit = useCallback((w: WatchlistWallet) => {
    setEditingId(w.id);
    setEditLabel(w.label ?? '');
    setEditNotes(w.notes ?? '');
  }, []);

  return (
    <div className="space-y-6 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Watchlist</h1>
        <Button type="button" size="sm" onClick={() => setIsAdding(true)} className="gap-1">
          <IconPlus className="size-4" />Ajouter
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
              <Button type="button" size="sm" onClick={handleAdd}>Ajouter</Button>
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
                      <a href={`https://solscan.io/account/${w.walletAddress}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                        <IconExternalLink className="size-3.5" />
                      </a>
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
                            <IconPencil className="size-3.5 text-muted-foreground" />
                          </button>
                          <button type="button" onClick={() => void handleDelete(w.id)} className="rounded p-1 hover:bg-muted" aria-label="Supprimer">
                            <IconTrash className="size-3.5 text-destructive" />
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
    </div>
  );
}

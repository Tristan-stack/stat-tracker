'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RuggerBuyerOrigin, RuggerBuyerWallet } from '@/types/rugger-buyer';
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';

interface RuggerBuyersTabProps {
  ruggerId: string;
  onRuggerChange: () => void;
}

const ORIGIN_LABELS: Record<RuggerBuyerOrigin, string> = {
  manual: 'Manuel',
  watchlist: 'Watchlist',
  analysis: 'Analyse',
  scraping: 'Scraping',
};

export default function RuggerBuyersTab({ ruggerId, onRuggerChange }: RuggerBuyersTabProps) {
  const [buyers, setBuyers] = useState<RuggerBuyerWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isAggregating, setIsAggregating] = useState(false);
  const [aggregateMessage, setAggregateMessage] = useState<string | null>(null);

  const fetchBuyers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/ruggers/${ruggerId}/buyers`);
      if (!res.ok) return;
      const data = (await res.json()) as { buyers: RuggerBuyerWallet[] };
      setBuyers(data.buyers);
    } finally {
      setIsLoading(false);
    }
  }, [ruggerId]);

  useEffect(() => {
    void fetchBuyers();
  }, [fetchBuyers]);

  const handleAddBuyer = useCallback(async () => {
    setError(null);
    const walletAddress = newAddress.trim();
    if (walletAddress === '') {
      setError('Adresse wallet requise.');
      return;
    }
    const res = await fetch(`/api/ruggers/${ruggerId}/buyers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        label: newLabel.trim() || null,
        notes: newNotes.trim() || null,
        origin: 'manual',
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Erreur');
      return;
    }
    setNewAddress('');
    setNewLabel('');
    setNewNotes('');
    setIsAdding(false);
    await fetchBuyers();
  }, [newAddress, newLabel, newNotes, ruggerId, fetchBuyers]);

  const handleDeleteBuyer = useCallback(
    async (buyer: RuggerBuyerWallet) => {
      if (!window.confirm(`Supprimer le wallet acheteur "${buyer.walletAddress}" ?`)) return;
      const res = await fetch(`/api/ruggers/${ruggerId}/buyers/${buyer.id}`, { method: 'DELETE' });
      if (!res.ok) return;
      await fetchBuyers();
    },
    [ruggerId, fetchBuyers]
  );

  const startEdit = useCallback((buyer: RuggerBuyerWallet) => {
    setEditingId(buyer.id);
    setEditLabel(buyer.label ?? '');
    setEditNotes(buyer.notes ?? '');
  }, []);

  const handleUpdateBuyer = useCallback(
    async (buyerId: string) => {
      const res = await fetch(`/api/ruggers/${ruggerId}/buyers/${buyerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editLabel.trim() || null,
          notes: editNotes.trim() || null,
        }),
      });
      if (!res.ok) return;
      setEditingId(null);
      await fetchBuyers();
    },
    [ruggerId, editLabel, editNotes, fetchBuyers]
  );

  const handleAggregateTokens = useCallback(async () => {
    setIsAggregating(true);
    setAggregateMessage(null);
    try {
      const res = await fetch(`/api/ruggers/${ruggerId}/buyers/aggregate-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        insertedCount?: number;
        skippedExistingCount?: number;
        sourceWalletCount?: number;
        walletRanking?: Array<{ walletAddress: string; tokenCount: number; coveragePercent: number }>;
        selectionStats?: Array<{ walletAddress: string; selectedTokenCount: number }>;
        error?: string;
      };
      if (!res.ok) {
        setAggregateMessage(data.error ?? 'Erreur pendant l’agrégation.');
        return;
      }
      const primaryWallet = data.walletRanking?.[0];
      const primarySelection = data.selectionStats?.[0];
      const baseMessage =
        `${data.insertedCount ?? 0} token(s) ajouté(s) depuis ${data.sourceWalletCount ?? 0} wallet(s). ${data.skippedExistingCount ?? 0} déjà présent(s).`;
      const strategyMessage = primaryWallet
        ? ` Wallet prioritaire: ${primaryWallet.walletAddress} (${primaryWallet.coveragePercent.toFixed(1)}% de couverture).`
        : '';
      const selectionMessage = primarySelection
        ? ` Tokens retenus majoritairement depuis: ${primarySelection.walletAddress} (${primarySelection.selectedTokenCount}).`
        : '';
      setAggregateMessage(`${baseMessage}${strategyMessage}${selectionMessage}`);
      onRuggerChange();
    } finally {
      setIsAggregating(false);
    }
  }, [ruggerId, onRuggerChange]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Wallets acheteurs</h2>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1" disabled={isAggregating} onClick={() => void handleAggregateTokens()}>
            <Sparkles className="size-4" />
            {isAggregating ? 'Agrégation…' : 'Générer les tokens du rugger'}
          </Button>
          <Button type="button" size="sm" className="gap-1" onClick={() => setIsAdding(true)}>
            <Plus className="size-4" />
            Ajouter un wallet
          </Button>
        </div>
      </div>

      {aggregateMessage && <p className="text-xs text-muted-foreground">{aggregateMessage}</p>}

      {isAdding && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Adresse wallet</Label>
              <Input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="Adresse Solana" className="font-mono text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Optionnel" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Optionnel" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void handleAddBuyer()}>Ajouter</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setIsAdding(false); setError(null); }}>Annuler</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : buyers.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          Aucun wallet acheteur lié à ce rugger.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Wallet</th>
                <th className="px-3 py-2 font-medium">Origine</th>
                <th className="px-3 py-2 font-medium">Label</th>
                <th className="px-3 py-2 font-medium">Notes</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {buyers.map((buyer) => (
                <tr key={buyer.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-xs break-all">{buyer.walletAddress}</td>
                  <td className="px-3 py-2 text-xs">{ORIGIN_LABELS[buyer.origin]}</td>
                  <td className="px-3 py-2">
                    {editingId === buyer.id ? (
                      <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-7 text-xs" />
                    ) : (
                      <span className="text-xs">{buyer.label ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === buyer.id ? (
                      <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="h-7 text-xs" />
                    ) : (
                      <span className="text-xs text-muted-foreground">{buyer.notes ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {editingId === buyer.id ? (
                        <>
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => void handleUpdateBuyer(buyer.id)}>
                            OK
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                            x
                          </Button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => startEdit(buyer)} className="rounded p-1 hover:bg-muted" aria-label="Modifier">
                            <Pencil className="size-3.5 text-muted-foreground" />
                          </button>
                          <button type="button" onClick={() => void handleDeleteBuyer(buyer)} className="rounded p-1 hover:bg-muted" aria-label="Supprimer">
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
    </section>
  );
}

'use client';

import { useState } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { PnlWallet } from '@/types/pnl';

interface PnlWalletManagerProps {
  wallets: PnlWallet[];
  onWalletsChange: (wallets: PnlWallet[]) => void;
}

function shortAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

export default function PnlWalletManager({ wallets, onWalletsChange }: PnlWalletManagerProps) {
  const [addressInput, setAddressInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAdd = async () => {
    const walletAddress = addressInput.trim();
    if (!walletAddress) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/pnl/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, label: labelInput.trim() || undefined }),
      });
      const data = (await res.json()) as { wallet?: PnlWallet; error?: string };
      if (!res.ok || !data.wallet) {
        setError(data.error ?? 'Échec de l’ajout');
        return;
      }
      onWalletsChange([data.wallet, ...wallets]);
      setAddressInput('');
      setLabelInput('');
    } catch {
      setError('Erreur réseau');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/pnl/wallets/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onWalletsChange(wallets.filter((w) => w.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveLabel = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/pnl/wallets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editLabel.trim() || undefined }),
      });
      const data = (await res.json()) as { wallet?: PnlWallet };
      if (res.ok && data.wallet) {
        onWalletsChange(wallets.map((w) => (w.id === id ? data.wallet! : w)));
        setEditingId(null);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Adresse du wallet"
          value={addressInput}
          onChange={(e) => setAddressInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleAdd();
          }}
          className="font-mono text-sm"
        />
        <Input
          placeholder="Nom (optionnel)"
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleAdd();
          }}
          className="sm:max-w-[200px]"
        />
        <Button type="button" onClick={() => void handleAdd()} disabled={adding || !addressInput.trim()}>
          {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Ajouter
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {wallets.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun wallet enregistré.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {wallets.map((w) => {
            const isEditing = editingId === w.id;
            const isBusy = busyId === w.id;
            return (
              <li key={w.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <Input
                      autoFocus
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSaveLabel(w.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="h-8"
                      placeholder="Nom du wallet"
                    />
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium">{w.label ?? shortAddress(w.walletAddress)}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{w.walletAddress}</p>
                    </>
                  )}
                </div>
                <div className={cn('flex shrink-0 items-center gap-1')}>
                  {isEditing ? (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        disabled={isBusy}
                        onClick={() => void handleSaveLabel(w.id)}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => {
                          setEditingId(w.id);
                          setEditLabel(w.label ?? '');
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        disabled={isBusy}
                        onClick={() => void handleDelete(w.id)}
                      >
                        {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

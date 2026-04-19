'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { Rugger, WalletType, StatusId } from '@/types/rugger';
import { STATUS_LABELS, STATUS_ORDER, STATUS_BADGE_STYLES } from '@/types/rugger';
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import RuggerTokensTab from '@/components/rugger/RuggerTokensTab';
import RuggerNetworkTab from '@/components/rugger/RuggerNetworkTab';
import RuggerBuyersTab from '@/components/rugger/RuggerBuyersTab';

type RuggerTab = 'tokens' | 'buyers' | 'network';

const walletTypeLabel: Record<WalletType, string> = {
  exchange: 'Exchange',
  mother: 'Mère',
  simple: 'Simple',
  buyer: 'Wallet acheteur',
};

function StatusBadge({ statusId }: { statusId: StatusId }) {
  return (
    <span className={cn('rounded px-2 py-0.5 text-[11px] font-medium tracking-wide', STATUS_BADGE_STYLES[statusId])}>
      {STATUS_LABELS[statusId]}
    </span>
  );
}

export default function RuggerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : null;

  const [rugger, setRugger] = useState<Rugger | null>(null);
  const [isLoadingRugger, setIsLoadingRugger] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editWalletAddress, setEditWalletAddress] = useState('');
  const [editWalletType, setEditWalletType] = useState<WalletType>('simple');
  const [editNotes, setEditNotes] = useState('');
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<RuggerTab>('tokens');

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

  useEffect(() => {
    if (!id) return;
    void loadRugger(id);
  }, [id, loadRugger]);

  useEffect(() => {
    if (rugger && isEditing) {
      setEditName(rugger.name ?? '');
      setEditDescription(rugger.description ?? '');
      setEditWalletAddress(rugger.walletAddress ?? '');
      setEditWalletType(rugger.walletType);
      setEditNotes(rugger.notes ?? '');
    }
  }, [rugger, isEditing]);

  const handleUpdateRugger = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!id) return;
      const response = await fetch(`/api/ruggers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim() || null,
          description: editDescription.trim() || null,
          walletAddress: editWalletAddress.trim() || null,
          walletType: editWalletType,
          notes: editNotes.trim() || null,
        }),
      });
      if (!response.ok) return;
      setIsEditing(false);
      await loadRugger(id);
    },
    [id, editName, editDescription, editWalletAddress, editWalletType, editNotes, loadRugger]
  );

  const handleAdvanceStatus = useCallback(async () => {
    if (!id || !rugger) return;
    const currentIndex = STATUS_ORDER.indexOf(rugger.statusId);
    if (currentIndex >= STATUS_ORDER.length - 1) return;
    const nextStatus = STATUS_ORDER[currentIndex + 1];
    const response = await fetch(`/api/ruggers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusId: nextStatus }),
    });
    if (!response.ok) return;
    await loadRugger(id);
  }, [id, rugger, loadRugger]);

  const handleRetrogradeStatus = useCallback(async () => {
    if (!id || !rugger) return;
    const currentIndex = STATUS_ORDER.indexOf(rugger.statusId);
    if (currentIndex <= 0) return;
    const prevStatus = STATUS_ORDER[currentIndex - 1];
    const response = await fetch(`/api/ruggers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusId: prevStatus }),
    });
    if (!response.ok) return;
    await loadRugger(id);
  }, [id, rugger, loadRugger]);

  const handleDeleteRugger = useCallback(async () => {
    if (!id || !rugger) return;
    if (!window.confirm(`Supprimer le rugger "${rugger.name ?? rugger.walletAddress ?? rugger.id}" ? Les tokens associés seront aussi supprimés.`)) return;
    const response = await fetch(`/api/ruggers/${id}`, { method: 'DELETE' });
    if (!response.ok) return;
    router.push('/rugger');
  }, [id, rugger, router]);

  const handleRuggerChange = useCallback(() => {
    if (id) void loadRugger(id);
  }, [id, loadRugger]);

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
        <Link href="/rugger" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Retour aux ruggers
        </Link>
        <p className="text-muted-foreground">Rugger introuvable.</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-x-hidden space-y-10 p-6 sm:p-8">
      <header className="space-y-4">
        <Link href="/rugger" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Retour aux ruggers
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between overflow-hidden">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                {rugger.name ?? (rugger.walletAddress ? `${rugger.walletAddress.slice(0, 10)}…` : `Rugger ${rugger.id.slice(0, 8)}`)}
              </h1>
              <div className="flex items-center gap-1.5">
                <StatusBadge statusId={rugger.statusId} />
                <span
                  className={cn(
                    'shrink-0 rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
                    rugger.walletType === 'exchange' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                    rugger.walletType === 'mother' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                    rugger.walletType === 'simple' && 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
                    rugger.walletType === 'buyer' &&
                      'bg-teal-100 text-teal-900 dark:bg-teal-900/30 dark:text-teal-200'
                  )}
                >
                  {walletTypeLabel[rugger.walletType]}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {STATUS_ORDER.indexOf(rugger.statusId) > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={handleRetrogradeStatus} className="gap-1">
                    <ChevronLeft className="size-4" />
                    Revenir à {STATUS_LABELS[STATUS_ORDER[STATUS_ORDER.indexOf(rugger.statusId) - 1]]}
                  </Button>
                )}
                {STATUS_ORDER.indexOf(rugger.statusId) < STATUS_ORDER.length - 1 && (
                  <Button type="button" variant="outline" size="sm" onClick={handleAdvanceStatus} className="gap-1">
                    Passer à {STATUS_LABELS[STATUS_ORDER[STATUS_ORDER.indexOf(rugger.statusId) + 1]]}
                    <ChevronRight className="size-4" />
                  </Button>
                )}
              </div>
            </div>
            <div
              className={cn(
                'min-w-0 overflow-x-hidden wrap-break-word',
                !isHeaderExpanded && 'max-h-24 overflow-y-hidden sm:max-h-none sm:overflow-visible',
                isHeaderExpanded && 'max-h-[50vh] overflow-y-auto'
              )}
            >
              {rugger.description ? (
                /^https?:\/\//i.test(rugger.description.trim()) ? (
                  <a href={rugger.description.trim()} target="_blank" rel="noopener noreferrer" className="block break-all text-sm text-primary underline underline-offset-2 hover:text-primary/80">
                    {rugger.description}
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground wrap-break-word">{rugger.description}</p>
                )
              ) : null}
              {(rugger.volumeMin != null || rugger.volumeMax != null) && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Intervalle volume : {rugger.volumeMin ?? '—'} – {rugger.volumeMax ?? '—'}
                </p>
              )}
              {rugger.notes?.trim() ? (
                <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm text-muted-foreground">{rugger.notes}</p>
              ) : null}
              {rugger.walletAddress ? (
                <p className="mt-2 break-all font-mono text-sm text-muted-foreground">{rugger.walletAddress}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Aucun wallet principal défini</p>
              )}
            </div>
            <Button type="button" variant="ghost" size="sm" className="mt-1 sm:hidden" onClick={() => setIsHeaderExpanded((v) => !v)}>
              {isHeaderExpanded ? 'Voir moins' : 'Voir plus'}
            </Button>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:flex-nowrap">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="size-4 mr-1" />Modifier
            </Button>
            <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleDeleteRugger}>
              <Trash2 className="size-4 mr-1" />Supprimer
            </Button>
          </div>
        </div>
      </header>

      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-rugger-detail-title">
          <Card className="w-full max-w-md max-h-[90dvh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 id="edit-rugger-detail-title" className="text-lg font-semibold">Modifier le rugger</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Fermer</Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateRugger} className="flex flex-col gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-detail-name">Nom (optionnel)</Label>
                  <Input id="edit-detail-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="ex. Rugger principal" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-detail-description">Description (optionnel)</Label>
                  <Input id="edit-detail-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="ex. Wallet principal CEX" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-detail-wallet">Adresse du wallet (optionnel)</Label>
                  <Input id="edit-detail-wallet" value={editWalletAddress} onChange={(e) => setEditWalletAddress(e.target.value)} placeholder="0x..." />
                  {editWalletType === 'buyer' && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Adresse Solana du wallet acheteur pour le montant du 1er achat dans le tableau des tokens.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-detail-type">Type de wallet</Label>
                  <select id="edit-detail-type" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={editWalletType} onChange={(e) => setEditWalletType(e.target.value as WalletType)}>
                    <option value="exchange">Exchange</option>
                    <option value="mother">Mère</option>
                    <option value="simple">Simple</option>
                    <option value="buyer">Wallet acheteur</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-detail-notes">Notes (optionnel)</Label>
                  <textarea id="edit-detail-notes" className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notes sur ce rugger…" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Annuler</Button>
                  <Button type="submit" size="sm">Enregistrer</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <nav className="flex gap-1 border-b border-border">
        {([
          { key: 'tokens' as const, label: 'Tokens' },
          { key: 'buyers' as const, label: 'Wallets acheteurs' },
          { key: 'network' as const, label: 'Network Analysis' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === key
                ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'tokens' && (
        <RuggerTokensTab key={id} ruggerId={id} rugger={rugger} onRuggerChange={handleRuggerChange} />
      )}
      {activeTab === 'buyers' && (
        <RuggerBuyersTab ruggerId={id} onRuggerChange={handleRuggerChange} />
      )}
      {activeTab === 'network' && (
        <RuggerNetworkTab ruggerId={id} tokenCount={rugger.tokenCount ?? 0} />
      )}
    </div>
  );
}

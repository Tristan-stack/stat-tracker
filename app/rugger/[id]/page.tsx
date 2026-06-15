'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { WalletType } from '@/types/rugger';
import { STATUS_LABELS, STATUS_ORDER } from '@/types/rugger';
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeUserHttpUrl } from '@/lib/safe-browser-url';
import { openSafeUserHttpUrlInNewTab } from '@/lib/open-trusted-solana-external';
import { StatusBadge } from '@/features/ruggers/components/StatusBadge';
import { RuggerForm } from '@/features/ruggers/components/RuggerForm';
import { useRugger, useUpdateRugger, useDeleteRugger } from '@/features/ruggers/hooks/use-ruggers';
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

export default function RuggerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = typeof params.id === 'string' ? params.id : null;

  const { data: rugger, isLoading } = useRugger(id);
  const updateRugger = useUpdateRugger();
  const deleteRugger = useDeleteRugger();

  const [isEditing, setIsEditing] = useState(false);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<RuggerTab>('tokens');

  // Les onglets (tokens/buyers) modifient des données qui impactent le rugger
  // (tokenCount, gains) : on invalide la query pour rafraîchir le header.
  const handleRuggerChange = () => qc.invalidateQueries({ queryKey: ['ruggers'] });

  const handleAdvanceStatus = async () => {
    if (!id || !rugger) return;
    const i = STATUS_ORDER.indexOf(rugger.statusId);
    if (i >= STATUS_ORDER.length - 1) return;
    await updateRugger.mutateAsync({ id, statusId: STATUS_ORDER[i + 1] }).catch(() => {});
  };

  const handleRetrogradeStatus = async () => {
    if (!id || !rugger) return;
    const i = STATUS_ORDER.indexOf(rugger.statusId);
    if (i <= 0) return;
    await updateRugger.mutateAsync({ id, statusId: STATUS_ORDER[i - 1] }).catch(() => {});
  };

  const handleDeleteRugger = async () => {
    if (!id || !rugger) return;
    if (!window.confirm(`Supprimer le rugger "${rugger.name ?? rugger.walletAddress ?? rugger.id}" ? Les tokens associés seront aussi supprimés.`)) return;
    try {
      await deleteRugger.mutateAsync(id);
      router.push('/rugger');
    } catch {
      // erreur ignorée : on reste sur la page
    }
  };

  if (!id) {
    return (
      <div className="p-6 sm:p-8">
        <p className="text-muted-foreground">Rugger introuvable.</p>
      </div>
    );
  }

  if (isLoading && !rugger) {
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
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                  {rugger.name ?? (rugger.walletAddress ? `${rugger.walletAddress.slice(0, 10)}…` : `Rugger ${rugger.id.slice(0, 8)}`)}
                </h1>
                <div className="flex items-center gap-1.5">
                  <StatusBadge statusId={rugger.statusId} />
                  <span className="shrink-0 rounded border border-border bg-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-foreground">
                    {walletTypeLabel[rugger.walletType]}
                  </span>
                </div>
                <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
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
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Pencil className="size-4 mr-1" />Modifier
              </Button>
              <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleDeleteRugger}>
                <Trash2 className="size-4 mr-1" />Supprimer
              </Button>
            </div>
          </div>

          <div
            className={cn(
              'min-w-0 space-y-2 wrap-break-word overflow-x-hidden',
              !isHeaderExpanded && 'max-sm:max-h-28 max-sm:overflow-y-hidden',
              isHeaderExpanded && 'max-sm:max-h-[50vh] max-sm:overflow-y-auto'
            )}
          >
            {rugger.description ? (
              safeUserHttpUrl(rugger.description) ? (
                <button
                  type="button"
                  onClick={() => {
                    const text = rugger.description;
                    if (text) void openSafeUserHttpUrlInNewTab(text);
                  }}
                  className="block w-full break-all text-left text-sm text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  {rugger.description}
                </button>
              ) : (
                <p className="text-sm text-muted-foreground wrap-break-word">{rugger.description}</p>
              )
            ) : null}
            {(rugger.volumeMin != null || rugger.volumeMax != null) && (
              <p className="text-sm text-muted-foreground">
                Intervalle volume : {rugger.volumeMin ?? '—'} – {rugger.volumeMax ?? '—'}
              </p>
            )}
            {rugger.notes?.trim() ? (
              <p className="whitespace-pre-wrap wrap-break-word text-sm text-muted-foreground">{rugger.notes}</p>
            ) : null}
            {rugger.walletAddress ? (
              <p className="break-all font-mono text-sm text-muted-foreground">{rugger.walletAddress}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun wallet principal défini</p>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" className="self-start sm:hidden" onClick={() => setIsHeaderExpanded((v) => !v)}>
            {isHeaderExpanded ? 'Voir moins' : 'Voir plus'}
          </Button>
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
              <RuggerForm
                idPrefix="edit-detail"
                submitLabel="Enregistrer"
                pending={updateRugger.isPending}
                initial={rugger}
                onCancel={() => setIsEditing(false)}
                onSubmit={async (payload) => {
                  await updateRugger.mutateAsync({ id, ...payload });
                  setIsEditing(false);
                }}
              />
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

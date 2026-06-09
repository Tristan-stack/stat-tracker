'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Rugger, WalletType, StatusId } from '@/types/rugger';
import { STATUS_LABELS, STATUS_ORDER, STATUS_FILTER_BUTTON_STYLES } from '@/types/rugger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/features/ruggers/components/StatusBadge';
import { RuggerForm } from '@/features/ruggers/components/RuggerForm';
import {
  useRuggers,
  useCreateRugger,
  useUpdateRugger,
  useDeleteRugger,
} from '@/features/ruggers/hooks/use-ruggers';

const walletTypeLabel: Record<WalletType, string> = {
  exchange: 'Exchange',
  mother: 'Mère',
  simple: 'Simple',
  buyer: 'Wallet acheteur',
};

export default function RuggerPage() {
  const [ruggerStatusFilter, setRuggerStatusFilter] = useState<StatusId | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [editingRugger, setEditingRugger] = useState<Rugger | null>(null);

  const { data: ruggers = [] } = useRuggers({ status: ruggerStatusFilter, archived: showArchived });
  const createRugger = useCreateRugger();
  const updateRugger = useUpdateRugger();
  const deleteRugger = useDeleteRugger();

  const handleToggleArchive = async (rugger: Rugger, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await updateRugger.mutateAsync({ id: rugger.id, archived: !rugger.archived }).catch(() => {});
  };

  const handleDelete = async (rugger: Rugger, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Supprimer le rugger "${rugger.name ?? rugger.walletAddress ?? rugger.id}" ?`)) return;
    await deleteRugger.mutateAsync(rugger.id).catch(() => {});
  };

  return (
    <div className="min-w-0 overflow-x-hidden space-y-10 p-6 sm:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Ruggers</h1>
          <p className="text-muted-foreground">
            Gère tes wallets (ruggers). Clique sur un rugger pour voir ses tokens et sa rentabilité.
          </p>
        </div>
        <Link
          href="/rugger/telegram"
          className="inline-flex shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
        >
          Leaderboard Telegram PnL
        </Link>
      </header>

      <section>
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow sm:p-6">
          <h2 className="text-sm font-semibold">Ajouter un rugger</h2>
          <RuggerForm
            idPrefix="create"
            submitLabel="Ajouter le rugger"
            pending={createRugger.isPending}
            onSubmit={async (payload) => {
              await createRugger.mutateAsync(payload);
            }}
          />
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{showArchived ? 'Ruggers archivés' : 'Mes ruggers'}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {(['all', ...STATUS_ORDER] as const).map((s) => {
                const styles = STATUS_FILTER_BUTTON_STYLES[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRuggerStatusFilter(s)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      ruggerStatusFilter === s ? styles.selected : styles.unselected
                    )}
                  >
                    {s === 'all' ? 'Tous' : STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowArchived((prev) => !prev)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                showArchived
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              <Archive className="size-3.5" />
              Archivés
            </button>
          </div>
        </div>
        {ruggers.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center text-muted-foreground">
            {ruggerStatusFilter === 'all'
              ? 'Aucun rugger enregistré. Ajoute-en un avec le formulaire ci-dessus.'
              : `Aucun rugger avec le statut « ${STATUS_LABELS[ruggerStatusFilter]} ». Change le filtre ou ajoute-en un.`}
          </p>
        ) : (
          <ul className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ruggers.map((rugger) => (
              <li key={rugger.id} className="min-w-0 w-full">
                <Card className="h-full w-full min-w-0 overflow-hidden transition-colors hover:border-primary hover:bg-muted/50">
                  <Link
                    href={`/rugger/${rugger.id}`}
                    className="block min-w-0 w-full overflow-hidden no-underline [&_.rugger-desc]:no-underline [&_.rugger-desc]:text-muted-foreground [&_.rugger-desc]:cursor-default"
                  >
                    <CardHeader className="min-w-0 w-full overflow-hidden pb-2">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">
                          {rugger.name ?? (rugger.walletAddress ? rugger.walletAddress.slice(0, 10) : `Rugger ${rugger.id.slice(0, 8)}`)}
                        </span>
                        <div className="flex shrink-0 gap-1.5">
                          <StatusBadge statusId={rugger.statusId} />
                          <span
                            className={cn(
                              'rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
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
                      </div>
                      {rugger.description ? (
                        <p className="rugger-desc line-clamp-2 wrap-break-word text-xs text-muted-foreground">
                          {rugger.description}
                        </p>
                      ) : null}
                      {(rugger.walletType === 'exchange' || rugger.walletType === 'mother') &&
                        (rugger.volumeMin != null || rugger.volumeMax != null) && (
                          <p className="rugger-desc truncate text-xs text-muted-foreground">
                            Volume : {rugger.volumeMin ?? '—'} – {rugger.volumeMax ?? '—'}
                          </p>
                        )}
                      {rugger.walletAddress ? (
                        <p className="rugger-desc truncate break-all text-xs text-muted-foreground font-mono">
                          {rugger.walletAddress}
                        </p>
                      ) : (
                        <p className="rugger-desc truncate text-xs text-muted-foreground">Aucun wallet principal défini</p>
                      )}
                    </CardHeader>
                    <CardContent className="flex gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {rugger.tokenCount} token{rugger.tokenCount !== 1 ? 's' : ''}
                      </span>
                      <span
                        className={cn(
                          'font-medium',
                          rugger.avgMaxGainPercent >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {rugger.tokenCount === 0
                          ? '–'
                          : `${rugger.avgMaxGainPercent >= 0 ? '+' : ''}${rugger.avgMaxGainPercent.toFixed(1)} % max`}
                      </span>
                    </CardContent>
                  </Link>
                  <div className="flex justify-end gap-1 border-t px-4 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingRugger(rugger);
                      }}
                      aria-label="Modifier"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'size-8',
                        rugger.archived
                          ? 'text-amber-600 hover:text-amber-700'
                          : 'text-muted-foreground hover:text-amber-600'
                      )}
                      onClick={(e) => handleToggleArchive(rugger, e)}
                      aria-label={rugger.archived ? 'Désarchiver' : 'Archiver'}
                      title={rugger.archived ? 'Désarchiver' : 'Archiver'}
                    >
                      {rugger.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="min-h-[44px] min-w-[44px] text-destructive hover:text-destructive sm:size-8"
                      onClick={(e) => handleDelete(rugger, e)}
                      aria-label="Supprimer"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editingRugger && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-rugger-title"
        >
          <Card className="w-full max-w-md max-h-[90dvh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 id="edit-rugger-title" className="text-lg font-semibold">
                Modifier le rugger
              </h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingRugger(null)}>
                Fermer
              </Button>
            </CardHeader>
            <CardContent>
              <RuggerForm
                idPrefix="edit"
                submitLabel="Enregistrer"
                pending={updateRugger.isPending}
                initial={editingRugger}
                onCancel={() => setEditingRugger(null)}
                onSubmit={async (payload) => {
                  await updateRugger.mutateAsync({ id: editingRugger.id, ...payload });
                  setEditingRugger(null);
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

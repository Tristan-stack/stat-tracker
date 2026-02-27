'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Rugger, WalletType } from '@/types/rugger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { IconPencil, IconTrash } from '@tabler/icons-react';

export default function RuggerPage() {
  const [ruggers, setRuggers] = useState<Rugger[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletType, setWalletType] = useState<WalletType>('simple');
  const [volumeMin, setVolumeMin] = useState<string>('');
  const [volumeMax, setVolumeMax] = useState<string>('');
  const [startHour, setStartHour] = useState<string>('');
  const [endHour, setEndHour] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [editingRugger, setEditingRugger] = useState<Rugger | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editWalletAddress, setEditWalletAddress] = useState('');
  const [editWalletType, setEditWalletType] = useState<WalletType>('simple');
  const [editVolumeMin, setEditVolumeMin] = useState<string>('');
  const [editVolumeMax, setEditVolumeMax] = useState<string>('');
  const [editStartHour, setEditStartHour] = useState<string>('');
  const [editEndHour, setEditEndHour] = useState<string>('');
  const [editNotes, setEditNotes] = useState('');

  const loadRuggers = useCallback(async () => {
    const response = await fetch('/api/ruggers');
    if (!response.ok) return;
    const data = (await response.json()) as { ruggers: Rugger[] };
    setRuggers(data.ruggers);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadRuggers());
  }, [loadRuggers]);

  useEffect(() => {
    if (!editingRugger) return;
    queueMicrotask(() => {
      setEditName(editingRugger.name ?? '');
      setEditDescription(editingRugger.description ?? '');
      setEditWalletAddress(editingRugger.walletAddress);
      setEditWalletType(editingRugger.walletType);
      setEditVolumeMin(editingRugger.volumeMin != null ? String(editingRugger.volumeMin) : '');
      setEditVolumeMax(editingRugger.volumeMax != null ? String(editingRugger.volumeMax) : '');
      setEditStartHour(editingRugger.startHour != null ? String(editingRugger.startHour) : '');
      setEditEndHour(editingRugger.endHour != null ? String(editingRugger.endHour) : '');
      setEditNotes(editingRugger.notes ?? '');
    });
  }, [editingRugger]);

  const handleCreateRugger = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (walletAddress.trim() === '') return;
      const toNum = (s: string) =>
        s.trim() === '' ? null : (Number(s) !== Number(s) ? null : Number(s));
      const toHour = (s: string): number | null => {
        const n = toNum(s);
        return n != null && n >= 0 && n <= 23 ? n : null;
      };
      const payload: {
        name: string | null;
        description: string | null;
        walletAddress: string;
        walletType: WalletType;
        volumeMin?: number | null;
        volumeMax?: number | null;
        startHour?: number | null;
        endHour?: number | null;
        notes?: string | null;
      } = {
        name: name.trim() || null,
        description: description.trim() || null,
        walletAddress: walletAddress.trim(),
        walletType,
        startHour: toHour(startHour) ?? null,
        endHour: toHour(endHour) ?? null,
        notes: notes.trim() || null,
      };
      if (walletType === 'exchange' || walletType === 'mother') {
        payload.volumeMin = toNum(volumeMin) ?? null;
        payload.volumeMax = toNum(volumeMax) ?? null;
      }
      const response = await fetch('/api/ruggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) return;
      setName('');
      setDescription('');
      setWalletAddress('');
      setVolumeMin('');
      setVolumeMax('');
      setStartHour('');
      setEndHour('');
      setNotes('');
      await loadRuggers();
    },
    [loadRuggers, name, description, walletAddress, walletType, volumeMin, volumeMax, startHour, endHour, notes]
  );

  const handleUpdateRugger = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!editingRugger || editWalletAddress.trim() === '') return;
      const toNum = (s: string) =>
        s.trim() === '' ? null : (Number(s) !== Number(s) ? null : Number(s));
      const payload: {
        name: string | null;
        description: string | null;
        walletAddress: string;
        walletType: WalletType;
        volumeMin?: number | null;
        volumeMax?: number | null;
      } = {
        name: editName.trim() || null,
        description: editDescription.trim() || null,
        walletAddress: editWalletAddress.trim(),
        walletType: editWalletType,
      };
      if (editWalletType === 'exchange' || editWalletType === 'mother') {
        payload.volumeMin = toNum(editVolumeMin) ?? null;
        payload.volumeMax = toNum(editVolumeMax) ?? null;
      }
      const response = await fetch(`/api/ruggers/${editingRugger.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) return;
      setEditingRugger(null);
      await loadRuggers();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editStartHour, editEndHour, editNotes used in payload
    [
      editingRugger,
      editName,
      editDescription,
      editWalletAddress,
      editWalletType,
      editVolumeMin,
      editVolumeMax,
      editStartHour,
      editEndHour,
      editNotes,
      loadRuggers,
    ]
  );

  const handleDeleteRugger = useCallback(
    async (rugger: Rugger, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!window.confirm(`Supprimer le rugger "${rugger.name ?? rugger.walletAddress}" ?`)) return;
      const response = await fetch(`/api/ruggers/${rugger.id}`, { method: 'DELETE' });
      if (!response.ok) return;
      await loadRuggers();
    },
    [loadRuggers]
  );

  const walletTypeLabel: Record<WalletType, string> = {
    exchange: 'Exchange',
    mother: 'Mère',
    simple: 'Simple',
  };

  return (
    <div className="space-y-10 p-6 sm:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Ruggers</h1>
        <p className="text-muted-foreground">
          Gère tes wallets (ruggers). Clique sur un rugger pour voir ses tokens et sa rentabilité.
        </p>
      </header>

      <section>
        <form
          onSubmit={handleCreateRugger}
          className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow sm:p-6"
        >
          <h2 className="text-sm font-semibold">Ajouter un rugger</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rugger-name">Nom (optionnel, sinon 1, 2, 3…)</Label>
              <Input
                id="rugger-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. Rugger principal"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rugger-description">Description (optionnel)</Label>
              <Input
                id="rugger-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ex. Wallet principal CEX"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rugger-type">Type de wallet</Label>
              <select
                id="rugger-type"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={walletType}
                onChange={(e) => setWalletType(e.target.value as WalletType)}
              >
                <option value="exchange">Exchange</option>
                <option value="mother">Mère</option>
                <option value="simple">Simple</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rugger-wallet">Adresse du wallet</Label>
              <Input
                id="rugger-wallet"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                required
              />
            </div>
            {(walletType === 'exchange' || walletType === 'mother') && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Intervalle volume</Label>
                <div className="flex gap-2">
                  <Input
                    id="rugger-volume-min"
                    type="number"
                    step="any"
                    value={volumeMin}
                    onChange={(e) => setVolumeMin(e.target.value)}
                    placeholder="Premier"
                    className="max-w-28"
                  />
                  <Input
                    id="rugger-volume-max"
                    type="number"
                    step="any"
                    value={volumeMax}
                    onChange={(e) => setVolumeMax(e.target.value)}
                    placeholder="Deuxième"
                    className="max-w-28"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label>Intervalle horaire (optionnel)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Rug de</span>
                <Input
                  id="rugger-start-hour"
                  type="number"
                  min={0}
                  max={23}
                  value={startHour}
                  onChange={(e) => setStartHour(e.target.value)}
                  placeholder="9"
                  className="w-16"
                />
                <span className="text-xs text-muted-foreground">h à</span>
                <Input
                  id="rugger-end-hour"
                  type="number"
                  min={0}
                  max={23}
                  value={endHour}
                  onChange={(e) => setEndHour(e.target.value)}
                  placeholder="18"
                  className="w-16"
                />
                <span className="text-xs text-muted-foreground">h</span>
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="rugger-notes">Notes (optionnel)</Label>
              <textarea
                id="rugger-notes"
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes sur ce rugger…"
              />
            </div>
          </div>
          <div>
            <Button type="submit" size="sm">
              Ajouter le rugger
            </Button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Mes ruggers</h2>
        {ruggers.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center text-muted-foreground">
            Aucun rugger enregistré. Ajoute-en un avec le formulaire ci-dessus.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ruggers.map((rugger) => (
              <li key={rugger.id} className="min-w-0">
                <Card className="h-full min-w-0 overflow-hidden transition-colors hover:border-primary hover:bg-muted/50">
                  <Link
                    href={`/rugger/${rugger.id}`}
                    className="block min-w-0 overflow-hidden no-underline [&_.rugger-desc]:no-underline [&_.rugger-desc]:text-muted-foreground [&_.rugger-desc]:cursor-default"
                  >
                    <CardHeader className="min-w-0 overflow-hidden pb-2">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">
                          {rugger.name ?? rugger.walletAddress.slice(0, 10)}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
                            rugger.walletType === 'exchange' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                            rugger.walletType === 'mother' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                            rugger.walletType === 'simple' && 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200'
                          )}
                        >
                          {walletTypeLabel[rugger.walletType]}
                        </span>
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
                      <p className="rugger-desc truncate break-all text-xs text-muted-foreground font-mono">
                        {rugger.walletAddress}
                      </p>
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
                      <IconPencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="min-h-[44px] min-w-[44px] text-destructive hover:text-destructive sm:size-8"
                      onClick={(e) => handleDeleteRugger(rugger, e)}
                      aria-label="Supprimer"
                    >
                      <IconTrash className="size-4" />
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditingRugger(null)}
              >
                Fermer
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateRugger} className="flex flex-col gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-rugger-name">Nom (optionnel)</Label>
                  <Input
                    id="edit-rugger-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="ex. Rugger principal"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rugger-description">Description (optionnel)</Label>
                  <Input
                    id="edit-rugger-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="ex. Wallet principal CEX"
                  />
                </div>
                {(editWalletType === 'exchange' || editWalletType === 'mother') && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="edit-rugger-volume-min">Intervalle volume – Premier</Label>
                      <Input
                        id="edit-rugger-volume-min"
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        placeholder="ex. 1000"
                        value={editVolumeMin}
                        onChange={(e) => setEditVolumeMin(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-rugger-volume-max">Intervalle volume – Deuxième</Label>
                      <Input
                        id="edit-rugger-volume-max"
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        placeholder="ex. 50000"
                        value={editVolumeMax}
                        onChange={(e) => setEditVolumeMax(e.target.value)}
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="edit-rugger-wallet">Adresse du wallet</Label>
                  <Input
                    id="edit-rugger-wallet"
                    value={editWalletAddress}
                    onChange={(e) => setEditWalletAddress(e.target.value)}
                    placeholder="0x..."
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rugger-type">Type de wallet</Label>
                  <select
                    id="edit-rugger-type"
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
                      id="edit-rugger-start-hour"
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
                      id="edit-rugger-end-hour"
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
                  <Label htmlFor="edit-rugger-notes">Notes (optionnel)</Label>
                  <textarea
                    id="edit-rugger-notes"
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
                    onClick={() => setEditingRugger(null)}
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
    </div>
  );
}

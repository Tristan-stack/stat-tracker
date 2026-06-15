'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trimToNull, parseNumericInput, parseHourInput } from '@/features/ruggers/normalize';
import type { RuggerWritePayload } from '@/features/ruggers/hooks/use-ruggers';
import type { WalletType } from '@/types/rugger';

export interface RuggerFormInitial {
  name?: string | null;
  description?: string | null;
  walletAddress?: string | null;
  walletType?: WalletType;
  volumeMin?: number | null;
  volumeMax?: number | null;
  startHour?: number | null;
  endHour?: number | null;
  notes?: string | null;
}

interface RuggerFormProps {
  /** Valeurs initiales (édition) ; vide pour la création. */
  initial?: RuggerFormInitial;
  /** Préfixe d'id pour éviter les collisions entre formulaire création et modale d'édition. */
  idPrefix: string;
  submitLabel: string;
  pending?: boolean;
  onSubmit: (payload: RuggerWritePayload) => void | Promise<void>;
  onCancel?: () => void;
}

function str(value: number | null | undefined): string {
  return value != null ? String(value) : '';
}

/**
 * Formulaire rugger partagé (création + édition). Remplace les deux blocs de
 * markup quasi identiques de la page et envoie tous les champs (l'édition
 * historique oubliait startHour/endHour/notes).
 */
export function RuggerForm({ initial, idPrefix, submitLabel, pending, onSubmit, onCancel }: RuggerFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [walletAddress, setWalletAddress] = useState(initial?.walletAddress ?? '');
  const [walletType, setWalletType] = useState<WalletType>(initial?.walletType ?? 'simple');
  const [volumeMin, setVolumeMin] = useState(str(initial?.volumeMin));
  const [volumeMax, setVolumeMax] = useState(str(initial?.volumeMax));
  const [startHour, setStartHour] = useState(str(initial?.startHour));
  const [endHour, setEndHour] = useState(str(initial?.endHour));
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const showVolume = walletType === 'exchange' || walletType === 'mother';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload: RuggerWritePayload = {
      name: trimToNull(name),
      description: trimToNull(description),
      walletAddress: trimToNull(walletAddress),
      walletType,
      startHour: parseHourInput(startHour),
      endHour: parseHourInput(endHour),
      notes: trimToNull(notes),
    };
    if (showVolume) {
      payload.volumeMin = parseNumericInput(volumeMin);
      payload.volumeMax = parseNumericInput(volumeMax);
    }
    try {
      await onSubmit(payload);
      // Reset uniquement en création réussie ; en édition la modale se ferme côté parent.
      if (!initial) {
        setName('');
        setDescription('');
        setWalletAddress('');
        setVolumeMin('');
        setVolumeMax('');
        setStartHour('');
        setEndHour('');
        setNotes('');
      }
    } catch {
      // Erreur réseau/validation : on conserve les champs saisis.
    }
  };

  const id = (suffix: string) => `${idPrefix}-rugger-${suffix}`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={id('name')}>Nom (optionnel, sinon 1, 2, 3…)</Label>
          <Input id={id('name')} value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Rugger principal" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id('description')}>Description (optionnel)</Label>
          <Input id={id('description')} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex. Wallet principal CEX" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id('type')}>Type de wallet</Label>
          <select
            id={id('type')}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={walletType}
            onChange={(e) => setWalletType(e.target.value as WalletType)}
          >
            <option value="exchange">Exchange</option>
            <option value="mother">Mère</option>
            <option value="simple">Simple</option>
            <option value="buyer">Wallet acheteur</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={id('wallet')}>Adresse du wallet (optionnel)</Label>
          <Input id={id('wallet')} value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="0x..." />
          {walletType === 'buyer' && (
            <p className="text-xs text-muted-foreground">
              Adresse Solana du wallet acheteur pour afficher le montant du 1er achat par token.
            </p>
          )}
        </div>
        {showVolume && (
          <div className="space-y-2 sm:col-span-2">
            <Label>Intervalle volume</Label>
            <div className="flex gap-2">
              <Input id={id('volume-min')} type="number" step="any" value={volumeMin} onChange={(e) => setVolumeMin(e.target.value)} placeholder="Premier" className="max-w-28" />
              <Input id={id('volume-max')} type="number" step="any" value={volumeMax} onChange={(e) => setVolumeMax(e.target.value)} placeholder="Deuxième" className="max-w-28" />
            </div>
          </div>
        )}
        <div className="space-y-2 sm:col-span-2">
          <Label>Intervalle horaire (optionnel)</Label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Rug de</span>
            <Input id={id('start-hour')} type="number" min={0} max={23} value={startHour} onChange={(e) => setStartHour(e.target.value)} placeholder="9" className="w-16" />
            <span className="text-xs text-muted-foreground">h à</span>
            <Input id={id('end-hour')} type="number" min={0} max={23} value={endHour} onChange={(e) => setEndHour(e.target.value)} placeholder="18" className="w-16" />
            <span className="text-xs text-muted-foreground">h</span>
          </div>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={id('notes')}>Notes (optionnel)</Label>
          <textarea
            id={id('notes')}
            className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes sur ce rugger…"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Annuler
          </Button>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

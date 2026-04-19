'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { Token } from '@/types/token';
import type { Rugger, WalletType } from '@/types/rugger';

interface CreateRuggerFromTokensProps {
  tokens: Token[];
}

export function CreateRuggerFromTokens({ tokens }: CreateRuggerFromTokensProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletType, setWalletType] = useState<WalletType>('simple');
  const [volumeMin, setVolumeMin] = useState('');
  const [volumeMax, setVolumeMax] = useState('');
  const [startHour, setStartHour] = useState('');
  const [endHour, setEndHour] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setWalletAddress('');
    setWalletType('simple');
    setVolumeMin('');
    setVolumeMax('');
    setStartHour('');
    setEndHour('');
    setNotes('');
    setError('');
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      setError('');

      try {
        const toNum = (s: string) =>
          s.trim() === '' ? null : (Number.isFinite(Number(s)) ? Number(s) : null);
        const payload: {
          name: string | null;
          description: string | null;
          walletAddress: string | null;
          walletType: WalletType;
          volumeMin?: number | null;
          volumeMax?: number | null;
        } = {
          name: name.trim() || null,
          description: description.trim() || null,
          walletAddress: walletAddress.trim() || null,
          walletType,
        };
        if (walletType === 'exchange' || walletType === 'mother') {
          payload.volumeMin = toNum(volumeMin) ?? null;
          payload.volumeMax = toNum(volumeMax) ?? null;
        }
        const ruggerRes = await fetch('/api/ruggers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!ruggerRes.ok) {
          const data = (await ruggerRes.json()) as { error?: string };
          setError(data.error ?? 'Erreur lors de la création du rugger');
          return;
        }

        const rugger = (await ruggerRes.json()) as Rugger;

        const tokensRes = await fetch(`/api/ruggers/${rugger.id}/tokens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens }),
        });

        if (!tokensRes.ok) {
          setError('Rugger créé mais erreur lors de l\'ajout des tokens');
          return;
        }

        resetForm();
        setIsOpen(false);
        router.push(`/rugger/${rugger.id}`);
      } catch {
        setError('Erreur réseau');
      } finally {
        setIsSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startHour, endHour, notes used in payload
    [name, description, walletAddress, walletType, volumeMin, volumeMax, startHour, endHour, notes, tokens, resetForm, router]
  );

  if (tokens.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
      >
        Créer un rugger ({tokens.length} token{tokens.length !== 1 ? 's' : ''})
      </Button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-rugger-title"
        >
          <Card className="w-full max-w-md max-h-[90dvh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 id="create-rugger-title" className="text-lg font-semibold">
                Créer un rugger avec {tokens.length} token{tokens.length !== 1 ? 's' : ''}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsOpen(false);
                  resetForm();
                }}
                disabled={isSubmitting}
              >
                Fermer
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-rugger-name">Nom (optionnel)</Label>
                  <Input
                    id="create-rugger-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ex. Rugger principal"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-rugger-desc">Description (optionnel)</Label>
                  <Input
                    id="create-rugger-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="ex. Wallet principal CEX"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-rugger-type">Type de wallet</Label>
                  <select
                    id="create-rugger-type"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={walletType}
                    onChange={(e) => setWalletType(e.target.value as WalletType)}
                    disabled={isSubmitting}
                  >
                    <option value="exchange">Exchange</option>
                    <option value="mother">Mère</option>
                    <option value="simple">Simple</option>
                    <option value="buyer">Wallet acheteur</option>
                  </select>
                </div>
                {(walletType === 'exchange' || walletType === 'mother') && (
                  <div className="space-y-2">
                    <Label>Intervalle volume</Label>
                    <div className="flex gap-2">
                      <Input
                        id="create-rugger-volume-min"
                        type="number"
                        step="any"
                        value={volumeMin}
                        onChange={(e) => setVolumeMin(e.target.value)}
                        placeholder="Premier"
                        className="max-w-28"
                        disabled={isSubmitting}
                      />
                      <Input
                        id="create-rugger-volume-max"
                        type="number"
                        step="any"
                        value={volumeMax}
                        onChange={(e) => setVolumeMax(e.target.value)}
                        placeholder="Deuxième"
                        className="max-w-28"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Intervalle horaire (optionnel)</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Rug de</span>
                    <Input
                      id="create-rugger-start-hour"
                      type="number"
                      min={0}
                      max={23}
                      value={startHour}
                      onChange={(e) => setStartHour(e.target.value)}
                      placeholder="9"
                      className="w-16"
                      disabled={isSubmitting}
                    />
                    <span className="text-xs text-muted-foreground">h à</span>
                    <Input
                      id="create-rugger-end-hour"
                      type="number"
                      min={0}
                      max={23}
                      value={endHour}
                      onChange={(e) => setEndHour(e.target.value)}
                      placeholder="18"
                      className="w-16"
                      disabled={isSubmitting}
                    />
                    <span className="text-xs text-muted-foreground">h</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-rugger-notes">Notes (optionnel)</Label>
                  <textarea
                    id="create-rugger-notes"
                    className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes sur ce rugger…"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-rugger-wallet">Adresse du wallet (optionnel)</Label>
                  <Input
                    id="create-rugger-wallet"
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    placeholder="0x..."
                    disabled={isSubmitting}
                  />
                  {walletType === 'buyer' && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Adresse Solana du wallet acheteur pour le montant du 1er achat par token.
                    </p>
                  )}
                </div>

                {error !== '' && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsOpen(false);
                      resetForm();
                    }}
                    disabled={isSubmitting}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" size="sm" disabled={isSubmitting}>
                    {isSubmitting ? 'Création…' : 'Créer le rugger'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

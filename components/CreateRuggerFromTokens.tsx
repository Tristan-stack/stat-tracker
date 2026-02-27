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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setWalletAddress('');
    setWalletType('simple');
    setError('');
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (walletAddress.trim() === '') return;
      setIsSubmitting(true);
      setError('');

      try {
        const ruggerRes = await fetch('/api/ruggers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim() || null,
            description: description.trim() || null,
            walletAddress: walletAddress.trim(),
            walletType,
          }),
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
    [name, description, walletAddress, walletType, tokens, resetForm, router]
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
          <Card className="w-full max-w-md">
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
                  <Label htmlFor="create-rugger-wallet">Adresse du wallet</Label>
                  <Input
                    id="create-rugger-wallet"
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    placeholder="0x..."
                    required
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
                  </select>
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

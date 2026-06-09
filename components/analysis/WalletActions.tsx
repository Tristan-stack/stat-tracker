'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Eye, Link2, MoreVertical, Wallet } from 'lucide-react';
import { apiPost } from '@/lib/api-client';
import { useCreateRugger, useRuggersList } from '@/features/ruggers/hooks/use-ruggers';
import { useAddWatchlist } from '@/features/watchlist/hooks/use-watchlist';

interface WalletActionsProps {
  walletAddress: string;
  sourceRuggerId?: string;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Erreur réseau';
}

export default function WalletActions({ walletAddress, sourceRuggerId }: WalletActionsProps) {
  const router = useRouter();
  const { data: ruggers = [] } = useRuggersList();
  const createRugger = useCreateRugger();
  const addWatchlist = useAddWatchlist();
  const attachBuyer = useMutation({
    mutationFn: (ruggerId: string) =>
      apiPost(`/api/ruggers/${ruggerId}/buyers`, { walletAddress, origin: 'analysis' }),
  });

  const [showWatchlistForm, setShowWatchlistForm] = useState(false);
  const [watchlistLabel, setWatchlistLabel] = useState('');
  const [watchlistNotes, setWatchlistNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showRuggerPicker, setShowRuggerPicker] = useState(false);
  const [selectedRuggerId, setSelectedRuggerId] = useState(sourceRuggerId ?? '');

  const isSubmitting = addWatchlist.isPending || attachBuyer.isPending;

  const handleAddAsRugger = useCallback(async () => {
    setFeedback(null);
    try {
      const rugger = await createRugger.mutateAsync({ walletAddress, walletType: 'simple' });
      router.push(`/rugger/${rugger.id}`);
    } catch (e) {
      setFeedback(errorMessage(e));
    }
  }, [walletAddress, router, createRugger]);

  const handleAddToWatchlist = useCallback(async () => {
    setFeedback(null);
    try {
      await addWatchlist.mutateAsync({
        walletAddress,
        label: watchlistLabel.trim() || undefined,
        notes: watchlistNotes.trim() || undefined,
        sourceRuggerId: sourceRuggerId || undefined,
      });
      setFeedback('Ajouté à la watchlist');
      setShowWatchlistForm(false);
      setWatchlistLabel('');
      setWatchlistNotes('');
    } catch (e) {
      setFeedback(errorMessage(e));
    }
  }, [walletAddress, watchlistLabel, watchlistNotes, sourceRuggerId, addWatchlist]);

  const openRuggerPicker = useCallback(() => {
    setFeedback(null);
    setSelectedRuggerId(sourceRuggerId ?? ruggers[0]?.id ?? '');
    setShowRuggerPicker(true);
  }, [sourceRuggerId, ruggers]);

  const handleAddToExistingRugger = useCallback(async () => {
    if (selectedRuggerId.trim() === '') return;
    setFeedback(null);
    try {
      await attachBuyer.mutateAsync(selectedRuggerId);
      setFeedback('Ajouté au rugger');
      setShowRuggerPicker(false);
    } catch (e) {
      setFeedback(errorMessage(e));
    }
  }, [selectedRuggerId, attachBuyer]);

  return (
    <div className="inline-flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="rounded p-1 hover:bg-muted" onClick={(e) => e.stopPropagation()} aria-label="Actions">
            <MoreVertical className="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => void handleAddAsRugger()} className="gap-2">
            <Wallet className="size-4" />Ajouter comme rugger
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void openRuggerPicker()} className="gap-2">
            <Link2 className="size-4" />Ajouter à un rugger
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowWatchlistForm(true)} className="gap-2">
            <Eye className="size-4" />Ajouter à la watchlist
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {feedback && !showWatchlistForm && (
        <span className="text-[10px] text-muted-foreground">{feedback}</span>
      )}

      {showWatchlistForm && (
        <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-lg border bg-background p-3 shadow-lg space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input value={watchlistLabel} onChange={(e) => setWatchlistLabel(e.target.value)} placeholder="ex. Whale suspecte" className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input value={watchlistNotes} onChange={(e) => setWatchlistNotes(e.target.value)} placeholder="Notes…" className="h-7 text-xs" />
          </div>
          {feedback && <p className="text-[10px] text-destructive">{feedback}</p>}
          <div className="flex gap-1.5">
            <Button type="button" size="sm" className="h-7 text-xs" disabled={isSubmitting} onClick={handleAddToWatchlist}>
              {isSubmitting ? '…' : 'Ajouter'}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowWatchlistForm(false); setFeedback(null); }}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {showRuggerPicker && (
        <div className="absolute right-0 top-full z-10 mt-1 w-72 rounded-lg border bg-background p-3 shadow-lg space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-1">
            <Label className="text-xs">Rugger cible</Label>
            <select
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={selectedRuggerId}
              onChange={(e) => setSelectedRuggerId(e.target.value)}
            >
              <option value="">Choisir un rugger…</option>
              {ruggers.map((rugger) => (
                <option key={rugger.id} value={rugger.id}>
                  {rugger.name ?? rugger.walletAddress ?? `Rugger ${rugger.id.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
          {feedback && <p className="text-[10px] text-destructive">{feedback}</p>}
          <div className="flex gap-1.5">
            <Button type="button" size="sm" className="h-7 text-xs" disabled={isSubmitting || selectedRuggerId.trim() === ''} onClick={() => void handleAddToExistingRugger()}>
              {isSubmitting ? '…' : 'Ajouter'}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowRuggerPicker(false); setFeedback(null); }}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

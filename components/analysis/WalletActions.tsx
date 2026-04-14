'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconDotsVertical, IconWallet, IconEye } from '@tabler/icons-react';

interface WalletActionsProps {
  walletAddress: string;
  sourceRuggerId?: string;
}

export default function WalletActions({ walletAddress, sourceRuggerId }: WalletActionsProps) {
  const router = useRouter();
  const [showWatchlistForm, setShowWatchlistForm] = useState(false);
  const [watchlistLabel, setWatchlistLabel] = useState('');
  const [watchlistNotes, setWatchlistNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleAddAsRugger = useCallback(async () => {
    setFeedback(null);
    try {
      const res = await fetch('/api/ruggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, walletType: 'simple' }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setFeedback(data.error ?? 'Erreur');
        return;
      }
      const data = (await res.json()) as { id: string };
      router.push(`/rugger/${data.id}`);
    } catch { setFeedback('Erreur réseau'); }
  }, [walletAddress, router]);

  const handleAddToWatchlist = useCallback(async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          label: watchlistLabel.trim() || undefined,
          notes: watchlistNotes.trim() || undefined,
          sourceRuggerId: sourceRuggerId || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setFeedback(data.error ?? 'Erreur');
        return;
      }
      setFeedback('Ajouté à la watchlist');
      setShowWatchlistForm(false);
      setWatchlistLabel('');
      setWatchlistNotes('');
    } catch { setFeedback('Erreur réseau'); }
    finally { setIsSubmitting(false); }
  }, [walletAddress, watchlistLabel, watchlistNotes, sourceRuggerId]);

  return (
    <div className="inline-flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="rounded p-1 hover:bg-muted" onClick={(e) => e.stopPropagation()} aria-label="Actions">
            <IconDotsVertical className="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => void handleAddAsRugger()} className="gap-2">
            <IconWallet className="size-4" />Ajouter comme rugger
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowWatchlistForm(true)} className="gap-2">
            <IconEye className="size-4" />Ajouter à la watchlist
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
    </div>
  );
}

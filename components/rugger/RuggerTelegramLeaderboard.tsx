'use client';

import { useCallback, useState } from 'react';
import { Star } from 'lucide-react';
import type { TelegramLeaderboardRow } from '@/types/telegram';
import { formatMintShort } from '@/lib/token-display';
import { cn } from '@/lib/utils';

export type TelegramLeaderSortBy = 'profitSol' | 'profitPct' | 'invested' | 'sold' | 'posts' | 'fetchedAt';

interface RuggerTelegramLeaderboardProps {
  rows: TelegramLeaderboardRow[];
  sortBy: TelegramLeaderSortBy;
  dir: 'asc' | 'desc';
  onSortChange: (key: TelegramLeaderSortBy) => void;
  favoriteMintSet?: ReadonlySet<string>;
  onToggleFavorite?: (row: TelegramLeaderboardRow) => void | Promise<void>;
}

function fmtSol(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} SOL`;
}

function fmtPct(s: string | null): string {
  if (s == null) return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function fmtFetchedAt(iso: string | null): string {
  if (iso == null || iso === '') return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function HeaderCell({
  label,
  active,
  dir,
  align = 'left',
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  align?: 'left' | 'right';
  onClick: () => void;
}) {
  return (
    <th className={cn('px-2 py-2 text-xs font-medium text-muted-foreground', align === 'right' ? 'text-right' : 'text-left')}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 underline-offset-2 hover:underline',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
        onClick={onClick}
      >
        {label}
        {active ? (dir === 'desc' ? '↓' : '↑') : null}
      </button>
    </th>
  );
}

export default function RuggerTelegramLeaderboard({
  rows,
  sortBy,
  dir,
  onSortChange,
  favoriteMintSet = new Set(),
  onToggleFavorite,
}: RuggerTelegramLeaderboardProps) {
  const showFavs = typeof onToggleFavorite === 'function';
  const [copiedMint, setCopiedMint] = useState<string | null>(null);

  const handleCopyMint = useCallback(async (mint: string) => {
    await navigator.clipboard.writeText(mint);
    setCopiedMint(mint);
    setTimeout(() => setCopiedMint((prev) => (prev === mint ? null : prev)), 1500);
  }, []);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune donnée pour cette plage (lance un scrape ou élargis les dates).</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className={cn('w-full text-sm', showFavs ? 'min-w-[848px]' : 'min-w-[800px]')}>
        <thead className="border-b bg-muted/40">
          <tr>
            {showFavs ? (
              <th scope="col" className="w-10 shrink-0 px-1 py-2 text-center text-xs font-medium text-muted-foreground">
                ★
              </th>
            ) : null}
            <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
            <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Token</th>
            <HeaderCell
              label="Scrapé le"
              active={sortBy === 'fetchedAt'}
              dir={dir}
              align="left"
              onClick={() => onSortChange('fetchedAt')}
            />
            <HeaderCell label="Investi" active={sortBy === 'invested'} dir={dir} align="right" onClick={() => onSortChange('invested')} />
            <HeaderCell label="Vendu" active={sortBy === 'sold'} dir={dir} align="right" onClick={() => onSortChange('sold')} />
            <HeaderCell label="Profit" active={sortBy === 'profitSol'} dir={dir} align="right" onClick={() => onSortChange('profitSol')} />
            <HeaderCell label="PnL %" active={sortBy === 'profitPct'} dir={dir} align="right" onClick={() => onSortChange('profitPct')} />
            <HeaderCell label="Posts" active={sortBy === 'posts'} dir={dir} align="right" onClick={() => onSortChange('posts')} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.token_mint} className="border-b last:border-0">
              {showFavs ? (
                <td className="px-1 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => onToggleFavorite?.(row)}
                    className={cn(
                      'inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                      favoriteMintSet.has(row.token_mint) && 'text-amber-500 hover:text-amber-600'
                    )}
                    aria-label={favoriteMintSet.has(row.token_mint) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                    aria-pressed={favoriteMintSet.has(row.token_mint)}
                  >
                    <Star
                      className={cn(
                        'size-4 shrink-0',
                        favoriteMintSet.has(row.token_mint) ? 'fill-amber-500 text-amber-500' : 'fill-transparent'
                      )}
                    />
                  </button>
                </td>
              ) : null}
              <td className="px-2 py-2 text-muted-foreground">{index + 1}</td>
              <td className="min-w-[200px] px-2 py-2 font-mono text-[13px]">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-foreground" title={row.token_name ?? undefined}>
                    {row.token_name?.trim() || '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyMint(row.token_mint)}
                    className={cn(
                      'shrink-0 cursor-pointer border-0 bg-transparent p-0 text-left font-mono text-[13px] text-muted-foreground',
                      copiedMint === row.token_mint && 'text-primary'
                    )}
                    title={`${row.token_mint} — cliquer pour copier le mint`}
                  >
                    {copiedMint === row.token_mint ? '✓ Copié' : formatMintShort(row.token_mint)}
                  </button>
                </div>
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-muted-foreground tabular-nums" title={row.fetched_at ?? undefined}>
                {fmtFetchedAt(row.fetched_at)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtSol(row.invested)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtSol(row.sold)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtSol(row.profit)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtPct(row.avg_profit_pct)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{row.posts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

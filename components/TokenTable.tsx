'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TokenWithMetrics } from '@/types/token';
import { STATUS_DOT_CLASSES } from '@/types/rugger';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatNum(value: number, decimals = 2): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNum(value, 2)} %`;
}

export interface TokenTableProps {
  tokens: TokenWithMetrics[];
  onRemove: (id: string) => void;
  onChangeTarget: (id: string, nextPercent: number) => void;
}

export function TokenTable({ tokens, onRemove, onChangeTarget }: TokenTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyName = useCallback(async (token: TokenWithMetrics) => {
    await navigator.clipboard.writeText(token.name);
    setCopiedId(token.id);
    setTimeout(() => setCopiedId((prev) => (prev === token.id ? null : prev)), 1500);
  }, []);

  return (
    <div className="overflow-x-auto rounded-xl border -mx-1 sm:mx-0">
      <table className="w-full min-w-[640px] text-xs sm:text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-3 text-left font-medium sm:px-5 sm:py-4">Nom</th>
            <th className="px-5 py-4 text-right font-medium">Entrée</th>
            <th className="px-5 py-4 text-right font-medium">Plus haut</th>
            <th className="px-5 py-4 text-right font-medium">Plus bas</th>
            <th className="px-5 py-4 text-right font-medium">Objectif %</th>
            <th className="px-5 py-4 text-right font-medium">Gain actuel</th>
            <th className="px-5 py-4 text-right font-medium">Gain max</th>
            <th className="px-5 py-4 text-right font-medium">Perte max</th>
            <th className="px-5 py-4 text-center font-medium">Objectif atteint</th>
            <th className="w-14 px-3 py-4" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="max-w-[100px] px-3 py-3 font-medium sm:max-w-none sm:px-5 sm:py-4" title={t.name}>
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      t.statusId ? STATUS_DOT_CLASSES[t.statusId] : 'bg-muted-foreground/40'
                    )}
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyName(t)}
                    className="truncate cursor-pointer hover:text-primary transition-colors"
                    title="Cliquer pour copier"
                  >
                    {copiedId === t.id ? '✓ Copié' : t.name}
                  </button>
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-5 sm:py-4">{formatNum(t.entryPrice)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-5 sm:py-4">{formatNum(t.high)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-5 sm:py-4">{formatNum(t.low)}</td>
              <td className="px-5 py-4 text-right tabular-nums">
                <div className="flex items-center justify-end gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="h-8 w-20 rounded-md border border-input bg-background px-2 text-right text-xs tabular-nums"
                    value={t.targetExitPercent.toString()}
                    onChange={(e) => {
                      const normalized = e.target.value.replace(',', '.');
                      const n = Number(normalized);
                      if (!Number.isFinite(n) || n < 0) return;
                      onChangeTarget(t.id, n);
                    }}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-green-600 dark:text-green-400 sm:px-5 sm:py-4">{formatPercent(t.targetExitPercent)}</td>
              <td
                className={`whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-5 sm:py-4 ${
                  t.maxGainPercent >= 0 ? 'text-green-600 dark:text-green-400' : ''
                }`}
              >
                {formatPercent(t.maxGainPercent)}
              </td>
              <td
                className={`whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-5 sm:py-4 ${
                  t.maxLossPercent <= 0 ? 'text-red-600 dark:text-red-400' : ''
                }`}
              >
                {formatPercent(t.maxLossPercent)}
              </td>
              <td className="px-3 py-3 text-center sm:px-5 sm:py-4">{t.targetReached ? 'Oui' : 'Non'}</td>
              <td className="px-2 py-3 sm:px-3 sm:py-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Supprimer"
                  onClick={() => onRemove(t.id)}
                  className="min-h-[44px] min-w-[44px] border border-red-500 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

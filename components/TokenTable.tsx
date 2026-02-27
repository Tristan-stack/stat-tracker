'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TokenWithMetrics } from '@/types/token';
import { Trash2 } from 'lucide-react';

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
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-5 py-4 text-left font-medium">Nom</th>
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
              <td className="px-5 py-4 font-medium">{t.name}</td>
              <td className="px-5 py-4 text-right tabular-nums">{formatNum(t.entryPrice)}</td>
              <td className="px-5 py-4 text-right tabular-nums">{formatNum(t.high)}</td>
              <td className="px-5 py-4 text-right tabular-nums">{formatNum(t.low)}</td>
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
              <td className="px-5 py-4 text-right tabular-nums text-green-600 dark:text-green-400">
                {formatPercent(t.targetExitPercent)}
              </td>
              <td
                className={`px-5 py-4 text-right tabular-nums ${
                  t.maxGainPercent >= 0 ? 'text-green-600 dark:text-green-400' : ''
                }`}
              >
                {formatPercent(t.maxGainPercent)}
              </td>
              <td
                className={`px-5 py-4 text-right tabular-nums ${
                  t.maxLossPercent <= 0 ? 'text-red-600 dark:text-red-400' : ''
                }`}
              >
                {formatPercent(t.maxLossPercent)}
              </td>
              <td className="px-5 py-4 text-center">{t.targetReached ? 'Oui' : 'Non'}</td>
              <td className="px-3 py-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Supprimer"
                  onClick={() => onRemove(t.id)}
                  className="border border-red-500 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-500"
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

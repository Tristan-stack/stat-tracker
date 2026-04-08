'use client';

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { TokenWithMetrics } from '@/types/token';
import { getTokenDisplayLabel } from '@/lib/token-display';
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

export interface TokenCardProps {
  token: TokenWithMetrics;
  onRemove: (id: string) => void;
}

export function TokenCard({ token, onRemove }: TokenCardProps) {
  const metrics = token;
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">{getTokenDisplayLabel(token)}</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Supprimer"
          onClick={() => onRemove(token.id)}
          className="border border-red-500 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span className="text-muted-foreground">Entrée</span>
          <span>{formatNum(metrics.entryPrice)}</span>
          <span className="text-muted-foreground">Plus haut</span>
          <span>{formatNum(metrics.high)}</span>
          <span className="text-muted-foreground">Plus bas</span>
          <span>{formatNum(metrics.low)}</span>
          <span className="text-muted-foreground">Objectif %</span>
          <span>{formatNum(metrics.targetExitPercent)} %</span>
          <span className="text-muted-foreground">Prix sortie cible</span>
          <span>{formatNum(metrics.targetExitPrice)}</span>
          <span className="text-muted-foreground">Gain actuel (objectif)</span>
          <span className="text-green-600 dark:text-green-400">
            {formatPercent(metrics.targetExitPercent)}
          </span>
          <span className="text-muted-foreground">Gain max (potentiel)</span>
          <span className={metrics.maxGainPercent >= 0 ? 'text-green-600 dark:text-green-400' : ''}>
            {formatPercent(metrics.maxGainPercent)}
          </span>
          <span className="text-muted-foreground">Perte max</span>
          <span className={metrics.maxLossPercent <= 0 ? 'text-red-600 dark:text-red-400' : ''}>
            {formatPercent(metrics.maxLossPercent)}
          </span>
          <span className="text-muted-foreground">Objectif atteint</span>
          <span>{metrics.targetReached ? 'Oui' : 'Non'}</span>
        </div>
      </CardContent>
      <CardFooter className="border-t pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onRemove(token.id)}
          className="w-full border-red-500 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-500 sm:w-auto"
        >
          Supprimer
        </Button>
      </CardFooter>
    </Card>
  );
}

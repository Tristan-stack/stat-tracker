'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TokenWithMetrics, ExitMode } from '@/types/token';
import { STATUS_DOT_CLASSES } from '@/types/rugger';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
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

function percentToMcap(entryPrice: number, targetPercent: number): number {
  return entryPrice * (1 + targetPercent / 100);
}

function mcapToPercent(entryPrice: number, targetMcap: number): number {
  return ((targetMcap / entryPrice) - 1) * 100;
}

function InlineNumericInput({
  value,
  onChange,
  suffix,
  min,
  className: inputClassName,
}: {
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  min?: number;
  className?: string;
}) {
  const [localValue, setLocalValue] = useState(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const commit = () => {
    const normalized = localValue.trim().replace(',', '.');
    const n = Number(normalized);
    const floor = min ?? 0;
    if (Number.isFinite(n) && n >= floor && n !== value) {
      onChange(n);
    } else {
      setLocalValue(String(value));
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Input
        type="text"
        inputMode="decimal"
        className={cn(
          'h-8 rounded-md border border-input bg-background px-2 text-right text-xs tabular-nums',
          inputClassName ?? 'w-20'
        )}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function McapTargetInput({
  entryPrice,
  targetPercent,
  onChangeTarget,
}: {
  entryPrice: number;
  targetPercent: number;
  onChangeTarget: (nextPercent: number) => void;
}) {
  const derivedMcap = percentToMcap(entryPrice, targetPercent);
  const [localValue, setLocalValue] = useState(String(Math.round(derivedMcap)));

  useEffect(() => {
    setLocalValue(String(Math.round(percentToMcap(entryPrice, targetPercent))));
  }, [entryPrice, targetPercent]);

  const commit = () => {
    const normalized = localValue.trim().replace(',', '.');
    const n = Number(normalized);
    if (Number.isFinite(n) && n > 0 && entryPrice > 0) {
      const newPercent = mcapToPercent(entryPrice, n);
      const rounded = Math.round(newPercent * 100) / 100;
      if (rounded !== targetPercent) {
        onChangeTarget(rounded);
        return;
      }
    }
    setLocalValue(String(Math.round(derivedMcap)));
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      className="h-8 w-24 rounded-md border border-input bg-background px-2 text-right text-xs tabular-nums"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
    />
  );
}

export interface TokenTableProps {
  tokens: TokenWithMetrics[];
  onRemove: (id: string) => void;
  onChangeTarget: (id: string, nextPercent: number) => void;
  onChangeEntryPrice: (id: string, nextPrice: number) => void;
  /** Si absent, la colonne visibilité n’est pas affichée (ex. page rugger). */
  onToggleHidden?: (id: string) => void;
}

export function TokenTable({
  tokens,
  onRemove,
  onChangeTarget,
  onChangeEntryPrice,
  onToggleHidden,
}: TokenTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exitMode, setExitMode] = useState<ExitMode>('percent');

  const handleCopyName = useCallback(async (token: TokenWithMetrics) => {
    await navigator.clipboard.writeText(token.name);
    setCopiedId(token.id);
    setTimeout(() => setCopiedId((prev) => (prev === token.id ? null : prev)), 1500);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Objectif de sortie :</span>
        <div className="flex rounded-md border text-xs">
          <button
            type="button"
            onClick={() => setExitMode('percent')}
            className={cn(
              'px-3 py-1 rounded-l-md transition-colors font-medium',
              exitMode === 'percent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            % de gain
          </button>
          <button
            type="button"
            onClick={() => setExitMode('mcap')}
            className={cn(
              'px-3 py-1 rounded-r-md transition-colors font-medium',
              exitMode === 'mcap' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            MCap cible
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border -mx-1 sm:mx-0">
        <table className="w-full min-w-[680px] text-xs sm:text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {onToggleHidden && (
                <th className="w-10 px-1 py-3 text-center font-medium sm:w-11 sm:px-2 sm:py-4">
                  <span className="sr-only">Visibilité stats</span>
                </th>
              )}
              <th className="px-3 py-3 text-left font-medium sm:px-5 sm:py-4">Nom</th>
              <th className="px-5 py-4 text-right font-medium">Entrée</th>
              <th className="px-5 py-4 text-right font-medium">Plus haut</th>
              <th className="px-5 py-4 text-right font-medium">Plus bas</th>
              <th className="px-5 py-4 text-right font-medium">
                {exitMode === 'percent' ? 'Objectif %' : 'Objectif MCap'}
              </th>
              <th className="px-5 py-4 text-right font-medium">Gain actuel</th>
              <th className="px-5 py-4 text-right font-medium">Gain max</th>
              <th className="px-5 py-4 text-right font-medium">Perte max</th>
              <th className="px-5 py-4 text-center font-medium">Objectif atteint</th>
              <th className="min-w-[100px] px-3 py-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr
                key={t.id}
                className={cn(
                  'border-b last:border-0 hover:bg-muted/30',
                  t.hidden && 'opacity-60 text-muted-foreground'
                )}
              >
                {onToggleHidden && (
                  <td className="w-10 px-1 py-3 text-center align-middle sm:w-11 sm:px-2 sm:py-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-foreground hover:bg-muted"
                      aria-pressed={!t.hidden}
                      aria-label={
                        t.hidden
                          ? 'Inclure ce token dans les statistiques'
                          : 'Exclure ce token des statistiques'
                      }
                      title={
                        t.hidden
                          ? 'Inclure dans les statistiques'
                          : 'Exclure des statistiques'
                      }
                      onClick={() => onToggleHidden(t.id)}
                    >
                      {t.hidden ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </td>
                )}
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
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-5 sm:py-4">
                  <InlineNumericInput
                    value={t.entryPrice}
                    onChange={(n) => onChangeEntryPrice(t.id, n)}
                    min={0}
                    className="w-24"
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-5 sm:py-4">{formatNum(t.high)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums sm:px-5 sm:py-4">{formatNum(t.low)}</td>
                <td className="px-5 py-4 text-right tabular-nums">
                  {exitMode === 'percent' ? (
                    <InlineNumericInput
                      value={t.targetExitPercent}
                      onChange={(n) => onChangeTarget(t.id, n)}
                      suffix="%"
                    />
                  ) : (
                    <McapTargetInput
                      entryPrice={t.entryPrice}
                      targetPercent={t.targetExitPercent}
                      onChangeTarget={(n) => onChangeTarget(t.id, n)}
                    />
                  )}
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
    </div>
  );
}

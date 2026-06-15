'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import type { GmgnPreviewRow } from '@/features/ruggers/types';

type EditableField = 'entryStr' | 'highStr' | 'lowStr';

interface GmgnPreviewListProps {
  rows: GmgnPreviewRow[];
  dedupeNotice: string | null;
  addAllLabel: string;
  onAddAll: () => void;
  onAddOne: (row: GmgnPreviewRow) => void;
  onRemove: (rowKey: string) => void;
  onUpdateField: (rowKey: string, field: EditableField, value: string) => void;
}

export function GmgnPreviewList({
  rows,
  dedupeNotice,
  addAllLabel,
  onAddAll,
  onAddOne,
  onRemove,
  onUpdateField,
}: GmgnPreviewListProps) {
  return (
    <div className="space-y-3">
      {dedupeNotice && <p className="text-xs text-muted-foreground">{dedupeNotice}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {rows.length} nouveau{rows.length !== 1 ? 'x' : ''} achat{rows.length !== 1 ? 's' : ''} à ajouter
        </p>
        <Button type="button" size="sm" onClick={onAddAll}>
          {addAllLabel}
        </Button>
      </div>
      <ul className="max-h-96 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3 text-sm">
        {rows.map((p) => (
          <li
            key={p.rowKey}
            className={cn('flex flex-col gap-3 rounded-md border bg-background/80 px-3 py-2', p.truncatedKlines && 'border-2 border-foreground')}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{p.tokenAddress}</div>
                {p.sourceWallet && (
                  <div className="truncate font-mono text-[10px] text-muted-foreground/90">Wallet : {p.sourceWallet}</div>
                )}
                <div className="text-xs text-muted-foreground">
                  {new Date(p.purchasedAt).toLocaleString('fr-FR')}
                  {p.truncatedKlines && ' · kline non chargé (limite)'}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onRemove(p.rowKey)}
                  aria-label="Retirer de la liste"
                >
                  <Trash2 className="size-4" />
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => onAddOne(p)}>
                  Ajouter
                </Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Entrée</Label>
                <Input className="font-mono text-xs" inputMode="decimal" value={p.entryStr} onChange={(e) => onUpdateField(p.rowKey, 'entryStr', e.target.value)} placeholder="ex. 6.41" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">High</Label>
                <Input className="font-mono text-xs" inputMode="decimal" value={p.highStr} onChange={(e) => onUpdateField(p.rowKey, 'highStr', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Low</Label>
                <Input className="font-mono text-xs" inputMode="decimal" value={p.lowStr} onChange={(e) => onUpdateField(p.rowKey, 'lowStr', e.target.value)} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

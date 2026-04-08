'use client';

import { useCallback, useRef } from 'react';
import { IconDotsVertical } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Token } from '@/types/token';
import { cn } from '@/lib/utils';

export interface TokenImportExportProps {
  tokens: Token[];
  onImport: (tokens: Token[]) => void;
  /** Bloc sous la carte (page d’accueil) ou menu ⋮ en haut à droite (rugger). */
  variant?: 'block' | 'menu';
  /** Bloc plus compact et largeur limitée (variant `block` uniquement). */
  compact?: boolean;
}

export function TokenImportExport({
  tokens,
  onImport,
  variant = 'block',
  compact = false,
}: TokenImportExportProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = useCallback(() => {
    if (tokens.length === 0) return;
    const blob = new Blob([JSON.stringify(tokens, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const now = new Date()
      .toISOString()
      .replace(/[:]/g, '-')
      .replace(/\.\d{3}Z$/, '');
    link.href = url;
    link.download = `tokens-${now}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [tokens]);

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result)) as unknown;
          if (!Array.isArray(parsed)) return;
          const cleaned: Token[] = parsed
            .filter((item): item is Token => {
              if (typeof item !== 'object' || item === null) return false;
              const candidate = item as Token;
              return (
                typeof candidate.id === 'string' &&
                typeof candidate.name === 'string' &&
                typeof candidate.entryPrice === 'number' &&
                typeof candidate.high === 'number' &&
                typeof candidate.low === 'number' &&
                typeof candidate.targetExitPercent === 'number'
              );
            })
            .map((token) => ({
              ...token,
              id: token.id || crypto.randomUUID(),
            }));
          if (cleaned.length === 0) return;
          onImport(cleaned);
        } catch {
          // ignore invalid files
        } finally {
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      };
      reader.readAsText(file);
    },
    [onImport]
  );

  const triggerImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="application/json"
      className="hidden"
      onChange={handleFileChange}
    />
  );

  if (variant === 'menu') {
    return (
      <div className="shrink-0">
        {hiddenInput}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 text-muted-foreground hover:text-foreground"
              aria-label="Importer ou exporter les tokens (JSON)"
            >
              <IconDotsVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Import / export JSON
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setTimeout(() => triggerImport(), 0);
              }}
            >
              Importer des tokens…
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={tokens.length === 0}
              onSelect={(e) => {
                e.preventDefault();
                handleExport();
              }}
            >
              Exporter les tokens
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <section
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-card',
        compact
          ? 'w-full max-w-md p-3 sm:flex-row sm:items-center sm:justify-between'
          : 'gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5'
      )}
    >
      {hiddenInput}
      <div className="min-w-0">
        <h2 className={cn('font-semibold', compact ? 'text-xs' : 'text-sm')}>Import / export des tokens</h2>
        <p className={cn('text-muted-foreground', compact ? 'text-[11px] leading-snug' : 'text-xs')}>
          Sauvegarde ou recharge ta liste de tokens au format JSON.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={tokens.length === 0}>
          Exporter les tokens
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={triggerImport}>
          Importer des tokens
        </Button>
      </div>
    </section>
  );
}

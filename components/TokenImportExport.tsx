'use client';

import { useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { Token } from '@/types/token';

export interface TokenImportExportProps {
  tokens: Token[];
  onImport: (tokens: Token[]) => void;
}

export function TokenImportExport({ tokens, onImport }: TokenImportExportProps) {
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

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div>
        <h2 className="text-sm font-semibold">Import / export des tokens</h2>
        <p className="text-xs text-muted-foreground">
          Sauvegarde ou recharge ta liste de tokens au format JSON.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={tokens.length === 0}>
          Exporter les tokens
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button type="button" variant="outline" size="sm" onClick={triggerImport}>
          Importer des tokens
        </Button>
      </div>
    </section>
  );
}


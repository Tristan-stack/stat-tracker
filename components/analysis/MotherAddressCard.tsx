'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AnalysisMotherAddress } from '@/types/analysis';
import { IconCheck, IconX, IconExternalLink } from '@tabler/icons-react';

interface MotherAddressCardProps {
  ruggerId: string;
  analysisId: string;
}

function truncateAddress(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export default function MotherAddressCard({ ruggerId, analysisId }: MotherAddressCardProps) {
  const [mothers, setMothers] = useState<AnalysisMotherAddress[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMothers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/ruggers/${ruggerId}/analysis/${analysisId}/mothers`);
      if (!res.ok) return;
      const data = (await res.json()) as { mothers: AnalysisMotherAddress[] };
      setMothers(data.mothers);
    } finally { setIsLoading(false); }
  }, [ruggerId, analysisId]);

  useEffect(() => { void fetchMothers(); }, [fetchMothers]);

  const handleValidate = useCallback(async (motherId: string, validated: boolean) => {
    const res = await fetch(`/api/ruggers/${ruggerId}/analysis/${analysisId}/mothers/${motherId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ validated }),
    });
    if (!res.ok) return;
    const updated = (await res.json()) as AnalysisMotherAddress;
    setMothers((prev) => prev.map((m) => m.id === motherId ? { ...m, validated: updated.validated, validatedAt: updated.validatedAt } : m));
  }, [ruggerId, analysisId]);

  if (isLoading) return <p className="text-xs text-muted-foreground">Chargement des adresses mères…</p>;
  if (mothers.length === 0) return <p className="text-xs text-muted-foreground">Aucune adresse mère détectée.</p>;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Adresses mères ({mothers.length})</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {mothers.map((m) => (
          <div key={m.id} className={cn(
            'rounded-lg border p-3 space-y-2',
            m.validated ? 'border-green-500/40 bg-green-500/5' : 'border-border'
          )}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-mono text-xs truncate">{truncateAddress(m.address)}</span>
                <a href={`https://solscan.io/account/${m.address}`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary hover:text-primary/80">
                  <IconExternalLink className="size-3.5" />
                </a>
              </div>
              {m.validated && (
                <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  Validée
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {m.walletsFunded} wallet{m.walletsFunded !== 1 ? 's' : ''} financé{m.walletsFunded !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-1.5">
              {!m.validated && (
                <Button type="button" variant="outline" size="sm" className="gap-1 text-green-600 hover:text-green-600" onClick={() => void handleValidate(m.id, true)}>
                  <IconCheck className="size-3.5" />Valider
                </Button>
              )}
              {m.validated && (
                <Button type="button" variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={() => void handleValidate(m.id, false)}>
                  <IconX className="size-3.5" />Invalider
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

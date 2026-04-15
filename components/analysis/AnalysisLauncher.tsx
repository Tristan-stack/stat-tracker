'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { AnalysisMode } from '@/types/analysis';
import { IconSearch, IconLink, IconLayersIntersect } from '@tabler/icons-react';

const WALLET_RECOVERY_MIN = 0;
const WALLET_RECOVERY_MAX = 120;
const WALLET_RECOVERY_DEFAULT = 15;

interface AnalysisLauncherProps {
  tokenCount: number;
  onLaunch: (opts: {
    mode: AnalysisMode;
    fundingDepth: number;
    walletCentricRecoveryLimit: number;
  }) => void;
  isDisabled?: boolean;
}

const MODE_OPTIONS: { key: AnalysisMode; label: string; description: string; icon: typeof IconSearch }[] = [
  { key: 'token', label: 'Tokens', description: 'Corrélation par tokens achetés', icon: IconSearch },
  { key: 'funding', label: 'Funding', description: 'Corrélation par adresse mère', icon: IconLink },
  { key: 'combined', label: 'Combiné', description: 'Tokens + funding, wallets en commun mis en avant', icon: IconLayersIntersect },
];

const DEPTH_OPTIONS = [1, 2, 3, 4, 5] as const;

export default function AnalysisLauncher({ tokenCount, onLaunch, isDisabled }: AnalysisLauncherProps) {
  const [mode, setMode] = useState<AnalysisMode>('combined');
  const [fundingDepth, setFundingDepth] = useState(5);
  const [walletCentricRecoveryLimit, setWalletCentricRecoveryLimit] = useState(WALLET_RECOVERY_DEFAULT);

  const needsTokens = mode === 'token' || mode === 'combined';
  const showDepth = mode === 'funding' || mode === 'combined';
  const canLaunch = !isDisabled && (!needsTokens || tokenCount > 0);

  const handleLaunch = () => {
    if (!canLaunch) return;
    const clamped = needsTokens
      ? Math.max(
          WALLET_RECOVERY_MIN,
          Math.min(
            WALLET_RECOVERY_MAX,
            Math.floor(Number(walletCentricRecoveryLimit) || WALLET_RECOVERY_DEFAULT)
          )
        )
      : WALLET_RECOVERY_DEFAULT;
    onLaunch({ mode, fundingDepth, walletCentricRecoveryLimit: clamped });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Mode d&apos;analyse</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODE_OPTIONS.map(({ key, label, description, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                mode === key
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn('size-4', mode === key ? 'text-primary' : 'text-muted-foreground')} />
                <span className={cn('text-sm font-medium', mode === key ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{description}</span>
            </button>
          ))}
        </div>
      </div>

      {showDepth && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Profondeur de funding chain</Label>
          <div className="flex items-center gap-2">
            {DEPTH_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setFundingDepth(d)}
                className={cn(
                  'flex size-9 items-center justify-center rounded-md border text-sm font-medium transition-colors',
                  fundingDepth === d
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                {d}
              </button>
            ))}
            <span className="text-xs text-muted-foreground ml-2">niveaux max</span>
          </div>
        </div>
      )}

      {needsTokens && tokenCount === 0 && (
        <p className="text-sm text-destructive">
          Aucun token enregistré sur ce rugger. Ajoute des tokens dans l&apos;onglet &quot;Tokens&quot; avant de lancer une analyse.
        </p>
      )}

      {needsTokens && tokenCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {tokenCount} token{tokenCount !== 1 ? 's' : ''} enregistré{tokenCount !== 1 ? 's' : ''} seront analysés.
        </p>
      )}

      {needsTokens && (
        <div className="space-y-2">
          <Label htmlFor="wallet-recovery-limit" className="text-sm font-medium">
            Recovery wallet-centric (GMGN)
          </Label>
          <p className="text-xs text-muted-foreground">
            Nombre de wallets candidats retenus par meilleure couverture (0 = désactivé). Max {WALLET_RECOVERY_MAX}.
          </p>
          <Input
            id="wallet-recovery-limit"
            type="number"
            min={WALLET_RECOVERY_MIN}
            max={WALLET_RECOVERY_MAX}
            step={1}
            value={walletCentricRecoveryLimit}
            onChange={(e) => setWalletCentricRecoveryLimit(Number(e.target.value))}
            className="max-w-[120px]"
            disabled={!canLaunch}
          />
        </div>
      )}

      <Button type="button" onClick={handleLaunch} disabled={!canLaunch} className="gap-2">
        <IconSearch className="size-4" />
        Lancer l&apos;analyse
      </Button>
    </div>
  );
}

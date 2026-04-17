'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { AnalysisMode } from '@/types/analysis';
import type { LucideIcon } from 'lucide-react';
import { Layers, Link2, Search, Target } from 'lucide-react';

const WALLET_RECOVERY_MIN = 0;
const WALLET_RECOVERY_MAX = 120;
const WALLET_RECOVERY_DEFAULT = 15;
const MCAP_INPUT_MULTIPLIER = 1000;
const MCAP_MIGRATION_WARNING_THRESHOLD = 1000;

interface AnalysisLauncherProps {
  tokenCount: number;
  onLaunch: (opts: {
    mode: AnalysisMode;
    fundingDepth: number;
    walletCentricRecoveryLimit: number;
    excludeInactiveOver24h: boolean;
    mcapMin?: number;
    mcapMax?: number;
  }) => void;
  isDisabled?: boolean;
}

const MODE_OPTIONS: { key: AnalysisMode; label: string; description: string; icon: LucideIcon }[] = [
  { key: 'token', label: 'Tokens', description: 'Corrélation par tokens achetés', icon: Search },
  { key: 'token_hunting', label: 'Token Hunting', description: 'Corrélation wallets depuis les tokens du rugger (sans wallet de référence)', icon: Target },
  { key: 'funding', label: 'Funding', description: 'Corrélation par adresse mère', icon: Link2 },
  { key: 'combined', label: 'Combiné', description: 'Tokens + funding, wallets en commun mis en avant', icon: Layers },
];

const DEPTH_OPTIONS = [1, 2, 3, 4, 5] as const;

export default function AnalysisLauncher({ tokenCount, onLaunch, isDisabled }: AnalysisLauncherProps) {
  const [mode, setMode] = useState<AnalysisMode>('combined');
  const [fundingDepth, setFundingDepth] = useState(5);
  const [walletCentricRecoveryLimit, setWalletCentricRecoveryLimit] = useState(WALLET_RECOVERY_DEFAULT);
  const [excludeInactiveOver24h, setExcludeInactiveOver24h] = useState(false);
  const [mcapMinInput, setMcapMinInput] = useState('');
  const [mcapMaxInput, setMcapMaxInput] = useState('');
  const [launchError, setLaunchError] = useState<string | null>(null);

  const needsTokens = mode === 'token' || mode === 'combined' || mode === 'token_hunting';
  const showDepth = mode === 'funding' || mode === 'combined';
  const canLaunch = !isDisabled && (!needsTokens || tokenCount > 0);
  const parsedMcapMinInput = mcapMinInput.trim() === '' ? null : Number(mcapMinInput);
  const parsedMcapMaxInput = mcapMaxInput.trim() === '' ? null : Number(mcapMaxInput);
  const showMcapMigrationWarning =
    (parsedMcapMinInput !== null &&
      Number.isFinite(parsedMcapMinInput) &&
      parsedMcapMinInput >= MCAP_MIGRATION_WARNING_THRESHOLD) ||
    (parsedMcapMaxInput !== null &&
      Number.isFinite(parsedMcapMaxInput) &&
      parsedMcapMaxInput >= MCAP_MIGRATION_WARNING_THRESHOLD);

  const handleLaunch = () => {
    if (!canLaunch) return;
    setLaunchError(null);
    const clamped = needsTokens
      ? Math.max(
          WALLET_RECOVERY_MIN,
          Math.min(
            WALLET_RECOVERY_MAX,
            Math.floor(Number(walletCentricRecoveryLimit) || WALLET_RECOVERY_DEFAULT)
          )
        )
      : WALLET_RECOVERY_DEFAULT;
    const mcapMinXk = parsedMcapMinInput === null ? undefined : parsedMcapMinInput;
    const mcapMaxXk = parsedMcapMaxInput === null ? undefined : parsedMcapMaxInput;
    const mcapMin = mcapMinXk === undefined ? undefined : mcapMinXk * MCAP_INPUT_MULTIPLIER;
    const mcapMax = mcapMaxXk === undefined ? undefined : mcapMaxXk * MCAP_INPUT_MULTIPLIER;
    if (mcapMin !== undefined && (!Number.isFinite(mcapMin) || mcapMin < 0)) {
      setLaunchError('MCAP min doit etre un nombre positif.');
      return;
    }
    if (mcapMax !== undefined && (!Number.isFinite(mcapMax) || mcapMax < 0)) {
      setLaunchError('MCAP max doit etre un nombre positif.');
      return;
    }
    if (mcapMin !== undefined && mcapMax !== undefined && mcapMin > mcapMax) {
      setLaunchError('MCAP min doit etre inferieur ou egal a MCAP max.');
      return;
    }
    onLaunch({
      mode,
      fundingDepth,
      walletCentricRecoveryLimit: clamped,
      excludeInactiveOver24h,
      mcapMin,
      mcapMax,
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Mode d&apos;analyse</Label>
        <div className="grid gap-2 sm:grid-cols-4">
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

      {needsTokens && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Filtre MCAP (buyers token)</Label>
          <p className="text-xs text-muted-foreground">
            Unité xK: 15 = 15k (15000). Nouvelle unité: les anciennes valeurs brutes doivent être adaptées.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="mcap-min" className="text-xs text-muted-foreground">MCAP min (xK)</Label>
              <Input
                id="mcap-min"
                type="number"
                min={0}
                step={1}
                value={mcapMinInput}
                onChange={(e) => setMcapMinInput(e.target.value)}
                placeholder="ex: 15"
                disabled={!canLaunch}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mcap-max" className="text-xs text-muted-foreground">MCAP max (xK)</Label>
              <Input
                id="mcap-max"
                type="number"
                min={0}
                step={1}
                value={mcapMaxInput}
                onChange={(e) => setMcapMaxInput(e.target.value)}
                placeholder="ex: 300"
                disabled={!canLaunch}
              />
            </div>
          </div>
          {showMcapMigrationWarning && (
            <p className="text-xs text-amber-600">
              Attention: tu as saisi une grande valeur. En mode xK, 15000 signifie 15 000 000.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-medium">Filtres pré-analyse</Label>
        <label
          htmlFor="exclude-inactive-24h"
          className={cn(
            'flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer',
            excludeInactiveOver24h
              ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
              : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
          )}
        >
          <input
            id="exclude-inactive-24h"
            type="checkbox"
            checked={excludeInactiveOver24h}
            onChange={(e) => setExcludeInactiveOver24h(e.target.checked)}
            className="mt-0.5 size-4 rounded border-border accent-primary"
            disabled={!canLaunch}
          />
          <div className="flex-1 space-y-0.5">
            <span className="block text-sm font-medium">
              Exclure les wallets inactifs depuis plus de 24h
            </span>
            <span className="block text-xs text-muted-foreground">
              Filtre les acheteurs via Helius avant l&apos;analyse profonde. Gain de temps et d&apos;appels API sur les wallets morts.
            </span>
          </div>
        </label>
      </div>

      <Button type="button" onClick={handleLaunch} disabled={!canLaunch} className="gap-2">
        <Search className="size-4" />
        Lancer l&apos;analyse
      </Button>
      {launchError && <p className="text-xs text-destructive">{launchError}</p>}
    </div>
  );
}

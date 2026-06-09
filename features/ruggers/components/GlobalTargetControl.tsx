'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ExitMode } from '@/types/token';

interface GlobalTargetControlProps {
  exitMode: ExitMode;
  onExitModeChange: (m: ExitMode) => void;
  percent: string;
  onPercentChange: (v: string) => void;
  mcap: string;
  onMcapChange: (v: string) => void;
  isApplying: boolean;
  onApply: () => void;
}

function num(v: string): number {
  return Number(v.replace(',', '.'));
}

export function GlobalTargetControl(props: GlobalTargetControlProps) {
  const disabled =
    props.isApplying ||
    (props.exitMode === 'percent'
      ? !Number.isFinite(num(props.percent))
      : !Number.isFinite(num(props.mcap)) || num(props.mcap) <= 0);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
      <Label className="text-sm font-medium">Objectif commun</Label>
      <div className="flex rounded-md border text-xs">
        <button
          type="button"
          onClick={() => props.onExitModeChange('percent')}
          className={cn('px-2 py-0.5 rounded-l-md transition-colors font-medium', props.exitMode === 'percent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
        >
          %
        </button>
        <button
          type="button"
          onClick={() => props.onExitModeChange('mcap')}
          className={cn('px-2 py-0.5 rounded-r-md transition-colors font-medium', props.exitMode === 'mcap' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
        >
          MCap
        </button>
      </div>
      {props.exitMode === 'percent' ? (
        <Input type="text" inputMode="decimal" className="w-24" value={props.percent} onChange={(e) => props.onPercentChange(e.target.value)} placeholder="100" />
      ) : (
        <Input type="text" inputMode="decimal" className="w-32" value={props.mcap} onChange={(e) => props.onMcapChange(e.target.value)} placeholder="500000" />
      )}
      <Button type="button" size="sm" disabled={disabled} onClick={props.onApply}>
        {props.isApplying ? 'Application…' : 'Appliquer à tous'}
      </Button>
      <span className="text-xs text-muted-foreground">
        {props.exitMode === 'percent'
          ? 'Applique le même % de sortie à tous les tokens.'
          : "Calcule le % de sortie pour chaque token en fonction de son point d'entrée."}
      </span>
    </div>
  );
}

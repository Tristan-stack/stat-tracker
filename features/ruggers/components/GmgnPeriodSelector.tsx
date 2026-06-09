'use client';

import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';
import { parseYyyyMmDd, formatYyyyMmDd } from '@/lib/format';

export type GmgnFetchPeriod = 'today' | 'yesterday' | 'all' | 'custom';

const PERIOD_LABELS: Record<GmgnFetchPeriod, string> = {
  today: "Aujourd'hui",
  yesterday: 'Hier',
  all: 'Tous',
  custom: 'Personnalisé',
};

interface GmgnPeriodSelectorProps {
  period: GmgnFetchPeriod;
  onPeriodChange: (p: GmgnFetchPeriod) => void;
  from: string;
  onFromChange: (v: string) => void;
  to: string;
  onToChange: (v: string) => void;
}

export function GmgnPeriodSelector(props: GmgnPeriodSelectorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="text-sm font-medium text-foreground">Période du fetch</span>
        <div className="flex flex-wrap items-center gap-2">
          {(['today', 'yesterday', 'all', 'custom'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => props.onPeriodChange(p)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                props.period === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      {props.period === 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Du</Label>
            <DatePicker value={parseYyyyMmDd(props.from)} onChange={(d) => props.onFromChange(formatYyyyMmDd(d))} placeholder="Date de début" className="w-[200px]" />
          </div>
          <div className="space-y-2">
            <Label>Au</Label>
            <DatePicker value={parseYyyyMmDd(props.to)} onChange={(d) => props.onToChange(formatYyyyMmDd(d))} placeholder="Date de fin" className="w-[200px]" />
          </div>
        </div>
      )}
    </div>
  );
}

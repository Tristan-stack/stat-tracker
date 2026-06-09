'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseYyyyMmDd, formatYyyyMmDd } from '@/lib/format';
import { STATUS_LABELS, STATUS_ORDER, STATUS_FILTER_BUTTON_STYLES, type StatusId } from '@/types/rugger';
import { getPurchaseFilterLabel, type TokenPurchaseFilter } from '@/lib/token-date-filter';

interface TokenFilterBarProps {
  status: StatusId | 'all';
  onStatusChange: (s: StatusId | 'all') => void;
  purchaseFilter: TokenPurchaseFilter;
  onPurchaseFilterChange: (p: TokenPurchaseFilter) => void;
  entryMcapMin: string;
  onEntryMcapMinChange: (v: string) => void;
  entryMcapMax: string;
  onEntryMcapMaxChange: (v: string) => void;
  customFrom: string;
  onCustomFromChange: (v: string) => void;
  customTo: string;
  onCustomToChange: (v: string) => void;
  pickDay: string;
  onPickDayChange: (v: string) => void;
  showReset: boolean;
  onReset: () => void;
}

const PURCHASE_FILTERS: TokenPurchaseFilter[] = ['all', 'today', 'yesterday', 'day', 'custom'];

export function TokenFilterBar(props: TokenFilterBarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(['all', ...STATUS_ORDER] as const).map((s) => {
            const styles = STATUS_FILTER_BUTTON_STYLES[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => props.onStatusChange(s)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  props.status === s ? styles.selected : styles.unselected
                )}
              >
                {s === 'all' ? 'Tous' : STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
        {props.showReset && (
          <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={props.onReset}>
            <Trash2 className="size-4 mr-1" />Reset les tokens
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Date d&apos;achat :</span>
        {PURCHASE_FILTERS.map((period) => (
          <button
            key={period}
            type="button"
            onClick={() => {
              props.onPurchaseFilterChange(period);
              if (period === 'day' && props.pickDay === '') props.onPickDayChange(formatYyyyMmDd(new Date()));
            }}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              props.purchaseFilter === period ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {getPurchaseFilterLabel(period)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label>MCAP d&apos;entrée min</Label>
          <Input type="text" inputMode="decimal" className="w-[200px]" value={props.entryMcapMin} onChange={(e) => props.onEntryMcapMinChange(e.target.value)} placeholder="100000" />
        </div>
        <div className="space-y-2">
          <Label>MCAP d&apos;entrée max</Label>
          <Input type="text" inputMode="decimal" className="w-[200px]" value={props.entryMcapMax} onChange={(e) => props.onEntryMcapMaxChange(e.target.value)} placeholder="500000" />
        </div>
      </div>

      {props.purchaseFilter === 'day' && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Jour</Label>
            <DatePicker value={parseYyyyMmDd(props.pickDay)} onChange={(date) => props.onPickDayChange(formatYyyyMmDd(date))} placeholder="Choisir un jour" className="w-[200px]" />
          </div>
        </div>
      )}
      {props.purchaseFilter === 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Du</Label>
            <DatePicker value={parseYyyyMmDd(props.customFrom)} onChange={(date) => props.onCustomFromChange(formatYyyyMmDd(date))} placeholder="Date de début" className="w-[200px]" />
          </div>
          <div className="space-y-2">
            <Label>Au</Label>
            <DatePicker value={parseYyyyMmDd(props.customTo)} onChange={(date) => props.onCustomToChange(formatYyyyMmDd(date))} placeholder="Date de fin" className="w-[200px]" />
          </div>
        </div>
      )}
    </div>
  );
}

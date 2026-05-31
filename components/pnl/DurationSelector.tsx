'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { PnlRangePreset } from '@/types/pnl';

const PRESETS: { value: Exclude<PnlRangePreset, 'custom'>; label: string }[] = [
  { value: '1d', label: '1 jour' },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
];

interface DurationSelectorProps {
  preset: PnlRangePreset;
  onPresetChange: (preset: PnlRangePreset) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
}

export default function DurationSelector({
  preset,
  onPresetChange,
  dateRange,
  onDateRangeChange,
}: DurationSelectorProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const calendarLabel = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      return `${format(dateRange.from, 'd MMM yyyy', { locale: fr })} — ${format(dateRange.to, 'd MMM yyyy', { locale: fr })}`;
    }
    return 'Choisir une plage';
  }, [dateRange]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.value}
            type="button"
            size="sm"
            variant={preset === p.value ? 'default' : 'outline'}
            onClick={() => {
              onPresetChange(p.value);
              onDateRangeChange(undefined);
            }}
          >
            {p.label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={preset === 'custom' ? 'default' : 'outline'}
          onClick={() => onPresetChange('custom')}
        >
          Personnalisé
        </Button>
      </div>
      {preset === 'custom' && (
        <div className="space-y-1">
          <Label>Plage (calendrier)</Label>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  'min-w-[240px] justify-start text-left font-normal',
                  !dateRange?.from && 'text-muted-foreground'
                )}
              >
                <CalendarDays className="mr-2 size-4" />
                {calendarLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={(r) => {
                  onDateRangeChange(r);
                  if (r?.from && r?.to) setCalendarOpen(false);
                }}
                numberOfMonths={2}
                locale={fr}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}

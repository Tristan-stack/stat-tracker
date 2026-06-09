import { cn } from '@/lib/utils';
import { STATUS_LABELS, STATUS_BADGE_STYLES, type StatusId } from '@/types/rugger';

export function StatusBadge({ statusId }: { statusId: StatusId }) {
  return (
    <span
      className={cn(
        'rounded px-2 py-0.5 text-[11px] font-medium tracking-wide',
        STATUS_BADGE_STYLES[statusId]
      )}
    >
      {STATUS_LABELS[statusId]}
    </span>
  );
}

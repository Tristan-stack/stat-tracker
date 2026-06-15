'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

interface CrossRuggerBadgeProps {
  ruggerNames: string[];
  ruggerIds: string[];
  className?: string;
}

export default function CrossRuggerBadge({ ruggerNames, ruggerIds, className }: CrossRuggerBadgeProps) {
  if (ruggerNames.length === 0) return null;

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground', className)}>
      <span>Aussi dans :</span>
      {ruggerNames.map((name, i) => (
        <span key={ruggerIds[i]}>
          {i > 0 && <span>, </span>}
          <Link href={`/rugger/${ruggerIds[i]}`} className="underline underline-offset-2 hover:text-foreground">
            {name}
          </Link>
        </span>
      ))}
    </span>
  );
}

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
    <span className={cn('inline-flex flex-wrap items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300', className)}>
      <span>Aussi dans :</span>
      {ruggerNames.map((name, i) => (
        <span key={ruggerIds[i]}>
          {i > 0 && <span>, </span>}
          <Link href={`/rugger/${ruggerIds[i]}`} className="underline hover:text-amber-900 dark:hover:text-amber-200">
            {name}
          </Link>
        </span>
      ))}
    </span>
  );
}

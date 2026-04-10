import { describe, it, expect } from 'vitest';
import { inferActivityHoursFromTokens } from '@/lib/infer-activity-hours';

/** ISO cohérent avec `getHours()` dans le fuseau de la machine de test. */
function purchasedAtLocal(y: number, m: number, d: number, hour: number): string {
  return new Date(y, m - 1, d, hour, 1, 0, 0).toISOString();
}

function localHourFrom(iso: string): number {
  return new Date(iso).getHours();
}

describe('inferActivityHoursFromTokens', () => {
  it('returns no_tokens when empty', () => {
    expect(inferActivityHoursFromTokens([])).toEqual({ kind: 'none', reason: 'no_tokens' });
  });

  it('returns no_dates when no purchasedAt', () => {
    const r = inferActivityHoursFromTokens([{ purchasedAt: undefined, hidden: false }]);
    expect(r).toEqual({ kind: 'none', reason: 'no_dates' });
  });

  it('ignores hidden tokens', () => {
    const r = inferActivityHoursFromTokens([
      { purchasedAt: purchasedAtLocal(2026, 4, 1, 10), hidden: true },
    ]);
    expect(r).toEqual({ kind: 'none', reason: 'no_tokens' });
  });

  it('estimates tight window with deciles for clustered hours', () => {
    const hours = [15, 15, 16, 16, 16, 17, 17];
    const tokens = hours.map((h) => ({
      purchasedAt: purchasedAtLocal(2026, 4, 1, h),
      hidden: false as const,
    }));
    const r = inferActivityHoursFromTokens(tokens);
    expect(r.kind).toBe('estimate');
    if (r.kind !== 'estimate') return;
    expect(r.wideSpread).toBe(false);
    expect(r.startHour).toBeGreaterThanOrEqual(15);
    expect(r.endHour).toBeLessThanOrEqual(17);
    expect(r.sampleCount).toBe(7);
  });

  it('uses min-max when spread > 14h', () => {
    const a = purchasedAtLocal(2026, 4, 1, 2);
    const b = purchasedAtLocal(2026, 4, 1, 22);
    const tokens = [
      { purchasedAt: a, hidden: false as const },
      { purchasedAt: b, hidden: false as const },
    ];
    const r = inferActivityHoursFromTokens(tokens);
    expect(r.kind).toBe('estimate');
    if (r.kind !== 'estimate') return;
    expect(r.wideSpread).toBe(true);
    expect(r.startHour).toBe(Math.min(localHourFrom(a), localHourFrom(b)));
    expect(r.endHour).toBe(Math.max(localHourFrom(a), localHourFrom(b)));
  });
});

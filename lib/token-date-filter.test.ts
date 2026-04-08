import { describe, it, expect } from 'vitest';
import {
  appendTokenDateQueryParams,
  localCustomDayRange,
  localGmgnAllTimeRange,
  type TokenPurchaseFilter,
} from '@/lib/token-date-filter';

describe('localCustomDayRange', () => {
  it('returns null for invalid input', () => {
    expect(localCustomDayRange('bad', '2026-04-01')).toBeNull();
    expect(localCustomDayRange('2026-04-10', '2026-04-01')).toBeNull();
  });

  it('returns ordered range for two valid days', () => {
    const r = localCustomDayRange('2026-04-01', '2026-04-02');
    expect(r).not.toBeNull();
    expect(r!.fromMs).toBeLessThanOrEqual(r!.toMs);
  });
});

describe('localGmgnAllTimeRange', () => {
  it('respecte la fenêtre max ~366 jours (API GMGN)', () => {
    const r = localGmgnAllTimeRange();
    expect(r.toMs - r.fromMs).toBe(366 * 86400000);
    expect(r.toMs).toBeLessThanOrEqual(Date.now());
  });
});

describe('appendTokenDateQueryParams', () => {
  it('adds nothing for all', () => {
    const p = new URLSearchParams();
    appendTokenDateQueryParams(p, 'all' as TokenPurchaseFilter);
    expect([...p.keys()].length).toBe(0);
  });

  it('adds tokenDateFrom and tokenDateTo for today', () => {
    const p = new URLSearchParams();
    appendTokenDateQueryParams(p, 'today');
    expect(p.get('tokenDateFrom')).toBeTruthy();
    expect(p.get('tokenDateTo')).toBeTruthy();
  });
});

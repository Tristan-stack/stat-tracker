import { describe, expect, it } from 'vitest';
import { aggregateHighLowFromKlines, normalizeKlineList } from '@/lib/gmgn/client';

describe('normalizeKlineList', () => {
  it('accepte list, candles, data ou tableau racine', () => {
    expect(normalizeKlineList({ list: [{ high: '2' }] })).toHaveLength(1);
    expect(normalizeKlineList({ candles: [{ high: '2' }] })).toHaveLength(1);
    expect(normalizeKlineList([{ high: '2' }])).toHaveLength(1);
    expect(normalizeKlineList(null)).toHaveLength(0);
  });
});

describe('aggregateHighLowFromKlines', () => {
  it('utilise open/close si high/low absents (nombres)', () => {
    const r = aggregateHighLowFromKlines(
      [{ open: 0.000001, close: 0.000002 } as never],
      0.0000015
    );
    expect(r.low).toBeLessThanOrEqual(0.0000015);
    expect(r.high).toBeGreaterThanOrEqual(0.0000015);
    expect(r.high).toBeGreaterThanOrEqual(r.low);
  });

  it('fusionne le prix d’entrée dans la plage', () => {
    const r = aggregateHighLowFromKlines(
      [{ high: '0.00001', low: '0.000008' } as never],
      0.000009
    );
    expect(r.low).toBe(0.000008);
    expect(r.high).toBe(0.00001);
  });

  it('liste vide → fallback entrée', () => {
    const r = aggregateHighLowFromKlines([], 0.000005);
    expect(r.high).toBe(0.000005);
    expect(r.low).toBe(0.000005);
  });

  it('avec purchaseMs : high sur toutes les bougies, low seulement après la fin des bougies avant achat', () => {
    const purchaseMs = 500_000;
    const r = aggregateHighLowFromKlines(
      [
        { time: 0, high: '0.00002', low: '0.000001' },
        { time: 300, high: '0.000008', low: '0.000002' },
      ] as never,
      0.000005,
      { purchaseMs, resolutionHint: '5m' }
    );
    expect(r.high).toBe(0.00002);
    expect(r.low).toBe(0.000002);
  });
});

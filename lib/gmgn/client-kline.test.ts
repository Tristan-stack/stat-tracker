import { describe, expect, it } from 'vitest';
import {
  aggregateHighLowFromKlines,
  minutesFromPurchaseToLowEstablished,
  normalizeKlineList,
} from '@/lib/gmgn/client';

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

describe('minutesFromPurchaseToLowEstablished', () => {
  it('aligne la fin de bougie sur la résolution API (15m), pas sur l’écart entre deux opens (sinon durée trop courte)', () => {
    const entryMs = 0;
    const entryPrice = 10;
    const targetLow = 5;
    const candles = [
      { time: 0, high: '10', low: '9' },
      { time: 90, high: '9', low: '5' },
    ] as never[];
    const m = minutesFromPurchaseToLowEstablished(candles, entryPrice, targetLow, entryMs, '15m');
    expect(m).not.toBeNull();
    expect(m!).toBeGreaterThan(10);
    expect(m!).toBeCloseTo(16.5, 1);
  });

  it('retourne 0 si le prix d’entrée est déjà le creux', () => {
    const m = minutesFromPurchaseToLowEstablished(
      [{ time: 1_700_000_000, high: '2', low: '1' } as never],
      1,
      1,
      1_700_000_000_000,
      '1h'
    );
    expect(m).toBe(0);
  });

  it('mesure jusqu’à la fin de la première bougie post-achat où le low agrégé est atteint', () => {
    const entryMs = 500_000;
    const entryPrice = 0.000005;
    const targetLow = 0.000002;
    const candles = [
      { time: 0, high: '0.00002', low: '0.000001' },
      { time: 300, high: '0.000008', low: '0.000002' },
    ] as never[];
    const minutes = minutesFromPurchaseToLowEstablished(
      candles,
      entryPrice,
      targetLow,
      entryMs,
      '5m'
    );
    expect(minutes).not.toBeNull();
    expect(minutes!).toBeGreaterThan(0);
    expect(minutes!).toBeLessThan(10);
  });
});

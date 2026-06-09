import { describe, it, expect } from 'vitest';
import {
  parseTakeProfits,
  mcapToPercent,
  autoInitialSellPercentFromTarget,
  simulateTokenMultiTp,
  resolveTpsForToken,
  getMultiTpSimulation,
  type TakeProfitInput,
} from './token-simulation';
import type { TokenWithMetrics } from '@/types/token';

function tok(over: Partial<TokenWithMetrics>): TokenWithMetrics {
  return {
    id: 't',
    name: 'mint',
    entryPrice: 100,
    high: 300,
    low: 50,
    targetExitPercent: 100,
    targetExitPrice: 200,
    maxGainPercent: 200,
    maxLossPercent: -50,
    targetReached: true,
    ...over,
  };
}

describe('parseTakeProfits', () => {
  it('garde les TP valides et ignore les vides/invalides', () => {
    const inputs: TakeProfitInput[] = [
      { executionType: 'tp', targetValue: '100', withdrawPercent: '50', targetMode: 'percent' },
      { executionType: 'tp', targetValue: '', withdrawPercent: '50', targetMode: 'percent' },
      { executionType: 'tp', targetValue: '200', withdrawPercent: '0', targetMode: 'percent' },
      { executionType: 'initial', targetValue: '50', withdrawPercent: '', targetMode: 'percent' },
    ];
    const parsed = parseTakeProfits(inputs);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ rawTarget: 100, withdrawPercent: 50 });
    expect(parsed[1]).toMatchObject({ executionType: 'initial', rawTarget: 50, withdrawPercent: 0 });
  });
});

describe('mcapToPercent', () => {
  it('convertit un MCap cible en % de gain vs entrée', () => {
    expect(mcapToPercent(100, 200)).toBe(100);
    expect(mcapToPercent(0, 200)).toBe(Infinity);
  });
});

describe('autoInitialSellPercentFromTarget', () => {
  it('calcule la fraction pour récupérer la mise', () => {
    expect(autoInitialSellPercentFromTarget(100)).toBeCloseTo(50);
    expect(autoInitialSellPercentFromTarget(0)).toBeCloseTo(100);
  });
});

describe('simulateTokenMultiTp', () => {
  it('vend une fraction au TP atteint puis le reste au low', () => {
    const token = tok({ maxGainPercent: 100, maxLossPercent: -50 });
    const tps = resolveTpsForToken(parseTakeProfits([
      { executionType: 'tp', targetValue: '100', withdrawPercent: '50', targetMode: 'percent' },
    ]), token);
    // 0.5 vendu à +100% = 0.5*2 = 1.0 ; 0.5 restant à -50% = 0.5*0.5 = 0.25 → total 1.25 pour amount=1
    expect(simulateTokenMultiTp(1, token, tps)).toBeCloseTo(1.25);
  });

  it('full loss si aucun TP atteint', () => {
    const token = tok({ maxGainPercent: 20, maxLossPercent: -50 });
    const tps = resolveTpsForToken(parseTakeProfits([
      { executionType: 'tp', targetValue: '100', withdrawPercent: '50', targetMode: 'percent' },
    ]), token);
    expect(simulateTokenMultiTp(1, token, tps)).toBeCloseTo(0.5);
  });
});

describe('getMultiTpSimulation', () => {
  it('agrège investi/reçu/profit sur plusieurs tokens', () => {
    const tokens = [tok({ maxGainPercent: 100 }), tok({ maxGainPercent: 20 })];
    const tps = parseTakeProfits([
      { executionType: 'tp', targetValue: '100', withdrawPercent: '50', targetMode: 'percent' },
    ]);
    const res = getMultiTpSimulation(1, tokens, tps);
    expect(res.investedTotal).toBe(2);
    expect(res.tokensWithAtLeastOneTp).toBe(1);
    expect(res.tokensFullLoss).toBe(1);
  });
});

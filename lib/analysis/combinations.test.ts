import { describe, it, expect } from 'vitest';
import { solveCombinations, type WalletTokenSet } from './combinations';

function ws(addr: string, tokens: string[]): WalletTokenSet {
  return { walletAddress: addr, tokens: new Set(tokens) };
}

const ALL_TOKENS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'];

describe('solveCombinations', () => {
  it('picks optimal order for 3 wallets covering 10 tokens', () => {
    const wallets = [
      ws('W1', ['T1', 'T2', 'T3']),
      ws('W2', ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']),
      ws('W3', ['T7', 'T8', 'T9', 'T10']),
    ];

    const steps = solveCombinations(wallets, ALL_TOKENS);

    expect(steps[0].walletAddress).toBe('W2');
    expect(steps[0].newTokensCovered).toHaveLength(7);
    expect(steps[0].cumulativeCoverage).toBe(70);

    expect(steps[1].walletAddress).toBe('W3');
    expect(steps[1].newTokensCovered).toHaveLength(3);
    expect(steps[1].cumulativeCoverage).toBe(100);

    expect(steps).toHaveLength(2);
  });

  it('stops at target coverage (80%)', () => {
    const wallets = [
      ws('W1', ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']),
      ws('W2', ['T9', 'T10']),
    ];

    const steps = solveCombinations(wallets, ALL_TOKENS, { targetCoveragePercent: 80 });

    expect(steps).toHaveLength(1);
    expect(steps[0].walletAddress).toBe('W1');
    expect(steps[0].cumulativeCoverage).toBe(80);
  });

  it('handles single wallet covering everything', () => {
    const wallets = [ws('W1', ALL_TOKENS)];

    const steps = solveCombinations(wallets, ALL_TOKENS);

    expect(steps).toHaveLength(1);
    expect(steps[0].walletAddress).toBe('W1');
    expect(steps[0].cumulativeCoverage).toBe(100);
  });

  it('returns empty for no wallets', () => {
    expect(solveCombinations([], ALL_TOKENS)).toEqual([]);
  });

  it('returns empty for no tokens', () => {
    expect(solveCombinations([ws('W1', ['T1'])], [])).toEqual([]);
  });

  it('correctly handles overlapping token sets', () => {
    const wallets = [
      ws('W1', ['T1', 'T2', 'T3']),
      ws('W2', ['T2', 'T3', 'T4', 'T5']),
      ws('W3', ['T1', 'T4', 'T5', 'T6', 'T7']),
    ];
    const tokens = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    const steps = solveCombinations(wallets, tokens);

    expect(steps[0].walletAddress).toBe('W3');
    expect(steps[0].newTokensCovered).toHaveLength(5);

    expect(steps[1].newTokensCovered.length).toBeGreaterThan(0);

    const totalCovered = steps.reduce((s, st) => s + st.newTokensCovered.length, 0);
    expect(totalCovered).toBe(7);
  });

  it('stops when no wallet adds new coverage', () => {
    const wallets = [
      ws('W1', ['T1', 'T2']),
      ws('W2', ['T1', 'T2']),
    ];

    const steps = solveCombinations(wallets, ALL_TOKENS);

    expect(steps).toHaveLength(1);
    expect(steps[0].cumulativeCoverage).toBe(20);
  });

  it('calculates cumulative coverage correctly across steps', () => {
    const wallets = [
      ws('W1', ['T1', 'T2']),
      ws('W2', ['T3', 'T4']),
      ws('W3', ['T5']),
    ];

    const steps = solveCombinations(wallets, ALL_TOKENS);

    expect(steps[0].cumulativeCoverage).toBe(20);
    expect(steps[1].cumulativeCoverage).toBe(40);
    expect(steps[2].cumulativeCoverage).toBe(50);
  });
});

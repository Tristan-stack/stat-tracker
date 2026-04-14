import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/analysis/discover-buyers', () => ({
  discoverBuyers: vi.fn(),
}));

vi.mock('@/lib/analysis/discover-siblings', () => ({
  discoverSiblingWallets: vi.fn(),
}));

vi.mock('@/lib/analysis/trace-funding', () => ({
  traceFundingForWallets: vi.fn(),
}));

vi.mock('@/lib/analysis/scoring', () => ({
  scoreWallets: vi.fn(),
}));

vi.mock('@/lib/analysis/combinations', () => ({
  solveCombinations: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
}));

import { discoverBuyers } from '@/lib/analysis/discover-buyers';
import { discoverSiblingWallets } from '@/lib/analysis/discover-siblings';
import { traceFundingForWallets } from '@/lib/analysis/trace-funding';
import { scoreWallets } from '@/lib/analysis/scoring';
import { solveCombinations } from '@/lib/analysis/combinations';
import { query } from '@/lib/db';
import { runAnalysisPipeline, type EmitFn } from './run-analysis';

const mockDiscoverBuyers = vi.mocked(discoverBuyers);
const mockDiscoverSiblings = vi.mocked(discoverSiblingWallets);
const mockTraceFunding = vi.mocked(traceFundingForWallets);
const mockScoreWallets = vi.mocked(scoreWallets);
const mockSolveCombinations = vi.mocked(solveCombinations);
const mockQuery = vi.mocked(query);

const ANALYSIS_ID = 'analysis-1';
const RUGGER_WALLET = 'RuggerWallet';
const USER_ID = 'user-1';
const TOKENS = [
  { address: 'TokenA', name: 'Token A' },
  { address: 'TokenB', name: 'Token B' },
];

function makeEmitSpy(): { emit: EmitFn; events: { event: string; data: Record<string, unknown> }[] } {
  const events: { event: string; data: Record<string, unknown> }[] = [];
  const emit: EmitFn = (event, data) => { events.push({ event, data }); };
  return { emit, events };
}

function setupDefaultMocks() {
  mockQuery.mockResolvedValue([]);

  mockDiscoverBuyers.mockResolvedValue({
    buyers: [
      {
        walletAddress: 'BuyerA',
        tokensBought: 2,
        totalTokens: 2,
        coveragePercent: 100,
        purchases: [
          { walletAddress: 'BuyerA', tokenAddress: 'TokenA', tokenName: 'Token A', purchasedAt: '2025-01-01T00:00:00Z', amountSol: 1.5 },
          { walletAddress: 'BuyerA', tokenAddress: 'TokenB', tokenName: 'Token B', purchasedAt: '2025-01-02T00:00:00Z', amountSol: 2.0 },
        ],
      },
    ],
    tokenCount: 2,
    totalUniqueBuyers: 1,
  });

  mockDiscoverSiblings.mockResolvedValue({
    motherAddress: 'MotherAddr',
    siblings: [
      { walletAddress: 'SiblingA', motherAddress: 'MotherAddr', amountReceived: 1.0, receivedAt: '2025-01-01T00:00:00Z' },
    ],
    ruggerChain: ['RuggerWallet', 'MotherAddr'],
  });

  mockTraceFunding.mockResolvedValue({
    chains: [
      { wallet: 'BuyerA', mother: 'MotherX', depth: 2, chain: ['BuyerA', 'IntermediateA', 'MotherX'], stoppedBy: null },
    ],
    mothers: [{ address: 'MotherX', walletsFunded: 1, wallets: ['BuyerA'] }],
  });

  mockScoreWallets.mockReturnValue([
    {
      walletAddress: 'BuyerA',
      tokensBought: 2,
      totalTokens: 2,
      coveragePercent: 100,
      consistency: 85.5,
      weight: 100,
      activeDays: 2,
      firstBuyAt: '2025-01-01T00:00:00Z',
      lastBuyAt: '2025-01-02T00:00:00Z',
      avgHoldDurationHours: null,
    },
  ]);

  mockSolveCombinations.mockReturnValue([
    { walletAddress: 'BuyerA', newTokensCovered: ['TokenA', 'TokenB'], cumulativeCoverage: 100 },
  ]);
}

describe('runAnalysisPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  describe('token mode', () => {
    it('runs discover -> score -> persist -> complete', async () => {
      const { emit, events } = makeEmitSpy();

      await runAnalysisPipeline(ANALYSIS_ID, TOKENS, RUGGER_WALLET, USER_ID, { mode: 'token' }, emit);

      expect(mockDiscoverBuyers).toHaveBeenCalled();
      expect(mockDiscoverSiblings).not.toHaveBeenCalled();
      expect(mockTraceFunding).not.toHaveBeenCalled();
      expect(mockScoreWallets).toHaveBeenCalled();

      const eventNames = events.map((e) => e.event);
      expect(eventNames[0]).toBe('started');
      expect(eventNames).toContain('buyers_found');
      expect(eventNames).toContain('complete');
      expect(eventNames).not.toContain('siblings_found');
    });

    it('emits started event with mode and token count', async () => {
      const { emit, events } = makeEmitSpy();

      await runAnalysisPipeline(ANALYSIS_ID, TOKENS, RUGGER_WALLET, USER_ID, { mode: 'token' }, emit);

      const started = events.find((e) => e.event === 'started');
      expect(started?.data).toEqual({ analysisId: ANALYSIS_ID, mode: 'token', tokenCount: 2 });
    });
  });

  describe('funding mode', () => {
    it('runs sibling discovery -> persist -> complete', async () => {
      const { emit, events } = makeEmitSpy();

      await runAnalysisPipeline(ANALYSIS_ID, TOKENS, RUGGER_WALLET, USER_ID, { mode: 'funding' }, emit);

      expect(mockDiscoverSiblings).toHaveBeenCalledWith(RUGGER_WALLET, USER_ID, {
        maxDepth: 5,
        siblingLimit: 200,
      });
      expect(mockDiscoverBuyers).not.toHaveBeenCalled();
      expect(mockTraceFunding).not.toHaveBeenCalled();

      const eventNames = events.map((e) => e.event);
      expect(eventNames).toContain('siblings_found');
      expect(eventNames).toContain('complete');
      expect(eventNames).not.toContain('buyers_found');
    });

    it('emits siblings_found with mother and count', async () => {
      const { emit, events } = makeEmitSpy();

      await runAnalysisPipeline(ANALYSIS_ID, TOKENS, RUGGER_WALLET, USER_ID, { mode: 'funding' }, emit);

      const siblingsFound = events.find((e) => e.event === 'siblings_found');
      expect(siblingsFound?.data).toEqual({ motherAddress: 'MotherAddr', siblingsFound: 1 });
    });
  });

  describe('combined mode', () => {
    it('runs discover -> siblings -> merge -> funding -> score -> complete', async () => {
      const { emit, events } = makeEmitSpy();

      await runAnalysisPipeline(ANALYSIS_ID, TOKENS, RUGGER_WALLET, USER_ID, { mode: 'combined' }, emit);

      expect(mockDiscoverBuyers).toHaveBeenCalled();
      expect(mockDiscoverSiblings).toHaveBeenCalled();
      expect(mockTraceFunding).toHaveBeenCalled();
      expect(mockScoreWallets).toHaveBeenCalled();

      const eventNames = events.map((e) => e.event);
      expect(eventNames).toContain('buyers_found');
      expect(eventNames).toContain('siblings_found');
      expect(eventNames).toContain('complete');
    });

    it('marks wallets in both lists as source "both"', async () => {
      mockDiscoverBuyers.mockResolvedValue({
        buyers: [
          {
            walletAddress: 'OverlapWallet',
            tokensBought: 1,
            totalTokens: 2,
            coveragePercent: 50,
            purchases: [{ walletAddress: 'OverlapWallet', tokenAddress: 'TokenA', tokenName: 'Token A', purchasedAt: '2025-01-01T00:00:00Z', amountSol: 1.0 }],
          },
        ],
        tokenCount: 2,
        totalUniqueBuyers: 1,
      });

      mockDiscoverSiblings.mockResolvedValue({
        motherAddress: 'MotherAddr',
        siblings: [
          { walletAddress: 'OverlapWallet', motherAddress: 'MotherAddr', amountReceived: 1.0, receivedAt: '2025-01-01T00:00:00Z' },
          { walletAddress: 'FundingOnly', motherAddress: 'MotherAddr', amountReceived: 2.0, receivedAt: '2025-01-01T00:00:00Z' },
        ],
        ruggerChain: ['RuggerWallet', 'MotherAddr'],
      });

      mockTraceFunding.mockResolvedValue({ chains: [], mothers: [] });

      const { emit, events } = makeEmitSpy();

      await runAnalysisPipeline(ANALYSIS_ID, TOKENS, RUGGER_WALLET, USER_ID, { mode: 'combined' }, emit);

      const complete = events.find((e) => e.event === 'complete');
      expect(complete?.data.overlapCount).toBe(1);
    });
  });

  describe('error handling', () => {
    it('emits error event and marks analysis as failed', async () => {
      mockDiscoverBuyers.mockRejectedValue(new Error('Helius API rate limited'));

      const { emit, events } = makeEmitSpy();

      await runAnalysisPipeline(ANALYSIS_ID, TOKENS, RUGGER_WALLET, USER_ID, { mode: 'token' }, emit);

      const errorEvent = events.find((e) => e.event === 'error');
      expect(errorEvent?.data.message).toBe('Helius API rate limited');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('status'),
        expect.arrayContaining([ANALYSIS_ID, 'failed'])
      );
    });
  });

  describe('progress events', () => {
    it('emits progress events with increasing percent', async () => {
      const { emit, events } = makeEmitSpy();

      await runAnalysisPipeline(ANALYSIS_ID, TOKENS, RUGGER_WALLET, USER_ID, { mode: 'token' }, emit);

      const progressEvents = events.filter((e) => e.event === 'progress');
      expect(progressEvents.length).toBeGreaterThanOrEqual(2);

      const percents = progressEvents.map((e) => e.data.percent as number);
      for (let i = 1; i < percents.length; i++) {
        expect(percents[i]).toBeGreaterThanOrEqual(percents[i - 1]);
      }
    });
  });

  describe('DB persistence', () => {
    it('updates analysis status to completed on success', async () => {
      const { emit } = makeEmitSpy();

      await runAnalysisPipeline(ANALYSIS_ID, TOKENS, RUGGER_WALLET, USER_ID, { mode: 'token' }, emit);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'completed'"),
        expect.arrayContaining([ANALYSIS_ID])
      );
    });

    it('inserts mother addresses when found', async () => {
      const { emit } = makeEmitSpy();

      await runAnalysisPipeline(ANALYSIS_ID, TOKENS, RUGGER_WALLET, USER_ID, { mode: 'funding' }, emit);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('analysis_mother_addresses'),
        expect.arrayContaining([ANALYSIS_ID, 'MotherAddr'])
      );
    });
  });
});

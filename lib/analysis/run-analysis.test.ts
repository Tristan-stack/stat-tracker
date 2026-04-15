import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/analysis/discover-buyers', () => ({
  discoverBuyers: vi.fn(),
  recoverWalletCentricBuyers: vi.fn(),
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

vi.mock('@/lib/analysis/discover-rugger-tokens', () => ({
  discoverRuggerTokens: vi.fn(),
  validateTokensByCrossReference: vi.fn(),
}));

import { recoverWalletCentricBuyers } from '@/lib/analysis/discover-buyers';
import { discoverSiblingWallets } from '@/lib/analysis/discover-siblings';
import { traceFundingForWallets } from '@/lib/analysis/trace-funding';
import { scoreWallets } from '@/lib/analysis/scoring';
import { solveCombinations } from '@/lib/analysis/combinations';
import { query } from '@/lib/db';
import {
  discoverRuggerTokens,
  validateTokensByCrossReference,
} from '@/lib/analysis/discover-rugger-tokens';
import { runAnalysisPipeline, type EmitFn } from './run-analysis';

const mockRecoverWalletCentricBuyers = vi.mocked(recoverWalletCentricBuyers);
const mockDiscoverSiblings = vi.mocked(discoverSiblingWallets);
const mockTraceFunding = vi.mocked(traceFundingForWallets);
const mockScoreWallets = vi.mocked(scoreWallets);
const mockSolveCombinations = vi.mocked(solveCombinations);
const mockQuery = vi.mocked(query);
const mockDiscoverRuggerTokens = vi.mocked(discoverRuggerTokens);
const mockValidateTokens = vi.mocked(validateTokensByCrossReference);

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
  mockDiscoverRuggerTokens.mockResolvedValue([...TOKENS]);
  mockValidateTokens.mockResolvedValue({
    validatedTokens: [...TOKENS],
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
    stats: {
      candidateCount: 2,
      validatedCount: 2,
      discardedCount: 0,
      multiTokenWalletCount: 1,
    },
  });

  mockRecoverWalletCentricBuyers.mockResolvedValue({
    buyers: [],
    tokenCount: 2,
    totalUniqueBuyers: 0,
  });

  mockDiscoverSiblings.mockResolvedValue({
    motherAddress: 'MotherAddr',
    siblings: [
      { walletAddress: 'SiblingA', motherAddress: 'MotherAddr', amountReceived: 1.0, receivedAt: '2025-01-01T00:00:00Z' },
    ],
    ruggerChain: ['RuggerWallet', 'MotherAddr'],
    motherChildCount: 1,
    hasHighFanoutMother: false,
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
      activeDaysInScope: 2,
      spanDaysInScope: 1,
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

      expect(mockValidateTokens).toHaveBeenCalled();
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

    it('does not call GMGN recovery when walletCentricRecoveryLimit is 0', async () => {
      const { emit, events } = makeEmitSpy();

      await runAnalysisPipeline(
        ANALYSIS_ID,
        TOKENS,
        RUGGER_WALLET,
        USER_ID,
        { mode: 'token', walletCentricRecoveryLimit: 0 },
        emit
      );

      expect(mockRecoverWalletCentricBuyers).not.toHaveBeenCalled();
      expect(
        events.some(
          (e) =>
            e.event === 'progress' &&
            typeof e.data.detail === 'string' &&
            e.data.detail.includes('désactivée')
        )
      ).toBe(true);
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
      expect(mockValidateTokens).not.toHaveBeenCalled();
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
      expect(siblingsFound?.data).toEqual({
        motherAddress: 'MotherAddr',
        siblingsFound: 1,
        motherChildCount: 1,
        highFanoutMother: false,
      });
    });
  });

  describe('combined mode', () => {
    it('runs discover -> siblings -> merge -> funding -> score -> complete', async () => {
      const { emit, events } = makeEmitSpy();

      await runAnalysisPipeline(ANALYSIS_ID, TOKENS, RUGGER_WALLET, USER_ID, { mode: 'combined' }, emit);

      expect(mockValidateTokens).toHaveBeenCalled();
      expect(mockDiscoverSiblings).toHaveBeenCalled();
      expect(mockTraceFunding).toHaveBeenCalled();
      expect(mockScoreWallets).toHaveBeenCalled();

      const eventNames = events.map((e) => e.event);
      expect(eventNames).toContain('buyers_found');
      expect(eventNames).toContain('siblings_found');
      expect(eventNames).toContain('complete');
    });

    it('marks wallets in both lists as source "both"', async () => {
      mockValidateTokens.mockResolvedValue({
        validatedTokens: [...TOKENS],
        buyers: [
          {
            walletAddress: 'OverlapWallet',
            tokensBought: 1,
            totalTokens: 2,
            coveragePercent: 50,
            purchases: [{ walletAddress: 'OverlapWallet', tokenAddress: 'TokenA', tokenName: 'Token A', purchasedAt: '2025-01-01T00:00:00Z', amountSol: 1.0 }],
          },
        ],
        stats: {
          candidateCount: 2,
          validatedCount: 2,
          discardedCount: 0,
          multiTokenWalletCount: 1,
        },
      });

      mockDiscoverSiblings.mockResolvedValue({
        motherAddress: 'MotherAddr',
        siblings: [
          { walletAddress: 'OverlapWallet', motherAddress: 'MotherAddr', amountReceived: 1.0, receivedAt: '2025-01-01T00:00:00Z' },
          { walletAddress: 'FundingOnly', motherAddress: 'MotherAddr', amountReceived: 2.0, receivedAt: '2025-01-01T00:00:00Z' },
        ],
        ruggerChain: ['RuggerWallet', 'MotherAddr'],
        motherChildCount: 2,
        hasHighFanoutMother: false,
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
      mockValidateTokens.mockRejectedValue(new Error('Helius API rate limited'));

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

    it('persists exclusion decision for low coverage token wallet', async () => {
      mockValidateTokens.mockResolvedValue({
        validatedTokens: [...TOKENS],
        buyers: [
          {
            walletAddress: 'LowCoverage',
            tokensBought: 1,
            totalTokens: 2,
            coveragePercent: 50,
            purchases: [
              { walletAddress: 'LowCoverage', tokenAddress: 'TokenA', tokenName: 'Token A', purchasedAt: '2025-01-01T00:00:00Z', amountSol: 1.0 },
            ],
          },
        ],
        stats: {
          candidateCount: 2,
          validatedCount: 2,
          discardedCount: 0,
          multiTokenWalletCount: 1,
        },
      });
      mockScoreWallets.mockReturnValue([
        {
          walletAddress: 'LowCoverage',
          tokensBought: 1,
          totalTokens: 2,
          coveragePercent: 30,
          consistency: 20,
          weight: 10,
          activeDaysInScope: 1,
          spanDaysInScope: 0,
          firstBuyAt: '2025-01-01T00:00:00Z',
          lastBuyAt: '2025-01-01T00:00:00Z',
          avgHoldDurationHours: null,
        },
      ]);

      const { emit } = makeEmitSpy();
      await runAnalysisPipeline(ANALYSIS_ID, TOKENS, RUGGER_WALLET, USER_ID, { mode: 'token' }, emit);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('inclusion_decision'),
        expect.arrayContaining(['excluded'])
      );
    });

    it('adds wallet_centric_recovered reason when wallet is recovered', async () => {
      mockRecoverWalletCentricBuyers.mockResolvedValueOnce({
        buyers: [
          {
            walletAddress: 'RecoveredWallet',
            tokensBought: 1,
            totalTokens: 2,
            coveragePercent: 50,
            purchases: [
              { walletAddress: 'RecoveredWallet', tokenAddress: 'TokenA', tokenName: 'Token A', purchasedAt: '2025-01-01T00:00:00Z', amountSol: null },
            ],
          },
        ],
        tokenCount: 2,
        totalUniqueBuyers: 1,
      });

      const { emit } = makeEmitSpy();
      await runAnalysisPipeline(ANALYSIS_ID, TOKENS, RUGGER_WALLET, USER_ID, { mode: 'token' }, emit);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('decision_reasons'),
        expect.arrayContaining([expect.stringContaining('wallet_centric_recovered')])
      );
    });
  });
});

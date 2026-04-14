import type { AnalysisMode, WalletSource } from '@/types/analysis';
import { discoverBuyers, type DiscoveredBuyer } from '@/lib/analysis/discover-buyers';
import { discoverSiblingWallets } from '@/lib/analysis/discover-siblings';
import { traceFundingForWallets } from '@/lib/analysis/trace-funding';
import { scoreWallets, type ScoringInput, type ScoringResult } from '@/lib/analysis/scoring';
import { solveCombinations, type WalletTokenSet } from '@/lib/analysis/combinations';
import { query } from '@/lib/db';

const ANALYSIS_CONCURRENCY = Number(process.env.ANALYSIS_CONCURRENCY ?? '3');
const FUNDING_BATCH_SIZE = 10;

export type EmitFn = (event: string, data: Record<string, unknown>) => void;

interface TokenInput {
  address: string;
  name: string | null;
}

export interface PipelineOpts {
  mode: AnalysisMode;
  fundingDepth?: number;
  buyerLimit?: number;
}

interface MergedWallet {
  walletAddress: string;
  source: WalletSource;
  purchases: { tokenAddress: string; tokenName: string | null; purchasedAt: string | null; amountSol: number | null }[];
  fundingChain: string[] | null;
  fundingDepth: number | null;
  motherAddress: string | null;
}

export async function runAnalysisPipeline(
  analysisId: string,
  tokens: TokenInput[],
  ruggerWallet: string,
  userId: string,
  opts: PipelineOpts,
  emit: EmitFn
): Promise<void> {
  const { mode, fundingDepth = 5, buyerLimit = 200 } = opts;

  try {
    await updateAnalysisStatus(analysisId, 'running', 0, 'Starting analysis...');
    emit('started', { analysisId, mode, tokenCount: tokens.length });

    let mergedWallets: MergedWallet[];

    if (mode === 'token') {
      mergedWallets = await runTokenMode(analysisId, tokens, ruggerWallet, buyerLimit, emit);
    } else if (mode === 'funding') {
      mergedWallets = await runFundingMode(analysisId, ruggerWallet, userId, fundingDepth, buyerLimit, emit);
    } else {
      mergedWallets = await runCombinedMode(analysisId, tokens, ruggerWallet, userId, fundingDepth, buyerLimit, emit);
    }

    emit('progress', { phase: 'scoring', percent: 90 });
    await updateAnalysisStatus(analysisId, 'running', 90, 'Computing scores...');

    const { scoredWallets, combinations } = computeScoresAndCombinations(mergedWallets, tokens);

    emit('progress', { phase: 'persisting', percent: 95 });
    await updateAnalysisStatus(analysisId, 'running', 95, 'Saving results...');

    const motherCount = await persistResults(analysisId, mergedWallets, scoredWallets, combinations);

    const buyerCount = mergedWallets.length;
    const overlapCount = mergedWallets.filter((w) => w.source === 'both').length;
    const topConsistency = scoredWallets.length > 0
      ? Math.max(...scoredWallets.map((s) => s.consistency))
      : 0;

    await finalizeAnalysis(analysisId, tokens.length, buyerCount);

    emit('complete', {
      analysisId,
      buyerCount,
      motherCount,
      topConsistency: Math.round(topConsistency * 10) / 10,
      overlapCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await updateAnalysisStatus(analysisId, 'failed', 0, null, message);
    emit('error', { message });
  }
}

async function runTokenMode(
  analysisId: string,
  tokens: TokenInput[],
  ruggerWallet: string,
  buyerLimit: number,
  emit: EmitFn
): Promise<MergedWallet[]> {
  const buyers = await discoverBuyersParallel(tokens, ruggerWallet, buyerLimit, emit);

  return buyers.map((b) => ({
    walletAddress: b.walletAddress,
    source: 'token' as WalletSource,
    purchases: b.purchases.map((p) => ({
      tokenAddress: p.tokenAddress,
      tokenName: p.tokenName,
      purchasedAt: p.purchasedAt,
      amountSol: p.amountSol,
    })),
    fundingChain: null,
    fundingDepth: null,
    motherAddress: null,
  }));
}

async function runFundingMode(
  _analysisId: string,
  ruggerWallet: string,
  userId: string,
  fundingDepth: number,
  siblingLimit: number,
  emit: EmitFn
): Promise<MergedWallet[]> {
  emit('progress', { phase: 'siblings', percent: 10 });

  const siblingResult = await discoverSiblingWallets(ruggerWallet, userId, {
    maxDepth: fundingDepth,
    siblingLimit,
  });

  emit('siblings_found', {
    motherAddress: siblingResult.motherAddress,
    siblingsFound: siblingResult.siblings.length,
  });

  emit('progress', { phase: 'siblings', percent: 70 });

  return siblingResult.siblings.map((s) => ({
    walletAddress: s.walletAddress,
    source: 'funding' as WalletSource,
    purchases: [],
    fundingChain: siblingResult.ruggerChain,
    fundingDepth: siblingResult.ruggerChain.length - 1,
    motherAddress: s.motherAddress,
  }));
}

async function runCombinedMode(
  analysisId: string,
  tokens: TokenInput[],
  ruggerWallet: string,
  userId: string,
  fundingDepth: number,
  buyerLimit: number,
  emit: EmitFn
): Promise<MergedWallet[]> {
  const tokenBuyers = await discoverBuyersParallel(tokens, ruggerWallet, buyerLimit, emit);

  emit('progress', { phase: 'siblings', percent: 50 });

  const siblingResult = await discoverSiblingWallets(ruggerWallet, userId, {
    maxDepth: fundingDepth,
    siblingLimit: buyerLimit,
  });

  emit('siblings_found', {
    motherAddress: siblingResult.motherAddress,
    siblingsFound: siblingResult.siblings.length,
  });

  emit('progress', { phase: 'merging', percent: 55 });

  const tokenSet = new Set(tokenBuyers.map((b) => b.walletAddress));
  const siblingSet = new Set(siblingResult.siblings.map((s) => s.walletAddress));
  const allWallets = new Map<string, MergedWallet>();

  for (const b of tokenBuyers) {
    const inBoth = siblingSet.has(b.walletAddress);
    allWallets.set(b.walletAddress, {
      walletAddress: b.walletAddress,
      source: inBoth ? 'both' : 'token',
      purchases: b.purchases.map((p) => ({
        tokenAddress: p.tokenAddress,
        tokenName: p.tokenName,
        purchasedAt: p.purchasedAt,
        amountSol: p.amountSol,
      })),
      fundingChain: null,
      fundingDepth: null,
      motherAddress: inBoth ? siblingResult.motherAddress : null,
    });
  }

  for (const s of siblingResult.siblings) {
    if (!tokenSet.has(s.walletAddress)) {
      allWallets.set(s.walletAddress, {
        walletAddress: s.walletAddress,
        source: 'funding',
        purchases: [],
        fundingChain: siblingResult.ruggerChain,
        fundingDepth: siblingResult.ruggerChain.length - 1,
        motherAddress: s.motherAddress,
      });
    }
  }

  emit('progress', { phase: 'funding', percent: 60 });

  const tokenOnlyWallets = tokenBuyers
    .map((b) => b.walletAddress)
    .filter((addr) => !siblingSet.has(addr));

  if (tokenOnlyWallets.length > 0) {
    const totalBatches = Math.ceil(tokenOnlyWallets.length / FUNDING_BATCH_SIZE);
    for (let i = 0; i < tokenOnlyWallets.length; i += FUNDING_BATCH_SIZE) {
      const batch = tokenOnlyWallets.slice(i, i + FUNDING_BATCH_SIZE);
      const batchNum = Math.floor(i / FUNDING_BATCH_SIZE) + 1;

      const fundingResult = await traceFundingForWallets(batch, userId, { maxDepth: fundingDepth });

      for (const chain of fundingResult.chains) {
        const existing = allWallets.get(chain.wallet);
        if (existing) {
          existing.fundingChain = chain.chain;
          existing.fundingDepth = chain.depth;
          if (chain.mother) existing.motherAddress = chain.mother;
        }
      }

      const fundingPercent = 60 + Math.round((batchNum / totalBatches) * 25);
      emit('progress', {
        phase: 'funding',
        current: Math.min(i + FUNDING_BATCH_SIZE, tokenOnlyWallets.length),
        total: tokenOnlyWallets.length,
        percent: fundingPercent,
      });
    }
  }

  return Array.from(allWallets.values());
}

async function discoverBuyersParallel(
  tokens: TokenInput[],
  ruggerWallet: string,
  buyerLimit: number,
  emit: EmitFn
): Promise<DiscoveredBuyer[]> {
  let processedTokens = 0;
  const allBuyers = new Map<string, DiscoveredBuyer>();

  for (let i = 0; i < tokens.length; i += ANALYSIS_CONCURRENCY) {
    const batch = tokens.slice(i, i + ANALYSIS_CONCURRENCY);

    const results = await Promise.all(
      batch.map((token) =>
        discoverBuyers([token], {
          buyerLimit,
          excludeWallets: [ruggerWallet],
        })
      )
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const token = batch[j];

      for (const buyer of result.buyers) {
        const existing = allBuyers.get(buyer.walletAddress);
        if (existing) {
          const newPurchases = buyer.purchases.filter(
            (p) => !existing.purchases.some((ep) => ep.tokenAddress === p.tokenAddress)
          );
          existing.purchases.push(...newPurchases);
          existing.tokensBought = existing.purchases.length;
          existing.coveragePercent = (existing.purchases.length / tokens.length) * 100;
        } else {
          allBuyers.set(buyer.walletAddress, {
            ...buyer,
            totalTokens: tokens.length,
            coveragePercent: (buyer.tokensBought / tokens.length) * 100,
          });
        }
      }

      processedTokens++;
      emit('buyers_found', { tokenAddress: token.address, buyersFound: result.totalUniqueBuyers });
      emit('progress', {
        phase: 'discovering',
        current: processedTokens,
        total: tokens.length,
        percent: Math.round((processedTokens / tokens.length) * 45),
      });
    }
  }

  const buyers = Array.from(allBuyers.values());
  buyers.sort((a, b) => b.tokensBought - a.tokensBought);
  return buyers;
}

function computeScoresAndCombinations(
  mergedWallets: MergedWallet[],
  tokens: TokenInput[]
) {
  const walletsWithPurchases = mergedWallets.filter((w) => w.purchases.length > 0);

  const scoringInputs: ScoringInput[] = walletsWithPurchases.map((w) => ({
    walletAddress: w.walletAddress,
    purchases: w.purchases.map((p) => ({
      tokenAddress: p.tokenAddress,
      purchasedAt: p.purchasedAt,
      amountSol: p.amountSol,
    })),
    totalRuggerTokens: tokens.length,
  }));

  const scoredWallets = scoringInputs.length > 0 ? scoreWallets(scoringInputs) : [];

  const walletSets: WalletTokenSet[] = walletsWithPurchases.map((w) => ({
    walletAddress: w.walletAddress,
    tokens: new Set(w.purchases.map((p) => p.tokenAddress)),
  }));

  const allTokenAddresses = tokens.map((t) => t.address);
  const combinations = walletSets.length > 0
    ? solveCombinations(walletSets, allTokenAddresses)
    : [];

  return { scoredWallets, combinations };
}

async function persistResults(
  analysisId: string,
  mergedWallets: MergedWallet[],
  scoredWallets: ScoringResult[],
  combinations: { walletAddress: string; newTokensCovered: string[]; cumulativeCoverage: number }[]
): Promise<number> {
  const scoreMap = new Map(scoredWallets.map((s) => [s.walletAddress, s]));

  const motherAddresses = new Map<string, Set<string>>();
  for (const w of mergedWallets) {
    if (w.motherAddress) {
      const existing = motherAddresses.get(w.motherAddress);
      if (existing) {
        existing.add(w.walletAddress);
      } else {
        motherAddresses.set(w.motherAddress, new Set([w.walletAddress]));
      }
    }
  }

  const motherIdMap = new Map<string, string>();
  for (const [address, wallets] of motherAddresses) {
    const rows = await query<{ id: string }>(
      `INSERT INTO analysis_mother_addresses (id, analysis_id, address, wallets_funded)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (analysis_id, address) DO UPDATE SET wallets_funded = $3
       RETURNING id`,
      [analysisId, address, wallets.size]
    );
    if (rows[0]) motherIdMap.set(address, rows[0].id);
  }

  for (const w of mergedWallets) {
    const score = scoreMap.get(w.walletAddress);
    const motherId = w.motherAddress ? motherIdMap.get(w.motherAddress) ?? null : null;

    await query(
      `INSERT INTO analysis_buyer_wallets
       (id, analysis_id, wallet_address, source, mother_address_id,
        tokens_bought, total_tokens, coverage_percent,
        first_buy_at, last_buy_at, active_days, consistency, weight,
        avg_hold_duration_hours, funding_depth, funding_chain)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (analysis_id, wallet_address) DO UPDATE SET
         source = $3, mother_address_id = $4,
         tokens_bought = $5, total_tokens = $6, coverage_percent = $7,
         first_buy_at = $8, last_buy_at = $9, active_days = $10,
         consistency = $11, weight = $12,
         avg_hold_duration_hours = $13, funding_depth = $14, funding_chain = $15`,
      [
        analysisId,
        w.walletAddress,
        w.source,
        motherId,
        score?.tokensBought ?? w.purchases.length,
        score?.totalTokens ?? 0,
        score?.coveragePercent ?? 0,
        score?.firstBuyAt ?? null,
        score?.lastBuyAt ?? null,
        score?.activeDays ?? 0,
        score?.consistency ?? 0,
        score?.weight ?? 0,
        score?.avgHoldDurationHours ?? null,
        w.fundingDepth,
        w.fundingChain ? JSON.stringify(w.fundingChain) : null,
      ]
    );

    for (const p of w.purchases) {
      await query(
        `INSERT INTO analysis_buyer_purchases
         (id, buyer_wallet_id, token_address, token_name, purchased_at, amount_sol)
         SELECT gen_random_uuid(), bw.id, $2, $3, $4, $5
         FROM analysis_buyer_wallets bw
         WHERE bw.analysis_id = $1 AND bw.wallet_address = $6
         ON CONFLICT (buyer_wallet_id, token_address) DO NOTHING`,
        [analysisId, p.tokenAddress, p.tokenName, p.purchasedAt, p.amountSol, w.walletAddress]
      );
    }
  }

  return motherAddresses.size;
}

async function updateAnalysisStatus(
  analysisId: string,
  status: string,
  progress: number,
  progressLabel: string | null,
  errorMessage?: string
): Promise<void> {
  await query(
    `UPDATE wallet_analyses SET status = $2, progress = $3, progress_label = $4, error_message = $5 WHERE id = $1`,
    [analysisId, status, progress, progressLabel, errorMessage ?? null]
  );
}

async function finalizeAnalysis(
  analysisId: string,
  tokenCount: number,
  buyerCount: number
): Promise<void> {
  await query(
    `UPDATE wallet_analyses
     SET status = 'completed', progress = 100, progress_label = 'Complete',
         token_count = $2, buyer_count = $3, completed_at = NOW()
     WHERE id = $1`,
    [analysisId, tokenCount, buyerCount]
  );
}

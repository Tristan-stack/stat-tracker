import type { AnalysisMode, WalletSource } from '@/types/analysis';
import {
  recoverWalletCentricBuyers,
  type DiscoveredBuyer,
} from '@/lib/analysis/discover-buyers';
import { discoverSiblingWallets } from '@/lib/analysis/discover-siblings';
import { traceFundingForWallets } from '@/lib/analysis/trace-funding';
import { filterBuyersByLastActivity } from '@/lib/analysis/filter-active-buyers';
import { filterBuyersByMcapRange } from '@/lib/analysis/filter-buyers-by-mcap';
import { scoreWallets, type ScoringInput, type ScoringResult } from '@/lib/analysis/scoring';
import { solveCombinations, type WalletTokenSet } from '@/lib/analysis/combinations';
import {
  discoverRuggerTokens,
  filterPumpfunTokensOnly,
  validateTokensByCrossReference,
} from '@/lib/analysis/discover-rugger-tokens';
import {
  updateAnalysisStatus,
  finalizeAnalysis,
  upsertAnalysisMotherAddress,
  upsertAnalysisBuyerWalletsBatch,
  insertAnalysisBuyerPurchasesBatch,
  loadWalletCentricCandidates,
  loadHistoricalMaxCoverageByRugger as loadHistoricalMaxCoverageByRuggerForAnalysis,
  type BuyerWalletPersistInput,
} from '@/features/analysis/repository';

const ANALYSIS_CONCURRENCY = Number(process.env.ANALYSIS_CONCURRENCY ?? '3');
const FUNDING_BATCH_SIZE = 10;
/**
 * Budget temps du pipeline (ms). Au-delà, les phases lourdes (cross-validation,
 * recovery wallet-centric, funding) sautent les éléments restants pour rester
 * sous la limite Vercel Hobby de 60 s ; le scoring/persist s'exécute quand même
 * (résultat partiel mais cohérent). Surchargeable par env si retour sur Pro.
 */
const ANALYSIS_BUDGET_MS = Number(process.env.ANALYSIS_BUDGET_MS ?? '50000');
const GLOBAL_CANDIDATE_FACTOR = Number(process.env.ANALYSIS_GLOBAL_CANDIDATE_FACTOR ?? '50');
const GLOBAL_CANDIDATE_MAX = Number(process.env.ANALYSIS_GLOBAL_CANDIDATE_MAX ?? '600');
const STRICT_COVERAGE_THRESHOLD = Number(process.env.STRICT_COVERAGE_THRESHOLD ?? '40');
const WALLET_CENTRIC_LOOKBACK_DAYS = Number(process.env.WALLET_CENTRIC_LOOKBACK_DAYS ?? '90');
const WALLET_CENTRIC_RECOVERY_MAX = Number(process.env.WALLET_CENTRIC_RECOVERY_MAX ?? '120');

export type EmitFn = (event: string, data: Record<string, unknown>) => void;

function resolveWalletCentricRecoveryLimit(opts: PipelineOpts): number {
  const cap = Math.max(0, WALLET_CENTRIC_RECOVERY_MAX);
  const envDefault = Math.max(0, Number(process.env.WALLET_CENTRIC_MAX_CANDIDATES ?? '15'));
  const raw = opts.walletCentricRecoveryLimit;
  if (raw === undefined || raw === null || Number.isNaN(Number(raw))) {
    return Math.min(envDefault, cap);
  }
  return Math.max(0, Math.min(Math.floor(Number(raw)), cap));
}

async function applyInactiveFilter(
  buyers: DiscoveredBuyer[],
  thresholdHours: number,
  emit: EmitFn
): Promise<DiscoveredBuyer[]> {
  if (buyers.length === 0) return buyers;

  emit('progress', {
    phase: 'filter_inactive',
    percent: 42,
    detail: `Vérification de l'activité on-chain de ${buyers.length} wallets (seuil ${thresholdHours}h)…`,
  });

  const result = await filterBuyersByLastActivity(buyers, {
    thresholdHours,
    onProgress: (current, total) => {
      emit('progress', {
        phase: 'filter_inactive',
        percent: 42,
        detail: `${current}/${total} wallets vérifiés`,
      });
    },
  });

  emit('progress', {
    phase: 'filter_inactive',
    percent: 44,
    detail: `${result.removedCount} wallets éliminés (inactifs > ${thresholdHours}h) · ${result.keptBuyers.length} conservés`,
  });
  emit('buyers_filtered_inactive', {
    removedCount: result.removedCount,
    keptCount: result.keptBuyers.length,
    thresholdHours,
    unknownCount: result.unknownWallets.length,
  });

  return result.keptBuyers;
}

async function applyMcapFilter(
  buyers: DiscoveredBuyer[],
  mcapMin: number | undefined,
  mcapMax: number | undefined,
  emit: EmitFn
): Promise<DiscoveredBuyer[]> {
  if (buyers.length === 0) return buyers;
  if (mcapMin === undefined && mcapMax === undefined) return buyers;

  const minLabel = mcapMin === undefined ? '-inf' : String(mcapMin);
  const maxLabel = mcapMax === undefined ? '+inf' : String(mcapMax);
  emit('progress', {
    phase: 'filter_mcap',
    percent: 44,
    detail: `Filtre MCAP en cours (${minLabel} -> ${maxLabel}) sur ${buyers.length} wallets...`,
  });

  const result = await filterBuyersByMcapRange(buyers, {
    mcapMin,
    mcapMax,
    onProgress: (current, total) => {
      emit('progress', {
        phase: 'filter_mcap',
        percent: 45,
        detail: `${current}/${total} wallets verifies`,
      });
    },
  });

  emit('progress', {
    phase: 'filter_mcap',
    percent: 46,
    detail: `${result.removedCount} wallets exclus via MCAP · ${result.keptBuyers.length} conserves`,
  });
  emit('buyers_filtered_mcap', {
    removedCount: result.removedCount,
    keptCount: result.keptBuyers.length,
    unknownCount: result.unknownWallets.length,
    mcapMin: mcapMin ?? null,
    mcapMax: mcapMax ?? null,
  });

  return result.keptBuyers;
}

interface TokenInput {
  address: string;
  name: string | null;
}

export interface PipelineOpts {
  mode: AnalysisMode;
  fundingDepth?: number;
  buyerLimit?: number;
  /** 0 = skip GMGN wallet-centric recovery; défaut serveur via WALLET_CENTRIC_MAX_CANDIDATES (15). */
  walletCentricRecoveryLimit?: number;
  /** Si true : éliminer les buyers dont la dernière activité on-chain Helius est > `inactiveThresholdHours` (défaut 24h) avant siblings/funding/recovery. */
  excludeInactiveOver24h?: boolean;
  /** Seuil d'inactivité en heures. Défaut 24. Utilisé uniquement si `excludeInactiveOver24h` est true. */
  inactiveThresholdHours?: number;
  /** Filtre optionnel du mcap d'entrée GMGN des buyers token. */
  mcapMin?: number;
  mcapMax?: number;
}

interface MergedWallet {
  walletAddress: string;
  source: WalletSource;
  purchases: { tokenAddress: string; tokenName: string | null; purchasedAt: string | null; amountSol: number | null }[];
  fundingChain: string[] | null;
  fundingDepth: number | null;
  motherAddress: string | null;
  hasHighFanoutMother: boolean;
  motherChildCount: number;
  recoveredByWalletCentric: boolean;
}

interface ModeRunResult {
  mergedWallets: MergedWallet[];
  effectiveTokens: TokenInput[];
}

type InclusionDecision = 'included' | 'excluded' | 'included_with_risk';
type RiskLevel = 'low' | 'medium' | 'high';

interface WalletDecision {
  walletAddress: string;
  matchingConfidence: number;
  inclusionDecision: InclusionDecision;
  riskFlag: string | null;
  riskLevel: RiskLevel | null;
  decisionReasons: string[];
}

export async function runAnalysisPipeline(
  analysisId: string,
  tokens: TokenInput[],
  ruggerWallet: string | null,
  userId: string,
  opts: PipelineOpts,
  emit: EmitFn
): Promise<void> {
  const { mode, fundingDepth = 5, buyerLimit = 200 } = opts;
  const walletCentricRecoveryLimit = resolveWalletCentricRecoveryLimit(opts);
  const excludeInactiveOver24h = Boolean(opts.excludeInactiveOver24h);
  const inactiveThresholdHours = Math.max(1, opts.inactiveThresholdHours ?? 24);
  const mcapMin = opts.mcapMin;
  const mcapMax = opts.mcapMax;

  const deadline = Date.now() + ANALYSIS_BUDGET_MS;

  try {
    await updateAnalysisStatus(analysisId, 'running', 0, 'Starting analysis...');
    emit('started', { analysisId, mode, tokenCount: tokens.length });

    let modeRun: ModeRunResult;

    if (mode === 'token') {
      if (!ruggerWallet) throw new Error('Rugger has no primary wallet configured');
      modeRun = await runTokenMode(
        analysisId,
        tokens,
        ruggerWallet,
        buyerLimit,
        walletCentricRecoveryLimit,
        excludeInactiveOver24h,
        inactiveThresholdHours,
        mcapMin,
        mcapMax,
        deadline,
        emit
      );
    } else if (mode === 'token_hunting') {
      modeRun = await runTokenHuntingMode(
        analysisId,
        tokens,
        buyerLimit,
        walletCentricRecoveryLimit,
        excludeInactiveOver24h,
        inactiveThresholdHours,
        mcapMin,
        mcapMax,
        deadline,
        emit
      );
    } else if (mode === 'funding') {
      if (!ruggerWallet) throw new Error('Rugger has no primary wallet configured');
      modeRun = await runFundingMode(tokens, ruggerWallet, userId, fundingDepth, buyerLimit, emit);
    } else {
      if (!ruggerWallet) throw new Error('Rugger has no primary wallet configured');
      modeRun = await runCombinedMode(
        analysisId,
        tokens,
        ruggerWallet,
        userId,
        fundingDepth,
        buyerLimit,
        walletCentricRecoveryLimit,
        excludeInactiveOver24h,
        inactiveThresholdHours,
        mcapMin,
        mcapMax,
        deadline,
        emit
      );
    }
    const { mergedWallets, effectiveTokens } = modeRun;
    const partial = Date.now() > deadline;
    if (partial) {
      emit('partial', {
        analysisId,
        message: 'Budget temps atteint (Hobby) : analyse partielle, relance pour compléter.',
      });
    }

    emit('progress', { phase: 'scoring', percent: 90 });
    await updateAnalysisStatus(analysisId, 'running', 90, 'Computing scores...');

    const { scoredWallets } = computeScoresAndCombinations(mergedWallets, effectiveTokens);
    const decisions = buildWalletDecisions(mergedWallets, scoredWallets);

    emit('progress', { phase: 'persisting', percent: 95 });
    await updateAnalysisStatus(analysisId, 'running', 95, 'Saving results...');

    const motherCount = await persistResults(analysisId, mergedWallets, scoredWallets, decisions);

    const buyerCount = mergedWallets.length;
    const overlapCount = mergedWallets.filter((w) => w.source === 'both').length;
    const topConsistency = scoredWallets.length > 0
      ? Math.max(...scoredWallets.map((s) => s.consistency))
      : 0;

    await finalizeAnalysis(analysisId, effectiveTokens.length, buyerCount, partial);

    emit('complete', {
      analysisId,
      buyerCount,
      motherCount,
      topConsistency: Math.round(topConsistency * 10) / 10,
      overlapCount,
      partial,
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
  walletCentricRecoveryLimit: number,
  excludeInactiveOver24h: boolean,
  inactiveThresholdHours: number,
  mcapMin: number | undefined,
  mcapMax: number | undefined,
  deadline: number,
  emit: EmitFn
): Promise<ModeRunResult> {
  const { buyers: initialBuyers, tokens: effectiveTokens } = await discoverAndValidateTokenUniverse(
    tokens,
    { ruggerWallet, discoverFromRuggerWallet: true },
    buyerLimit,
    deadline,
    emit
  );

  const buyers = excludeInactiveOver24h
    ? await applyInactiveFilter(initialBuyers, inactiveThresholdHours, emit)
    : initialBuyers;
  const mcapFilteredBuyers = await applyMcapFilter(buyers, mcapMin, mcapMax, emit);

  let recoveredResult: Awaited<ReturnType<typeof recoverWalletCentricBuyers>>;

  if (walletCentricRecoveryLimit === 0) {
    emit('progress', {
      phase: 'wallet_centric_recovery',
      percent: 55,
      detail: 'Recovery wallet-centric désactivée (0 wallet)',
    });
    recoveredResult = {
      buyers: [],
      tokenCount: effectiveTokens.length,
      totalUniqueBuyers: 0,
    };
  } else {
    emit('progress', { phase: 'wallet_centric_recovery', percent: 45, detail: 'Chargement des candidats…' });
    const candidateWallets = await loadWalletCentricCandidates(analysisId);
    const historicalCoverage = await loadHistoricalMaxCoverageByRuggerForAnalysis(analysisId);
    const rankedWallets = selectTopCandidatesByCoverage(
      candidateWallets,
      mcapFilteredBuyers,
      historicalCoverage,
      walletCentricRecoveryLimit
    );
    emit('progress', {
      phase: 'wallet_centric_recovery',
      percent: 48,
      detail: `${candidateWallets.length} en base → ${rankedWallets.length} retenus (meilleure couverture, N=${walletCentricRecoveryLimit})`,
    });

    recoveredResult = await recoverWalletCentricBuyers(effectiveTokens, rankedWallets, {
      excludeWallets: [ruggerWallet],
      fromMs: Date.now() - WALLET_CENTRIC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      toMs: Date.now(),
      maxCandidates: Math.max(1, rankedWallets.length || 1),
      deadline,
      onProgress: (current, total) => {
        const pct = 48 + Math.round((current / Math.max(1, total)) * 20);
        emit('progress', {
          phase: 'wallet_centric_recovery',
          percent: pct,
          detail: `${current}/${total} wallets analysés`,
        });
      },
    });
  }

  emit('progress', { phase: 'wallet_centric_recovery', percent: 70, detail: 'Fusion des résultats…' });
  const { mergedBuyers, recoveredWalletAddresses } = mergeRecoveredBuyers(
    mcapFilteredBuyers,
    recoveredResult.buyers
  );
  if (recoveredWalletAddresses.size > 0) {
    emit('wallet_centric_recovered', { recoveredCount: recoveredWalletAddresses.size });
  }

  return {
    mergedWallets: mergedBuyers.map((b) => ({
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
      hasHighFanoutMother: false,
      motherChildCount: 0,
      recoveredByWalletCentric: recoveredWalletAddresses.has(b.walletAddress),
    })),
    effectiveTokens,
  };
}

async function runTokenHuntingMode(
  analysisId: string,
  tokens: TokenInput[],
  buyerLimit: number,
  walletCentricRecoveryLimit: number,
  excludeInactiveOver24h: boolean,
  inactiveThresholdHours: number,
  mcapMin: number | undefined,
  mcapMax: number | undefined,
  deadline: number,
  emit: EmitFn
): Promise<ModeRunResult> {
  const { buyers: initialBuyers, tokens: effectiveTokens } = await discoverAndValidateTokenUniverse(
    tokens,
    { ruggerWallet: null, discoverFromRuggerWallet: false },
    buyerLimit,
    deadline,
    emit
  );

  const buyers = excludeInactiveOver24h
    ? await applyInactiveFilter(initialBuyers, inactiveThresholdHours, emit)
    : initialBuyers;
  const mcapFilteredBuyers = await applyMcapFilter(buyers, mcapMin, mcapMax, emit);

  let recoveredResult: Awaited<ReturnType<typeof recoverWalletCentricBuyers>>;
  if (walletCentricRecoveryLimit === 0) {
    emit('progress', {
      phase: 'wallet_centric_recovery',
      percent: 55,
      detail: 'Recovery wallet-centric désactivée (0 wallet)',
    });
    recoveredResult = {
      buyers: [],
      tokenCount: effectiveTokens.length,
      totalUniqueBuyers: 0,
    };
  } else {
    emit('progress', { phase: 'wallet_centric_recovery', percent: 45, detail: 'Chargement des candidats…' });
    const candidateWallets = await loadWalletCentricCandidates(analysisId);
    const historicalCoverage = await loadHistoricalMaxCoverageByRuggerForAnalysis(analysisId);
    const rankedWallets = selectTopCandidatesByCoverage(
      candidateWallets,
      mcapFilteredBuyers,
      historicalCoverage,
      walletCentricRecoveryLimit
    );
    emit('progress', {
      phase: 'wallet_centric_recovery',
      percent: 48,
      detail: `${candidateWallets.length} en base → ${rankedWallets.length} retenus (meilleure couverture, N=${walletCentricRecoveryLimit})`,
    });
    recoveredResult = await recoverWalletCentricBuyers(effectiveTokens, rankedWallets, {
      fromMs: Date.now() - WALLET_CENTRIC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      toMs: Date.now(),
      maxCandidates: Math.max(1, rankedWallets.length || 1),
      deadline,
      onProgress: (current, total) => {
        const pct = 48 + Math.round((current / Math.max(1, total)) * 20);
        emit('progress', {
          phase: 'wallet_centric_recovery',
          percent: pct,
          detail: `${current}/${total} wallets analysés`,
        });
      },
    });
  }

  emit('progress', { phase: 'wallet_centric_recovery', percent: 70, detail: 'Fusion des résultats…' });
  const { mergedBuyers, recoveredWalletAddresses } = mergeRecoveredBuyers(
    mcapFilteredBuyers,
    recoveredResult.buyers
  );
  if (recoveredWalletAddresses.size > 0) {
    emit('wallet_centric_recovered', { recoveredCount: recoveredWalletAddresses.size });
  }

  return {
    mergedWallets: mergedBuyers.map((b) => ({
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
      hasHighFanoutMother: false,
      motherChildCount: 0,
      recoveredByWalletCentric: recoveredWalletAddresses.has(b.walletAddress),
    })),
    effectiveTokens,
  };
}

async function runFundingMode(
  tokens: TokenInput[],
  ruggerWallet: string,
  userId: string,
  fundingDepth: number,
  siblingLimit: number,
  emit: EmitFn
): Promise<ModeRunResult> {
  emit('progress', { phase: 'siblings', percent: 10 });

  const siblingResult = await discoverSiblingWallets(ruggerWallet, userId, {
    maxDepth: fundingDepth,
    siblingLimit,
  });

  emit('siblings_found', {
    motherAddress: siblingResult.motherAddress,
    siblingsFound: siblingResult.siblings.length,
    motherChildCount: siblingResult.motherChildCount,
    highFanoutMother: siblingResult.hasHighFanoutMother,
  });

  emit('progress', { phase: 'siblings', percent: 70 });

  return {
    mergedWallets: siblingResult.siblings.map((s) => ({
      walletAddress: s.walletAddress,
      source: 'funding' as WalletSource,
      purchases: [],
      fundingChain: siblingResult.ruggerChain,
      fundingDepth: siblingResult.ruggerChain.length - 1,
      motherAddress: s.motherAddress,
      hasHighFanoutMother: siblingResult.hasHighFanoutMother,
      motherChildCount: siblingResult.motherChildCount,
      recoveredByWalletCentric: false,
    })),
    effectiveTokens: tokens,
  };
}

async function runCombinedMode(
  analysisId: string,
  tokens: TokenInput[],
  ruggerWallet: string,
  userId: string,
  fundingDepth: number,
  buyerLimit: number,
  walletCentricRecoveryLimit: number,
  excludeInactiveOver24h: boolean,
  inactiveThresholdHours: number,
  mcapMin: number | undefined,
  mcapMax: number | undefined,
  deadline: number,
  emit: EmitFn
): Promise<ModeRunResult> {
  const {
    buyers: discoveredBuyers,
    tokens: effectiveTokens,
  } = await discoverAndValidateTokenUniverse(
    tokens,
    { ruggerWallet, discoverFromRuggerWallet: true },
    buyerLimit,
    deadline,
    emit
  );

  const tokenBuyersInitial = excludeInactiveOver24h
    ? await applyInactiveFilter(discoveredBuyers, inactiveThresholdHours, emit)
    : discoveredBuyers;
  const mcapFilteredBuyers = await applyMcapFilter(
    tokenBuyersInitial,
    mcapMin,
    mcapMax,
    emit
  );

  let recoveredResult: Awaited<ReturnType<typeof recoverWalletCentricBuyers>>;

  if (walletCentricRecoveryLimit === 0) {
    emit('progress', {
      phase: 'wallet_centric_recovery',
      percent: 50,
      detail: 'Recovery wallet-centric désactivée (0 wallet)',
    });
    recoveredResult = {
      buyers: [],
      tokenCount: effectiveTokens.length,
      totalUniqueBuyers: 0,
    };
  } else {
    emit('progress', { phase: 'wallet_centric_recovery', percent: 45, detail: 'Chargement des candidats…' });
    const candidateWallets = await loadWalletCentricCandidates(analysisId);
    const historicalCoverage = await loadHistoricalMaxCoverageByRuggerForAnalysis(analysisId);
    const rankedWallets = selectTopCandidatesByCoverage(
      candidateWallets,
      mcapFilteredBuyers,
      historicalCoverage,
      walletCentricRecoveryLimit
    );
    emit('progress', {
      phase: 'wallet_centric_recovery',
      percent: 48,
      detail: `${candidateWallets.length} en base → ${rankedWallets.length} retenus (meilleure couverture, N=${walletCentricRecoveryLimit})`,
    });

    recoveredResult = await recoverWalletCentricBuyers(effectiveTokens, rankedWallets, {
      excludeWallets: [ruggerWallet],
      fromMs: Date.now() - WALLET_CENTRIC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      toMs: Date.now(),
      maxCandidates: Math.max(1, rankedWallets.length || 1),
      deadline,
      onProgress: (current, total) => {
        const pct = 48 + Math.round((current / Math.max(1, total)) * 4);
        emit('progress', {
          phase: 'wallet_centric_recovery',
          percent: pct,
          detail: `${current}/${total} wallets analysés`,
        });
      },
    });
  }

  emit('progress', { phase: 'wallet_centric_recovery', percent: 52, detail: 'Fusion des résultats…' });
  const { mergedBuyers: tokenBuyers, recoveredWalletAddresses } = mergeRecoveredBuyers(
    mcapFilteredBuyers,
    recoveredResult.buyers
  );
  if (recoveredWalletAddresses.size > 0) {
    emit('wallet_centric_recovered', { recoveredCount: recoveredWalletAddresses.size });
  }

  emit('progress', { phase: 'siblings', percent: 52 });

  const siblingResult = await discoverSiblingWallets(ruggerWallet, userId, {
    maxDepth: fundingDepth,
    siblingLimit: buyerLimit,
  });

  emit('siblings_found', {
    motherAddress: siblingResult.motherAddress,
    siblingsFound: siblingResult.siblings.length,
    motherChildCount: siblingResult.motherChildCount,
    highFanoutMother: siblingResult.hasHighFanoutMother,
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
      hasHighFanoutMother: inBoth ? siblingResult.hasHighFanoutMother : false,
      motherChildCount: inBoth ? siblingResult.motherChildCount : 0,
      recoveredByWalletCentric: recoveredWalletAddresses.has(b.walletAddress),
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
        hasHighFanoutMother: siblingResult.hasHighFanoutMother,
        motherChildCount: siblingResult.motherChildCount,
        recoveredByWalletCentric: false,
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
      // Budget temps atteint : on arrête le funding (résultat partiel, évite le timeout Hobby).
      if (Date.now() > deadline) break;
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

  return {
    mergedWallets: Array.from(allWallets.values()),
    effectiveTokens,
  };
}

interface DiscoverTokenUniverseOpts {
  ruggerWallet: string | null;
  discoverFromRuggerWallet: boolean;
}

async function discoverAndValidateTokenUniverse(
  registeredTokens: TokenInput[],
  opts: DiscoverTokenUniverseOpts,
  buyerLimit: number,
  deadline: number,
  emit: EmitFn
): Promise<{ tokens: TokenInput[]; buyers: DiscoveredBuyer[] }> {
  const { ruggerWallet, discoverFromRuggerWallet } = opts;
  emit('progress', { phase: 'discovering_rugger_tokens', percent: 5 });
  const allCandidateTokens = discoverFromRuggerWallet
    ? await discoverRuggerTokens(ruggerWallet ?? '', registeredTokens)
    : await filterPumpfunTokensOnly(registeredTokens);
  emit('tokens_discovered', {
    candidateCount: allCandidateTokens.length,
    registeredCount: registeredTokens.length,
  });

  emit('progress', { phase: 'cross_validating', percent: 10 });
  const validated = await validateTokensByCrossReference(
    allCandidateTokens,
    new Set(registeredTokens.map((token) => token.address)),
    {
      buyerLimit,
      excludeWallets: ruggerWallet ? [ruggerWallet] : [],
      concurrency: ANALYSIS_CONCURRENCY,
      deadline,
      onProgress: (current, total) => {
        const pct = 10 + Math.round((current / total) * 30);
        emit('progress', {
          phase: 'cross_validating',
          percent: pct,
          detail: `${current}/${total} tokens analysés`,
        });
      },
    }
  );
  emit('tokens_validated', {
    validatedCount: validated.stats.validatedCount,
    discardedCount: validated.stats.discardedCount,
    multiTokenWalletCount: validated.stats.multiTokenWalletCount,
    failedTokenCount: validated.stats.failedTokenCount,
    candidateCount: validated.stats.candidateCount,
  });
  const buyersFoundByToken = new Map<string, number>();
  for (const buyer of validated.buyers) {
    for (const purchase of buyer.purchases) {
      buyersFoundByToken.set(
        purchase.tokenAddress,
        (buyersFoundByToken.get(purchase.tokenAddress) ?? 0) + 1
      );
    }
  }
  for (const token of validated.validatedTokens) {
    emit('buyers_found', {
      tokenAddress: token.address,
      buyersFound: buyersFoundByToken.get(token.address) ?? 0,
    });
  }

  const filteredBuyers = validated.buyers.filter(
    (buyer) => !isLikelyAggregatorWallet(buyer, validated.validatedTokens.length)
  );
  const removedAsLikelyBots = validated.buyers.length - filteredBuyers.length;
  if (removedAsLikelyBots > 0) {
    emit('buyers_filtered', {
      reason: 'exchange_or_bot',
      removedCount: removedAsLikelyBots,
    });
  }

  const globalCandidateLimit = computeGlobalCandidateLimit(validated.validatedTokens.length);
  const cappedBuyers = filteredBuyers
    .sort((a, b) => b.tokensBought - a.tokensBought || b.coveragePercent - a.coveragePercent)
    .slice(0, globalCandidateLimit);
  if (cappedBuyers.length < filteredBuyers.length) {
    emit('buyers_capped', {
      totalAfterFiltering: filteredBuyers.length,
      kept: cappedBuyers.length,
      cap: globalCandidateLimit,
    });
  }

  return {
    tokens: validated.validatedTokens,
    buyers: cappedBuyers,
  };
}

function computeGlobalCandidateLimit(totalTokens: number): number {
  const dynamicLimit = Math.max(totalTokens * GLOBAL_CANDIDATE_FACTOR, totalTokens * 5, 50);
  return Math.max(1, Math.min(dynamicLimit, GLOBAL_CANDIDATE_MAX));
}

function isLikelyAggregatorWallet(buyer: DiscoveredBuyer, totalTokens: number): boolean {
  if (totalTokens < 5) return false;
  const coverageRatio = buyer.tokensBought / totalTokens;
  if (coverageRatio < 0.95) return false;
  const amountSolValues = buyer.purchases
    .map((purchase) => purchase.amountSol)
    .filter((amount): amount is number => amount != null && amount > 0);
  if (amountSolValues.length === 0) return false;
  const avgAmountSol = amountSolValues.reduce((sum, amount) => sum + amount, 0) / amountSolValues.length;
  const threshold = Number(process.env.AGGREGATOR_AVG_SOL_THRESHOLD ?? '0.012');
  return avgAmountSol < threshold;
}

function mergeRecoveredBuyers(
  baseBuyers: DiscoveredBuyer[],
  recoveredBuyers: DiscoveredBuyer[]
): {
  mergedBuyers: DiscoveredBuyer[];
  recoveredWalletAddresses: Set<string>;
} {
  const buyerMap = new Map<string, DiscoveredBuyer>(
    baseBuyers.map((buyer) => [buyer.walletAddress, { ...buyer, purchases: [...buyer.purchases] }])
  );
  const recoveredWalletAddresses = new Set<string>();

  for (const recovered of recoveredBuyers) {
    const existing = buyerMap.get(recovered.walletAddress);
    if (!existing) {
      buyerMap.set(recovered.walletAddress, { ...recovered, purchases: [...recovered.purchases] });
      recoveredWalletAddresses.add(recovered.walletAddress);
      continue;
    }

    const existingTokens = new Set(existing.purchases.map((purchase) => purchase.tokenAddress));
    let merged = false;
    for (const purchase of recovered.purchases) {
      if (existingTokens.has(purchase.tokenAddress)) continue;
      existing.purchases.push(purchase);
      existingTokens.add(purchase.tokenAddress);
      merged = true;
    }
    if (merged) {
      existing.tokensBought = existing.purchases.length;
      existing.coveragePercent = (existing.tokensBought / existing.totalTokens) * 100;
      recoveredWalletAddresses.add(recovered.walletAddress);
    }
  }

  const mergedBuyers = Array.from(buyerMap.values()).sort(
    (a, b) => b.tokensBought - a.tokensBought || b.coveragePercent - a.coveragePercent
  );
  return { mergedBuyers, recoveredWalletAddresses };
}

function selectTopCandidatesByCoverage(
  candidateWallets: string[],
  currentBuyers: DiscoveredBuyer[],
  historicalCoverage: Map<string, number>,
  limit: number
): string[] {
  if (limit <= 0) return [];
  const currentByWallet = new Map(
    currentBuyers.map((b) => [b.walletAddress.toLowerCase(), b.coveragePercent])
  );
  const seen = new Set<string>();
  const scored: { wallet: string; score: number }[] = [];
  for (const raw of candidateWallets) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const score = currentByWallet.get(key) ?? historicalCoverage.get(key) ?? 0;
    scored.push({ wallet: trimmed, score });
  }
  scored.sort((a, b) => b.score - a.score || a.wallet.localeCompare(b.wallet));
  return scored.slice(0, limit).map((s) => s.wallet);
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

function buildWalletDecisions(
  mergedWallets: MergedWallet[],
  scoredWallets: ScoringResult[]
): Map<string, WalletDecision> {
  const scoreMap = new Map(scoredWallets.map((score) => [score.walletAddress, score]));
  const decisions = new Map<string, WalletDecision>();

  for (const wallet of mergedWallets) {
    const score = scoreMap.get(wallet.walletAddress);
    const coverage = score?.coveragePercent ?? 0;
    const temporalCoherence = score?.consistency ?? 0;
    const executionWeight = score?.weight ?? 0;
    const fundingProximity = wallet.fundingDepth == null
      ? wallet.source === 'token' ? 50 : 0
      : Math.max(0, 100 - wallet.fundingDepth * 10);

    const blended =
      coverage * 0.55 +
      temporalCoherence * 0.20 +
      fundingProximity * 0.15 +
      executionWeight * 0.10;
    let matchingConfidence = Math.max(0, Math.min(100, blended));

    const decisionReasons: string[] = [];
    let inclusionDecision: InclusionDecision = 'included';
    let riskFlag: string | null = null;
    let riskLevel: RiskLevel | null = null;

    if ((wallet.source === 'token' || wallet.source === 'both') && coverage < STRICT_COVERAGE_THRESHOLD) {
      inclusionDecision = 'excluded';
      decisionReasons.push('low_coverage');
    } else if (coverage >= STRICT_COVERAGE_THRESHOLD) {
      decisionReasons.push('high_coverage');
    }

    if (wallet.source === 'both') decisionReasons.push('both_source_bonus');
    if (wallet.recoveredByWalletCentric) decisionReasons.push('wallet_centric_recovered');
    if (wallet.source === 'funding') {
      inclusionDecision = 'included_with_risk';
      riskFlag = 'funding_only';
      riskLevel = 'medium';
      decisionReasons.push('funding_only');
      matchingConfidence = Math.max(0, matchingConfidence - 15);
    }

    if (executionWeight < 20) decisionReasons.push('weak_execution_weight');
    if (wallet.fundingDepth != null && wallet.fundingDepth >= 8) decisionReasons.push('deep_funding_path');

    if (wallet.hasHighFanoutMother) {
      inclusionDecision = inclusionDecision === 'excluded' ? 'excluded' : 'included_with_risk';
      riskFlag = 'high_fanout_mother';
      riskLevel = 'high';
      decisionReasons.push('high_fanout_mother');
      matchingConfidence = Math.max(0, matchingConfidence - 20);
    }

    if (decisionReasons.length === 0) {
      decisionReasons.push('high_coverage');
    }

    decisions.set(wallet.walletAddress, {
      walletAddress: wallet.walletAddress,
      matchingConfidence,
      inclusionDecision,
      riskFlag,
      riskLevel,
      decisionReasons,
    });
  }

  return decisions;
}

async function persistResults(
  analysisId: string,
  mergedWallets: MergedWallet[],
  scoredWallets: ScoringResult[],
  decisions: Map<string, WalletDecision>
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
    const id = await upsertAnalysisMotherAddress(analysisId, address, wallets.size);
    if (id) motherIdMap.set(address, id);
  }

  const walletInputs: BuyerWalletPersistInput[] = mergedWallets.map((w) => {
    const score = scoreMap.get(w.walletAddress);
    const decision = decisions.get(w.walletAddress);
    const motherId = w.motherAddress ? motherIdMap.get(w.motherAddress) ?? null : null;
    return {
      analysisId,
      walletAddress: w.walletAddress,
      source: w.source,
      motherAddressId: motherId,
      tokensBought: score?.tokensBought ?? w.purchases.length,
      totalTokens: score?.totalTokens ?? 0,
      coveragePercent: score?.coveragePercent ?? 0,
      firstBuyAt: score?.firstBuyAt ?? null,
      lastBuyAt: score?.lastBuyAt ?? null,
      activeDays: score?.activeDaysInScope ?? 0,
      spanDaysInScope: score?.spanDaysInScope ?? 0,
      consistency: score?.consistency ?? 0,
      weight: score?.weight ?? 0,
      avgHoldDurationHours: score?.avgHoldDurationHours ?? null,
      fundingDepth: w.fundingDepth,
      fundingChain: w.fundingChain ?? null,
      motherChildCount: w.motherChildCount,
      hasHighFanoutMother: w.hasHighFanoutMother,
      matchingConfidence: decision?.matchingConfidence ?? 0,
      inclusionDecision: decision?.inclusionDecision ?? 'included',
      riskFlag: decision?.riskFlag ?? null,
      riskLevel: decision?.riskLevel ?? null,
      decisionReasons: decision?.decisionReasons ?? ['high_coverage'],
    };
  });
  // Persistance en lot : ~2 requêtes au lieu d'un round-trip Neon par wallet + par achat
  // (sinon des centaines d'appels séquentiels → dépassement du budget 60 s, blocage à 95 %).
  await upsertAnalysisBuyerWalletsBatch(walletInputs);

  const purchaseInputs = mergedWallets.flatMap((w) =>
    w.purchases.map((p) => ({
      walletAddress: w.walletAddress,
      tokenAddress: p.tokenAddress,
      tokenName: p.tokenName,
      purchasedAt: p.purchasedAt,
      amountSol: p.amountSol,
    }))
  );
  await insertAnalysisBuyerPurchasesBatch(analysisId, purchaseInputs);

  return motherAddresses.size;
}

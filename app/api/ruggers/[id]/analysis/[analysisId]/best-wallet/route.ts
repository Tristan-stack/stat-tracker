import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import {
  getBestWalletGuard,
  getBestWalletBenchmark,
  getTopTokens,
  getBestWalletCandidates,
  type BestWalletCandidateRow,
} from '@/features/analysis/repository';
import { buildPurchasePreviews } from '@/lib/gmgn/wallet-purchases';
import { rankBestWallets, type BestWalletResult, type WalletTokenPreview } from '@/lib/analysis/best-wallet';
import { computeTieCapMeta, resolveBestWalletTieMax } from '@/lib/analysis/best-wallet-tie';
import {
  getBestWalletCacheStats,
  getBestWalletResponseCache,
  getWalletPreviewCache,
  makeBestWalletResponseCacheKey,
  makeWalletPreviewCacheKey,
  setBestWalletResponseCache,
  setWalletPreviewCache,
} from '@/lib/analysis/best-wallet-cache';
import { runWithConcurrency } from '@/lib/analysis/async-pool';

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; analysisId: string }> };

const DEFAULT_TP_MIN_PERCENT = 80;
const DEFAULT_TOKEN_LIMIT = 20;
const MAX_TOKEN_LIMIT = 40;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_WALLET_TIMEOUT_MS = 180_000;
const WALLET_PREVIEW_CACHE_TTL_MS = 30 * 60_000;
const RESPONSE_CACHE_TTL_MS = 8 * 60_000;
const DEFAULT_RETRIES = 2;

interface BestWalletPayload {
  topWallets: Array<BestWalletResult & { activeDays: number }>;
  meta: {
    tpMinPercent: number;
    tokenLimit: number;
    selectionPolicy: 'bestCoverageTie';
    maxTieWallets: number;
    maxCoveragePercent: number | null;
    tiedAtMaxCount: number;
    tieCapApplied: boolean;
    selectedTokenCount: number;
    scopedWalletCount: number;
    walletsAnalyzed: number;
    walletsSucceeded: number;
    walletsFailed: number;
    walletsRemaining: number;
    cacheHit: boolean;
    cacheHitResponse: boolean;
    cacheHitWalletPreviews: number;
    timingsMs: { total: number; topTokensQuery: number; candidateQuery: number; gmgnPhase: number; ranking: number };
    benchmark: { walletCount: number; tokenCount: number };
    topCoverageTokens: Array<{ tokenAddress: string; walletCount: number }>;
    partialFailures: Array<{ walletAddress: string; error: string }>;
    insufficientDataWallets: string[];
    rankingPolicy: string;
    partialMode: boolean;
    retries: number;
  };
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parsePercent(value: string | null, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, 1000);
}

async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : '';
      const retryable = /HTTP 429|HTTP 5\d{2}|ECONNRESET|ETIMEDOUT|timeout/i.test(message);
      if (!retryable || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 300 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Wallet processing timeout (${timeoutMs}ms)`)), timeoutMs);
    }),
  ]);
}

export const GET = withAuth<Ctx>(async (req, ctx, { userId }) => {
  const { id: ruggerId, analysisId } = await ctx.params;

  const url = new URL(req.url);
  const tpMinPercent = parsePercent(url.searchParams.get('tpMinPercent'), DEFAULT_TP_MIN_PERCENT);
  const tokenLimit = parsePositiveInt(url.searchParams.get('tokenLimit'), DEFAULT_TOKEN_LIMIT, MAX_TOKEN_LIMIT);
  const maxTieWallets = resolveBestWalletTieMax(url.searchParams.get('maxTieWallets'));
  const concurrency = parsePositiveInt(
    url.searchParams.get('concurrency'),
    Number(process.env.GMGN_BEST_WALLET_CONCURRENCY ?? DEFAULT_CONCURRENCY),
    6
  );
  const walletTimeoutMs = parsePositiveInt(
    url.searchParams.get('walletTimeoutMs'),
    Number(process.env.GMGN_BEST_WALLET_TIMEOUT_MS ?? DEFAULT_WALLET_TIMEOUT_MS),
    60_000
  );
  const retries = parsePositiveInt(
    url.searchParams.get('retries'),
    Number(process.env.GMGN_BEST_WALLET_RETRIES ?? DEFAULT_RETRIES),
    5
  );
  const startTotal = performance.now();

  const guard = await getBestWalletGuard(analysisId, ruggerId, userId);
  if (!guard) throw notFoundError('Analysis not found');

  const benchmark = await getBestWalletBenchmark(analysisId);

  const tTopStart = performance.now();
  const topTokens = await getTopTokens(analysisId, tokenLimit);
  const topTokensQueryMs = performance.now() - tTopStart;

  if (topTokens.length === 0) {
    return ok({
      topWallets: [],
      meta: {
        tpMinPercent,
        tokenLimit,
        selectionPolicy: 'bestCoverageTie',
        maxTieWallets,
        maxCoveragePercent: null,
        tiedAtMaxCount: 0,
        tieCapApplied: false,
        selectedTokenCount: 0,
        scopedWalletCount: 0,
        walletsAnalyzed: 0,
        walletsSucceeded: 0,
        walletsFailed: 0,
        walletsRemaining: 0,
        cacheHit: false,
        cacheHitResponse: false,
        cacheHitWalletPreviews: 0,
        timingsMs: {
          total: Math.round(performance.now() - startTotal),
          topTokensQuery: Math.round(topTokensQueryMs),
          candidateQuery: 0,
          gmgnPhase: 0,
          ranking: 0,
        },
        benchmark: { walletCount: benchmark.wallet_count, tokenCount: benchmark.token_count },
        topCoverageTokens: [],
        partialFailures: [],
        insufficientDataWallets: [],
        rankingPolicy: 'coverage-first > tp-hit-rate > tp-hit-count > entry-quality',
        partialMode: false,
        retries,
      },
    });
  }

  const nowMs = Date.now();
  const startsAt = guard.starts_at ? new Date(guard.starts_at).getTime() : nowMs - 90 * 86400000;
  const endsAt = guard.ends_at ? new Date(guard.ends_at).getTime() : nowMs;
  const fromMs = Math.max(0, startsAt - 86400000);
  const toMs = Math.max(fromMs, Math.min(nowMs, endsAt + 7 * 86400000));
  const topTokenAddresses = topTokens.map((row) => row.token_address);
  const topTokenSet = new Set(topTokenAddresses);
  const responseCacheKey = makeBestWalletResponseCacheKey({ analysisId, tpMinPercent, tokenLimit, maxTieWallets });
  const cachedResponse = getBestWalletResponseCache<BestWalletPayload>(responseCacheKey);
  const streamRequested = url.searchParams.get('stream') === '1';
  const cacheStats = getBestWalletCacheStats();
  if (cachedResponse && !streamRequested) {
    return ok({
      ...cachedResponse,
      meta: {
        ...cachedResponse.meta,
        cacheHit: true,
        cacheHitResponse: true,
        cacheHitWalletPreviews: cachedResponse.meta.cacheHitWalletPreviews,
        cacheStats,
      },
    });
  }

  const tCandidateStart = performance.now();
  const walletRows: BestWalletCandidateRow[] = await getBestWalletCandidates(analysisId, tokenLimit, maxTieWallets);
  const candidateQueryMs = performance.now() - tCandidateStart;

  const partialFailures: Array<{ walletAddress: string; error: string }> = [];
  const insufficientDataWallets: string[] = [];

  const buildPayload = async (
    onProgress?: (event: {
      message: string;
      totalWallets: number;
      walletsAnalyzed: number;
      walletsRemaining: number;
      walletsSucceeded: number;
      walletsFailed: number;
      currentWallet: string;
    }) => void
  ): Promise<BestWalletPayload> => {
    const gmgnPhaseStart = performance.now();
    const candidates: Array<{ walletAddress: string; analysisCoveragePercent: number; previews: WalletTokenPreview[] }> = [];
    let walletsAnalyzed = 0;
    let walletsSucceeded = 0;
    let walletsFailed = 0;
    let cacheHitWalletPreviews = 0;

    const processed = await runWithConcurrency(walletRows, concurrency, async (wallet) => {
      const previewCacheKey = makeWalletPreviewCacheKey({
        analysisId,
        walletAddress: wallet.wallet_address,
        fromMs,
        toMs,
      });
      const cachedPreviews = getWalletPreviewCache<WalletTokenPreview[]>(previewCacheKey);
      if (cachedPreviews) {
        cacheHitWalletPreviews += 1;
        walletsAnalyzed += 1;
        walletsSucceeded += 1;
        onProgress?.({
          message: `Wallet ${wallet.wallet_address} analysé depuis cache (${walletsAnalyzed}/${walletRows.length})`,
          totalWallets: walletRows.length,
          walletsAnalyzed,
          walletsRemaining: Math.max(0, walletRows.length - walletsAnalyzed),
          walletsSucceeded,
          walletsFailed,
          currentWallet: wallet.wallet_address,
        });
        return { walletAddress: wallet.wallet_address, analysisCoveragePercent: wallet.coverage_percent, previews: cachedPreviews };
      }

      try {
        const previews = await withTimeout(
          withRetry(() => buildPurchasePreviews(wallet.wallet_address, fromMs, toMs), retries),
          walletTimeoutMs
        );
        const filteredPreviews: WalletTokenPreview[] = previews
          .filter((preview) => topTokenSet.has(preview.tokenAddress))
          .map((preview) => ({ tokenAddress: preview.tokenAddress, entryPrice: preview.entryPrice, high: preview.high }));
        setWalletPreviewCache(previewCacheKey, filteredPreviews, WALLET_PREVIEW_CACHE_TTL_MS);
        if (filteredPreviews.length === 0) insufficientDataWallets.push(wallet.wallet_address);
        walletsSucceeded += 1;
        return { walletAddress: wallet.wallet_address, analysisCoveragePercent: wallet.coverage_percent, previews: filteredPreviews };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Preview collection failed';
        partialFailures.push({ walletAddress: wallet.wallet_address, error: message });
        walletsFailed += 1;
        return { walletAddress: wallet.wallet_address, analysisCoveragePercent: wallet.coverage_percent, previews: [] as WalletTokenPreview[] };
      } finally {
        walletsAnalyzed += 1;
        onProgress?.({
          message: `Wallet ${wallet.wallet_address} traité (${walletsAnalyzed}/${walletRows.length})`,
          totalWallets: walletRows.length,
          walletsAnalyzed,
          walletsRemaining: Math.max(0, walletRows.length - walletsAnalyzed),
          walletsSucceeded,
          walletsFailed,
          currentWallet: wallet.wallet_address,
        });
      }
    });
    candidates.push(...processed);
    const gmgnPhaseMs = performance.now() - gmgnPhaseStart;
    const rankingPhaseStart = performance.now();
    const ranked = rankBestWallets(candidates, topTokenAddresses, tpMinPercent);
    const activeByWallet = new Map(walletRows.map((w) => [w.wallet_address, w.active_days]));
    const topWallets: Array<BestWalletResult & { activeDays: number }> = ranked.map((row) => ({
      ...row,
      activeDays: activeByWallet.get(row.walletAddress) ?? 0,
    }));
    const rankingMs = performance.now() - rankingPhaseStart;
    const totalMs = performance.now() - startTotal;

    const tiedAtMaxCount = walletRows[0]?.tied_at_max_count ?? 0;
    const maxCoveragePercent = walletRows.length > 0 ? walletRows[0].coverage_percent : null;
    const { tieCapApplied } = computeTieCapMeta(tiedAtMaxCount, walletRows.length, maxTieWallets);

    return {
      topWallets,
      meta: {
        tpMinPercent,
        tokenLimit,
        selectionPolicy: 'bestCoverageTie',
        maxTieWallets,
        maxCoveragePercent,
        tiedAtMaxCount,
        tieCapApplied,
        selectedTokenCount: topTokenAddresses.length,
        scopedWalletCount: walletRows.length,
        walletsAnalyzed,
        walletsSucceeded,
        walletsFailed,
        walletsRemaining: Math.max(0, walletRows.length - walletsAnalyzed),
        cacheHit: cacheHitWalletPreviews > 0,
        cacheHitResponse: false,
        cacheHitWalletPreviews,
        timingsMs: {
          total: Math.round(totalMs),
          topTokensQuery: Math.round(topTokensQueryMs),
          candidateQuery: Math.round(candidateQueryMs),
          gmgnPhase: Math.round(gmgnPhaseMs),
          ranking: Math.round(rankingMs),
        },
        benchmark: { walletCount: benchmark.wallet_count, tokenCount: benchmark.token_count },
        topCoverageTokens: topTokens.map((token) => ({
          tokenAddress: token.token_address,
          walletCount: Number(token.wallet_count),
        })),
        partialFailures,
        insufficientDataWallets,
        rankingPolicy: 'coverage-first > tp-hit-rate > tp-hit-count > entry-quality',
        partialMode: partialFailures.length > 0,
        retries,
      },
    };
  };

  if (!streamRequested) {
    const payload = await buildPayload();
    setBestWalletResponseCache(responseCacheKey, payload, RESPONSE_CACHE_TTL_MS);
    return ok(payload);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };
      try {
        send({
          type: 'started',
          totalWallets: walletRows.length,
          selectedTokenCount: topTokenAddresses.length,
          tpMinPercent,
          message: 'Démarrage de l’analyse Best Wallet',
        });
        const payload = await buildPayload((progress) => send({ type: 'progress', ...progress }));
        setBestWalletResponseCache(responseCacheKey, payload, RESPONSE_CACHE_TTL_MS);
        send({ type: 'done', payload });
      } catch (error) {
        send({ type: 'error', error: error instanceof Error ? error.message : 'Best wallet stream failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
});
